import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(process.argv[2]);
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

const client = new pg.Client({
  host: "aws-0-ap-northeast-2.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password: env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});
await client.connect();
const { rows } = await client.query(`
  select filename, status, source_path, image_path, answers, created_at
  from public.scan_results
  order by created_at desc
  limit 8
`);
await client.end();
for (const row of rows) {
  console.log(row.created_at, row.filename, row.status, "src=", row.source_path, "img=", row.image_path, JSON.stringify(row.answers));
}
