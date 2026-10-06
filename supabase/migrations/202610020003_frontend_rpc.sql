-- RPCs invoked by the existing frontend. Do not expose internal mutation helpers.
begin;

create table public.work_timesheet_period_lock (
  project_id uuid not null references public.project_project,
  period_start date not null,
  period_end date not null,
  locked_at timestamptz not null default now(),
  locked_by uuid not null references auth.users,
  primary key (project_id, period_start, period_end),
  check (period_end >= period_start and period_end - period_start <= 30)
);
alter table public.work_timesheet_period_lock enable row level security;
revoke all on public.work_timesheet_period_lock from public, anon, authenticated;
grant select on public.work_timesheet_period_lock to authenticated;
grant all on public.work_timesheet_period_lock to service_role;
create policy period_lock_read on public.work_timesheet_period_lock for select to authenticated
  using (internal.is_project_member(project_id) or internal.is_project_reviewer(project_id));

create function internal.notify(p_recipient uuid, p_type public.notification_type, p_title text, p_link text, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  insert into public.core_notification(recipient_id, type, title, link, dedupe_key)
  values (p_recipient, p_type, p_title, p_link, p_dedupe) on conflict (dedupe_key) do nothing;
end;
$$;
create function internal.check_timesheet_reviewer(p_project_id uuid, p_employee_id uuid, p_creator uuid, p_step public.approval_step)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not internal.is_active_user() then raise exception 'FORBIDDEN'; end if;
  if not (internal.has_role('company_owner')
    or (p_step = 'leader' and (internal.has_role('hr_admin') or 'team_leader' = any(internal.project_roles(p_project_id))))
    or (p_step = 'pm' and 'pm' = any(internal.project_roles(p_project_id)))) then raise exception 'FORBIDDEN'; end if;
  if internal.owns_employee(p_employee_id) or p_creator = auth.uid() then raise exception 'SOD_VIOLATION'; end if;
end;
$$;
create function internal.guard_worklog() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_employee uuid; v_date date;
begin
  v_project := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  v_employee := case when tg_op = 'DELETE' then old.employee_id else new.employee_id end;
  v_date := case when tg_op = 'DELETE' then old.logged_date else new.logged_date end;
  perform 1 from public.project_project where id = v_project for update;
  perform 1 from public.hr_employee where id = v_employee for update;
  if tg_op = 'UPDATE' then
    if (new.project_id, new.employee_id, new.issue_id, new.created_by, new.created_at)
      is distinct from (old.project_id, old.employee_id, old.issue_id, old.created_by, old.created_at) then raise exception 'IMMUTABLE_IDENTITY'; end if;
    -- RPC-only status changes do not edit the captured worklog payload.
    if (to_jsonb(new) - array['status','updated_at','version']) = (to_jsonb(old) - array['status','updated_at','version']) then return new; end if;
    if old.status <> 'draft' then raise exception 'LOCKED'; end if;
  elsif tg_op = 'DELETE' and old.status <> 'draft' then raise exception 'LOCKED'; end if;
  if exists (select 1 from public.work_timesheet_period_lock where project_id = v_project and v_date between period_start and period_end)
    or exists (select 1 from public.work_timesheet where employee_id = v_employee and project_id = v_project
      and (v_date between period_start and period_end or (tg_op = 'UPDATE' and old.logged_date between period_start and period_end)) and status <> 'draft')
  then raise exception 'LOCKED'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.logged_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'FUTURE_WORKLOG'; end if;
  if not exists (select 1 from public.hr_employee where id = v_employee and status = 'active') then raise exception 'EMPLOYEE_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.project_project where id = v_project and status = 'active') then raise exception 'PROJECT_NOT_ACTIVE'; end if;
  if coalesce((select sum(hours) from public.work_worklog where employee_id = v_employee and logged_date = new.logged_date and id <> new.id), 0) + new.hours > 24
    then raise exception 'DAILY_HOURS_EXCEEDED'; end if;
  return new;
end;
$$;
create trigger hezb_worklog_guard before insert or update or delete on public.work_worklog
  for each row execute function internal.guard_worklog();
create function internal.guard_locked_timesheet() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'locked' then raise exception 'LOCKED'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger hezb_locked_timesheet before update or delete on public.work_timesheet
  for each row execute function internal.guard_locked_timesheet();

create function public.assign_role(p_target_user_id uuid, p_role public.app_role, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  lock table public.core_role_assignment in share row exclusive mode;
  if not internal.has_role('company_owner') then raise exception 'FORBIDDEN'; end if;
  if p_expires_at <= now() or (p_role = 'company_owner' and p_expires_at is not null) then raise exception 'INVALID_EXPIRY'; end if;
  if not exists (select 1 from public.core_user_profile where id = p_target_user_id and is_active) then raise exception 'NOT_FOUND'; end if;
  insert into public.core_role_assignment(user_id, role, granted_by, expires_at)
  values (p_target_user_id, p_role, auth.uid(), p_expires_at)
  on conflict (user_id, role) do update set revoked_at = null, expires_at = excluded.expires_at, granted_by = auth.uid(), granted_at = now();
end;
$$;
create function public.revoke_role(p_target_user_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  lock table public.core_role_assignment in share row exclusive mode;
  if not internal.has_role('company_owner') then raise exception 'FORBIDDEN'; end if;
  if p_role = 'company_owner' and not exists (
    select 1 from public.core_role_assignment r join public.core_user_profile p on p.id = r.user_id and p.is_active
    where r.role = 'company_owner' and r.user_id <> p_target_user_id and r.revoked_at is null and (r.expires_at is null or r.expires_at > now())
  ) then raise exception 'LAST_OWNER'; end if;
  update public.core_role_assignment set revoked_at = now() where user_id = p_target_user_id and role = p_role and revoked_at is null;
end;
$$;
create function public.transition_employee_status(p_employee_id uuid, p_new_status public.employee_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp public.hr_employee;
begin
  if not internal.has_role('company_owner', 'hr_admin') then raise exception 'FORBIDDEN'; end if;
  lock table public.core_role_assignment in share row exclusive mode;
  select * into v_emp from public.hr_employee where id = p_employee_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not ((v_emp.status = 'onboarding' and p_new_status in ('active','terminated'))
    or (v_emp.status = 'active' and p_new_status = 'offboarding') or (v_emp.status = 'offboarding' and p_new_status = 'terminated')) then raise exception 'INVALID_TRANSITION'; end if;
  if p_new_status = 'terminated' and exists (select 1 from public.core_role_assignment where user_id = v_emp.user_id and role = 'company_owner' and revoked_at is null)
    and not exists (select 1 from public.core_role_assignment r join public.core_user_profile p on p.id = r.user_id and p.is_active
      where r.role = 'company_owner' and r.user_id <> v_emp.user_id and r.revoked_at is null and (r.expires_at is null or r.expires_at > now())) then raise exception 'LAST_OWNER'; end if;
  update public.hr_employee set status = p_new_status,
    terminate_date = case when p_new_status = 'terminated' then (now() at time zone 'Asia/Ho_Chi_Minh')::date else terminate_date end where id = p_employee_id;
  if p_new_status = 'terminated' and v_emp.user_id is not null then
    update public.core_user_profile set is_active = false where id = v_emp.user_id;
    update public.core_role_assignment set revoked_at = now() where user_id = v_emp.user_id and revoked_at is null;
    update public.project_membership set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where user_id = v_emp.user_id and status = 'active';
  end if;
end;
$$;
create function public.approve_leave(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.hr_leave_request; v_balance public.hr_leave_balance; v_user uuid;
begin
  if not internal.has_role('company_owner','hr_admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_req from public.hr_leave_request where id = p_request_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'INVALID_STATE'; end if;
  select user_id into v_user from public.hr_employee where id = v_req.employee_id;
  if v_req.created_by = auth.uid() or v_user = auth.uid() then raise exception 'SOD_VIOLATION'; end if;
  select * into v_balance from public.hr_leave_balance where employee_id = v_req.employee_id and leave_type_id = v_req.leave_type_id
    and year = extract(year from v_req.start_date)::int for update;
  if not found or v_balance.remaining_days < v_req.days_requested then raise exception 'INSUFFICIENT_BALANCE'; end if;
  if exists (select 1 from public.hr_leave_request where employee_id = v_req.employee_id and status = 'approved'
    and start_date <= v_req.end_date and end_date >= v_req.start_date) then raise exception 'LEAVE_OVERLAP'; end if;
  update public.hr_leave_balance set used_days = used_days + v_req.days_requested where id = v_balance.id;
  update public.hr_leave_request set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_request_id;
  perform internal.notify(v_user, 'leave_approved', 'Đơn nghỉ phép đã được duyệt', '/dashboard/hr/leave', 'leave_approved_' || p_request_id);
end;
$$;
create function public.reject_leave(p_request_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.hr_leave_request; v_user uuid;
begin
  if not internal.has_role('company_owner','hr_admin') then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(p_reason)),0) = 0 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_req from public.hr_leave_request where id = p_request_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'INVALID_STATE'; end if;
  select user_id into v_user from public.hr_employee where id = v_req.employee_id;
  if v_req.created_by = auth.uid() or v_user = auth.uid() then raise exception 'SOD_VIOLATION'; end if;
  update public.hr_leave_request set status = 'rejected', rejected_reason = p_reason where id = p_request_id;
  perform internal.notify(v_user, 'leave_rejected', 'Đơn nghỉ phép cần điều chỉnh', '/dashboard/hr/leave', 'leave_rejected_' || p_request_id);
end;
$$;
create function public.send_proposal(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_proposal public.project_proposal;
begin
  if not internal.has_role('company_owner','project_manager') then raise exception 'FORBIDDEN'; end if;
  select * into v_proposal from public.project_proposal where id = p_proposal_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_proposal.status <> 'draft' then raise exception 'INVALID_STATE'; end if;
  if not internal.has_role('company_owner') and v_proposal.created_by is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  update public.project_proposal set status = 'sent', sent_at = now() where id = p_proposal_id;
end;
$$;
create function public.approve_proposal(p_proposal_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_proposal public.project_proposal; v_project uuid;
begin
  if not internal.has_role('company_owner','director') then raise exception 'FORBIDDEN'; end if;
  select * into v_proposal from public.project_proposal where id = p_proposal_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_proposal.status <> 'sent' then raise exception 'INVALID_STATE'; end if;
  if v_proposal.created_by is null then raise exception 'CREATOR_REQUIRED'; end if;
  if v_proposal.created_by = auth.uid() then raise exception 'SOD_VIOLATION'; end if;
  if v_proposal.expires_at < (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'EXPIRED'; end if;
  update public.project_proposal set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = p_proposal_id;
  insert into public.project_project(proposal_id, client_id, name, description, billing_type, budget_amount, budget_currency, scope_snapshot, created_by)
  values (v_proposal.id, v_proposal.client_id, v_proposal.title, v_proposal.description, v_proposal.billing_type, v_proposal.estimated_budget, v_proposal.currency, v_proposal.scope, auth.uid()) returning id into v_project;
  insert into public.project_membership(project_id, user_id, project_role, granted_by)
  values (v_project, v_proposal.created_by, 'pm', auth.uid());
  return v_project;
end;
$$;
create function public.transition_issue(p_issue_id uuid, p_new_status public.issue_status, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_issue public.work_issue; v_roles text[]; v_allowed text[];
begin
  if not internal.is_active_user() then raise exception 'FORBIDDEN'; end if;
  select * into v_issue from public.work_issue where id = p_issue_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_roles := internal.project_roles(v_issue.project_id);
  if internal.has_role('company_owner') then v_roles := array['pm']; end if;
  if cardinality(v_roles) = 0 then raise exception 'FORBIDDEN'; end if;
  select allowed_roles into v_allowed from public.work_issue_workflow where from_status = v_issue.status and to_status = p_new_status;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  if not (v_roles && v_allowed) then raise exception 'FORBIDDEN'; end if;
  update public.work_issue set status = p_new_status where id = p_issue_id;
end;
$$;

create function public.submit_timesheet(p_employee_id uuid, p_project_id uuid, p_period_start date, p_period_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status public.timesheet_status; v_total numeric; v_recipient uuid;
begin
  if not internal.owns_employee(p_employee_id) or not internal.is_project_member(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start or p_period_end - p_period_start > 30 then raise exception 'INVALID_PERIOD'; end if;
  perform 1 from public.project_project where id = p_project_id for update;
  perform 1 from public.hr_employee where id = p_employee_id and status = 'active' for update;
  if not found then raise exception 'EMPLOYEE_NOT_ACTIVE'; end if;
  if exists (select 1 from public.work_timesheet_period_lock where project_id = p_project_id and period_start <= p_period_end and period_end >= p_period_start) then raise exception 'LOCKED'; end if;
  select id, status into v_id, v_status from public.work_timesheet where employee_id = p_employee_id and project_id = p_project_id
    and period_start = p_period_start and period_end = p_period_end for update;
  if found and v_status <> 'draft' then raise exception 'ALREADY_SUBMITTED'; end if;
  if exists (select 1 from public.work_timesheet where employee_id = p_employee_id and project_id = p_project_id and id is distinct from v_id
    and period_start <= p_period_end and period_end >= p_period_start) then raise exception 'PERIOD_OVERLAP'; end if;
  perform 1 from public.work_worklog where employee_id = p_employee_id and project_id = p_project_id and logged_date between p_period_start and p_period_end and status = 'draft' for update;
  select coalesce(sum(hours),0) into v_total from public.work_worklog where employee_id = p_employee_id and project_id = p_project_id
    and logged_date between p_period_start and p_period_end and status = 'draft';
  if v_total = 0 then raise exception 'NO_WORKLOG'; end if;
  insert into public.work_timesheet(employee_id, project_id, period_start, period_end, total_hours, status, submitted_at, created_by)
  values (p_employee_id, p_project_id, p_period_start, p_period_end, v_total, 'submitted', now(), auth.uid())
  on conflict (employee_id, project_id, period_start, period_end) do update set total_hours = excluded.total_hours, status = 'submitted', submitted_at = now() returning id into v_id;
  delete from public.work_timesheet_line where timesheet_id = v_id;
  insert into public.work_timesheet_line(timesheet_id, worklog_id, hours, is_billable, logged_date)
    select v_id, id, hours, is_billable, logged_date from public.work_worklog where employee_id = p_employee_id and project_id = p_project_id
      and logged_date between p_period_start and p_period_end and status = 'draft';
  update public.work_worklog set status = 'submitted' where id in (select worklog_id from public.work_timesheet_line where timesheet_id = v_id);
  for v_recipient in select user_id from public.project_membership where project_id = p_project_id and project_role = 'team_leader' and status = 'active'
    and revoked_at is null and start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date and (end_date is null or end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date) loop
    perform internal.notify(v_recipient, 'timesheet_submitted', 'Có timesheet cần Leader duyệt', '/dashboard/worklogs?tab=approval', 'ts_submit_' || v_id || '_' || v_recipient || '_' || (select version from public.work_timesheet where id = v_id));
  end loop;
  return v_id;
end;
$$;
create function public.approve_timesheet_step(p_timesheet_id uuid, p_step public.approval_step) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ts public.work_timesheet; v_project uuid; v_recipient uuid;
begin
  select project_id into v_project from public.work_timesheet where id = p_timesheet_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.project_project where id = v_project for update;
  select * into v_ts from public.work_timesheet where id = p_timesheet_id for update;
  perform internal.check_timesheet_reviewer(v_ts.project_id, v_ts.employee_id, v_ts.created_by, p_step);
  if p_step is null or (p_step = 'leader' and v_ts.status <> 'submitted') or (p_step = 'pm' and v_ts.status <> 'leader_approved') then raise exception 'INVALID_STATE'; end if;
  update public.work_timesheet set status = case when p_step = 'leader' then 'leader_approved' else 'pm_approved' end::public.timesheet_status where id = p_timesheet_id;
  insert into public.work_approval_step(timesheet_id, step, decision, decided_by, decided_at) values (p_timesheet_id, p_step, 'approved', auth.uid(), now());
  if p_step = 'pm' then
    update public.work_worklog set status = 'approved' where id in (select worklog_id from public.work_timesheet_line where timesheet_id = p_timesheet_id);
    select user_id into v_recipient from public.hr_employee where id = v_ts.employee_id;
    perform internal.notify(v_recipient, 'timesheet_pm_approved', 'Timesheet đã được PM duyệt', '/dashboard/worklogs?tab=approval', 'ts_pm_' || p_timesheet_id || '_' || v_ts.version);
  else
    for v_recipient in select user_id from public.project_membership where project_id = v_project and project_role = 'pm' and status = 'active' and revoked_at is null
      and start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date and (end_date is null or end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date) loop
      perform internal.notify(v_recipient, 'timesheet_leader_approved', 'Có timesheet cần PM duyệt', '/dashboard/worklogs?tab=approval', 'ts_leader_' || p_timesheet_id || '_' || v_recipient || '_' || v_ts.version);
    end loop;
  end if;
end;
$$;
create function public.reject_timesheet(p_timesheet_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ts public.work_timesheet; v_project uuid; v_step public.approval_step; v_user uuid;
begin
  if coalesce(length(btrim(p_reason)),0) = 0 then raise exception 'REASON_REQUIRED'; end if;
  select project_id into v_project from public.work_timesheet where id = p_timesheet_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.project_project where id = v_project for update;
  select * into v_ts from public.work_timesheet where id = p_timesheet_id for update;
  if v_ts.status not in ('submitted','leader_approved') then raise exception 'INVALID_STATE'; end if;
  v_step := case when v_ts.status = 'submitted' then 'leader' else 'pm' end::public.approval_step;
  perform internal.check_timesheet_reviewer(v_ts.project_id, v_ts.employee_id, v_ts.created_by, v_step);
  update public.work_timesheet set status = 'draft' where id = p_timesheet_id;
  update public.work_worklog set status = 'draft' where id in (select worklog_id from public.work_timesheet_line where timesheet_id = p_timesheet_id);
  delete from public.work_timesheet_line where timesheet_id = p_timesheet_id;
  insert into public.work_approval_step(timesheet_id, step, decision, decided_by, decided_at, reason) values (p_timesheet_id, v_step, 'rejected', auth.uid(), now(), p_reason);
  select user_id into v_user from public.hr_employee where id = v_ts.employee_id;
  perform internal.notify(v_user, 'timesheet_rejected', 'Timesheet cần điều chỉnh', '/dashboard/worklogs?tab=approval', 'ts_rejected_' || p_timesheet_id || '_' || v_ts.version);
end;
$$;
create function public.lock_timesheet_period(p_project_id uuid, p_period_start date, p_period_end date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not (internal.has_role('company_owner') or 'pm' = any(internal.project_roles(p_project_id))) then raise exception 'FORBIDDEN'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start or p_period_end - p_period_start > 30 then raise exception 'INVALID_PERIOD'; end if;
  perform 1 from public.project_project where id = p_project_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.work_timesheet where project_id = p_project_id and period_start <= p_period_end and period_end >= p_period_start
    and (status not in ('pm_approved','locked') or period_start <> p_period_start or period_end <> p_period_end))
    or exists (select 1 from public.work_worklog where project_id = p_project_id and logged_date between p_period_start and p_period_end and status <> 'approved') then raise exception 'HAS_UNAPPROVED'; end if;
  if not exists (select 1 from public.work_timesheet where project_id = p_project_id and period_start = p_period_start and period_end = p_period_end) then raise exception 'NO_TIMESHEET'; end if;
  insert into public.work_timesheet_period_lock(project_id, period_start, period_end, locked_by)
    values (p_project_id, p_period_start, p_period_end, auth.uid()) on conflict do nothing;
  update public.work_timesheet set status = 'locked', locked_at = now(), locked_by = auth.uid()
    where project_id = p_project_id and period_start = p_period_start and period_end = p_period_end and status = 'pm_approved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
create function public.request_timesheet_adjustment(p_timesheet_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ts public.work_timesheet; v_id uuid;
begin
  select * into v_ts from public.work_timesheet where id = p_timesheet_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (internal.owns_employee(v_ts.employee_id) or internal.has_role('company_owner') or 'pm' = any(internal.project_roles(v_ts.project_id))) then raise exception 'FORBIDDEN'; end if;
  if v_ts.status <> 'locked' then raise exception 'NOT_LOCKED'; end if;
  if coalesce(length(btrim(p_reason)),0) = 0 then raise exception 'REASON_REQUIRED'; end if;
  insert into public.work_timesheet_adjustment(timesheet_id, reason, requested_by) values (p_timesheet_id, p_reason, auth.uid())
    on conflict (timesheet_id) where status = 'pending' do update set reason = public.work_timesheet_adjustment.reason returning id into v_id;
  return v_id;
end;
$$;

-- Every exposed function gets explicit privileges (Supabase defaults vary by project).
revoke execute on all functions in schema internal from public, anon, authenticated;
grant execute on function internal.is_active_user(), internal.has_role(text[]), internal.project_roles(uuid),
  internal.is_project_member(uuid), internal.is_project_reviewer(uuid), internal.owns_employee(uuid) to authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and p.proname = any(array['assign_role','revoke_role','transition_employee_status','approve_leave','reject_leave','send_proposal',
      'approve_proposal','transition_issue','submit_timesheet','approve_timesheet_step','reject_timesheet','lock_timesheet_period','request_timesheet_adjustment']) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
commit;
