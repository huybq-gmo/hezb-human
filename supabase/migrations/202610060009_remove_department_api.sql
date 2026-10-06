begin;

-- Keep the legacy value in storage for historical preservation, but remove it
-- from all authenticated read/write surfaces and dashboard aggregates.
revoke select on public.hr_employee from authenticated;
grant select (
  id, user_id, employee_code, full_name, email, phone, type, status,
  hire_date, terminate_date, created_at, created_by, updated_at, updated_by, version
) on public.hr_employee to authenticated;
revoke update (department) on public.hr_employee from authenticated;

drop view public.dashboard_team_utilization;
create view public.dashboard_team_utilization with (security_invoker = true) as
  select e.id as employee_id, e.full_name,
    coalesce(sum(t.total_hours), 0) as approved_hours,
    count(distinct t.project_id) as active_projects
  from public.hr_employee e
  left join public.work_timesheet t on t.employee_id = e.id and t.status in ('pm_approved', 'locked')
  where e.status = 'active'
  group by e.id, e.full_name;
revoke all on public.dashboard_team_utilization from public, anon, authenticated;
grant select on public.dashboard_team_utilization to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
