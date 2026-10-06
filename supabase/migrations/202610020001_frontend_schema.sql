-- Frontend database bootstrap: scoped to the existing UI, see supabase/README.md.

-- Apply once to a fresh ERP namespace. Any name collision aborts the transaction.

begin;

create schema if not exists internal;

revoke all on schema internal from public, anon;

grant usage on schema internal to authenticated;

create schema if not exists extensions;

create extension if not exists btree_gist with schema extensions;

create type app_role as enum (
  'company_owner', 'hr_admin', 'finance_admin', 'director',
  'project_manager', 'team_leader', 'developer', 'qa_reviewer', 'auditor'
);

create type project_role as enum (
  'pm', 'team_leader', 'developer', 'qa_reviewer'
);

create type membership_status as enum ('active', 'revoked', 'expired');

create type employee_type as enum ('full_time', 'part_time', 'freelancer', 'contractor');

create type employee_status as enum ('onboarding', 'active', 'offboarding', 'terminated');

create type rate_type as enum ('hourly', 'monthly', 'daily');

create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create type proposal_status as enum ('draft', 'sent', 'approved', 'rejected');

create type project_status as enum ('active', 'on_hold', 'completed', 'cancelled');

create type billing_type as enum ('fixed_price', 'hourly', 'mixed');

create type milestone_status as enum ('open', 'submitted', 'accepted', 'rejected');

create type issue_type as enum ('epic', 'story', 'task', 'subtask', 'bug');

create type issue_priority as enum ('critical', 'high', 'medium', 'low');

create type issue_status as enum ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled', 'blocked');

create type worklog_status as enum ('draft', 'submitted', 'approved', 'rejected');

create type timesheet_status as enum ('draft', 'submitted', 'leader_approved', 'pm_approved', 'locked', 'adjustment_pending');

create type approval_step as enum ('leader', 'pm');

create type approval_decision as enum ('approved', 'rejected');

create type notification_type as enum (
  'timesheet_submitted',
  'timesheet_leader_approved',
  'timesheet_pm_approved',
  'timesheet_rejected',
  'timesheet_locked',
  'issue_assigned',
  'issue_overdue',
  'leave_approved',
  'leave_rejected',
  'allocation_approved'
);

create table audit_log (
    id           uuid primary key default gen_random_uuid(),
    actor_id     uuid references auth.users,
    table_name   text not null,
    record_id    uuid,
    action       text not null, -- INSERT | UPDATE | DELETE | RPC
    before_masked jsonb,
    after_masked  jsonb,
    request_id   uuid,
    occurred_at  timestamptz not null default now()
  );

create table core_config (
    key   text primary key,
    value text not null
  );

