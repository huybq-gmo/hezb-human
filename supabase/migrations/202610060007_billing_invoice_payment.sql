begin;

create type public.invoice_status as enum ('draft','issued','partially_paid','paid','overdue','voided');
create type public.payment_status as enum ('pending','confirmed','failed','refunded');
create sequence public.finance_invoice_number_seq start 1;

create table public.finance_invoice (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default 'INV-' || to_char(nextval('public.finance_invoice_number_seq'),'FM00000'),
  project_id uuid not null references public.project_project,
  client_id uuid not null references public.project_client,
  status public.invoice_status not null default 'draft',
  amount numeric(18,4) not null check (amount > 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(18,4) generated always as (amount + tax_amount) stored,
  currency char(3) not null default 'VND',
  due_date date,
  issued_at timestamptz,
  issued_by uuid references auth.users,
  source_snapshot jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create table public.finance_invoice_line (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoice on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  line_total numeric(18,4) generated always as (quantity * unit_price) stored,
  source_type text check (source_type in ('milestone','worklog')),
  source_id uuid
);
create unique index finance_invoice_milestone_once on public.finance_invoice_line(source_id)
  where source_type='milestone' and source_id is not null;
create table public.finance_payment (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoice,
  amount numeric(18,4) not null check (amount > 0),
  currency char(3) not null default 'VND',
  payment_date date not null,
  external_ref text unique,
  fee numeric(18,4) not null default 0 check (fee >= 0),
  notes text,
  status public.payment_status not null default 'pending',
  recorded_by uuid references auth.users,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  version integer not null default 1
);

alter table public.finance_invoice enable row level security;
alter table public.finance_invoice_line enable row level security;
alter table public.finance_payment enable row level security;
revoke all on public.finance_invoice,public.finance_invoice_line,public.finance_payment from public,anon,authenticated;
grant select on public.finance_invoice,public.finance_invoice_line,public.finance_payment to authenticated;
grant all on public.finance_invoice,public.finance_invoice_line,public.finance_payment to service_role;
create policy finance_invoice_read on public.finance_invoice for select to authenticated
  using (internal.has_role('company_owner','finance_admin','director','auditor') or 'pm'=any(internal.project_roles(project_id)));
create policy finance_invoice_line_read on public.finance_invoice_line for select to authenticated
  using (exists(select 1 from public.finance_invoice i where i.id=invoice_id
    and internal.has_role('company_owner','finance_admin','director','auditor')));
create policy finance_payment_read on public.finance_payment for select to authenticated
  using (internal.has_role('company_owner','finance_admin','director','auditor'));
create trigger hezb_invoice_audit after insert or update or delete on public.finance_invoice
  for each row execute function internal.audit_row();
create trigger hezb_payment_audit after insert or update or delete on public.finance_payment
  for each row execute function internal.audit_row();

create function internal.guard_issued_invoice_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('issued','partially_paid','paid')
    and current_setting('app.allow_invoice_payment_update',true) is distinct from 'on' then
    raise exception 'INVOICE_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function internal.guard_issued_invoice_update() from public,anon,authenticated;
create trigger finance_invoice_immutable before update on public.finance_invoice
  for each row execute function internal.guard_issued_invoice_update();

create function public.issue_invoice(
  p_project_id uuid,
  p_milestone_ids uuid[] default null,
  p_period_start date default null,
  p_period_end date default null,
  p_tax_rate numeric default 0,
  p_due_date date default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_project public.project_project;
  v_invoice uuid;
  v_amount numeric := 0;
  v_period_amount numeric := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_row record;
  v_selected integer := coalesce(cardinality(p_milestone_ids),0);
  v_valid integer := 0;
begin
  if not internal.has_role('company_owner','finance_admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_project from public.project_project where id=p_project_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 1 then raise exception 'INVALID_TAX_RATE'; end if;
  if (p_period_start is null) <> (p_period_end is null) or (p_period_end is not null and p_period_end < p_period_start) then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if v_selected=0 and p_period_start is null then raise exception 'ZERO_AMOUNT'; end if;

  if v_selected > 0 then
    select count(distinct m.id) into v_valid from public.project_milestone m
    where m.id=any(p_milestone_ids) and m.project_id=p_project_id and m.status='accepted'
      and m.budget_amount is not null and m.currency=v_project.budget_currency;
    if v_valid <> v_selected then raise exception 'INVALID_MILESTONE_SOURCE'; end if;
    for v_row in select m.id,m.name,m.budget_amount,m.currency from public.project_milestone m
      where m.id=any(p_milestone_ids) and m.project_id=p_project_id and m.status='accepted'
      order by m.due_date nulls last,m.name
    loop
      if exists(select 1 from public.finance_invoice_line l where l.source_type='milestone' and l.source_id=v_row.id) then
        raise exception 'MILESTONE_ALREADY_INVOICED';
      end if;
      v_amount := v_amount + v_row.budget_amount;
      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('type','milestone','id',v_row.id,'name',v_row.name,'amount',v_row.budget_amount,'currency',v_row.currency));
    end loop;
  end if;

  if p_period_start is not null then
    select coalesce(sum(w.hours * coalesce(rate.hourly_amount,0)),0) into v_period_amount
    from public.work_worklog w
    left join lateral (
      select (entry->>'amount')::numeric as hourly_amount
      from public.project_allocation a
      join public.finance_allocation_rate_snapshot s on s.allocation_id=a.id
      cross join lateral jsonb_array_elements(s.rate_snapshot) entry
      where a.project_id=w.project_id and a.employee_id=w.employee_id and a.status='approved'
        and a.start_date <= w.logged_date and a.end_date >= w.logged_date
        and entry->>'rate_type'='hourly' and entry->>'currency'=v_project.budget_currency
      order by a.start_date desc limit 1
    ) rate on true
    where w.project_id=p_project_id and w.is_billable and w.status='approved'
      and w.logged_date between p_period_start and p_period_end;
    v_amount := v_amount + v_period_amount;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('type','worklog','period_start',p_period_start,'period_end',p_period_end,'amount',v_period_amount,'currency',v_project.budget_currency));
  end if;
  if v_amount <= 0 then raise exception 'ZERO_AMOUNT'; end if;

  insert into public.finance_invoice(project_id,client_id,status,amount,tax_amount,currency,due_date,issued_at,issued_by,source_snapshot,notes,created_by)
  values(p_project_id,v_project.client_id,'issued',v_amount,round(v_amount*p_tax_rate,4),v_project.budget_currency,p_due_date,now(),auth.uid(),v_snapshot,nullif(btrim(p_notes),''),auth.uid())
  returning id into v_invoice;
  if v_selected > 0 then
    insert into public.finance_invoice_line(invoice_id,description,unit_price,source_type,source_id)
    select v_invoice,m.name,m.budget_amount,'milestone',m.id from public.project_milestone m
    where m.id=any(p_milestone_ids) and m.project_id=p_project_id and m.status='accepted';
  end if;
  if p_period_start is not null then
    insert into public.finance_invoice_line(invoice_id,description,unit_price,source_type)
    values(v_invoice,'Approved billable worklogs '||p_period_start||' – '||p_period_end,v_period_amount,'worklog');
  end if;
  return v_invoice;
end;
$$;

create function public.record_payment(
  p_invoice_id uuid,p_amount numeric,p_payment_date date,p_external_ref text,
  p_fee numeric default 0,p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_invoice public.finance_invoice; v_id uuid; v_existing numeric;
begin
  if not internal.has_role('company_owner','finance_admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_invoice from public.finance_invoice where id=p_invoice_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_invoice.status in ('paid','voided') then raise exception 'INVALID_STATE'; end if;
  if p_amount is null or p_amount<=0 or p_payment_date is null or p_fee is null or p_fee<0 then raise exception 'INVALID_PAYMENT'; end if;
  if p_external_ref is not null and exists(select 1 from public.finance_payment where external_ref=p_external_ref) then raise exception 'DUPLICATE_PAYMENT'; end if;
  select coalesce(sum(amount),0) into v_existing from public.finance_payment where invoice_id=p_invoice_id and status in ('pending','confirmed');
  if v_existing + p_amount > v_invoice.total_amount then raise exception 'OVERPAYMENT'; end if;
  insert into public.finance_payment(invoice_id,amount,currency,payment_date,external_ref,fee,notes,recorded_by,created_by)
  values(p_invoice_id,p_amount,v_invoice.currency,p_payment_date,nullif(btrim(p_external_ref),''),p_fee,nullif(btrim(p_notes),''),auth.uid(),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create function public.reconcile_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_invoice public.finance_invoice; v_total numeric;
begin
  if not internal.has_role('company_owner','finance_admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_invoice from public.finance_invoice where id=p_invoice_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_invoice.issued_by=auth.uid() then raise exception 'SOD_VIOLATION'; end if;
  if v_invoice.status='voided' then raise exception 'INVALID_STATE'; end if;
  update public.finance_payment set status='confirmed' where invoice_id=p_invoice_id and status='pending';
  select coalesce(sum(amount),0) into v_total from public.finance_payment where invoice_id=p_invoice_id and status='confirmed';
  perform set_config('app.allow_invoice_payment_update','on',true);
  update public.finance_invoice set status=case when v_total>=total_amount then 'paid'::public.invoice_status
    when v_total>0 then 'partially_paid'::public.invoice_status else 'issued'::public.invoice_status end
    where id=p_invoice_id;
  perform set_config('app.allow_invoice_payment_update','off',true);
end;
$$;

revoke all on function public.issue_invoice(uuid,uuid[],date,date,numeric,date,text),
  public.record_payment(uuid,numeric,date,text,numeric,text),public.reconcile_invoice(uuid) from public,anon;
grant execute on function public.issue_invoice(uuid,uuid[],date,date,numeric,date,text),
  public.record_payment(uuid,numeric,date,text,numeric,text),public.reconcile_invoice(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
