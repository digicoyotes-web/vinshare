-- Vinshar Integrated Services · Facility Management ERP
-- Run this SQL in your Supabase Project SQL Editor to create the ERP persistence tables.

create table if not exists public.clients (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attrition_records (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lois (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.agreements (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_emails (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.doc_snapshots (
  id text primary key,
  reference text,
  client_id text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security and allow ERP client access via anon key
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'clients',
    'opportunities',
    'proposals',
    'attrition_records',
    'lois',
    'agreements',
    'projects',
    'invoices',
    'payments',
    'project_emails',
    'doc_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('drop policy if exists "erp_anon_full_access" on public.%I;', tbl);
    execute format(
      'create policy "erp_anon_full_access" on public.%I for all to anon, authenticated using (true) with check (true);',
      tbl
    );
  end loop;
end $$;
