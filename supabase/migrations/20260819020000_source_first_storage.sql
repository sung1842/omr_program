-- Keep the untouched upload instead of a re-rendered page image.
-- Every sheet is stored before recognition runs and removed once it lands cleanly,
-- so an exception always has the original bytes to review.

alter table public.scan_results
  add column if not exists source_path text;

alter table public.scan_results
  add column if not exists source_page integer;

create index if not exists scan_results_source_path_idx
  on public.scan_results (source_path)
  where source_path is not null;

-- Originals are whole PDFs or full-resolution scans, so the 5 MB image cap no longer fits.
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/bmp'
  ]
where id = 'scan-sheets';
