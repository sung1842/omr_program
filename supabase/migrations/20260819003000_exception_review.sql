-- Exception review: keep the scan image, allow manual answers, hide finished rows from the queue.

alter table public.scan_results
  add column if not exists image_path text;

alter table public.scan_results
  add column if not exists reviewed_at timestamptz;

alter table public.scan_results
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

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
