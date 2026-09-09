-- Online Test System - v15 incremental migration
-- Paste this whole file into the Supabase SQL Editor and run it once
-- against a database that already has migration_v13.sql applied.
--
-- Adds multi-tenant "organizations" (one per teacher's own page) with
-- Supabase-Auth-backed teacher accounts. Existing students/tests are moved
-- into a new "legacy" organization so the first person who registers with
-- the shared passphrase becomes its admin and keeps all existing data.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  is_legacy boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'teacher', -- 'admin' | 'teacher'
  created_at timestamptz default now(),
  unique (organization_id, user_id)
);

create table if not exists organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create index if not exists idx_organization_members_org_id on organization_members(organization_id);
create index if not exists idx_organization_members_user_id on organization_members(user_id);
create index if not exists idx_organization_invites_org_id on organization_invites(organization_id);
create index if not exists idx_organization_invites_email on organization_invites(email);

alter table students add column if not exists organization_id uuid references organizations(id);
alter table tests add column if not exists organization_id uuid references organizations(id);

-- Create (once) a legacy organization and move every existing student/test
-- into it. Guarded so re-running this script is a no-op past this point.
do $$
declare
  legacy_org_id uuid;
begin
  select id into legacy_org_id from organizations where is_legacy limit 1;
  if legacy_org_id is null then
    insert into organizations (is_legacy) values (true) returning id into legacy_org_id;
  end if;
  update students set organization_id = legacy_org_id where organization_id is null;
  update tests set organization_id = legacy_org_id where organization_id is null;
end $$;

alter table students alter column organization_id set not null;
alter table tests alter column organization_id set not null;

create index if not exists idx_students_organization_id on students(organization_id);
create index if not exists idx_tests_organization_id on tests(organization_id);
