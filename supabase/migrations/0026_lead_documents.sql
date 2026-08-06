-- ============================================================
-- LEAD DOCUMENTS
--
-- Private storage bucket for files attached to individual leads
-- (KYC documents, signed forms, whatever's relevant). Files are
-- stored under a {tenant_id}/{lead_id}/{filename} path — the
-- storage RLS policy below checks that first path segment against
-- the caller's own tenant_id, the same isolation pattern used
-- everywhere else in this app, just applied to storage instead of
-- a table.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('lead-documents', 'lead-documents', false)
on conflict (id) do nothing;

create table if not exists lead_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table lead_documents enable row level security;

create policy "tenant access on lead_documents" on lead_documents for all
  using (tenant_id = get_my_tenant_id() and has_active_access(tenant_id))
  with check (tenant_id = get_my_tenant_id() and has_active_access(tenant_id));

create policy "tenant access on lead-documents storage" on storage.objects for all
  using (bucket_id = 'lead-documents' and (storage.foldername(name))[1] = get_my_tenant_id()::text)
  with check (bucket_id = 'lead-documents' and (storage.foldername(name))[1] = get_my_tenant_id()::text);
