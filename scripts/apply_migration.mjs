import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  throw new Error("사용법: node scripts/apply_migration.mjs supabase/migrations/<파일>.sql");
}

const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [line.slice(0, index).trim(), value];
    }),
);

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const password = env.SUPABASE_DB_PASSWORD;
if (!projectRef || !password) {
  throw new Error(".env.local에 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_DB_PASSWORD가 없습니다.");
}

const sql = fs.readFileSync(path.resolve(root, target), "utf8");

const hosts = [
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-1-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 6543, user: `postgres.${projectRef}` },
  { host: `db.${projectRef}.supabase.co.`, port: 5432, user: "postgres" },
];

let lastError = null;
for (const candidate of hosts) {
  const client = new pg.Client({
    host: candidate.host,
    port: candidate.port,
    user: candidate.user,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    await client.query(sql);
    const columns = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'scan_results'
        and column_name in ('image_path', 'source_path', 'source_page', 'reviewed_at')
      order by column_name
    `);
    const bucket = await client.query(
      `select file_size_limit, allowed_mime_types from storage.buckets where id = 'scan-sheets'`,
    );
    await client.end();
    console.log(`applied ${target} via ${candidate.host}:${candidate.port}`);
    console.log("scan_results:", columns.rows.map((row) => row.column_name).join(", "));
    console.log("bucket:", JSON.stringify(bucket.rows[0] ?? null));
    process.exit(0);
  } catch (error) {
    lastError = error;
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}
throw lastError ?? new Error("Postgres에 연결하지 못했습니다.");
