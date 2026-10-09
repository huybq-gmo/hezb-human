begin;

-- Rate changes must keep non-overlapping effective periods. Route writes through
-- this function so a new open-ended rate can close the preceding period safely.
create function public.save_employee_rate(
  p_employee_id uuid,
  p_rate_type public.rate_type,
  p_amount numeric,
  p_currency text,
  p_effective_from date,
  p_effective_to date default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_overlap_count integer;
  v_previous public.hr_employee_rate;
  v_rate_id uuid;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
begin
  if auth.uid() is null or not internal.has_role('company_owner', 'hr_admin') then
    raise exception 'FORBIDDEN';
  end if;

  if p_employee_id is null
    or p_rate_type is null
    or p_amount is null
    or p_amount <= 0
    or p_amount::text = 'NaN'
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'INVALID_RATE';
  end if;

  -- Serialize changes for this employee. The exclusion constraint remains the
  -- final guard against overlapping writes from other database paths.
  select id into v_employee_id
  from public.hr_employee
  where id = p_employee_id
  for update;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  select count(*) into v_overlap_count
  from public.hr_employee_rate r
  where r.employee_id = p_employee_id
    and r.rate_type = p_rate_type
    and daterange(r.effective_from, r.effective_to, '[]')
      && daterange(p_effective_from, p_effective_to, '[]');

  if v_overlap_count > 1 then
    raise exception 'RATE_RANGE_CONFLICT';
  elsif v_overlap_count = 1 then
    select * into v_previous
    from public.hr_employee_rate r
    where r.employee_id = p_employee_id
      and r.rate_type = p_rate_type
      and daterange(r.effective_from, r.effective_to, '[]')
        && daterange(p_effective_from, p_effective_to, '[]')
    for update;

    if v_previous.effective_from >= p_effective_from then
      raise exception 'RATE_RANGE_CONFLICT';
    end if;

    -- A bounded replacement must not leave a gap after the new rate while the
    -- old rate would otherwise still have been in force.
    if p_effective_to is not null
      and (v_previous.effective_to is null or p_effective_to < v_previous.effective_to) then
      raise exception 'RATE_END_BEFORE_PREVIOUS';
    end if;

    update public.hr_employee_rate
    set effective_to = p_effective_from - 1
    where id = v_previous.id;
  end if;

  insert into public.hr_employee_rate (
    employee_id,
    rate_type,
    amount,
    currency,
    effective_from,
    effective_to,
    created_by
  ) values (
    p_employee_id,
    p_rate_type,
    p_amount,
    v_currency,
    p_effective_from,
    p_effective_to,
    auth.uid()
  ) returning id into v_rate_id;

  return v_rate_id;
end;
$$;

-- Do not let clients bypass the period validation and replacement logic.
revoke insert on table public.hr_employee_rate from public, anon, authenticated;
revoke all on function public.save_employee_rate(uuid, public.rate_type, numeric, text, date, date)
  from public, anon, authenticated;
grant execute on function public.save_employee_rate(uuid, public.rate_type, numeric, text, date, date)
  to authenticated;

commit;
