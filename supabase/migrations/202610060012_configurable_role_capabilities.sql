begin;

create table public.core_role_permission (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission public.app_role not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  version integer not null default 1,
  unique(role,permission)
);
insert into public.core_role_permission(role,permission)
select r,r from unnest(enum_range(null::public.app_role)) r where r <> 'company_owner';
alter table public.core_role_permission enable row level security;
revoke all on public.core_role_permission from public,anon,authenticated;
grant select on public.core_role_permission to authenticated;
grant all on public.core_role_permission to service_role;
create policy role_permission_read on public.core_role_permission for select to authenticated
  using (internal.has_role('company_owner'));
create trigger hezb_role_permission_audit after insert or update or delete on public.core_role_permission
  for each row execute function internal.audit_row();
create trigger hezb_role_permission_stamp before update on public.core_role_permission
  for each row execute function internal.stamp_row();

create or replace function internal.audit_mask(p_row jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_row)
  where key = any(array['id','status','role','permission','enabled','project_role','version','is_read','is_active']);
$$;

-- Existing role gates now resolve through an Owner-configurable capability map.
-- Owner is always protected; finance_admin can only come from the finance_admin assignment.
create or replace function internal.has_role(variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select internal.is_active_user() and (
    ('company_owner' = any(p_roles) and exists (
      select 1 from public.core_role_assignment a join public.core_user_profile u on u.id=a.user_id and u.is_active
      where a.user_id=auth.uid() and a.role='company_owner' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
    ))
    or ('finance_admin' = any(p_roles) and exists (
      select 1 from public.core_role_assignment a join public.core_user_profile u on u.id=a.user_id and u.is_active
      where a.user_id=auth.uid() and a.role='finance_admin' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
    ))
    or exists (
      select 1 from public.core_role_assignment a
      join public.core_role_permission p on p.role=a.role and p.enabled
      join public.core_user_profile u on u.id=a.user_id and u.is_active
      where a.user_id=auth.uid() and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
        and p.permission::text=any(p_roles) and p.permission not in ('company_owner','finance_admin')
    )
  );
$$;

create or replace function public.get_my_roles() returns table(role public.app_role)
language sql stable security definer set search_path = '' as $$
  select distinct p.permission from public.core_role_assignment a
  join public.core_user_profile u on u.id=a.user_id and u.is_active
  join public.core_role_permission p on p.role=a.role and p.enabled
  where internal.is_active_user() and a.user_id=auth.uid() and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
    and p.permission not in ('company_owner','finance_admin')
  union
  select 'company_owner'::public.app_role from public.core_role_assignment a
  join public.core_user_profile u on u.id=a.user_id and u.is_active
  where internal.is_active_user() and a.user_id=auth.uid() and a.role='company_owner' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
  union
  select 'finance_admin'::public.app_role from public.core_role_assignment a
  join public.core_user_profile u on u.id=a.user_id and u.is_active
  where internal.is_active_user() and a.user_id=auth.uid() and a.role='finance_admin' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now());
$$;

create function public.configure_role_permission(p_role public.app_role,p_permission public.app_role,p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.core_role_assignment a join public.core_user_profile u on u.id=a.user_id and u.is_active
    where a.user_id=auth.uid() and a.role='company_owner' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
  ) then raise exception 'FORBIDDEN'; end if;
  if p_role='company_owner' or p_permission in ('company_owner','finance_admin') then raise exception 'PROTECTED_PERMISSION'; end if;
  insert into public.core_role_permission(role,permission,enabled,created_by,updated_by)
  values(p_role,p_permission,p_enabled,auth.uid(),auth.uid())
  on conflict(role,permission) do update set enabled=excluded.enabled,updated_by=auth.uid(),updated_at=now(),version=public.core_role_permission.version+1;
end;
$$;
revoke all on function public.configure_role_permission(public.app_role,public.app_role,boolean) from public,anon;
grant execute on function public.configure_role_permission(public.app_role,public.app_role,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
