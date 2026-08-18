-- Allow wiping scan data from the app, then recreate the default template in JS.

drop policy if exists "scan_results_delete_authenticated" on public.scan_results;
create policy "scan_results_delete_authenticated"
  on public.scan_results for delete to authenticated
  using (true);

drop policy if exists "scan_jobs_delete_authenticated" on public.scan_jobs;
create policy "scan_jobs_delete_authenticated"
  on public.scan_jobs for delete to authenticated
  using (true);

create or replace function public.reset_omr_workspace()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.scan_results;
  delete from public.scan_jobs;
  delete from public.templates;
end;
$$;

revoke all on function public.reset_omr_workspace() from public;
grant execute on function public.reset_omr_workspace() to authenticated;
