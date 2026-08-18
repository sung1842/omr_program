-- Allow deleting exception images after review, and push new rows to open tabs.

drop policy if exists "scan_sheets_delete" on storage.objects;
create policy "scan_sheets_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'scan-sheets');

alter table public.scan_results replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scan_results'
  ) then
    execute 'alter publication supabase_realtime add table public.scan_results';
  end if;
end $$;
