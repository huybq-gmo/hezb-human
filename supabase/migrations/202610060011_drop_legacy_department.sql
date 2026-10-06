begin;

-- The employee Data API, UI and utilization view no longer use this field.
-- Remove the legacy column after that dependency audit to complete the HR cleanup.
alter table public.hr_employee drop column department;

notify pgrst, 'reload schema';
commit;
