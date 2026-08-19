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
      select filename, status, image_path, answers, details, created_at
      from public.scan_results
      order by created_at desc
      limit 3
    `);
    await client.end();
    for (const row of rows.rows) {
      console.log("---", row.filename, row.status, row.created_at);
      console.log("answers", JSON.stringify(row.answers));
      console.log("image_path", row.image_path);
      const details = row.details || {};
      console.log("cell_source", details.cell_source, "alignment", details.alignment);
      console.log("baseline", details.hole_baseline ?? details.mark_baseline, "thr", details.mark_threshold);
      console.log("reasons", JSON.stringify(details.exception_reasons || [], null, 2));
      const questions = details.questions || [];
      for (const question of questions) {
        for (const option of question.options || []) {
          if (option.verdict && option.verdict !== "blank") {
            console.log(" ", option.label, option);
          }
        }
      }
    }
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
