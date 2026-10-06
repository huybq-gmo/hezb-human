begin;

create view public.hr_team_skill_matrix with (security_invoker=true) as
  select m.team_id,e.id as employee_id,e.full_name,e.employee_code,m.team_role,
    coalesce(jsonb_agg(jsonb_build_object('skill_name',s.skill_name,'level',s.level,'certified_at',s.certified_at)
      order by s.skill_name) filter (where s.id is not null),'[]'::jsonb) as skills
  from public.hr_team_membership m
  join public.hr_team t on t.id=m.team_id and t.is_active
  join public.hr_employee e on e.id=m.employee_id and e.status='active'
  left join public.hr_skill s on s.employee_id=e.id
  where m.status='active' and m.start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and (m.end_date is null or m.end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  group by m.team_id,e.id,e.full_name,e.employee_code,m.team_role;
revoke all on public.hr_team_skill_matrix from public,anon,authenticated;
grant select on public.hr_team_skill_matrix to authenticated,service_role;

create function public.get_dashboard_utilization(
  p_start_date date,p_end_date date,p_project_id uuid default null,p_offset integer default 0,p_limit integer default 50
) returns table(employee_id uuid,full_name text,approved_hours numeric,capacity_hours numeric,
  utilization_pct numeric,active_projects bigint,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not internal.is_active_user() then raise exception 'FORBIDDEN'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>365
    or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_REPORT_RANGE'; end if;
  if p_project_id is not null and not (internal.is_project_member(p_project_id) or internal.is_project_reviewer(p_project_id)) then raise exception 'FORBIDDEN'; end if;
  return query
  with scoped as (
    select e.id,e.full_name,e.user_id,e.hire_date,e.terminate_date
    from public.hr_employee e where e.status='active'
      and (internal.owns_employee(e.id) or internal.has_role('company_owner','hr_admin','finance_admin')
        or exists (select 1 from public.project_membership m where m.user_id=e.user_id
          and internal.is_project_reviewer(m.project_id) and m.status='active' and m.revoked_at is null
          and m.start_date<=p_end_date and (m.end_date is null or m.end_date>=p_start_date)))
      and (p_project_id is null or exists (select 1 from public.project_membership m where m.project_id=p_project_id
        and m.user_id=e.user_id and m.status='active' and m.revoked_at is null
        and m.start_date<=p_end_date and (m.end_date is null or m.end_date>=p_start_date))
        or exists (select 1 from public.work_worklog w where w.employee_id=e.id and w.project_id=p_project_id
          and w.logged_date between p_start_date and p_end_date))
  ), summary as (
    select e.id,e.full_name,
      coalesce((select sum(w.hours) from public.work_worklog w where w.employee_id=e.id and w.status='approved'
        and w.logged_date between p_start_date and p_end_date and (p_project_id is null or w.project_id=p_project_id)
        and (internal.owns_employee(e.id) or internal.is_project_reviewer(w.project_id))),0)::numeric as hours,
      coalesce((select sum(case when p_project_id is null then 8 else
          8 * least(100,coalesce((select sum(a.allocation_percent) from public.project_allocation a
            where a.employee_id=e.id and a.project_id=p_project_id and a.status='approved'
              and d.day::date between a.start_date and a.end_date),0))/100 end)
        from generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') d(day)
        where extract(isodow from d.day)<6 and (e.hire_date is null or d.day::date>=e.hire_date)
          and (e.terminate_date is null or d.day::date<=e.terminate_date)
          and not exists (select 1 from public.hr_leave_request l where l.employee_id=e.id and l.status='approved'
            and d.day::date between l.start_date and l.end_date)),0)::numeric as capacity,
      (select count(distinct w.project_id) from public.work_worklog w where w.employee_id=e.id and w.status='approved'
        and w.logged_date between p_start_date and p_end_date and (p_project_id is null or w.project_id=p_project_id)
        and (internal.owns_employee(e.id) or internal.is_project_reviewer(w.project_id))) as projects
    from scoped e
  )
  select s.id,s.full_name,s.hours,s.capacity,case when s.capacity>0 then round(s.hours*100/s.capacity,2) else null end,
    s.projects,count(*) over() from summary s order by s.hours desc,s.full_name,s.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.get_dashboard_utilization(date,date,uuid,integer,integer) from public,anon;
grant execute on function public.get_dashboard_utilization(date,date,uuid,integer,integer) to authenticated;

-- Keep invoice totals correct even when its payment list is paginated.
create view public.finance_invoice_payment_summary with (security_invoker=true) as
  select i.id as invoice_id,
    coalesce(sum(p.amount) filter(where p.status='confirmed'),0)::numeric as confirmed_amount,
    coalesce(sum(p.amount) filter(where p.status='pending'),0)::numeric as pending_amount
  from public.finance_invoice i left join public.finance_payment p on p.invoice_id=i.id
  group by i.id;
revoke all on public.finance_invoice_payment_summary from public,anon,authenticated;
grant select on public.finance_invoice_payment_summary to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
