begin;

create function public.save_project_client(
  p_client_id uuid,
  p_name text,
  p_code text,
  p_address text,
  p_website text,
  p_notes text,
  p_is_active boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not internal.has_role('company_owner', 'director', 'project_manager', 'finance_admin') then
    raise exception 'FORBIDDEN';
  end if;
  if coalesce(length(btrim(p_name)), 0) = 0 then raise exception 'INVALID_CLIENT'; end if;

  if p_client_id is null then
    insert into public.project_client(name, code, address, website, notes, is_active, created_by, updated_by)
    values (btrim(p_name), nullif(btrim(p_code), ''), nullif(btrim(p_address), ''),
      nullif(btrim(p_website), ''), nullif(btrim(p_notes), ''), coalesce(p_is_active, true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.project_client set name = btrim(p_name), code = nullif(btrim(p_code), ''),
      address = nullif(btrim(p_address), ''), website = nullif(btrim(p_website), ''),
      notes = nullif(btrim(p_notes), ''), is_active = coalesce(p_is_active, true), updated_by = auth.uid()
    where id = p_client_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end;
$$;

create function public.reject_proposal(p_proposal_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_proposal public.project_proposal;
begin
  if not internal.has_role('company_owner', 'director') then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(p_reason)), 0) = 0 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_proposal from public.project_proposal where id = p_proposal_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_proposal.status <> 'sent' then raise exception 'INVALID_STATE'; end if;
  if v_proposal.created_by = auth.uid() then raise exception 'SOD_VIOLATION'; end if;
  update public.project_proposal set status = 'rejected', reject_reason = btrim(p_reason),
    decided_by = auth.uid(), decided_at = now() where id = p_proposal_id;
end;
$$;

revoke all on function public.save_project_client(uuid, text, text, text, text, text, boolean),
  public.reject_proposal(uuid, text) from public, anon;
grant execute on function public.save_project_client(uuid, text, text, text, text, text, boolean),
  public.reject_proposal(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
