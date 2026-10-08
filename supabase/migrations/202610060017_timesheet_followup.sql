begin;

-- Directory views keep filters, counts and names in the same RLS-scoped query.
create view public.admin_role_directory with (security_invoker=true) as
 select r.*, p.full_name from public.core_role_assignment r
 left join public.core_user_profile p on p.id=r.user_id;
create view public.admin_membership_directory with (security_invoker=true) as
 select m.*, p.full_name, pr.name as project_name, pr.code as project_code,
 case when m.revoked_at is not null or m.status='revoked' then 'revoked'
      when m.status='active' and m.end_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'expired'
      when m.status='active' and m.start_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'pending'
      else m.status::text end as effective_status
 from public.project_membership m
 left join public.core_user_profile p on p.id=m.user_id
 left join public.project_project pr on pr.id=m.project_id;
grant select on public.admin_role_directory,public.admin_membership_directory to authenticated;

-- Aggregate the entire week before the journal is paginated.
create view public.work_weekly_hours with (security_invoker=true) as
 select w.employee_id,w.project_id,w.issue_id,w.logged_date,i.title as issue_title,
 p.name as project_name,sum(w.hours) as hours
 from public.work_worklog w left join public.work_issue i on i.id=w.issue_id
 left join public.project_project p on p.id=w.project_id
 group by w.employee_id,w.project_id,w.issue_id,w.logged_date,i.title,p.name;
grant select on public.work_weekly_hours to authenticated;

alter table public.work_timesheet_adjustment
 add column version integer not null default 1,
 add column updated_at timestamptz not null default now(),
 add column resolution_reason text,
 add constraint adjustment_status_check check (status in ('pending','approved','rejected'));
create trigger hezb_adjustment_stamp before update on public.work_timesheet_adjustment
 for each row execute function internal.stamp_row();
create table public.work_timesheet_adjustment_line (
 id uuid primary key default gen_random_uuid(),
 adjustment_id uuid not null references public.work_timesheet_adjustment,
 worklog_id uuid not null references public.work_worklog,
 previous_hours numeric(6,2) not null,
 proposed_hours numeric(6,2) not null check (proposed_hours > 0 and proposed_hours <= 24),
 worklog_version integer not null,
 unique(adjustment_id,worklog_id)
);
alter table public.work_timesheet_adjustment_line enable row level security;
revoke all on public.work_timesheet_adjustment_line from public,anon,authenticated;
grant select on public.work_timesheet_adjustment_line to authenticated;
grant all on public.work_timesheet_adjustment_line to service_role;
create policy adjustment_line_read on public.work_timesheet_adjustment_line for select to authenticated
 using (exists(select 1 from public.work_timesheet_adjustment a where a.id=adjustment_id));

-- An inaccessible transaction-scoped authorization record, never a client-set GUC.
create table internal.adjustment_write_context (
 backend integer not null, transaction_id bigint not null, adjustment_id uuid not null,
 timesheet_id uuid not null, primary key(backend,transaction_id)
);
revoke all on internal.adjustment_write_context from public,anon,authenticated,service_role;

