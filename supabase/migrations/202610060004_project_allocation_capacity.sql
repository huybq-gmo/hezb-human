begin;

create table public.project_allocation (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_project on delete cascade,
  employee_id uuid not null references public.hr_employee on delete restrict,
  project_role public.project_role not null,
  allocation_percent numeric(5,2) not null check (allocation_percent > 0 and allocation_percent <= 100),
  start_date date not null,
  end_date date not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  requested_by uuid not null references auth.users,
  decided_by uuid references auth.users,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  version integer not null default 1,
  check (end_date >= start_date)
);
create index project_allocation_capacity on public.project_allocation(employee_id, start_date, end_date)
  where status = 'approved';

-- Keep financial rate snapshots separate from the project team view.
create table public.finance_allocation_rate_snapshot (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique references public.project_allocation on delete cascade,
  rate_snapshot jsonb not null,
  captured_at timestamptz not null default now(),
  created_by uuid not null references auth.users
);

alter table public.project_allocation enable row level security;
revoke all on public.project_allocation from public, anon, authenticated;
grant select on public.project_allocation to authenticated;
grant all on public.project_allocation to service_role;
create policy allocation_read on public.project_allocation for select to authenticated
  using (internal.owns_employee(employee_id)
    or internal.has_role('company_owner', 'hr_admin', 'director', 'project_manager')
    or 'pm' = any(internal.project_roles(project_id))
    or 'team_leader' = any(internal.project_roles(project_id)));
create trigger hezb_allocation_audit after insert or update or delete on public.project_allocation
  for each row execute function internal.audit_row();
create trigger hezb_allocation_stamp before update on public.project_allocation
  for each row execute function internal.stamp_row();

alter table public.finance_allocation_rate_snapshot enable row level security;
revoke all on public.finance_allocation_rate_snapshot from public, anon, authenticated;
grant select on public.finance_allocation_rate_snapshot to authenticated;
grant all on public.finance_allocation_rate_snapshot to service_role;
create policy allocation_snapshot_read on public.finance_allocation_rate_snapshot for select to authenticated
  using (internal.has_role('company_owner', 'hr_admin', 'finance_admin', 'auditor'));
create trigger hezb_allocation_rate_audit after insert or update or delete on public.finance_allocation_rate_snapshot
  for each row execute function internal.audit_row();

