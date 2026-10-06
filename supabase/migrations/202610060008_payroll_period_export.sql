begin;

create table public.finance_payroll_period (
  id uuid primary key default gen_random_uuid(),
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  status text not null default 'open' check (status in ('open','locked')),
  opened_by uuid not null references auth.users,
  opened_at timestamptz not null default now(),
  locked_by uuid references auth.users,
  locked_at timestamptz,
  unique(month,year)
);
create index finance_payroll_period_order on public.finance_payroll_period(year desc,month desc);
alter table public.finance_payroll_period enable row level security;
revoke all on public.finance_payroll_period from public,anon,authenticated;
grant select on public.finance_payroll_period to authenticated;
grant all on public.finance_payroll_period to service_role;
create policy payroll_period_read on public.finance_payroll_period for select to authenticated
  using (internal.has_role('company_owner','finance_admin','hr_admin','director','auditor'));

create function public.open_payroll_period(p_month integer,p_year integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner','finance_admin','hr_admin') then raise exception 'FORBIDDEN'; end if;
  if p_month not between 1 and 12 or p_year not between 2000 and 2200 then raise exception 'INVALID_PERIOD'; end if;
  insert into public.finance_payroll_period(month,year,opened_by) values(p_month,p_year,auth.uid())
    on conflict(month,year) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.finance_payroll_period where month=p_month and year=p_year;
  end if;
  return v_id;
end;
$$;

create function public.export_payroll_hours(p_period_id uuid)
returns table(
  employee_id uuid,
  employee_code text,
  full_name text,
  employee_type public.employee_type,
  total_approved_hours numeric,
  rate_snapshot jsonb,
  period_start date,
  period_end date
)
language plpgsql stable security definer set search_path = '' as $$
declare v_period public.finance_payroll_period; v_start date; v_end date;
begin
  if not internal.has_role('company_owner','finance_admin','hr_admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_period from public.finance_payroll_period where id=p_period_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_start := make_date(v_period.year,v_period.month,1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  return query
  select e.id,e.employee_code,e.full_name,e.type,
    coalesce(sum(w.hours) filter(where w.status='approved' and w.logged_date between v_start and v_end),0)::numeric,
    (select jsonb_agg(jsonb_build_object('rate_type',r.rate_type,'amount',r.amount,'currency',r.currency,
      'effective_from',r.effective_from,'effective_to',r.effective_to) order by r.rate_type,r.effective_from)
      from public.hr_employee_rate r where r.employee_id=e.id and r.effective_from<=v_end
        and (r.effective_to is null or r.effective_to>=v_start)),
    v_start,v_end
  from public.hr_employee e
  left join public.work_worklog w on w.employee_id=e.id and w.status='approved' and w.logged_date between v_start and v_end
  where e.status='active'
  group by e.id,e.employee_code,e.full_name,e.type
  order by e.employee_code nulls last,e.full_name;
end;
$$;

revoke all on function public.open_payroll_period(integer,integer),public.export_payroll_hours(uuid) from public,anon;
grant execute on function public.open_payroll_period(integer,integer),public.export_payroll_hours(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