create function public.propose_timesheet_adjustment(
 p_timesheet_id uuid,p_reason text,p_changes jsonb,p_expected_version integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_ts public.work_timesheet; v_id uuid; v_project uuid; v_row record; v_recipient uuid;
begin
 select project_id into v_project from public.work_timesheet where id=p_timesheet_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.project_project where id=v_project for update;
 select * into v_ts from public.work_timesheet where id=p_timesheet_id for update;
 if not internal.owns_employee(v_ts.employee_id) then raise exception 'FORBIDDEN'; end if;
 if v_ts.status<>'locked' then raise exception 'NOT_LOCKED'; end if;
 if p_expected_version is null or v_ts.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'array' then raise exception 'INVALID_CHANGES'; end if;
 if jsonb_array_length(p_changes) not between 1 and 200 then raise exception 'INVALID_CHANGES'; end if;
 if exists(select 1 from public.work_timesheet_adjustment where timesheet_id=p_timesheet_id and status='pending')
 then raise exception 'ADJUSTMENT_PENDING'; end if;
 insert into public.work_timesheet_adjustment(timesheet_id,reason,requested_by)
 values(p_timesheet_id,btrim(p_reason),auth.uid()) returning id into v_id;
 for v_row in select * from jsonb_to_recordset(p_changes) as x(worklog_id uuid,hours numeric) loop
   if v_row.hours is null or v_row.hours<=0 or v_row.hours>24 or round(v_row.hours,2)<>v_row.hours then raise exception 'INVALID_HOURS'; end if;
   insert into public.work_timesheet_adjustment_line(adjustment_id,worklog_id,previous_hours,proposed_hours,worklog_version)
   select v_id,w.id,w.hours,v_row.hours,w.version from public.work_worklog w
   join public.work_timesheet_line l on l.worklog_id=w.id and l.timesheet_id=p_timesheet_id
   where w.id=v_row.worklog_id and w.status='approved' and w.hours<>v_row.hours;
   if not found then raise exception 'INVALID_WORKLOG'; end if;
 end loop;
 for v_recipient in
   select m.user_id from public.project_membership m where m.project_id=v_project and m.project_role='pm'
     and m.status='active' and m.revoked_at is null
     and m.start_date<=(now() at time zone 'Asia/Ho_Chi_Minh')::date
     and (m.end_date is null or m.end_date>=(now() at time zone 'Asia/Ho_Chi_Minh')::date)
   union select r.user_id from public.core_role_assignment r where r.role='company_owner' and r.revoked_at is null
     and (r.expires_at is null or r.expires_at>now())
 loop
   if v_recipient<>auth.uid() and exists(select 1 from public.core_user_profile where id=v_recipient and is_active) then
     perform internal.notify(v_recipient,'timesheet_submitted','Có yêu cầu sửa giờ timesheet đã khóa',
       '/dashboard/worklogs?tab=adjustments','ts_adjust_request_'||v_id||'_'||v_recipient);
   end if;
 end loop;
 return v_id;
end;
$$;

-- Preserve the original guards; grant only the exact approved hours correction.
create or replace function internal.guard_worklog() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_employee uuid; v_date date;
begin
 if tg_op='UPDATE' and old.status='approved' and new.status='approved'
   and (to_jsonb(new)-array['hours','version','updated_at'])=(to_jsonb(old)-array['hours','version','updated_at'])
   and exists(select 1 from internal.adjustment_write_context c
     join public.work_timesheet_adjustment_line l on l.adjustment_id=c.adjustment_id
     where c.backend=pg_backend_pid() and c.transaction_id=txid_current()
       and l.worklog_id=old.id and l.previous_hours=old.hours and l.proposed_hours=new.hours)
 then return new; end if;
 v_project:=case when tg_op='DELETE' then old.project_id else new.project_id end;
 v_employee:=case when tg_op='DELETE' then old.employee_id else new.employee_id end;
 v_date:=case when tg_op='DELETE' then old.logged_date else new.logged_date end;
 perform 1 from public.project_project where id=v_project for update;
 perform 1 from public.hr_employee where id=v_employee for update;
 if tg_op='UPDATE' then
   if (new.project_id,new.employee_id,new.issue_id,new.created_by,new.created_at)
     is distinct from (old.project_id,old.employee_id,old.issue_id,old.created_by,old.created_at)
   then raise exception 'IMMUTABLE_IDENTITY'; end if;
   if (to_jsonb(new)-array['status','updated_at','version'])=(to_jsonb(old)-array['status','updated_at','version']) then return new; end if;
   if old.status<>'draft' then raise exception 'LOCKED'; end if;
 elsif tg_op='DELETE' and old.status<>'draft' then raise exception 'LOCKED'; end if;
 if exists(select 1 from public.work_timesheet_period_lock where project_id=v_project and v_date between period_start and period_end)
   or exists(select 1 from public.work_timesheet where employee_id=v_employee and project_id=v_project
     and (v_date between period_start and period_end or (tg_op='UPDATE' and old.logged_date between period_start and period_end)) and status<>'draft')
 then raise exception 'LOCKED'; end if;
 if tg_op='DELETE' then return old; end if;
 if new.logged_date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'FUTURE_WORKLOG'; end if;
 if not exists(select 1 from public.hr_employee where id=v_employee and status='active') then raise exception 'EMPLOYEE_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.project_project where id=v_project and status='active') then raise exception 'PROJECT_NOT_ACTIVE'; end if;
 if coalesce((select sum(hours) from public.work_worklog where employee_id=v_employee and logged_date=new.logged_date and id<>new.id),0)+new.hours>24
 then raise exception 'DAILY_HOURS_EXCEEDED'; end if;
 return new;
end;
$$;

create or replace function internal.guard_locked_timesheet() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='locked' then
   if tg_op='UPDATE' and new.status='locked'
     and (to_jsonb(new)-array['total_hours','updated_at','version'])=(to_jsonb(old)-array['total_hours','updated_at','version'])
     and exists(select 1 from internal.adjustment_write_context c where c.backend=pg_backend_pid()
       and c.transaction_id=txid_current() and c.timesheet_id=old.id)
   then return new; end if;
   raise exception 'LOCKED';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;

create function public.resolve_timesheet_adjustment(
 p_adjustment_id uuid,p_approve boolean,p_reason text,p_expected_version integer
) returns void language plpgsql security definer set search_path='' as $$
declare v_a public.work_timesheet_adjustment; v_ts public.work_timesheet; v_project uuid; v_user uuid;
begin
 select t.project_id into v_project from public.work_timesheet_adjustment a
 join public.work_timesheet t on t.id=a.timesheet_id where a.id=p_adjustment_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.project_project where id=v_project for update;
 select * into v_a from public.work_timesheet_adjustment where id=p_adjustment_id for update;
 select * into v_ts from public.work_timesheet where id=v_a.timesheet_id for update;
 perform internal.check_timesheet_reviewer(v_project,v_ts.employee_id,v_ts.created_by,'pm');
 if v_a.requested_by=auth.uid() then raise exception 'SOD_VIOLATION'; end if;
 if p_expected_version is null or v_a.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if v_a.status<>'pending' or v_ts.status<>'locked' or p_approve is null then raise exception 'INVALID_STATE'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 if p_approve then
   if not exists(select 1 from public.work_timesheet_adjustment_line where adjustment_id=v_a.id) then raise exception 'NO_CHANGES'; end if;
   perform 1 from public.hr_employee where id=v_ts.employee_id for update;
   perform 1 from public.work_worklog w join public.work_timesheet_adjustment_line l on l.worklog_id=w.id
     where l.adjustment_id=v_a.id for update of w;
   if exists(select 1 from public.work_timesheet_adjustment_line l join public.work_worklog w on w.id=l.worklog_id
     where l.adjustment_id=v_a.id and (w.version<>l.worklog_version or w.hours<>l.previous_hours or w.status<>'approved'))
   then raise exception 'STALE_VERSION'; end if;
   -- Invoice snapshots contain billing periods rather than individual IDs.
   if exists(select 1 from public.finance_invoice i where i.project_id=v_project and i.status<>'voided'
     and (jsonb_typeof(i.source_snapshot)<>'array' or exists(
       select 1 from jsonb_array_elements(case when jsonb_typeof(i.source_snapshot)='array' then i.source_snapshot else '[]'::jsonb end) s
       join public.work_timesheet_adjustment_line l on l.adjustment_id=v_a.id
       join public.work_worklog w on w.id=l.worklog_id
       where s->>'type'='worklog' and w.logged_date between (s->>'period_start')::date and (s->>'period_end')::date)))
   then raise exception 'INVOICED_WORKLOG'; end if;
   lock table public.finance_payroll_period in share mode;
   if exists(select 1 from public.finance_payroll_period p join public.work_worklog w
       on extract(month from w.logged_date)=p.month and extract(year from w.logged_date)=p.year
     join public.work_timesheet_adjustment_line l on l.worklog_id=w.id and l.adjustment_id=v_a.id where p.status='locked')
   then raise exception 'PAYROLL_LOCKED'; end if;
   if exists(select 1 from public.work_worklog w left join public.work_timesheet_adjustment_line l
     on l.worklog_id=w.id and l.adjustment_id=v_a.id where w.employee_id=v_ts.employee_id
       and w.logged_date in(select w2.logged_date from public.work_worklog w2 join public.work_timesheet_adjustment_line l2
         on l2.worklog_id=w2.id where l2.adjustment_id=v_a.id)
     group by w.logged_date having sum(coalesce(l.proposed_hours,w.hours))>24)
   then raise exception 'DAILY_HOURS_EXCEEDED'; end if;
   insert into internal.adjustment_write_context values(pg_backend_pid(),txid_current(),v_a.id,v_ts.id);
   update public.work_worklog w set hours=l.proposed_hours from public.work_timesheet_adjustment_line l
     where l.adjustment_id=v_a.id and w.id=l.worklog_id;
   update public.work_timesheet_line l set hours=w.hours from public.work_worklog w
     where l.timesheet_id=v_ts.id and l.worklog_id=w.id;
   update public.work_timesheet set total_hours=(select sum(hours) from public.work_timesheet_line where timesheet_id=v_ts.id)
     where id=v_ts.id;
   delete from internal.adjustment_write_context where backend=pg_backend_pid() and transaction_id=txid_current();
 end if;
 update public.work_timesheet_adjustment set status=case when p_approve then 'approved' else 'rejected' end,
   resolved_by=auth.uid(),resolved_at=now(),resolution_reason=btrim(p_reason) where id=v_a.id;
 select user_id into v_user from public.hr_employee where id=v_ts.employee_id;
 perform internal.notify(v_user,case when p_approve then 'timesheet_pm_approved' else 'timesheet_rejected' end::public.notification_type,
   case when p_approve then 'Điều chỉnh giờ làm đã được áp dụng' else 'Yêu cầu điều chỉnh bị từ chối' end,
   '/dashboard/worklogs?tab=adjustments','ts_adjust_'||v_a.id);
end;
$$;
revoke all on function internal.guard_worklog(),internal.guard_locked_timesheet(),
 public.propose_timesheet_adjustment(uuid,text,jsonb,integer),public.resolve_timesheet_adjustment(uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.propose_timesheet_adjustment(uuid,text,jsonb,integer),
 public.resolve_timesheet_adjustment(uuid,boolean,text,integer) to authenticated;

-- Prevent billing from racing with a correction of the same project's hours.
do $$
declare body text;
begin
 select pg_get_functiondef('public.issue_invoice(uuid,uuid[],date,date,numeric,date,text)'::regprocedure) into body;
 body:=replace(body,'where id=p_project_id;','where id=p_project_id for update;');
 execute body;
end;
$$;

alter table public.core_email_reminder_log drop constraint core_email_reminder_log_reminder_type_check;
alter table public.core_email_reminder_log add constraint core_email_reminder_log_reminder_type_check
 check(reminder_type in ('issue_overdue','timesheet_pending','timesheet_unsubmitted'));

-- Reminder policy: last completed Mon-Sun week, effective memberships on
-- working days, excluding approved leave and locked/submitted coverage.
create function public.get_unsubmitted_timesheet_reminders(p_today date,p_offset integer default 0,p_limit integer default 500)
returns table(employee_id uuid,user_id uuid,project_id uuid,full_name text,project_name text,
 period_start date,period_end date,draft_hours numeric)
language plpgsql security definer set search_path='' as $$
declare v_start date; v_end date;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
 if p_today is null or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'INVALID_PERIOD'; end if;
 v_end:=p_today-extract(isodow from p_today)::integer; v_start:=v_end-6;
 return query select e.id,e.user_id,p.id,e.full_name,p.name,v_start,v_end,
   coalesce((select sum(w.hours) from public.work_worklog w where w.employee_id=e.id and w.project_id=p.id
     and w.status='draft' and w.logged_date between v_start and v_end),0)
 from public.hr_employee e
 join public.core_user_profile u on u.id=e.user_id and u.is_active
 join public.project_project p on p.status='active'
 where e.status='active' and exists(
   select 1 from generate_series(v_start::timestamp,v_end::timestamp,interval '1 day') d(day)
   where extract(isodow from day)<6 and (e.hire_date is null or day::date>=e.hire_date)
     and exists(select 1 from public.project_membership m where m.project_id=p.id and m.user_id=e.user_id
       and m.status='active' and m.revoked_at is null and m.start_date<=day::date and (m.end_date is null or m.end_date>=day::date))
     and not exists(select 1 from public.hr_leave_request l where l.employee_id=e.id and l.status='approved'
       and day::date between l.start_date and l.end_date)
     and not exists(select 1 from public.work_timesheet_period_lock l where l.project_id=p.id
       and day::date between l.period_start and l.period_end)
     and (exists(select 1 from public.work_worklog w where w.employee_id=e.id and w.project_id=p.id and w.status='draft'
             and w.logged_date=day::date)
       or not exists(select 1 from public.work_timesheet t where t.employee_id=e.id and t.project_id=p.id and t.status<>'draft'
             and day::date between t.period_start and t.period_end))
 )
 order by e.id,p.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.get_unsubmitted_timesheet_reminders(date,integer,integer) from public,anon,authenticated;
grant execute on function public.get_unsubmitted_timesheet_reminders(date,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
