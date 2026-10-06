begin;

create table public.core_email_reminder_log (
  id uuid primary key default gen_random_uuid(),
  reminder_type text not null check (reminder_type in ('issue_overdue','timesheet_pending')),
  entity_id uuid not null,
  recipient_id uuid not null references auth.users on delete cascade,
  reminder_date date not null,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (reminder_type,entity_id,recipient_id,reminder_date)
);
create index core_email_reminder_recent on public.core_email_reminder_log(reminder_date desc,status);
alter table public.core_email_reminder_log enable row level security;
revoke all on public.core_email_reminder_log from public,anon,authenticated;
grant all on public.core_email_reminder_log to service_role;

-- Atomic daily claim; stale in-flight claims can be retried after ten minutes.
create function public.claim_email_reminder(p_type text,p_entity_id uuid,p_recipient_id uuid,p_reminder_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  insert into public.core_email_reminder_log(reminder_type,entity_id,recipient_id,reminder_date)
    values(p_type,p_entity_id,p_recipient_id,p_reminder_date)
  on conflict(reminder_type,entity_id,recipient_id,reminder_date) do update set
    status='sending',attempt_count=public.core_email_reminder_log.attempt_count+1,
    error_code=null,updated_at=now()
  where public.core_email_reminder_log.status='failed'
    or (public.core_email_reminder_log.status='sending' and public.core_email_reminder_log.updated_at < now()-interval '10 minutes')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.claim_email_reminder(text,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.claim_email_reminder(text,uuid,uuid,date) to service_role;

notify pgrst, 'reload schema';
commit;
