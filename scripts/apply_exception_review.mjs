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

const sql = `
alter table public.scan_results
  drop constraint if exists scan_results_status_check;
alter table public.scan_results
  add constraint scan_results_status_check
  check (status in ('success', 'exception', 'failed'));
alter table public.scan_jobs
  add column if not exists exception_count integer not null default 0;

alter table public.scan_results add column if not exists image_path text;
alter table public.scan_results add column if not exists reviewed_at timestamptz;
alter table public.scan_results add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

create index if not exists scan_results_pending_review_idx
  on public.scan_results (status, reviewed_at, created_at desc);

drop policy if exists "scan_results_update_authenticated" on public.scan_results;
create policy "scan_results_update_authenticated"
  on public.scan_results for update to authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scan-sheets',
  'scan-sheets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "scan_sheets_select" on storage.objects;
create policy "scan_sheets_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'scan-sheets');

drop policy if exists "scan_sheets_insert" on storage.objects;
create policy "scan_sheets_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'scan-sheets');

drop policy if exists "scan_sheets_update" on storage.objects;
create policy "scan_sheets_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'scan-sheets');

drop policy if exists "scan_sheets_delete" on storage.objects;
create policy "scan_sheets_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'scan-sheets');
`;

const hosts = [
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-1-ap-northeast-2.pooler.supabase.com", port: 5432, user: `postgres.${projectRef}` },
  { host: "aws-0-ap-northeast-2.pooler.supabase.com", port: 6543, user: `postgres.${projectRef}` },
  { host: `db.${projectRef}.supabase.co.`, port: 5432, user: "postgres" },
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
    await client.query(sql);
    const check = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'scan_results'
        and column_name in ('image_path', 'reviewed_at', 'reviewed_by')
      order by column_name
    `);
    await client.end();
    console.log("ok", check.rows.map((row) => row.column_name).join(","));
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
