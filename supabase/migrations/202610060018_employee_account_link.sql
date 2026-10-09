create function public.prepare_employee_account_link(
  p_employee_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.hr_employee;
begin
  if auth.uid() is null or not internal.has_role('company_owner', 'hr_admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_email is null or length(btrim(p_email)) = 0 then
    raise exception 'INVALID_EMAIL';
  end if;

  select * into v_employee
  from public.hr_employee
  where id = p_employee_id
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_employee.user_id is not null then
    raise exception 'EMPLOYEE_ALREADY_LINKED';
  end if;
end;
$$;

create function public.link_employee_account(
  p_employee_id uuid,
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.hr_employee;
  v_auth_email text;
begin
  if auth.uid() is null or not internal.has_role('company_owner', 'hr_admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_email is null or length(btrim(p_email)) = 0 then
    raise exception 'INVALID_EMAIL';
  end if;

  select * into v_employee
  from public.hr_employee
  where id = p_employee_id
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_employee.user_id is not null then
    raise exception 'EMPLOYEE_ALREADY_LINKED';
  end if;
  select lower(email) into v_auth_email
  from auth.users
  where id = p_user_id;
  if not found then raise exception 'TARGET_USER_NOT_FOUND'; end if;
  if v_auth_email is null or v_auth_email <> lower(btrim(p_email)) then
    raise exception 'EMAIL_MISMATCH';
  end if;
  if not exists (
    select 1 from public.core_user_profile
    where id = p_user_id and is_active
  ) then
    raise exception 'TARGET_USER_NOT_ACTIVE';
  end if;
  if exists (
    select 1 from public.hr_employee
    where user_id = p_user_id and id <> p_employee_id
  ) then
    raise exception 'USER_ALREADY_LINKED';
  end if;

  update public.hr_employee
  set user_id = p_user_id,
      email = lower(btrim(p_email))
  where id = p_employee_id;
end;
$$;

revoke all on function public.prepare_employee_account_link(uuid, text) from public, anon;
revoke all on function public.link_employee_account(uuid, uuid, text) from public, anon;
grant execute on function public.prepare_employee_account_link(uuid, text) to authenticated;
grant execute on function public.link_employee_account(uuid, uuid, text) to authenticated;
