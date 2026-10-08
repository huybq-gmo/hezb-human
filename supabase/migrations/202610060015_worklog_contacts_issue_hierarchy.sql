begin;

grant update (work_type) on public.work_worklog to authenticated;
drop policy worklog_delete on public.work_worklog;
create policy worklog_delete on public.work_worklog for delete to authenticated
  using (internal.owns_employee(employee_id) and internal.is_project_member(project_id) and status='draft');

-- The original worklog guard checks the destination date. Also protect the
-- source date when moving a draft out of an already locked project period.
create function internal.guard_worklog_source_period() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.logged_date is distinct from old.logged_date and exists (
    select 1 from public.work_timesheet_period_lock l where l.project_id=old.project_id
      and old.logged_date between l.period_start and l.period_end
  ) then raise exception 'LOCKED'; end if;
  return new;
end;
$$;
revoke all on function internal.guard_worklog_source_period() from public,anon,authenticated;
create trigger hezb_worklog_source_period before update on public.work_worklog
  for each row execute function internal.guard_worklog_source_period();

create table public.project_client_contact (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.project_client,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  email text check (email is null or length(email)<=254),
  phone text check (phone is null or length(phone)<=40),
  title text check (title is null or length(title)<=120),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  version integer not null default 1
);
create index client_contact_client on public.project_client_contact(client_id);
create unique index client_contact_one_primary on public.project_client_contact(client_id) where is_primary;
alter table public.project_client_contact enable row level security;
revoke all on public.project_client_contact from public,anon,authenticated;
grant select on public.project_client_contact to authenticated;
grant all on public.project_client_contact to service_role;
create policy client_contact_read on public.project_client_contact for select to authenticated
  using (internal.is_active_user() and exists (select 1 from public.project_client c where c.id=client_id));
create trigger hezb_client_contact_audit after insert or update or delete on public.project_client_contact
  for each row execute function internal.audit_row();
create trigger hezb_client_contact_stamp before update on public.project_client_contact
  for each row execute function internal.stamp_row();

create function public.save_project_client_contact(
  p_contact_id uuid,p_client_id uuid,p_full_name text,p_email text,p_phone text,p_title text,p_is_primary boolean,
  p_expected_version integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_contact public.project_client_contact; v_id uuid;
begin
  if not internal.has_role('company_owner','director','project_manager','finance_admin') then raise exception 'FORBIDDEN'; end if;
  if length(btrim(coalesce(p_full_name,''))) not between 1 and 160 or p_is_primary is null
    or length(coalesce(p_email,''))>254 or length(coalesce(p_phone,''))>40 or length(coalesce(p_title,''))>120
    or (nullif(btrim(p_email),'') is not null and btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    then raise exception 'INVALID_CONTACT'; end if;
  -- Serialize primary-contact changes for this client.
  perform 1 from public.project_client where id=p_client_id and is_active for update;
  if not found then raise exception 'CLIENT_NOT_FOUND'; end if;
  if p_contact_id is not null then
    select * into v_contact from public.project_client_contact where id=p_contact_id and client_id=p_client_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_expected_version is null or v_contact.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
  end if;
  if p_is_primary then
    update public.project_client_contact set is_primary=false where client_id=p_client_id and is_primary and id is distinct from p_contact_id;
  end if;
  if p_contact_id is null then
    insert into public.project_client_contact(client_id,full_name,email,phone,title,is_primary,created_by,updated_by)
    values(p_client_id,btrim(p_full_name),nullif(btrim(p_email),''),nullif(btrim(p_phone),''),nullif(btrim(p_title),''),p_is_primary,auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.project_client_contact set full_name=btrim(p_full_name),email=nullif(btrim(p_email),''),
      phone=nullif(btrim(p_phone),''),title=nullif(btrim(p_title),''),is_primary=p_is_primary where id=p_contact_id returning id into v_id;
  end if;
  return v_id;
end;
$$;
create function public.delete_project_client_contact(p_contact_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_version integer;
begin
  if not internal.has_role('company_owner','director','project_manager','finance_admin') then raise exception 'FORBIDDEN'; end if;
  select client_id into v_client from public.project_client_contact where id=p_contact_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.project_client where id=v_client for update;
  select version into v_version from public.project_client_contact where id=p_contact_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is null or v_version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
  delete from public.project_client_contact where id=p_contact_id;
end;
$$;
revoke all on function public.save_project_client_contact(uuid,uuid,text,text,text,text,boolean,integer),
  public.delete_project_client_contact(uuid,integer) from public,anon;
grant execute on function public.save_project_client_contact(uuid,uuid,text,text,text,text,boolean,integer),
  public.delete_project_client_contact(uuid,integer) to authenticated;

create index work_issue_parent on public.work_issue(parent_id) where parent_id is not null;
create function internal.guard_issue_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_parent public.work_issue;
begin
  if new.parent_id is null then return new; end if;
  perform 1 from public.project_project where id=new.project_id for update;
  select * into v_parent from public.work_issue where id=new.parent_id;
  if not found or v_parent.project_id<>new.project_id or new.parent_id=new.id then raise exception 'INVALID_PARENT'; end if;
  if v_parent.type not in ('epic','story') then raise exception 'INVALID_PARENT_TYPE'; end if;
  if exists (
    with recursive ancestors as (
      select i.id,i.parent_id,array[i.id] as path from public.work_issue i where i.id=new.parent_id
      union all
      select i.id,i.parent_id,a.path || i.id from public.work_issue i join ancestors a on i.id=a.parent_id
        where not i.id=any(a.path)
    ) select 1 from ancestors where id=new.id
  ) then raise exception 'PARENT_CYCLE'; end if;
  return new;
end;
$$;
revoke all on function internal.guard_issue_parent() from public,anon,authenticated;
create trigger hezb_issue_parent before insert or update of parent_id,project_id on public.work_issue
  for each row execute function internal.guard_issue_parent();

create function public.set_issue_parent(p_issue_id uuid,p_parent_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_issue public.work_issue; v_project uuid;
begin
  if not internal.is_active_user() then raise exception 'FORBIDDEN'; end if;
  select project_id into v_project from public.work_issue where id=p_issue_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.project_project where id=v_project for update;
  select * into v_issue from public.work_issue where id=p_issue_id for update;
  if not (internal.has_role('company_owner') or internal.project_roles(v_project) && array['pm','team_leader']
    or (internal.is_project_member(v_project) and v_issue.reporter_id=auth.uid() and v_issue.status in ('backlog','todo')))
    then raise exception 'FORBIDDEN'; end if;
  if v_issue.status in ('done','cancelled') then raise exception 'ISSUE_CLOSED'; end if;
  if p_expected_version is null or v_issue.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
  update public.work_issue set parent_id=p_parent_id where id=p_issue_id;
end;
$$;
revoke all on function public.set_issue_parent(uuid,uuid,integer) from public,anon;
grant execute on function public.set_issue_parent(uuid,uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
