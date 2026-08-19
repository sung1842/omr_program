import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
const projectRef = url.hostname.split(".")[0];
const password = env.SUPABASE_DB_PASSWORD;

const hosts = [
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-1-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
];

let lastError = null;
for (const target of hosts) {
  const client = new pg.Client({
    host: target.host,
    port: target.port,
    user: target.user,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    const rows = await client.query(`
      select filename, status, image_path, answers,
             details -> 'cell_source' as cell_source,
             details -> 'alignment' as alignment,
             details -> 'hole_baseline' as baseline,
             created_at
      from public.scan_results
      order by created_at desc
      limit 10
    `);
    const objects = await client.query(
      "select name, created_at from storage.objects where bucket_id = 'scan-sheets' order by created_at desc limit 10",
    );
    await client.end();
    console.log(JSON.stringify({ rows: rows.rows, objects: objects.rows }, null, 2));
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
throw lastError ?? new Error("Could not connect to Postgres");
