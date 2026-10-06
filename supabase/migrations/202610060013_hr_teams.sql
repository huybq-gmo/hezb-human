begin;

create table public.hr_team (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 100),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  version integer not null default 1
);
create unique index hr_team_name_unique on public.hr_team(lower(name));
alter table public.hr_team enable row level security;
revoke all on public.hr_team from public,anon,authenticated;
grant select on public.hr_team to authenticated;
grant all on public.hr_team to service_role;
create policy hr_team_read on public.hr_team for select to authenticated
  using (internal.has_role('company_owner','hr_admin'));
create trigger hezb_hr_team_audit after insert or update or delete on public.hr_team
  for each row execute function internal.audit_row();
create trigger hezb_hr_team_stamp before update on public.hr_team
  for each row execute function internal.stamp_row();

create table public.hr_team_membership (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.hr_team,
  employee_id uuid not null references public.hr_employee,
  team_role text not null default 'member' check (team_role in ('member','leader')),
  start_date date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  end_date date,
  status text not null default 'active' check (status in ('active','revoked')),
  granted_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (end_date is null or end_date >= start_date),
  unique(team_id,employee_id,start_date),
  exclude using gist(team_id with =,employee_id with =,daterange(start_date,end_date,'[]') with &&) where (status='active')
);
create unique index hr_team_one_active_leader on public.hr_team_membership(team_id)
  where team_role='leader' and status='active';
create index hr_team_members_employee on public.hr_team_membership(employee_id,status);
alter table public.hr_team_membership enable row level security;
revoke all on public.hr_team_membership from public,anon,authenticated;
grant select on public.hr_team_membership to authenticated;
grant all on public.hr_team_membership to service_role;
create policy hr_team_membership_read on public.hr_team_membership for select to authenticated
  using (internal.has_role('company_owner','hr_admin'));
create trigger hezb_hr_team_membership_audit after insert or update or delete on public.hr_team_membership
  for each row execute function internal.audit_row();
create trigger hezb_hr_team_membership_stamp before update on public.hr_team_membership
  for each row execute function internal.stamp_row();

create function internal.revoke_hr_team_memberships_on_termination() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status='terminated' then
    update public.hr_team_membership set status='revoked' where employee_id=new.id and status='active';
  end if;
  return new;
end;
$$;
revoke all on function internal.revoke_hr_team_memberships_on_termination() from public,anon,authenticated;
create trigger hezb_revoke_hr_team_memberships after update of status on public.hr_employee
  for each row execute function internal.revoke_hr_team_memberships_on_termination();

create function public.save_hr_team(p_team_id uuid,p_name text,p_description text,p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner','hr_admin') then raise exception 'FORBIDDEN'; end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'INVALID_NAME'; end if;
  if p_is_active is null then raise exception 'INVALID_STATE'; end if;
  if p_team_id is null then
    insert into public.hr_team(name,description,is_active,created_by,updated_by)
    values(btrim(p_name),nullif(btrim(p_description),''),p_is_active,auth.uid(),auth.uid()) returning id into v_id;
  else
    if not p_is_active and exists(select 1 from public.hr_team_membership where team_id=p_team_id and status='active') then raise exception 'TEAM_HAS_MEMBERS'; end if;
    update public.hr_team set name=btrim(p_name),description=nullif(btrim(p_description),''),is_active=p_is_active,updated_by=auth.uid()
    where id=p_team_id returning id into v_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end;
$$;

create function public.assign_hr_team_member(p_team_id uuid,p_employee_id uuid,p_team_role text,p_start_date date,p_end_date date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner','hr_admin') then raise exception 'FORBIDDEN'; end if;
  if p_team_role not in ('member','leader') then raise exception 'INVALID_ROLE'; end if;
  if p_start_date is null or (p_end_date is not null and p_end_date<p_start_date) then raise exception 'INVALID_PERIOD'; end if;
  if not exists(select 1 from public.hr_team where id=p_team_id and is_active) then raise exception 'TEAM_NOT_ACTIVE'; end if;
  if not exists(select 1 from public.hr_employee where id=p_employee_id and status='active') then raise exception 'EMPLOYEE_NOT_ACTIVE'; end if;
  insert into public.hr_team_membership(team_id,employee_id,team_role,start_date,end_date,granted_by)
    values(p_team_id,p_employee_id,p_team_role,p_start_date,p_end_date,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create function public.revoke_hr_team_member(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not internal.has_role('company_owner','hr_admin') then raise exception 'FORBIDDEN'; end if;
  update public.hr_team_membership set status='revoked' where id=p_membership_id and status='active';
  if not found then raise exception 'INVALID_STATE'; end if;
end;
$$;

revoke all on function public.save_hr_team(uuid,text,text,boolean),public.assign_hr_team_member(uuid,uuid,text,date,date),public.revoke_hr_team_member(uuid) from public,anon;
grant execute on function public.save_hr_team(uuid,text,text,boolean),public.assign_hr_team_member(uuid,uuid,text,date,date),public.revoke_hr_team_member(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
