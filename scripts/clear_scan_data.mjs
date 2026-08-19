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
if (!projectRef || !password) {
  throw new Error("Supabase URL or DB password missing");
}

const hosts = [
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-1-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 6543, user: `postgres.${projectRef}` },
];

const sql = `
delete from public.scan_results;
delete from public.scan_jobs;
`;

const storageSql = `
do $$
declare obj record;
begin
  for obj in select name from storage.objects where bucket_id = 'scan-sheets'
  loop
    perform storage.delete_object('scan-sheets', obj.name);
  end loop;
end $$;
`;

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
    const before = await client.query(
      "select (select count(*) from public.scan_results) as results, (select count(*) from public.scan_jobs) as jobs",
    );
    await client.query(sql);
    try {
      await client.query(storageSql);
    } catch {
      // Storage trigger blocks raw deletes; ignore if the helper is unavailable.
    }
    const after = await client.query(
      "select (select count(*) from public.scan_results) as results, (select count(*) from public.scan_jobs) as jobs",
    );
    await client.end();
    console.log(
      `cleared scan_results ${before.rows[0].results}->${after.rows[0].results}, scan_jobs ${before.rows[0].jobs}->${after.rows[0].jobs}`,
    );
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
