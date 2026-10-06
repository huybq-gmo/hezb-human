begin;

-- Custom permission codes are named aliases for existing, audited capabilities.
-- A new code can only map to an existing non-protected capability; it cannot
-- invent database behavior or grant Owner/Finance access.
create table public.core_permission_catalog (
  id uuid not null default gen_random_uuid() unique,
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,47}$'),
  label text not null check (length(btrim(label)) between 2 and 80),
  description text,
  capability public.app_role not null check (capability <> 'company_owner'),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);
insert into public.core_permission_catalog(code,label,description,capability,is_system)
select r::text, replace(initcap(replace(r::text,'_',' ')),'Hr ','HR '),
       'Quyền nghiệp vụ tương ứng vai trò ' || r::text, r, true
from unnest(enum_range(null::public.app_role)) r
where r <> 'company_owner';

alter table public.core_role_permission alter column permission type text using permission::text;
alter table public.core_role_permission add constraint core_role_permission_catalog_fk
  foreign key(permission) references public.core_permission_catalog(code);
alter table public.core_permission_catalog enable row level security;
revoke all on public.core_permission_catalog from public,anon,authenticated;
grant select on public.core_permission_catalog to authenticated;
grant all on public.core_permission_catalog to service_role;
create policy permission_catalog_read on public.core_permission_catalog for select to authenticated
  using (internal.is_active_user());
create trigger hezb_permission_catalog_audit after insert or update or delete on public.core_permission_catalog
  for each row execute function internal.audit_row();

create or replace function internal.audit_mask(p_row jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_row)
  where key = any(array['id','status','role','permission','code','label','capability','enabled','project_role','version','is_read','is_active']);
$$;

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
      join public.core_permission_catalog c on c.code=p.permission
      join public.core_user_profile u on u.id=a.user_id and u.is_active
      where a.user_id=auth.uid() and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
        and c.capability::text=any(p_roles) and c.capability not in ('company_owner','finance_admin')
    )
  );
$$;

create or replace function public.get_my_roles() returns table(role public.app_role)
language sql stable security definer set search_path = '' as $$
  select distinct c.capability from public.core_role_assignment a
  join public.core_user_profile u on u.id=a.user_id and u.is_active
  join public.core_role_permission p on p.role=a.role and p.enabled
  join public.core_permission_catalog c on c.code=p.permission
  where internal.is_active_user() and a.user_id=auth.uid() and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
    and c.capability not in ('company_owner','finance_admin')
  union
  select 'company_owner'::public.app_role from public.core_role_assignment a
  join public.core_user_profile u on u.id=a.user_id and u.is_active
  where internal.is_active_user() and a.user_id=auth.uid() and a.role='company_owner' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
  union
  select 'finance_admin'::public.app_role from public.core_role_assignment a
  join public.core_user_profile u on u.id=a.user_id and u.is_active
  where internal.is_active_user() and a.user_id=auth.uid() and a.role='finance_admin' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now());
$$;

