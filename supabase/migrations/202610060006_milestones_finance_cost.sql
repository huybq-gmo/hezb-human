begin;

alter table public.project_milestone add column submitted_by uuid references auth.users;

create function public.save_project_milestone(
  p_milestone_id uuid,
  p_project_id uuid,
  p_name text,
  p_description text,
  p_due_date date,
  p_budget_amount numeric,
  p_currency text default 'VND'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_milestone public.project_milestone; v_id uuid;
begin
  if not internal.has_role('company_owner','director','project_manager')
    and not ('pm' = any(internal.project_roles(p_project_id))) then raise exception 'FORBIDDEN'; end if;
  if p_project_id is null or coalesce(length(btrim(p_name)),0) = 0 or p_budget_amount < 0
    or p_currency is null or length(btrim(p_currency)) <> 3 then raise exception 'INVALID_MILESTONE'; end if;
  if p_milestone_id is null then
    insert into public.project_milestone(project_id,name,description,due_date,budget_amount,currency,created_by)
      values (p_project_id,btrim(p_name),nullif(btrim(p_description),''),p_due_date,p_budget_amount,upper(btrim(p_currency)),auth.uid())
      returning id into v_id;
  else
    select * into v_milestone from public.project_milestone where id=p_milestone_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_milestone.project_id <> p_project_id then raise exception 'PROJECT_MISMATCH'; end if;
    if v_milestone.status not in ('open','rejected') then raise exception 'INVALID_STATE'; end if;
    update public.project_milestone set name=btrim(p_name),description=nullif(btrim(p_description),''),
      due_date=p_due_date,budget_amount=p_budget_amount,currency=upper(btrim(p_currency))
      where id=p_milestone_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function public.submit_milestone_acceptance(p_milestone_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_milestone public.project_milestone;
begin
  select * into v_milestone from public.project_milestone where id=p_milestone_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not internal.has_role('company_owner','project_manager')
    and not ('pm' = any(internal.project_roles(v_milestone.project_id))) then raise exception 'FORBIDDEN'; end if;
  if v_milestone.status not in ('open','rejected') then raise exception 'INVALID_STATE'; end if;
  update public.project_milestone set status='submitted',submitted_at=now(),submitted_by=auth.uid(),reject_reason=null
    where id=p_milestone_id;
end;
$$;

create function public.decide_milestone(p_milestone_id uuid,p_accept boolean,p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_milestone public.project_milestone;
begin
  if not internal.has_role('company_owner','director') then raise exception 'FORBIDDEN'; end if;
  select * into v_milestone from public.project_milestone where id=p_milestone_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_milestone.status <> 'submitted' then raise exception 'INVALID_STATE'; end if;
  if v_milestone.submitted_by = auth.uid() or v_milestone.created_by = auth.uid() then raise exception 'SOD_VIOLATION'; end if;
  if not p_accept and coalesce(length(btrim(p_reason)),0)=0 then raise exception 'REASON_REQUIRED'; end if;
  update public.project_milestone set status=case when p_accept then 'accepted'::public.milestone_status else 'rejected'::public.milestone_status end,
    accepted_at=case when p_accept then now() else null end,accepted_by=case when p_accept then auth.uid() else null end,
    reject_reason=case when p_accept then null else btrim(p_reason) end
    where id=p_milestone_id;
end;
$$;

create view public.finance_project_cost_summary as
select p.id as project_id,p.name as project_name,p.budget_amount,p.budget_currency,
  coalesce(cost.actual_cost,0)::numeric(18,4) as actual_cost,p.budget_currency as actual_currency,
  case when p.budget_amount is null or p.budget_amount=0 then null
    else round(coalesce(cost.actual_cost,0)/p.budget_amount*100,2) end as budget_utilization_pct,
  coalesce(cost.unpriced_hours,0)::numeric as unpriced_hours
from public.project_project p
left join lateral (
  select sum(w.hours * coalesce(rate.hourly_amount,0)) as actual_cost,
    sum(case when rate.hourly_amount is null then w.hours else 0 end) as unpriced_hours
  from public.work_worklog w
  left join lateral (
    select (entry->>'amount')::numeric as hourly_amount
    from public.project_allocation a
    join public.finance_allocation_rate_snapshot s on s.allocation_id=a.id
    cross join lateral jsonb_array_elements(s.rate_snapshot) entry
    where a.project_id=w.project_id and a.employee_id=w.employee_id and a.status='approved'
      and a.start_date <= w.logged_date and a.end_date >= w.logged_date
      and entry->>'rate_type'='hourly' and entry->>'currency'=p.budget_currency
    order by a.start_date desc limit 1
  ) rate on true
  where w.project_id=p.id and w.status='approved' and w.is_billable=true
) cost on true
where internal.has_role('company_owner','finance_admin','auditor');

revoke all on public.finance_project_cost_summary from public,anon,authenticated;
grant select on public.finance_project_cost_summary to authenticated;
revoke all on function public.save_project_milestone(uuid,uuid,text,text,date,numeric,text),
  public.submit_milestone_acceptance(uuid),public.decide_milestone(uuid,boolean,text) from public,anon;
grant execute on function public.save_project_milestone(uuid,uuid,text,text,date,numeric,text),
  public.submit_milestone_acceptance(uuid),public.decide_milestone(uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';
commit;
