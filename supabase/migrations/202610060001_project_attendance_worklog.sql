begin;

alter table public.work_worklog
  add column work_type text not null default 'coding'
  check (work_type in ('coding', 'study', 'test', 'meeting', 'review', 'support', 'other'));

alter table public.work_issue_comment
  add column attachment_paths text[] not null default '{}';

-- Remove department from the HR-facing API while retaining legacy values.
revoke update (department) on public.hr_employee from authenticated;
drop view public.dashboard_team_utilization;
create view public.dashboard_team_utilization with (security_invoker = true) as
  select e.id as employee_id, e.full_name, coalesce(sum(t.total_hours), 0) as approved_hours,
    count(distinct t.project_id) as active_projects
  from public.hr_employee e
  left join public.work_timesheet t on t.employee_id = e.id and t.status in ('pm_approved', 'locked')
  where e.status = 'active'
  group by e.id, e.full_name;
revoke all on public.dashboard_team_utilization from public, anon, authenticated;
grant select on public.dashboard_team_utilization to authenticated, service_role;

create table public.work_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employee on delete cascade,
  work_date date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date),
  check (check_out_at is null or check_out_at >= check_in_at)
);
alter table public.work_attendance enable row level security;
revoke all on public.work_attendance from public, anon, authenticated;
grant select on public.work_attendance to authenticated;
grant all on public.work_attendance to service_role;
create policy attendance_read on public.work_attendance for select to authenticated
  using (internal.owns_employee(employee_id) or internal.has_role('company_owner','hr_admin'));
create trigger hezb_attendance_audit after insert or update or delete on public.work_attendance
  for each row execute function internal.audit_row();

create function public.set_work_attendance(p_action text) returns public.work_attendance
language plpgsql security definer set search_path = '' as $$
declare v_employee uuid; v_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_row public.work_attendance;
begin
  if p_action is null or p_action not in ('check_in', 'check_out') or not internal.is_active_user() then raise exception 'FORBIDDEN'; end if;
  select id into v_employee from public.hr_employee where user_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'EMPLOYEE_NOT_ACTIVE'; end if;
  if p_action = 'check_in' then
    insert into public.work_attendance(employee_id, work_date) values (v_employee, v_date)
      on conflict (employee_id, work_date) do nothing;
  else
    update public.work_attendance set check_out_at = now()
      where employee_id = v_employee and work_date = v_date and check_out_at is null;
    if not found then raise exception 'CHECK_IN_REQUIRED'; end if;
  end if;
  select * into v_row from public.work_attendance where employee_id = v_employee and work_date = v_date;
  if p_action = 'check_in' and v_row.check_out_at is not null then raise exception 'ALREADY_CHECKED_OUT'; end if;
  return v_row;
end;
$$;
revoke all on function public.set_work_attendance(text) from public, anon;
grant execute on function public.set_work_attendance(text) to authenticated;

create function public.create_project(
  p_client_id uuid, p_name text, p_code text, p_description text,
  p_billing_type public.billing_type, p_budget_amount numeric,
  p_budget_currency text, p_start_date date, p_end_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner','director','project_manager') then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(p_name)), 0) = 0 or p_budget_amount < 0
    or (p_end_date is not null and p_start_date is not null and p_end_date < p_start_date) then raise exception 'INVALID_PROJECT'; end if;
  if not exists (select 1 from public.project_client where id = p_client_id and is_active) then raise exception 'CLIENT_NOT_FOUND'; end if;
  insert into public.project_project(client_id, name, code, description, billing_type, budget_amount, budget_currency, start_date, end_date, created_by, updated_by)
  values (p_client_id, btrim(p_name), nullif(btrim(p_code), ''), nullif(btrim(p_description), ''), p_billing_type,
    p_budget_amount, coalesce(nullif(upper(btrim(p_budget_currency)), ''), 'VND'), p_start_date, p_end_date, auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_project(
  p_project_id uuid, p_client_id uuid, p_name text, p_code text, p_description text,
  p_status public.project_status, p_billing_type public.billing_type, p_budget_amount numeric,
  p_budget_currency text, p_start_date date, p_end_date date
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not internal.has_role('company_owner','director','project_manager') and not ('pm' = any(internal.project_roles(p_project_id))) then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(p_name)), 0) = 0 or p_budget_amount < 0
    or (p_end_date is not null and p_start_date is not null and p_end_date < p_start_date) then raise exception 'INVALID_PROJECT'; end if;
  if not exists (select 1 from public.project_client where id = p_client_id and is_active) then raise exception 'CLIENT_NOT_FOUND'; end if;
  update public.project_project set client_id = p_client_id, name = btrim(p_name), code = nullif(btrim(p_code), ''),
    description = nullif(btrim(p_description), ''), status = p_status, billing_type = p_billing_type,
    budget_amount = p_budget_amount, budget_currency = coalesce(nullif(upper(btrim(p_budget_currency)), ''), 'VND'),
    start_date = p_start_date, end_date = p_end_date, updated_at = now(), updated_by = auth.uid(), version = version + 1
  where id = p_project_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

create function public.assign_project_member(p_project_id uuid, p_user_id uuid, p_project_role public.project_role, p_start_date date default current_date, p_end_date date default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not internal.has_role('company_owner','director','project_manager') and not ('pm' = any(internal.project_roles(p_project_id))) then raise exception 'FORBIDDEN'; end if;
  if p_start_date is null or (p_end_date is not null and p_end_date < p_start_date) then raise exception 'INVALID_DATE_RANGE'; end if;
  if not exists (select 1 from public.core_user_profile where id = p_user_id and is_active) then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.project_membership(project_id, user_id, project_role, granted_by, start_date, end_date, status, revoked_at, revoked_by)
  values (p_project_id, p_user_id, p_project_role, auth.uid(), p_start_date, p_end_date, 'active', null, null)
  on conflict (project_id, user_id, project_role) do update set start_date = excluded.start_date, end_date = excluded.end_date,
    status = 'active', revoked_at = null, revoked_by = null, granted_by = auth.uid(), updated_at = now(), version = project_membership.version + 1;
end;
$$;

create function public.revoke_project_member(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.project_membership where id = p_membership_id;
  if v_project is null then raise exception 'NOT_FOUND'; end if;
  if not internal.has_role('company_owner','director','project_manager') and not ('pm' = any(internal.project_roles(v_project))) then raise exception 'FORBIDDEN'; end if;
  update public.project_membership set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), updated_at = now(), version = version + 1
    where id = p_membership_id and status <> 'revoked';
end;
$$;

revoke all on function public.create_project(uuid,text,text,text,public.billing_type,numeric,text,date,date),
  public.update_project(uuid,uuid,text,text,text,public.project_status,public.billing_type,numeric,text,date,date),
  public.assign_project_member(uuid,uuid,public.project_role,date,date), public.revoke_project_member(uuid)
  from public, anon;
grant execute on function public.create_project(uuid,text,text,text,public.billing_type,numeric,text,date,date),
  public.update_project(uuid,uuid,text,text,text,public.project_status,public.billing_type,numeric,text,date,date),
  public.assign_project_member(uuid,uuid,public.project_role,date,date), public.revoke_project_member(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
