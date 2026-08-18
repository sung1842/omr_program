-- Allow recognized-but-invalid ballots (rule overflow) to be stored separately.

alter table public.scan_results
  drop constraint if exists scan_results_status_check;

alter table public.scan_results
  add constraint scan_results_status_check
  check (status in ('success', 'exception', 'failed'));

alter table public.scan_jobs
  add column if not exists exception_count integer not null default 0;
