begin;

create function public.adjust_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year integer,
  p_total_days numeric
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner', 'hr_admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_employee_id is null or p_leave_type_id is null or p_year not between 2000 and 2200
    or p_total_days is null or p_total_days < 0 then
    raise exception 'INVALID_BALANCE';
  end if;
  if not exists (select 1 from public.hr_employee where id = p_employee_id) then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.hr_leave_type where id = p_leave_type_id) then
    raise exception 'LEAVE_TYPE_NOT_FOUND';
  end if;

  insert into public.hr_leave_balance(employee_id, leave_type_id, year, total_days)
  values (p_employee_id, p_leave_type_id, p_year, p_total_days)
  on conflict (employee_id, leave_type_id, year) do update
    set total_days = excluded.total_days
    where public.hr_leave_balance.used_days <= excluded.total_days
  returning id into v_id;

  if v_id is null then raise exception 'BALANCE_BELOW_USED'; end if;
  return v_id;
end;
$$;

revoke all on function public.adjust_leave_balance(uuid, uuid, integer, numeric) from public, anon;
grant execute on function public.adjust_leave_balance(uuid, uuid, integer, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
