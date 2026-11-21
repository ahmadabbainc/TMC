create table if not exists public.tmc_jobs (
  id text primary key,
  status text not null default 'uploading',
  progress integer not null default 0 check (progress between 0 and 100),
  message text,
  file_name text not null,
  object_key text not null unique,
  output_key text,
  size_bytes bigint not null,
  client_ip text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tmc_jobs_created_at_idx on public.tmc_jobs (created_at desc);
create index if not exists tmc_jobs_client_ip_created_at_idx on public.tmc_jobs (client_ip, created_at desc);

alter table public.tmc_jobs enable row level security;

-- Only the Edge Function's service-role key reads or writes this table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tmc-videos',
  'tmc-videos',
  false,
  50000000,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
)
on conflict (id) do update
set public = false,
    file_size_limit = 50000000,
    allowed_mime_types = excluded.allowed_mime_types;