drop function public.configure_role_permission(public.app_role,public.app_role,boolean);
create function public.configure_role_permission(p_role public.app_role,p_permission text,p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_capability public.app_role;
begin
  if not exists (
    select 1 from public.core_role_assignment a join public.core_user_profile u on u.id=a.user_id and u.is_active
    where a.user_id=auth.uid() and a.role='company_owner' and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
  ) then raise exception 'FORBIDDEN'; end if;
  if p_role='company_owner' or p_permission='company_owner' or p_enabled is null then raise exception 'PROTECTED_PERMISSION'; end if;
  select capability into v_capability from public.core_permission_catalog where code=p_permission;
  if not found then raise exception 'UNKNOWN_PERMISSION'; end if;
  if v_capability in ('company_owner','finance_admin') then raise exception 'PROTECTED_PERMISSION'; end if;
  insert into public.core_role_permission(role,permission,enabled,created_by,updated_by)
  values(p_role,p_permission,p_enabled,auth.uid(),auth.uid())
  on conflict(role,permission) do update set enabled=excluded.enabled,updated_by=auth.uid(),updated_at=now(),version=public.core_role_permission.version+1;
end;
$$;
revoke all on function public.configure_role_permission(public.app_role,text,boolean) from public,anon;
grant execute on function public.configure_role_permission(public.app_role,text,boolean) to authenticated;

create function public.create_permission_code(p_code text,p_label text,p_description text,p_capability public.app_role)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text := lower(btrim(coalesce(p_code,'')));
begin
  if not internal.has_role('company_owner') then raise exception 'FORBIDDEN'; end if;
  if v_code !~ '^[a-z][a-z0-9_]{1,47}$' then raise exception 'INVALID_CODE'; end if;
  if length(btrim(coalesce(p_label,''))) not between 2 and 80 then raise exception 'INVALID_LABEL'; end if;
  if p_capability is null or p_capability in ('company_owner','finance_admin') then raise exception 'PROTECTED_PERMISSION'; end if;
  insert into public.core_permission_catalog(code,label,description,capability,is_system,created_by)
  values(v_code,btrim(p_label),nullif(btrim(p_description),''),p_capability,false,auth.uid());
  return v_code;
exception when unique_violation then raise exception 'PERMISSION_CODE_EXISTS';
end;
$$;
revoke all on function public.create_permission_code(text,text,text,public.app_role) from public,anon;
grant execute on function public.create_permission_code(text,text,text,public.app_role) to authenticated;

-- Issue fields can only be edited through this state- and role-checked RPC.
drop policy issue_update on public.work_issue;
revoke update (title,description,priority,assignee_id,story_points,due_date,board_order) on public.work_issue from authenticated;
create function public.update_issue_fields(p_issue_id uuid,p_fields jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.work_issue;
  v_roles text[];
  v_can_manage boolean;
begin
  if not internal.is_active_user() then raise exception 'FORBIDDEN'; end if;
  if p_fields is null or jsonb_typeof(p_fields)<>'object' or p_fields='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
  if exists(select 1 from jsonb_object_keys(p_fields) as item(key) where item.key not in ('title','description','priority','assignee_id','story_points','due_date')) then
    raise exception 'INVALID_FIELDS';
  end if;
  select * into v_issue from public.work_issue where id=p_issue_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_roles := internal.project_roles(v_issue.project_id);
  v_can_manage := internal.has_role('company_owner') or v_roles && array['pm','team_leader'];
  if v_can_manage then
    if v_issue.status in ('done','cancelled') then raise exception 'ISSUE_CLOSED'; end if;
  else
    if cardinality(v_roles)=0 or v_issue.reporter_id is distinct from auth.uid() or v_issue.status not in ('backlog','todo') then raise exception 'FORBIDDEN'; end if;
    if exists(select 1 from jsonb_object_keys(p_fields) as item(key) where item.key not in ('title','description')) then raise exception 'FORBIDDEN'; end if;
  end if;
  if p_fields ? 'title' and length(btrim(coalesce(p_fields->>'title',''))) not between 1 and 250 then raise exception 'INVALID_TITLE'; end if;
  if p_fields ? 'description' and length(coalesce(p_fields->>'description',''))>10000 then raise exception 'INVALID_DESCRIPTION'; end if;
  if p_fields ? 'priority' and p_fields->>'priority' not in ('critical','high','medium','low') then raise exception 'INVALID_PRIORITY'; end if;
  if p_fields ? 'story_points' and p_fields->>'story_points' is not null and (p_fields->>'story_points')::integer not between 0 and 100 then raise exception 'INVALID_STORY_POINTS'; end if;
  if p_fields ? 'assignee_id' and p_fields->>'assignee_id' is not null and not exists (
    select 1 from public.project_membership m where m.project_id=v_issue.project_id and m.user_id=(p_fields->>'assignee_id')::uuid
      and m.status='active' and m.revoked_at is null and m.start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
      and (m.end_date is null or m.end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  ) then raise exception 'ASSIGNEE_NOT_MEMBER'; end if;
  update public.work_issue set
    title=case when p_fields ? 'title' then btrim(p_fields->>'title') else title end,
    description=case when p_fields ? 'description' then nullif(p_fields->>'description','') else description end,
    priority=case when p_fields ? 'priority' then (p_fields->>'priority')::public.issue_priority else priority end,
    assignee_id=case when p_fields ? 'assignee_id' then (p_fields->>'assignee_id')::uuid else assignee_id end,
    story_points=case when p_fields ? 'story_points' then (p_fields->>'story_points')::integer else story_points end,
    due_date=case when p_fields ? 'due_date' then (p_fields->>'due_date')::date else due_date end
  where id=p_issue_id;
end;
$$;
revoke all on function public.update_issue_fields(uuid,jsonb) from public,anon;
grant execute on function public.update_issue_fields(uuid,jsonb) to authenticated;

-- Only project managers, team leaders and Company Owners may remove stored files.
create function internal.can_manage_attachment(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_project uuid; v_issue uuid;
begin
  if not internal.is_active_user() or array_length(string_to_array(p_name,'/'),1)<>3 then return false; end if;
  begin
    v_project := split_part(p_name,'/',1)::uuid;
    v_issue := split_part(p_name,'/',2)::uuid;
  exception when invalid_text_representation then return false;
  end;
  return exists(select 1 from public.work_issue i where i.id=v_issue and i.project_id=v_project)
    and (internal.has_role('company_owner') or internal.project_roles(v_project) && array['pm','team_leader']);
end;
$$;
revoke all on function internal.can_manage_attachment(text) from public,anon;
grant execute on function internal.can_manage_attachment(text) to authenticated;
create policy hezb_attachment_delete on storage.objects for delete to authenticated
  using (bucket_id='issue-attachments' and internal.can_manage_attachment(name));

create function public.update_issue_attachment_reference(p_path text,p_new_path text default null)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_issue uuid; v_comment_ids uuid[];
begin
  if not internal.can_manage_attachment(p_path) then raise exception 'FORBIDDEN'; end if;
  v_issue := split_part(p_path,'/',2)::uuid;
  if p_new_path is not null and (
    split_part(p_new_path,'/',1)<>split_part(p_path,'/',1)
    or split_part(p_new_path,'/',2)<>split_part(p_path,'/',2)
    or not internal.can_manage_attachment(p_new_path)
  ) then raise exception 'INVALID_ATTACHMENT_PATH'; end if;
  with changed as (
    update public.work_issue_comment c
    set attachment_paths=case when p_new_path is null
      then array_remove(c.attachment_paths,p_path)
      else array_replace(c.attachment_paths,p_path,p_new_path) end
    where c.issue_id=v_issue and p_path=any(c.attachment_paths)
    returning c.id
  ) select coalesce(array_agg(id),'{}'::uuid[]) into v_comment_ids from changed;
  return v_comment_ids;
end;
$$;
revoke all on function public.update_issue_attachment_reference(text,text) from public,anon;
grant execute on function public.update_issue_attachment_reference(text,text) to authenticated;

create function public.restore_issue_attachment_reference(p_path text,p_comment_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_issue uuid;
begin
  if not internal.can_manage_attachment(p_path) then raise exception 'FORBIDDEN'; end if;
  v_issue := split_part(p_path,'/',2)::uuid;
  update public.work_issue_comment c set attachment_paths=array_append(c.attachment_paths,p_path)
  where c.issue_id=v_issue and c.id=any(coalesce(p_comment_ids,'{}'::uuid[])) and not p_path=any(c.attachment_paths);
end;
$$;
revoke all on function public.restore_issue_attachment_reference(text,uuid[]) from public,anon;
grant execute on function public.restore_issue_attachment_reference(text,uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