create function public.request_project_allocation(
  p_project_id uuid,
  p_employee_id uuid,
  p_project_role public.project_role,
  p_allocation_percent numeric,
  p_start_date date,
  p_end_date date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner', 'hr_admin', 'director', 'project_manager')
    and not ('pm' = any(internal.project_roles(p_project_id))) then
    raise exception 'FORBIDDEN';
  end if;
  if p_project_id is null or p_employee_id is null or p_project_role is null
    or p_allocation_percent is null or p_allocation_percent <= 0 or p_allocation_percent > 100
    or p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'INVALID_ALLOCATION';
  end if;
  if not exists (select 1 from public.project_project where id = p_project_id and status = 'active') then
    raise exception 'PROJECT_NOT_ACTIVE';
  end if;
  if not exists (select 1 from public.hr_employee where id = p_employee_id and status = 'active') then
    raise exception 'EMPLOYEE_NOT_ACTIVE';
  end if;
  insert into public.project_allocation(project_id, employee_id, project_role, allocation_percent,
    start_date, end_date, requested_by)
  values (p_project_id, p_employee_id, p_project_role, p_allocation_percent,
    p_start_date, p_end_date, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create function public.decide_project_allocation(p_allocation_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_allocation public.project_allocation;
  v_rate_snapshot jsonb;
  v_allocated numeric;
begin
  if not internal.has_role('company_owner', 'hr_admin', 'director') then raise exception 'FORBIDDEN'; end if;
  select * into v_allocation from public.project_allocation where id = p_allocation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_allocation.status <> 'requested' then raise exception 'INVALID_STATE'; end if;
  if v_allocation.requested_by = auth.uid() or internal.owns_employee(v_allocation.employee_id) then
    raise exception 'SOD_VIOLATION';
  end if;
  if not p_approve and coalesce(length(btrim(p_reason)), 0) = 0 then raise exception 'REASON_REQUIRED'; end if;

  if p_approve then
    select coalesce(sum(a.allocation_percent), 0) into v_allocated
    from public.project_allocation a
    where a.employee_id = v_allocation.employee_id and a.status = 'approved'
      and a.start_date <= v_allocation.end_date and a.end_date >= v_allocation.start_date;
    if v_allocated + v_allocation.allocation_percent > 100 then raise exception 'CAPACITY_EXCEEDED'; end if;

    select jsonb_agg(jsonb_build_object('rate_type', r.rate_type, 'amount', r.amount,
      'currency', r.currency, 'effective_from', r.effective_from, 'effective_to', r.effective_to))
      into v_rate_snapshot
    from public.hr_employee_rate r
    where r.employee_id = v_allocation.employee_id
      and r.effective_from <= v_allocation.start_date
      and (r.effective_to is null or r.effective_to >= v_allocation.start_date);
    if v_rate_snapshot is null then raise exception 'RATE_NOT_FOUND'; end if;

    update public.project_allocation set status = 'approved', decided_by = auth.uid(), decided_at = now(),
      decision_reason = null where id = p_allocation_id;
    insert into public.finance_allocation_rate_snapshot(allocation_id, rate_snapshot, created_by)
    values (p_allocation_id, v_rate_snapshot, auth.uid());
    insert into public.project_membership(project_id, user_id, project_role, start_date, end_date,
      status, granted_by, updated_at)
    select v_allocation.project_id, e.user_id, v_allocation.project_role, v_allocation.start_date,
      v_allocation.end_date, 'active', auth.uid(), now()
    from public.hr_employee e where e.id = v_allocation.employee_id and e.user_id is not null
    on conflict (project_id, user_id, project_role) do update set
      start_date = least(public.project_membership.start_date, excluded.start_date),
      end_date = case when public.project_membership.end_date is null or excluded.end_date is null then null
        else greatest(public.project_membership.end_date, excluded.end_date) end,
      status = 'active',
      revoked_at = null, revoked_by = null, granted_by = auth.uid(), updated_at = now(),
      version = public.project_membership.version + 1;
  else
    update public.project_allocation set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_reason = btrim(p_reason) where id = p_allocation_id;
  end if;
end;
$$;

create function public.employee_availability(p_start_date date, p_end_date date)
returns table(employee_id uuid, full_name text, available_hours numeric, allocated_percent numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if not internal.has_role('company_owner', 'hr_admin', 'director', 'project_manager')
    and not exists (select 1 from public.hr_employee e where e.user_id = auth.uid() and internal.owns_employee(e.id)) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select e.id, e.full_name,
    greatest(0, count(d.work_date) filter (where extract(isodow from d.work_date) < 6
      and not exists (select 1 from public.hr_leave_request l where l.employee_id = e.id
        and l.status = 'approved' and l.start_date <= d.work_date and l.end_date >= d.work_date)) * 8)::numeric,
    coalesce((select sum(a.allocation_percent) from public.project_allocation a
      where a.employee_id = e.id and a.status = 'approved'
        and a.start_date <= p_end_date and a.end_date >= p_start_date), 0)::numeric
  from public.hr_employee e
  cross join lateral generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') as d(work_date)
  where e.status = 'active'
    and (internal.has_role('company_owner', 'hr_admin', 'director', 'project_manager') or e.user_id = auth.uid())
  group by e.id, e.full_name;
end;
$$;

revoke all on function public.request_project_allocation(uuid, uuid, public.project_role, numeric, date, date),
  public.decide_project_allocation(uuid, boolean, text), public.employee_availability(date, date)
  from public, anon;
grant execute on function public.request_project_allocation(uuid, uuid, public.project_role, numeric, date, date),
  public.decide_project_allocation(uuid, boolean, text), public.employee_availability(date, date)
  to authenticated;

notify pgrst, 'reload schema';
commit;
