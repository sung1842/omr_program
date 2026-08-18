-- OMR 집계 서비스 스키마
-- Supabase SQL Editor에서 실행하거나 CLI로 적용합니다.

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_width integer not null,
  image_height integer not null,
  markers jsonb not null,
  questions jsonb not null,
  marker_shape text not null default 'square',
  fill_threshold numeric not null default 0.35,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.scan_jobs (id) on delete set null,
  template_id uuid not null references public.templates (id) on delete cascade,
  filename text not null,
  status text not null check (status in ('success', 'failed')),
  answers jsonb,
  details jsonb,
  error_code text,
  error_message text,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists scan_results_template_id_idx
  on public.scan_results (template_id, created_at desc);

create index if not exists scan_results_status_idx
  on public.scan_results (status);

alter table public.templates enable row level security;
alter table public.scan_jobs enable row level security;
alter table public.scan_results enable row level security;

create policy "templates_select_authenticated"
  on public.templates for select to authenticated
  using (true);

create policy "templates_insert_own"
  on public.templates for insert to authenticated
  with check (auth.uid() = created_by);

create policy "templates_update_authenticated"
  on public.templates for update to authenticated
  using (true)
  with check (true);

create policy "templates_delete_authenticated"
  on public.templates for delete to authenticated
  using (true);

create policy "scan_jobs_select_authenticated"
  on public.scan_jobs for select to authenticated
  using (true);

create policy "scan_jobs_insert_own"
  on public.scan_jobs for insert to authenticated
  with check (auth.uid() = created_by);

create policy "scan_jobs_update_authenticated"
  on public.scan_jobs for update to authenticated
  using (true)
  with check (true);

create policy "scan_results_select_authenticated"
  on public.scan_results for select to authenticated
  using (true);

create policy "scan_results_insert_own"
  on public.scan_results for insert to authenticated
  with check (auth.uid() = created_by);
