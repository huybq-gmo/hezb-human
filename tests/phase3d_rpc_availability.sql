-- ============================================================
-- Phase 3d: Resource Capacity & Availability Tests
-- ============================================================

begin;

select plan(3);

set local role to postgres;

-- Setup employees
insert into hr_employee(id, user_id, full_name, type, status)
values
  ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A (có leave)', 'full_time', 'active'),
  ('e2', '00000000-0000-0000-0000-000000000011', 'Dev B (no leave)',  'full_time', 'active');

-- Leave type
insert into hr_leave_type(id, code, name, default_days_per_year)
values ('lt1', 'annual', 'Nghỉ phép năm', 12);

-- Tuần test: thứ 2 đến thứ 6
-- 2 ngày leave approved cho Dev A trong tuần đó
insert into hr_leave_request(
  id, employee_id, leave_type_id,
  start_date, end_date, days_requested,
  status, approved_by, approved_at, created_by
) values (
  'r1', 'e1', 'lt1',
  date_trunc('week', current_date)::date,
  date_trunc('week', current_date)::date + 1,
  2,
  'approved',
  '00000000-0000-0000-0000-000000000003',
  now(),
  '00000000-0000-0000-0000-000000000010'
);

-- ---------------------------------------------------------------------------
-- 1. Nhân sự có 2 ngày leave trong tuần 5 ngày → available_hours = 24
-- ---------------------------------------------------------------------------
select is(
  (
    select available_hours
    from employee_availability(
      'e1'::uuid,
      date_trunc('week', current_date)::date,
      date_trunc('week', current_date)::date + 4
    )
  ),
  24::numeric,
  'Dev A có 2 ngày leave trong tuần 5 ngày → available_hours = (5-2)×8 = 24'
);

-- ---------------------------------------------------------------------------
-- 2. Nhân sự không có leave → available_hours = 40
-- ---------------------------------------------------------------------------
select is(
  (
    select available_hours
    from employee_availability(
      'e2'::uuid,
      date_trunc('week', current_date)::date,
      date_trunc('week', current_date)::date + 4
    )
  ),
  40::numeric,
  'Dev B không có leave trong tuần → available_hours = 5×8 = 40'
);

-- ---------------------------------------------------------------------------
-- 3. total_work_days = 5 cho tuần thứ 2 - thứ 6
-- ---------------------------------------------------------------------------
select is(
  (
    select total_work_days
    from employee_availability(
      'e2'::uuid,
      date_trunc('week', current_date)::date,
      date_trunc('week', current_date)::date + 4
    )
  ),
  5,
  'total_work_days = 5 cho tuần thứ 2 - thứ 6'
);

select * from finish();
rollback;
