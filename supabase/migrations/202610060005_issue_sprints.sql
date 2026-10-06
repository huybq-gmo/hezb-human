begin;

create table public.work_sprint (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_project on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  version integer not null default 1,
  unique (project_id, name),
  check (end_date >= start_date)
);
create index work_sprint_project_dates on public.work_sprint(project_id, start_date, end_date);
alter table public.work_issue add constraint work_issue_sprint_fk foreign key (sprint_id) references public.work_sprint(id) on delete set null;

alter table public.work_sprint enable row level security;
revoke all on public.work_sprint from public, anon, authenticated;
grant select on public.work_sprint to authenticated;
grant all on public.work_sprint to service_role;
create policy sprint_read on public.work_sprint for select to authenticated
  using (internal.is_project_member(project_id) or internal.has_role('director'));
create trigger hezb_sprint_audit after insert or update or delete on public.work_sprint
  for each row execute function internal.audit_row();
create trigger hezb_sprint_stamp before update on public.work_sprint
  for each row execute function internal.stamp_row();

create function public.save_project_sprint(
  p_sprint_id uuid,
  p_project_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_status text default 'planned'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_sprint public.work_sprint; v_id uuid;
begin
  if not internal.has_role('company_owner', 'director', 'project_manager')
    and not ('pm' = any(internal.project_roles(p_project_id))) then raise exception 'FORBIDDEN'; end if;
  if p_project_id is null or coalesce(length(btrim(p_name)),0) = 0
    or p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'INVALID_SPRINT';
  end if;
  if p_sprint_id is null then
    if p_status <> 'planned' then raise exception 'INVALID_STATE'; end if;
    insert into public.work_sprint(project_id,name,start_date,end_date,created_by,updated_by)
      values (p_project_id,btrim(p_name),p_start_date,p_end_date,auth.uid(),auth.uid()) returning id into v_id;
  else
    select * into v_sprint from public.work_sprint where id=p_sprint_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_sprint.project_id <> p_project_id then raise exception 'PROJECT_MISMATCH'; end if;
    if p_status not in ('planned','active','completed') or not (
      p_status = v_sprint.status
      or (v_sprint.status = 'planned' and p_status = 'active')
      or (v_sprint.status = 'active' and p_status = 'completed')
    ) then raise exception 'INVALID_STATE'; end if;
    update public.work_sprint set name=btrim(p_name),start_date=p_start_date,end_date=p_end_date,status=p_status,updated_by=auth.uid()
      where id=p_sprint_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function public.assign_issue_to_sprint(p_issue_id uuid, p_sprint_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_sprint_project uuid;
begin
  select project_id into v_project from public.work_issue where id=p_issue_id for update;
  if v_project is null then raise exception 'NOT_FOUND'; end if;
  if not internal.has_role('company_owner','director','project_manager')
    and not (internal.project_roles(v_project) && array['pm','team_leader']) then raise exception 'FORBIDDEN'; end if;
  if p_sprint_id is not null then
    select project_id into v_sprint_project from public.work_sprint where id=p_sprint_id;
    if v_sprint_project is null then raise exception 'SPRINT_NOT_FOUND'; end if;
    if v_sprint_project <> v_project then raise exception 'PROJECT_MISMATCH'; end if;
  end if;
  update public.work_issue set sprint_id=p_sprint_id,updated_by=auth.uid() where id=p_issue_id;
end;
$$;

revoke all on function public.save_project_sprint(uuid,uuid,text,date,date,text),
  public.assign_issue_to_sprint(uuid,uuid) from public, anon;
grant execute on function public.save_project_sprint(uuid,uuid,text,date,date,text),
  public.assign_issue_to_sprint(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
