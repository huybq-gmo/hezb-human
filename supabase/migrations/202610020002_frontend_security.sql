-- Live business roles, RLS, audit, auth profiles and safe views.
begin;

create function internal.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.core_user_profile where id = auth.uid() and is_active)
    and (exists (select 1 from public.core_role_assignment where user_id = auth.uid() and revoked_at is null
      and (expires_at is null or expires_at > now())) or exists (
        select 1 from public.project_membership where user_id = auth.uid() and status = 'active' and revoked_at is null
          and start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
          and (end_date is null or end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)));
$$;
create function internal.has_role(variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select internal.is_active_user() and exists (
    select 1 from public.core_role_assignment
    where user_id = auth.uid() and role::text = any(p_roles)
      and revoked_at is null and (expires_at is null or expires_at > now())
  );
$$;
create function internal.project_roles(p_project_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(project_role::text), '{}'::text[])
  from public.project_membership
  where internal.is_active_user() and project_id = p_project_id and user_id = auth.uid()
    and status = 'active' and revoked_at is null
    and start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and (end_date is null or end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date);
$$;
create function internal.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select internal.has_role('company_owner') or cardinality(internal.project_roles(p_project_id)) > 0;
$$;
create function internal.is_project_reviewer(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select internal.has_role('company_owner', 'hr_admin', 'finance_admin')
    or internal.project_roles(p_project_id) && array['pm', 'team_leader'];
$$;
create function internal.owns_employee(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select internal.is_active_user() and exists (
    select 1 from public.hr_employee where id = p_employee_id and user_id = auth.uid()
  );
$$;
-- Canonical role source for the frontend. An empty result means no roles.
create function public.get_my_roles() returns table(role public.app_role)
language sql stable security definer set search_path = '' as $$
  select r.role from public.core_role_assignment r
  where internal.is_active_user() and r.user_id = auth.uid()
    and r.revoked_at is null and (r.expires_at is null or r.expires_at > now());
$$;
revoke all on function public.get_my_roles() from public, anon;
grant execute on function public.get_my_roles() to authenticated;

create policy profile_read on public.core_user_profile for select to authenticated
  using (internal.is_active_user());
create policy profile_update on public.core_user_profile for update to authenticated
  using (internal.is_active_user() and (id = auth.uid() or internal.has_role('company_owner', 'hr_admin')))
  with check (internal.is_active_user() and (id = auth.uid() or internal.has_role('company_owner', 'hr_admin')));
create policy role_read on public.core_role_assignment for select to authenticated
  using (internal.is_active_user() and (user_id = auth.uid() or internal.has_role('company_owner', 'hr_admin')));
create policy membership_read on public.project_membership for select to authenticated
  using (internal.is_active_user() and (user_id = auth.uid() or internal.has_role('company_owner', 'hr_admin', 'project_manager')
    or internal.project_roles(project_id) && array['pm', 'team_leader']));
create policy employee_read on public.hr_employee for select to authenticated using (internal.is_active_user());
create policy employee_insert on public.hr_employee for insert to authenticated
  with check (internal.has_role('company_owner', 'hr_admin') and created_by = auth.uid() and status = 'onboarding');
create policy employee_update on public.hr_employee for update to authenticated
  using (internal.has_role('company_owner', 'hr_admin')) with check (internal.has_role('company_owner', 'hr_admin'));
create policy contract_read on public.hr_contract for select to authenticated
  using (internal.has_role('company_owner', 'hr_admin', 'finance_admin'));
create policy contract_insert on public.hr_contract for insert to authenticated
  with check (internal.has_role('company_owner', 'hr_admin') and created_by = auth.uid());
create policy skill_read on public.hr_skill for select to authenticated using (internal.is_active_user());
create policy skill_insert on public.hr_skill for insert to authenticated
  with check (internal.has_role('company_owner', 'hr_admin') and created_by = auth.uid());
create policy skill_delete on public.hr_skill for delete to authenticated using (internal.has_role('company_owner', 'hr_admin'));
create policy rate_read on public.hr_employee_rate for select to authenticated
  using (internal.has_role('company_owner', 'hr_admin', 'finance_admin'));
create policy rate_insert on public.hr_employee_rate for insert to authenticated
  with check (internal.has_role('company_owner', 'hr_admin') and created_by = auth.uid());
create policy leave_type_read on public.hr_leave_type for select to authenticated using (internal.is_active_user());
create policy balance_read on public.hr_leave_balance for select to authenticated
  using (internal.owns_employee(employee_id) or internal.has_role('company_owner', 'hr_admin'));
create policy leave_read on public.hr_leave_request for select to authenticated
  using (internal.owns_employee(employee_id) or internal.has_role('company_owner', 'hr_admin'));
create policy leave_insert on public.hr_leave_request for insert to authenticated
  with check (internal.owns_employee(employee_id) and created_by = auth.uid() and status = 'pending'
    and approved_by is null and approved_at is null and rejected_reason is null);
create policy client_read on public.project_client for select to authenticated using (internal.is_active_user());
create policy client_insert on public.project_client for insert to authenticated
  with check (internal.has_role('company_owner', 'director', 'project_manager', 'finance_admin') and created_by = auth.uid());
create policy proposal_read on public.project_proposal for select to authenticated
  using (internal.has_role('company_owner', 'director', 'project_manager', 'finance_admin', 'auditor'));
create policy proposal_insert on public.project_proposal for insert to authenticated
  with check (internal.has_role('company_owner', 'project_manager') and created_by = auth.uid()
    and status = 'draft' and decided_by is null and decided_at is null);
create policy project_read on public.project_project for select to authenticated using (internal.is_active_user());
create policy milestone_read on public.project_milestone for select to authenticated using (internal.is_active_user());
create policy milestone_insert on public.project_milestone for insert to authenticated
  with check ((internal.has_role('company_owner', 'director') or 'pm' = any(internal.project_roles(project_id)))
    and created_by = auth.uid() and status = 'open' and accepted_by is null and accepted_at is null);
create policy issue_read on public.work_issue for select to authenticated
  using (internal.is_project_member(project_id) or internal.has_role('director'));
create policy issue_insert on public.work_issue for insert to authenticated
  with check (internal.is_project_member(project_id) and created_by = auth.uid()
    and reporter_id = auth.uid() and status in ('backlog', 'todo'));
create policy issue_update on public.work_issue for update to authenticated
  using (internal.is_project_member(project_id)) with check (internal.is_project_member(project_id));
create policy workflow_read on public.work_issue_workflow for select to authenticated using (internal.is_active_user());
create policy comment_read on public.work_issue_comment for select to authenticated
  using (exists (select 1 from public.work_issue i where i.id = issue_id));
create policy comment_insert on public.work_issue_comment for insert to authenticated
  with check (created_by = auth.uid() and not is_deleted and exists (
    select 1 from public.work_issue i where i.id = issue_id and internal.is_project_member(i.project_id)));
create policy worklog_read on public.work_worklog for select to authenticated
  using (internal.owns_employee(employee_id) or internal.is_project_reviewer(project_id));
create policy worklog_insert on public.work_worklog for insert to authenticated
  with check (internal.owns_employee(employee_id) and internal.is_project_member(project_id)
    and created_by = auth.uid() and status = 'draft');
create policy worklog_update on public.work_worklog for update to authenticated
  using (internal.owns_employee(employee_id) and internal.is_project_member(project_id) and status = 'draft')
  with check (internal.owns_employee(employee_id) and internal.is_project_member(project_id) and status = 'draft');
create policy worklog_delete on public.work_worklog for delete to authenticated
  using (internal.owns_employee(employee_id) and status = 'draft');
create policy timesheet_read on public.work_timesheet for select to authenticated
  using (internal.owns_employee(employee_id) or internal.is_project_reviewer(project_id));
create policy timesheet_line_read on public.work_timesheet_line for select to authenticated
  using (exists (select 1 from public.work_timesheet t where t.id = timesheet_id));
create policy approval_read on public.work_approval_step for select to authenticated
  using (exists (select 1 from public.work_timesheet t where t.id = timesheet_id));
create policy adjustment_read on public.work_timesheet_adjustment for select to authenticated
  using (exists (select 1 from public.work_timesheet t where t.id = timesheet_id));
create policy notification_read on public.core_notification for select to authenticated
  using (internal.is_active_user() and recipient_id = auth.uid());
create policy notification_update on public.core_notification for update to authenticated
  using (internal.is_active_user() and recipient_id = auth.uid())
  with check (internal.is_active_user() and recipient_id = auth.uid());
create policy audit_read on public.audit_log for select to authenticated using (internal.has_role('company_owner', 'auditor'));
create policy config_read on public.core_config for select to authenticated using (internal.is_active_user());

create function internal.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.core_user_profile(id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger hezb_auth_user_created after insert on auth.users
  for each row execute function internal.on_auth_user_created();
-- Also cover Auth accounts that were created before migrations.
insert into public.core_user_profile(id, full_name)
  select id, raw_user_meta_data ->> 'full_name' from auth.users on conflict (id) do nothing;

create function internal.audit_mask(p_row jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_row)
  where key = any(array['id', 'status', 'role', 'project_role', 'version', 'is_read', 'is_active']);
$$;
create function internal.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor_id, table_name, record_id, action, before_masked, after_masked)
  values (auth.uid(), tg_table_name, coalesce(new.id, old.id), tg_op,
    case when tg_op <> 'INSERT' then internal.audit_mask(to_jsonb(old)) end,
    case when tg_op <> 'DELETE' then internal.audit_mask(to_jsonb(new)) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create function internal.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'version' then new := jsonb_populate_record(new, jsonb_build_object('version', old.version + 1)); end if;
  if to_jsonb(new) ? 'updated_by' then new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid())); end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['core_user_profile', 'core_role_assignment', 'project_membership', 'hr_employee', 'hr_contract', 'hr_skill',
    'hr_employee_rate', 'hr_leave_balance', 'hr_leave_request', 'project_client', 'project_proposal', 'project_project', 'project_milestone',
    'work_issue', 'work_issue_comment', 'work_worklog', 'work_timesheet', 'work_approval_step', 'work_timesheet_adjustment'] loop
    execute format('create trigger hezb_audit after insert or update or delete on public.%I for each row execute function internal.audit_row()', t);
  end loop;
  foreach t in array array['core_user_profile', 'project_membership', 'hr_employee', 'hr_leave_request', 'project_client', 'project_proposal',
    'project_project', 'project_milestone', 'work_issue', 'work_issue_comment', 'work_worklog', 'work_timesheet'] loop
    execute format('create trigger hezb_stamp before update on public.%I for each row execute function internal.stamp_row()', t);
  end loop;
end;
$$;

-- Security-invoker views retain the requesting user's RLS and grants.
create view public.work_issue_with_sla with (security_invoker = true) as
  select i.*,
    i.status not in ('done', 'cancelled') and i.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date as is_overdue,
    case when i.status in ('done', 'cancelled') then 'completed' when i.due_date is null then 'no_deadline'
      when i.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'overdue'
      when i.due_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date + 3 then 'at_risk' else 'on_track' end as sla_status
  from public.work_issue i;
create view public.project_milestone_with_health with (security_invoker = true) as
  select m.*, p.name as project_name,
    case when m.status = 'accepted' then 'completed'
      when m.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date and m.status = 'open' then 'overdue'
      when m.due_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date + 7 then 'at_risk' else 'on_track' end as health
  from public.project_milestone m join public.project_project p on p.id = m.project_id;
-- Aggregate issues and milestones separately so joining them cannot multiply counts.
create view public.dashboard_project_health with (security_invoker = true) as
  select p.id as project_id, p.name as project_name, p.status,
    coalesce(i.issues_backlog, 0) as issues_backlog, coalesce(i.issues_open, 0) as issues_open,
    coalesce(i.issues_done, 0) as issues_done, coalesce(i.issues_overdue, 0) as issues_overdue,
    coalesce(m.milestones_overdue, 0) as milestones_overdue, coalesce(m.milestones_on_track, 0) as milestones_on_track
  from public.project_project p
  left join (select project_id, count(*) filter (where status = 'backlog') as issues_backlog,
    count(*) filter (where status in ('todo', 'in_progress', 'in_review', 'blocked')) as issues_open,
    count(*) filter (where status = 'done') as issues_done, count(*) filter (where is_overdue) as issues_overdue
    from public.work_issue_with_sla group by project_id) i on i.project_id = p.id
  left join (select project_id, count(*) filter (where health = 'overdue') as milestones_overdue,
    count(*) filter (where health = 'on_track') as milestones_on_track from public.project_milestone_with_health group by project_id) m on m.project_id = p.id
  where p.status = 'active';
create view public.dashboard_team_utilization with (security_invoker = true) as
  select e.id as employee_id, e.full_name, e.department, coalesce(sum(t.total_hours), 0) as approved_hours,
    count(distinct t.project_id) as active_projects
  from public.hr_employee e left join public.work_timesheet t on t.employee_id = e.id and t.status in ('pm_approved', 'locked')
  where e.status = 'active' group by e.id, e.full_name, e.department;
revoke all on public.work_issue_with_sla, public.project_milestone_with_health, public.dashboard_project_health, public.dashboard_team_utilization from public, anon, authenticated;
grant select on public.work_issue_with_sla, public.project_milestone_with_health, public.dashboard_project_health, public.dashboard_team_utilization to authenticated, service_role;

-- Internal mutation helpers and trigger functions must never become public RPCs.
revoke execute on all functions in schema internal from public, anon, authenticated;
grant execute on function internal.is_active_user(), internal.has_role(text[]), internal.project_roles(uuid),
  internal.is_project_member(uuid), internal.is_project_reviewer(uuid), internal.owns_employee(uuid) to authenticated;
commit;