create table core_user_profile (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table core_role_assignment (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  role        app_role not null,
  granted_by  uuid references auth.users,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint uq_user_role unique (user_id, role)
);

create table hr_employee (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users on delete set null,
  employee_code   text unique,
  full_name       text not null,
  email           text,
  phone           text,
  type            employee_type not null default 'full_time',
  department      text,
  status          employee_status not null default 'onboarding',
  hire_date       date,
  terminate_date  date,
  created_at      timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at      timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users,
  version         integer not null default 1
);

create table hr_contract (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references hr_employee on delete cascade,
  contract_type text not null, -- 'probation', 'fixed_term', 'indefinite', 'freelance'
  start_date    date not null,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  -- Không có updated_at — lịch sử bất biến, chỉ INSERT
  version       integer not null default 1
);

create table hr_skill (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employee on delete cascade,
  skill_name   text not null,
  level        text, -- 'beginner', 'intermediate', 'expert'
  certified_at date,
  created_at   timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users
);

create table hr_employee_rate (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references hr_employee on delete cascade,
  rate_type      rate_type not null,
  amount         numeric(18,4) not null check (amount > 0),
  currency       char(3) not null default 'VND',
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  version        integer not null default 1,
  constraint uq_employee_rate_from unique (employee_id, rate_type, effective_from)
);

create table hr_leave_type (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  name                text not null,
  default_days_per_year int not null default 12
);

create table hr_leave_balance (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references hr_employee on delete cascade,
  leave_type_id uuid not null references hr_leave_type,
  year          int not null,
  total_days    numeric(5,1) not null,
  used_days     numeric(5,1) not null default 0,
  remaining_days numeric(5,1) generated always as (total_days - used_days) stored,
  constraint uq_leave_balance unique (employee_id, leave_type_id, year)
);

create table hr_leave_request (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references hr_employee on delete cascade,
  leave_type_id   uuid not null references hr_leave_type,
  start_date      date not null,
  end_date        date not null,
  days_requested  numeric(5,1) not null,
  reason          text,
  status          leave_status not null default 'pending',
  approved_by     uuid references auth.users,
  approved_at     timestamptz,
  rejected_reason text,
  created_at      timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at      timestamptz not null default now(),
  version         integer not null default 1
);

create table project_client (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text unique,
  address     text,
  website     text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at  timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users,
  version     integer not null default 1
);

create table project_proposal (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references project_client,
  title             text not null,
  description       text,
  scope             jsonb,
  estimated_budget  numeric(18,4),
  currency          char(3) not null default 'VND',
  billing_type      billing_type not null default 'fixed_price',
  status            proposal_status not null default 'draft',
  revision_of       uuid references project_proposal, -- nếu là bản revise
  sent_at           timestamptz,
  expires_at        date,
  decided_by        uuid references auth.users,
  decided_at        timestamptz,
  reject_reason     text,
  created_at        timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at        timestamptz not null default now(),
  version           integer not null default 1
);

create table project_project (
  id                 uuid primary key default gen_random_uuid(),
  proposal_id        uuid unique references project_proposal,
  client_id          uuid not null references project_client,
  name               text not null,
  code               text unique,
  description        text,
  status             project_status not null default 'active',
  billing_type       billing_type not null,
  budget_amount      numeric(18,4),
  budget_currency    char(3) not null default 'VND',
  scope_snapshot     jsonb, -- snapshot từ proposal lúc approve
  start_date         date,
  end_date           date,
  created_at         timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at         timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users,
  version            integer not null default 1
);

create table project_membership (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null, -- FK sang project_project (Phase 3)
  user_id      uuid not null references auth.users on delete cascade,
  project_role project_role not null,
  granted_by   uuid references auth.users,
  start_date   date not null default current_date,
  end_date     date,
  status       membership_status not null default 'active',
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  constraint uq_project_user_role unique (project_id, user_id, project_role)
);

create table project_milestone (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project_project on delete cascade,
  name          text not null,
  description   text,
  due_date      date,
  budget_amount numeric(18,4),
  currency      char(3) not null default 'VND',
  status        milestone_status not null default 'open',
  submitted_at  timestamptz,
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users,
  reject_reason text,
  created_at    timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);

create table work_issue (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references project_project on delete cascade,
  sprint_id      uuid, -- FK sang work_sprint, thêm sau 4b
  parent_id      uuid references work_issue on delete set null,
  type           issue_type not null default 'task',
  title          text not null,
  description    text,
  status         issue_status not null default 'backlog',
  priority       issue_priority not null default 'medium',
  assignee_id    uuid references auth.users,
  reporter_id uuid default auth.uid() references auth.users,
  story_points   int,
  due_date       date,
  board_order    int default 0,
  created_at     timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at     timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users,
  version        integer not null default 1
);

create table work_issue_workflow (
  id             uuid primary key default gen_random_uuid(),
  from_status    issue_status not null,
  to_status      issue_status not null,
  allowed_roles  text[] not null, -- project roles được phép
  constraint uq_transition unique (from_status, to_status)
);

create table work_issue_comment (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references work_issue on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create table work_worklog (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references work_issue on delete cascade,
  project_id  uuid not null references project_project, -- denormalize để RLS dễ
  employee_id uuid not null references hr_employee,
  logged_date date not null default current_date,
  hours       numeric(6,2) not null check (hours > 0 and hours <= 24),
  description text,
  is_billable boolean not null default true,
  status      worklog_status not null default 'draft',
  created_at  timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create table work_timesheet (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employee on delete cascade,
  project_id   uuid not null references project_project,
  period_start date not null,
  period_end   date not null,
  total_hours  numeric(8,2) not null default 0,
  status       timesheet_status not null default 'draft',
  submitted_at timestamptz,
  locked_at    timestamptz,
  locked_by    uuid references auth.users,
  created_at   timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  constraint uq_timesheet unique (employee_id, project_id, period_start, period_end)
);

create table work_timesheet_line (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references work_timesheet on delete cascade,
  worklog_id   uuid not null unique references work_worklog,
  hours        numeric(6,2) not null,
  is_billable  boolean not null,
  logged_date  date not null
);

create table work_approval_step (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references work_timesheet on delete cascade,
  step         approval_step not null,
  decision     approval_decision,
  decided_by   uuid references auth.users,
  decided_at   timestamptz,
  reason       text,
  created_at   timestamptz not null default now()
);

create table work_timesheet_adjustment (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references work_timesheet,
  reason       text not null,
  requested_by uuid references auth.users,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending', -- 'pending', 'approved', 'rejected'
  resolved_by  uuid references auth.users,
  resolved_at  timestamptz
);

create table core_notification (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users on delete cascade,
  type         notification_type not null,
  title        text not null,
  body         text,
  link         text, -- relative URL, e.g. '/timesheet/abc'
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  dedupe_key   text unique -- chống duplicate notification
);

alter table project_membership add foreign key (project_id) references project_project(id);

alter table hr_employee add check (length(btrim(full_name)) > 0), add check (terminate_date is null or terminate_date >= hire_date);

alter table hr_contract add check (end_date is null or end_date >= start_date);

alter table hr_employee_rate add check (effective_to is null or effective_to >= effective_from);

-- Inclusive effective dates, enforced by an exclusion constraint (including concurrent inserts).

set local search_path = public, extensions;

alter table hr_employee_rate add constraint rate_no_overlap exclude using gist (employee_id with =, rate_type with =, daterange(effective_from, effective_to, '[]') with &&);

set local search_path = public;

alter table project_membership add check (end_date is null or end_date >= start_date);

alter table hr_leave_balance add check (total_days >= 0 and used_days >= 0 and used_days <= total_days);

alter table hr_leave_request add check (end_date >= start_date and extract(year from start_date) = extract(year from end_date)), add check (days_requested > 0 and days_requested <= end_date - start_date + 1);

alter table work_timesheet add check (period_end >= period_start and period_end - period_start <= 30), add check (total_hours >= 0);

alter table work_issue add unique (id, project_id);

alter table work_worklog add foreign key (issue_id, project_id) references work_issue(id, project_id);

alter table work_issue_comment add check (length(btrim(content)) between 1 and 10000);

alter table work_timesheet_adjustment add check (length(btrim(reason)) between 1 and 2000);

create unique index one_pending_adjustment on work_timesheet_adjustment(timesheet_id) where status = 'pending';

insert into core_config values ('org_timezone', 'Asia/Ho_Chi_Minh'), ('org_locale', 'vi-VN'), ('org_currency', 'VND'), ('week_start_day', '1');

insert into hr_leave_type(code, name, default_days_per_year) values ('annual', 'Nghỉ phép năm', 12), ('sick', 'Nghỉ ốm', 5), ('unpaid', 'Nghỉ không lương', 0), ('other', 'Khác', 0);

insert into work_issue_workflow(from_status, to_status, allowed_roles) values ('backlog', 'todo', array['pm','team_leader','developer','qa_reviewer']), ('todo', 'in_progress', array['pm','team_leader','developer','qa_reviewer']), ('in_progress', 'in_review', array['pm','team_leader','developer','qa_reviewer']), ('in_review', 'done', array['pm','team_leader','qa_reviewer']), ('in_review', 'in_progress', array['pm','team_leader','qa_reviewer']), ('done', 'backlog', array['pm','team_leader']), ('backlog', 'cancelled', array['pm','team_leader']), ('todo', 'cancelled', array['pm','team_leader']), ('in_progress', 'blocked', array['pm','team_leader','developer','qa_reviewer']), ('blocked', 'in_progress', array['pm','team_leader','developer','qa_reviewer']);

alter table audit_log enable row level security;

revoke all on table audit_log from public, anon, authenticated;

grant select on table audit_log to authenticated;

grant all on table audit_log to service_role;

alter table core_config enable row level security;

revoke all on table core_config from public, anon, authenticated;

grant select on table core_config to authenticated;

grant all on table core_config to service_role;

alter table core_user_profile enable row level security;

revoke all on table core_user_profile from public, anon, authenticated;

grant select on table core_user_profile to authenticated;

grant all on table core_user_profile to service_role;

alter table core_role_assignment enable row level security;

revoke all on table core_role_assignment from public, anon, authenticated;

grant select on table core_role_assignment to authenticated;

grant all on table core_role_assignment to service_role;

alter table hr_employee enable row level security;

revoke all on table hr_employee from public, anon, authenticated;

grant select on table hr_employee to authenticated;

grant all on table hr_employee to service_role;

alter table hr_contract enable row level security;

revoke all on table hr_contract from public, anon, authenticated;

grant select on table hr_contract to authenticated;

grant all on table hr_contract to service_role;

alter table hr_skill enable row level security;

revoke all on table hr_skill from public, anon, authenticated;

grant select on table hr_skill to authenticated;

grant all on table hr_skill to service_role;

alter table hr_employee_rate enable row level security;

revoke all on table hr_employee_rate from public, anon, authenticated;

grant select on table hr_employee_rate to authenticated;

grant all on table hr_employee_rate to service_role;

alter table hr_leave_type enable row level security;

revoke all on table hr_leave_type from public, anon, authenticated;

grant select on table hr_leave_type to authenticated;

grant all on table hr_leave_type to service_role;

alter table hr_leave_balance enable row level security;

revoke all on table hr_leave_balance from public, anon, authenticated;

grant select on table hr_leave_balance to authenticated;

grant all on table hr_leave_balance to service_role;

alter table hr_leave_request enable row level security;

revoke all on table hr_leave_request from public, anon, authenticated;

grant select on table hr_leave_request to authenticated;

grant all on table hr_leave_request to service_role;

alter table project_client enable row level security;

revoke all on table project_client from public, anon, authenticated;

grant select on table project_client to authenticated;

grant all on table project_client to service_role;

alter table project_proposal enable row level security;

revoke all on table project_proposal from public, anon, authenticated;

grant select on table project_proposal to authenticated;

grant all on table project_proposal to service_role;

alter table project_project enable row level security;

revoke all on table project_project from public, anon, authenticated;

grant select on table project_project to authenticated;

grant all on table project_project to service_role;

alter table project_membership enable row level security;

revoke all on table project_membership from public, anon, authenticated;

grant select on table project_membership to authenticated;

grant all on table project_membership to service_role;

alter table project_milestone enable row level security;

revoke all on table project_milestone from public, anon, authenticated;

grant select on table project_milestone to authenticated;

grant all on table project_milestone to service_role;

alter table work_issue enable row level security;

revoke all on table work_issue from public, anon, authenticated;

grant select on table work_issue to authenticated;

grant all on table work_issue to service_role;

alter table work_issue_workflow enable row level security;

revoke all on table work_issue_workflow from public, anon, authenticated;

grant select on table work_issue_workflow to authenticated;

grant all on table work_issue_workflow to service_role;

alter table work_issue_comment enable row level security;

revoke all on table work_issue_comment from public, anon, authenticated;

grant select on table work_issue_comment to authenticated;

grant all on table work_issue_comment to service_role;

alter table work_worklog enable row level security;

revoke all on table work_worklog from public, anon, authenticated;

grant select on table work_worklog to authenticated;

grant all on table work_worklog to service_role;

alter table work_timesheet enable row level security;

revoke all on table work_timesheet from public, anon, authenticated;

grant select on table work_timesheet to authenticated;

grant all on table work_timesheet to service_role;

alter table work_timesheet_line enable row level security;

revoke all on table work_timesheet_line from public, anon, authenticated;

grant select on table work_timesheet_line to authenticated;

grant all on table work_timesheet_line to service_role;

alter table work_approval_step enable row level security;

revoke all on table work_approval_step from public, anon, authenticated;

grant select on table work_approval_step to authenticated;

grant all on table work_approval_step to service_role;

alter table work_timesheet_adjustment enable row level security;

revoke all on table work_timesheet_adjustment from public, anon, authenticated;

grant select on table work_timesheet_adjustment to authenticated;

grant all on table work_timesheet_adjustment to service_role;

alter table core_notification enable row level security;

revoke all on table core_notification from public, anon, authenticated;

grant select on table core_notification to authenticated;

grant all on table core_notification to service_role;

grant update (full_name, avatar_url, updated_at) on core_user_profile to authenticated;

grant insert on hr_employee, hr_contract, hr_skill, hr_employee_rate, hr_leave_request, project_client, project_proposal, project_milestone, work_issue, work_issue_comment, work_worklog to authenticated;

grant update (full_name, email, phone, employee_code, type, department, hire_date) on hr_employee to authenticated;

grant update (title, description, priority, assignee_id, story_points, due_date, board_order) on work_issue to authenticated;

grant update (hours, description, is_billable, logged_date) on work_worklog to authenticated;

grant delete on work_worklog, hr_skill to authenticated;

grant update (is_read) on core_notification to authenticated;

create index role_assignment_user on core_role_assignment(user_id) where revoked_at is null;

create index membership_project_user on project_membership(project_id, user_id) where status = 'active';

create index issue_project on work_issue(project_id, status);

create index comment_issue on work_issue_comment(issue_id, created_at);

create index worklog_employee_date on work_worklog(employee_id, logged_date);

create index timesheet_project_period on work_timesheet(project_id, period_start, period_end);

create index notification_recipient on core_notification(recipient_id, is_read, created_at desc);

commit;
