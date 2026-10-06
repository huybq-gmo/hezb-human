-- Run only against an isolated test database. All fixtures roll back.
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001','owner@example.test','{"full_name":"Test Owner"}'),
  ('00000000-0000-4000-8000-000000000002','developer@example.test','{}'),
  ('00000000-0000-4000-8000-000000000003','leader@example.test','{}'),
  ('00000000-0000-4000-8000-000000000004','pm@example.test','{}'),
  ('00000000-0000-4000-8000-000000000005','qa@example.test','{}'),
  ('00000000-0000-4000-8000-000000000006','other@example.test','{}'),
  ('00000000-0000-4000-8000-000000000007','hr@example.test','{}'),
  ('00000000-0000-4000-8000-000000000008','unprovisioned@example.test','{}');
insert into core_role_assignment(user_id, role) values
  ('00000000-0000-4000-8000-000000000001','company_owner'),
  ('00000000-0000-4000-8000-000000000002','developer'),
  ('00000000-0000-4000-8000-000000000003','team_leader'),
  ('00000000-0000-4000-8000-000000000004','project_manager'),
  ('00000000-0000-4000-8000-000000000005','qa_reviewer'),
  ('00000000-0000-4000-8000-000000000006','developer'),
  ('00000000-0000-4000-8000-000000000007','hr_admin'),
  ('00000000-0000-4000-8000-000000000007','finance_admin');
insert into hr_employee(id, user_id, full_name, status) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Test Owner','active'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Test Developer','active'),
  ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','Test Other','active'),
  ('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000007','Test HR','active');
insert into hr_contract(employee_id,contract_type,start_date) values ('10000000-0000-4000-8000-000000000002','fixed_term',current_date);
insert into hr_skill(employee_id,skill_name) values ('10000000-0000-4000-8000-000000000002','TypeScript');
insert into hr_employee_rate(employee_id,rate_type,amount,effective_from,effective_to) values ('10000000-0000-4000-8000-000000000002','hourly',100,current_date-30,current_date+30);
insert into hr_leave_balance(employee_id,leave_type_id,year,total_days)
  select '10000000-0000-4000-8000-000000000002',id,extract(year from current_date)::int,12 from hr_leave_type where code='annual';
insert into hr_leave_request(id,employee_id,leave_type_id,start_date,end_date,days_requested,created_by)
  select '40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',id,current_date,current_date,1,'00000000-0000-4000-8000-000000000002' from hr_leave_type where code='annual';
insert into project_client(id,name) values ('50000000-0000-4000-8000-000000000001','Test client');
insert into project_proposal(id,client_id,title,status,created_by) values
  ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Test proposal','sent','00000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','Owner proposal','sent','00000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001','Rejectable proposal','sent','00000000-0000-4000-8000-000000000002');
insert into project_project(id,client_id,name,billing_type) values
  ('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Test project','hourly'),
  ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','Other project','hourly');
insert into project_membership(project_id,user_id,project_role) values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','developer'),
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','team_leader'),
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','pm'),
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','qa_reviewer'),
  ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','developer');
insert into work_issue(id,project_id,title,status,due_date,reporter_id,created_by) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Test issue','in_review',current_date-1,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Test issue 2','todo',current_date+1,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Hidden issue','todo',current_date+1,'00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006');
insert into project_milestone(project_id,name,due_date,budget_amount,currency) values
  ('20000000-0000-4000-8000-000000000001','Milestone 1',current_date-1,1000,'VND'),
  ('20000000-0000-4000-8000-000000000001','Milestone 2',current_date-1,500,'VND');

set local role anon;
select throws_ok('select * from core_user_profile','42501',null,'Anon cannot read profiles');
select throws_ok($$select assign_role('00000000-0000-4000-8000-000000000008','developer')$$,'42501',null,'Anon cannot invoke privileged RPC');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}';
select is((select count(*) from hr_employee),0::bigint,'New unprovisioned Auth account has no employee access');
select is((select count(*) from get_my_roles()),0::bigint,'Unprovisioned account has no business role');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select full_name from core_user_profile where id=auth.uid()),null::text,'Auth trigger created own profile');
select lives_ok($$update core_user_profile set full_name='Developer updated' where id=auth.uid()$$,'User can edit own name');
select throws_ok($$update core_user_profile set is_active=false where id=auth.uid()$$,'42501',null,'User cannot edit own activation');
select is((select count(*) from core_role_assignment),1::bigint,'User can read own role assignments only');
select is((select role::text from get_my_roles()),'developer','Live roles are readable without JWT hook');
select throws_ok($$select assign_role(auth.uid(),'company_owner')$$,'P0001','FORBIDDEN','Developer cannot grant roles');
select throws_ok($$select configure_role_permission('developer','hr_admin',true)$$,'P0001','FORBIDDEN','Developer cannot alter role capabilities');
select is((select count(*) from audit_log),0::bigint,'Developer cannot read audit');
select is((select count(*) from hr_employee),4::bigint,'Provisioned developer can read employees');
select throws_ok($$select department from hr_employee limit 1$$,'42703',null,'Department field has been removed from the HR schema');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='dashboard_team_utilization' and column_name='department'),0::bigint,'Team utilization view no longer exposes department');
select throws_ok($$insert into hr_employee(full_name) values ('Forbidden')$$,'42501',null,'Developer cannot create employee');
select is((select count(*) from hr_employee_rate),0::bigint,'Developer cannot see salary rates');
select is((select count(*) from hr_contract),0::bigint,'Developer cannot see contracts');
select is((select count(*) from hr_skill),1::bigint,'Developer can see skills');
select throws_ok($$insert into hr_contract(employee_id,contract_type,start_date) values ('10000000-0000-4000-8000-000000000002','test',current_date)$$,'42501',null,'Developer cannot insert contracts');
select is((select count(*) from work_issue),2::bigint,'Issues are scoped to project membership');
select is((select count(*) from work_issue_with_sla),2::bigint,'SLA view respects issue RLS');
select is((select count(*) from work_issue_with_sla where is_overdue),1::bigint,'SLA marks overdue issue');
select throws_ok($$update work_issue set status='done' where id='30000000-0000-4000-8000-000000000001'$$,'42501',null,'Direct workflow status update is denied');
select throws_ok($$update work_issue set title='Bypass' where id='30000000-0000-4000-8000-000000000002'$$,'42501',null,'Direct issue edits are denied');
select lives_ok($$select update_issue_fields('30000000-0000-4000-8000-000000000002','{"title":"Reporter edit","description":"Updated while todo"}')$$,'Reporter can edit own title and description before work starts');
select throws_ok($$select update_issue_fields('30000000-0000-4000-8000-000000000002','{"priority":"high"}')$$,'P0001','FORBIDDEN','Reporter cannot edit manager-only fields');
select throws_ok($$select update_issue_fields('30000000-0000-4000-8000-000000000001','{"title":"Late edit"}')$$,'P0001','FORBIDDEN','Reporter cannot edit after issue leaves backlog/todo');
select throws_ok($$select transition_issue('30000000-0000-4000-8000-000000000001','done')$$,'P0001','FORBIDDEN','Developer cannot finish own review');
select throws_ok($$select transition_issue('30000000-0000-4000-8000-000000000002','done')$$,'P0001','INVALID_TRANSITION','Cannot skip workflow states');
select lives_ok($$insert into work_issue_comment(issue_id,content,attachment_paths) values ('30000000-0000-4000-8000-000000000001','Test comment',array['20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt'])$$,'Project member can comment with a private attachment');
select throws_ok($$select update_issue_attachment_reference('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt','20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/new.txt')$$,'P0001','FORBIDDEN','Regular member cannot replace an attachment reference');
select throws_ok($$insert into work_issue_comment(issue_id,content) values ('30000000-0000-4000-8000-000000000003','Forbidden')$$,'42501',null,'Cannot comment on another project');
select lives_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours,work_type) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',current_date,7.5,'test')$$,'Employee can log own work with a work type');
select is((select work_type from work_worklog limit 1),'test','Worklog type persists');
select throws_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours,work_type) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',current_date,0.25,'invalid')$$,'23514',null,'Worklog type is restricted to the supported list');
select lives_ok($$select set_work_attendance('check_in')$$,'Employee can check in');
select is((select count(*) from work_attendance where employee_id='10000000-0000-4000-8000-000000000002'),1::bigint,'Check-in creates one daily attendance row');
select lives_ok($$select set_work_attendance('check_in')$$,'Repeated check-in is idempotent');
select lives_ok($$select set_work_attendance('check_out')$$,'Employee can check out after check-in');
select throws_ok($$select set_work_attendance('check_out')$$,'P0001','CHECK_IN_REQUIRED','Repeated check-out is rejected');
select throws_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours) values ('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',current_date,1)$$,'42501',null,'Cannot log work for another employee');
select throws_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003',current_date,1)$$,'42501',null,'Cannot log work in another project');
select throws_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',current_date,1)$$,'23503',null,'Issue/project composite FK rejects mismatches');
select throws_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',current_date,20)$$,'P0001','DAILY_HOURS_EXCEEDED','Daily total cannot exceed 24 hours');
select lives_ok($$select submit_timesheet('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',current_date,current_date)$$,'Employee can submit timesheet');
select is((select total_hours from work_timesheet),7.5::numeric,'Timesheet snapshots actual worklog hours');
select is((select count(*) from work_timesheet_line),1::bigint,'Timesheet captures one worklog line');
select lives_ok($$update work_worklog set hours=8$$,'RLS filters submitted worklogs from direct updates');
select is((select hours from work_worklog),7.5::numeric,'Submitted worklog hours stay unchanged');
select throws_ok($$select lock_timesheet_period('20000000-0000-4000-8000-000000000001',current_date,current_date)$$,'P0001','FORBIDDEN','Developer cannot lock period');
select throws_ok($$select approve_timesheet_step((select id from work_timesheet limit 1),'leader')$$,'P0001','FORBIDDEN','Developer cannot approve timesheets');
select throws_ok($$select approve_leave('40000000-0000-4000-8000-000000000001')$$,'P0001','FORBIDDEN','Developer cannot approve leave');
select throws_ok($$select adjust_leave_balance('10000000-0000-4000-8000-000000000002',(select id from hr_leave_type where code='annual'),extract(year from current_date)::int,15)$$,'P0001','FORBIDDEN','Developer cannot adjust leave balance');
select throws_ok($$select approve_proposal('60000000-0000-4000-8000-000000000001')$$,'P0001','FORBIDDEN','Developer cannot approve proposal');
select throws_ok($$select save_project_client(null,'Forbidden client',null,null,null,null,true)$$,'P0001','FORBIDDEN','Developer cannot create or edit clients');
select throws_ok($$select request_project_allocation('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','developer',50,current_date,current_date+30)$$,'P0001','FORBIDDEN','Developer cannot request a team allocation');
select throws_ok($$insert into project_allocation(project_id,employee_id,project_role,allocation_percent,start_date,end_date,requested_by) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','developer',50,current_date,current_date+30,auth.uid())$$,'42501',null,'Allocation writes require the guarded RPC');
select throws_ok($$select save_project_sprint(null,'20000000-0000-4000-8000-000000000001','Iteration 1',current_date,current_date+13,'planned')$$,'P0001','FORBIDDEN','Developer cannot create a sprint');
select throws_ok($$select submit_milestone_acceptance((select id from project_milestone limit 1))$$,'P0001','FORBIDDEN','Developer cannot submit milestone acceptance');
select is((select count(*) from finance_project_cost_summary),0::bigint,'Developer cannot read project cost summary');
select throws_ok($$select issue_invoice('20000000-0000-4000-8000-000000000001',null,null,null)$$,'P0001','FORBIDDEN','Developer cannot issue invoices');
select throws_ok($$select record_payment('00000000-0000-4000-8000-000000000099',10,current_date,'DEV-REF')$$,'P0001','FORBIDDEN','Developer cannot record payments');
select is((select count(*) from project_proposal),0::bigint,'Developer cannot read proposals');
select is((select count(*) from finance_allocation_rate_snapshot),0::bigint,'Developer cannot read financial rate snapshots');
select is((select count(*) from finance_payroll_period),0::bigint,'Developer cannot read payroll periods');
select is((select count(*) from hr_team),0::bigint,'Developer cannot read HR team roster');
select throws_ok($$select open_payroll_period(extract(month from current_date)::int,extract(year from current_date)::int)$$,'P0001','FORBIDDEN','Developer cannot open payroll periods');
select throws_ok($$select save_hr_team(null,'Forbidden team',null,true)$$,'P0001','FORBIDDEN','Developer cannot create HR teams');
select throws_ok($$select * from export_payroll_hours('00000000-0000-4000-8000-000000000099')$$,'P0001','FORBIDDEN','Developer cannot export payroll hours');
select throws_ok($$select * from core_email_reminder_log$$,'42501',null,'Developer cannot read email reminder delivery logs');
select throws_ok($$select claim_email_reminder('issue_overdue','00000000-0000-4000-8000-000000000099',auth.uid(),current_date)$$,'42501',null,'Authenticated users cannot claim email reminders');
select is(internal.can_access_attachment('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt',true),true,'Member can upload to own issue folder');
select is(internal.can_access_attachment('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003/test.txt',true),false,'Forged project/issue folder is denied');
select is(internal.can_manage_attachment('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt'),false,'Regular member cannot manage issue attachments');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='hezb_attachment_delete'),1::bigint,'Storage has an explicit manager-only attachment delete policy');
select lives_ok($$insert into storage.objects(bucket_id,name) values ('issue-attachments','20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt')$$,'Member can insert private attachment metadata');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('issue-attachments','20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003/test.txt')$$,'42501',null,'Cross-project upload is denied');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select lives_ok($$select transition_issue('30000000-0000-4000-8000-000000000001','done')$$,'QA can approve issue review');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select update_issue_fields('30000000-0000-4000-8000-000000000002','{"title":"PM edit","priority":"high","assignee_id":"00000000-0000-4000-8000-000000000002","story_points":5}')$$,'Project Manager can edit active issue fields and assign an active member');
select throws_ok($$select update_issue_fields('30000000-0000-4000-8000-000000000002','{"assignee_id":"00000000-0000-4000-8000-000000000006"}')$$,'P0001','ASSIGNEE_NOT_MEMBER','Issue cannot be assigned to a non-member');
select throws_ok($$select update_issue_fields('30000000-0000-4000-8000-000000000001','{"title":"Closed edit"}')$$,'P0001','ISSUE_CLOSED','Closed issue cannot be edited');
select is(internal.can_manage_attachment('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt'),true,'Project Manager can manage issue attachments');
select lives_ok($$select update_issue_attachment_reference('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/test.txt','20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/new.txt')$$,'Project Manager can replace a comment attachment reference');
select is((select attachment_paths[1] from work_issue_comment where content='Test comment'),'20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/new.txt','Replacement updates the comment link');
select lives_ok($$select update_issue_attachment_reference('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/new.txt',null)$$,'Project Manager can remove a comment attachment reference');
select is((select cardinality(attachment_paths) from work_issue_comment where content='Test comment'),0,'Removal clears stale attachment links from the comment');
select lives_ok($$select restore_issue_attachment_reference('20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/new.txt',array[(select id from work_issue_comment where content='Test comment')])$$,'Manager can restore a comment link if Storage removal fails');
select is((select attachment_paths[1] from work_issue_comment where content='Test comment'),'20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/new.txt','Attachment compensation restores its comment link');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*) from work_worklog),1::bigint,'Project leader can read employee worklog');
select is((select count(*) from core_notification),1::bigint,'Submit notifies project leader');
select throws_ok($$select approve_timesheet_step((select id from work_timesheet limit 1),'pm')$$,'P0001','FORBIDDEN','Leader cannot approve PM step');
select lives_ok($$select reject_timesheet((select id from work_timesheet limit 1),'Correct the hours')$$,'Leader can reject submitted timesheet');
select is((select status::text from work_timesheet),'draft','Rejection returns timesheet to draft');
select is((select count(*) from work_timesheet_line),0::bigint,'Rejection releases captured lines');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$update work_worklog set hours=8$$,'Employee can edit rejected draft worklog');
select lives_ok($$select submit_timesheet('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',current_date,current_date)$$,'Employee can resubmit rejected timesheet');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select configure_role_permission('developer','hr_admin',true)$$,'Owner can grant an approved HR capability to a role');
select lives_ok($$select create_permission_code('hr_custom_ops','HR Custom Ops','Named alias for HR administration','hr_admin')$$,'Owner can create a custom permission code mapped to an existing capability');
select lives_ok($$select configure_role_permission('developer','hr_custom_ops',true)$$,'Owner can assign a custom permission code to a role');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(internal.has_role('hr_admin'),true,'Configured capability takes effect in database authorization');
select lives_ok($$insert into hr_employee(full_name) values ('Capability-granted employee')$$,'Configured HR capability grants HR employee creation through RLS');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select configure_role_permission('developer','hr_admin',false)$$,'Owner can revoke an approved capability');
select lives_ok($$select configure_role_permission('developer','hr_custom_ops',false)$$,'Owner can revoke a custom permission code');
select throws_ok($$select configure_role_permission('developer','finance_admin',true)$$,'P0001','PROTECTED_PERMISSION','Finance capability cannot be granted through configuration');
select throws_ok($$select configure_role_permission('developer','company_owner',true)$$,'P0001','PROTECTED_PERMISSION','Owner capability cannot be granted through configuration');
select throws_ok($$select create_permission_code('protected_owner','Protected','Cannot alias Owner','company_owner')$$,'P0001','PROTECTED_PERMISSION','Owner cannot create a custom Owner permission');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(internal.has_role('hr_admin'),false,'Revoking capability takes effect immediately in database authorization');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select issues_open from dashboard_project_health where project_id='20000000-0000-4000-8000-000000000001'),1::bigint,'Dashboard issue count is not multiplied by milestones');
select is((select milestones_overdue from dashboard_project_health where project_id='20000000-0000-4000-8000-000000000001'),2::bigint,'Dashboard milestone count is not multiplied by issues');
select throws_ok($$select lock_timesheet_period('20000000-0000-4000-8000-000000000001',current_date,current_date)$$,'P0001','HAS_UNAPPROVED','Cannot lock submitted period');
select lives_ok($$select approve_leave('40000000-0000-4000-8000-000000000001')$$,'Owner can approve another employee leave');
select is((select remaining_days from hr_leave_balance),11.0::numeric,'Leave approval deducts balance');
select throws_ok($$select adjust_leave_balance('10000000-0000-4000-8000-000000000002',(select id from hr_leave_type where code='annual'),extract(year from current_date)::int,0)$$,'P0001','BALANCE_BELOW_USED','HR balance cannot be reduced below used days');
select lives_ok($$select adjust_leave_balance('10000000-0000-4000-8000-000000000002',(select id from hr_leave_type where code='annual'),extract(year from current_date)::int,14)$$,'Owner can adjust annual leave balance');
select is((select total_days from hr_leave_balance),14::numeric,'Leave balance adjustment preserves used days');
select throws_ok($$select approve_leave('40000000-0000-4000-8000-000000000001')$$,'P0001','INVALID_STATE','Duplicate approval cannot deduct balance twice');
select throws_ok($$select approve_proposal('60000000-0000-4000-8000-000000000002')$$,'P0001','SOD_VIOLATION','Owner cannot approve own proposal');
select lives_ok($$select approve_proposal('60000000-0000-4000-8000-000000000001')$$,'Owner can approve another creator proposal');
select is((select count(*) from project_project where proposal_id='60000000-0000-4000-8000-000000000001'),1::bigint,'Proposal creates exactly one project');
select throws_ok($$select reject_proposal('60000000-0000-4000-8000-000000000002','Rejected')$$,'P0001','SOD_VIOLATION','Proposal creator cannot reject own proposal');
select lives_ok($$select reject_proposal('60000000-0000-4000-8000-000000000003','Scope does not match')$$,'Director or Owner can reject another creator proposal');
select is((select status::text from project_proposal where id='60000000-0000-4000-8000-000000000003'),'rejected','Proposal rejection updates its state');
select lives_ok($$select save_project_client(null,'Second test client','CLIENT-2',null,null,null,true)$$,'Owner can create client');
select is((select count(*) from project_client where code='CLIENT-2'),1::bigint,'Client create persists a unique code');
select lives_ok($$select save_project_client((select id from project_client where code='CLIENT-2'),'Updated test client','CLIENT-2',null,null,null,false)$$,'Owner can edit and deactivate client');
select is((select is_active from project_client where code='CLIENT-2'),false,'Client can be deactivated without deleting history');
select lives_ok($$select save_project_sprint(null,'20000000-0000-4000-8000-000000000001','Iteration 1',current_date,current_date+13,'planned')$$,'Owner can create a project sprint');
select lives_ok($$select assign_issue_to_sprint('30000000-0000-4000-8000-000000000001',(select id from work_sprint limit 1))$$,'Owner can assign an issue to its project sprint');
select is((select sprint_id from work_issue where id='30000000-0000-4000-8000-000000000001'),(select id from work_sprint limit 1),'Issue stores its sprint');
select throws_ok($$select assign_issue_to_sprint('30000000-0000-4000-8000-000000000003',(select id from work_sprint limit 1))$$,'P0001','PROJECT_MISMATCH','Issue cannot be assigned to another project sprint');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select submit_milestone_acceptance((select id from project_milestone order by name limit 1))$$,'Project PM can submit a milestone for acceptance');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select decide_milestone((select id from project_milestone order by name limit 1),true,null)$$,'Owner can accept a milestone submitted by a PM');
select throws_ok($$select decide_milestone((select id from project_milestone order by name limit 1),true,null)$$,'P0001','INVALID_STATE','Milestone cannot be accepted twice');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select submit_milestone_acceptance((select id from project_milestone order by name desc limit 1))$$,'PM can submit another milestone');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select decide_milestone((select id from project_milestone order by name desc limit 1),false,'Acceptance criteria incomplete')$$,'Owner can reject a milestone with a reason');
select is((select status::text from project_milestone order by name desc limit 1),'rejected','Milestone rejection is persisted');
select throws_ok($$select issue_invoice('20000000-0000-4000-8000-000000000001',null,null,null)$$,'P0001','ZERO_AMOUNT','Invoice cannot be issued without an accepted source');
select lives_ok($$select issue_invoice('20000000-0000-4000-8000-000000000001',array[(select id from project_milestone where name='Milestone 1')],null,null,0.1,current_date+30,'Acceptance milestone')$$,'Owner can issue invoice from an accepted milestone');
select matches((select invoice_number from finance_invoice limit 1),'^INV-[0-9]{5}$','Invoice number is generated from sequence');
select is((select total_amount from finance_invoice limit 1),1100::numeric,'Invoice tax and total are calculated');
select throws_ok($$select issue_invoice('20000000-0000-4000-8000-000000000001',array[(select id from project_milestone where name='Milestone 1')],null,null,0,current_date+30,null)$$,'P0001','MILESTONE_ALREADY_INVOICED','Milestone cannot be invoiced more than once');
select throws_ok($$select reconcile_invoice((select id from finance_invoice limit 1))$$,'P0001','SOD_VIOLATION','Invoice issuer cannot reconcile own invoice');
reset role;
select throws_ok($$update finance_invoice set notes='forged' where project_id='20000000-0000-4000-8000-000000000001'$$,'P0001','INVOICE_LOCKED','Issued invoice cannot be changed directly');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}';
select lives_ok($$select record_payment((select id from finance_invoice limit 1),300,current_date,'BANK-001')$$,'Finance can record a partial payment');
select throws_ok($$select record_payment((select id from finance_invoice limit 1),100,current_date,'BANK-001')$$,'P0001','DUPLICATE_PAYMENT','External reference enforces payment idempotency');
select lives_ok($$select reconcile_invoice((select id from finance_invoice limit 1))$$,'A different finance user can reconcile the invoice');
select is((select status::text from finance_invoice limit 1),'partially_paid','Reconciliation marks partial payment');
select lives_ok($$select record_payment((select id from finance_invoice limit 1),800,current_date,'BANK-002')$$,'Finance can record the remaining payment');
select lives_ok($$select reconcile_invoice((select id from finance_invoice limit 1))$$,'Finance can reconcile the remaining payment');
select is((select status::text from finance_invoice limit 1),'paid','Fully reconciled invoice is paid');
select throws_ok($$select record_payment((select id from finance_invoice limit 1),1,current_date,'BANK-003')$$,'P0001','INVALID_STATE','Paid invoice rejects additional payment');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select request_project_allocation('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','developer',50,current_date,current_date+30)$$,'Project PM can request employee allocation');
select is((select status from project_allocation limit 1),'requested','Allocation starts pending approval');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select decide_project_allocation((select id from project_allocation limit 1),true,null)$$,'Owner can approve another users allocation request');
select is((select status from project_allocation limit 1),'approved','Allocation approval changes state');
select is((select count(*) from finance_allocation_rate_snapshot),1::bigint,'Approval snapshots effective employee rates');
select is((select allocated_percent from employee_availability(current_date,current_date) where employee_id='10000000-0000-4000-8000-000000000002'),50::numeric,'Capacity view includes approved allocation percent');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select request_project_allocation('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','developer',60,current_date,current_date+30)$$,'PM can submit an additional allocation request');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select decide_project_allocation((select id from project_allocation where status='requested' limit 1),true,null)$$,'P0001','CAPACITY_EXCEEDED','Approval rejects overlapping allocations above full capacity');
select throws_ok($$select revoke_role(auth.uid(),'company_owner')$$,'P0001','LAST_OWNER','Cannot revoke last owner');
select lives_ok($$select assign_role('00000000-0000-4000-8000-000000000006','auditor')$$,'Owner can grant role');
select lives_ok($$select revoke_role('00000000-0000-4000-8000-000000000006','auditor')$$,'Owner can revoke role');
select is((select count(*) from audit_log where before_masked ? 'amount' or after_masked ? 'amount'),0::bigint,'Audit masks monetary amounts');
select is((select count(*) from audit_log where before_masked ? 'full_name' or after_masked ? 'full_name'),0::bigint,'Audit masks names');
select throws_ok($$update audit_log set action='FORGED'$$,'42501',null,'Audit trail is append-only for clients');
select throws_ok($$select transition_employee_status('10000000-0000-4000-8000-000000000006','terminated')$$,'P0001','INVALID_TRANSITION','Employee cannot skip offboarding');
select lives_ok($$select transition_employee_status('10000000-0000-4000-8000-000000000006','offboarding')$$,'Owner can start employee offboarding');
select lives_ok($$select transition_employee_status('10000000-0000-4000-8000-000000000006','terminated')$$,'Owner can terminate offboarding employee');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated","roles":["auditor","developer"]}';
select is((select count(*) from get_my_roles()),0::bigint,'Revoked roles cannot reappear from stale JWT claims');
select is((select count(*) from hr_employee),0::bigint,'Terminated account cannot read ERP');
select throws_ok($$select request_timesheet_adjustment('70000000-0000-4000-8000-000000000001','Forged')$$,'P0001','NOT_FOUND','Missing adjustment target is rejected');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$select approve_timesheet_step((select id from work_timesheet limit 1),'leader')$$,'Leader approves leader step');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select approve_timesheet_step((select id from work_timesheet limit 1),'pm')$$,'PM approves PM step');
select is((select status::text from work_worklog),'approved','PM approval also approves worklog');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select actual_cost from finance_project_cost_summary where project_id='20000000-0000-4000-8000-000000000001'),800::numeric,'Project actual cost uses the approved worklog and allocation rate snapshot');
select is(open_payroll_period(extract(month from current_date)::int,extract(year from current_date)::int),open_payroll_period(extract(month from current_date)::int,extract(year from current_date)::int),'Opening an existing payroll period is idempotent');
select is((select total_approved_hours from export_payroll_hours((select id from finance_payroll_period where month=extract(month from current_date)::int and year=extract(year from current_date)::int)) where employee_id='10000000-0000-4000-8000-000000000002'),8::numeric,'Payroll export contains approved worklog hours for the period');
select is((select rate_snapshot->0->>'amount' from export_payroll_hours((select id from finance_payroll_period where month=extract(month from current_date)::int and year=extract(year from current_date)::int)) where employee_id='10000000-0000-4000-8000-000000000002'),'100.0000','Payroll export snapshots effective rate data');
select is((select lock_timesheet_period('20000000-0000-4000-8000-000000000001',current_date,current_date)),1,'PM locks approved period');
select is((select lock_timesheet_period('20000000-0000-4000-8000-000000000001',current_date,current_date)),0,'Lock is idempotent');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select request_timesheet_adjustment((select id from work_timesheet limit 1),'Need correction')$$,'Owner can request adjustment without unlocking');
select is((select status::text from work_timesheet),'locked','Adjustment does not unlock immutable timesheet');
select throws_ok($$insert into work_worklog(employee_id,project_id,issue_id,logged_date,hours) values ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',current_date,1)$$,'P0001','LOCKED','Cannot append worklog into locked period');
select is((select count(*) from core_notification where type='leave_approved'),1::bigint,'Leave approval sends private notification');
select lives_ok($$update core_notification set is_read=true$$,'Recipient can mark own notifications read');
select throws_ok($$update core_notification set title='Forged'$$,'42501',null,'Recipient cannot rewrite notification content');
select throws_ok($$select internal.notify(auth.uid(),'issue_assigned','Spam','/dashboard','spam')$$,'42501',null,'Clients cannot invoke notification mutation helper');

reset role;
-- Test SoD even for owners, and protect locked rows from accidental admin writes.
update core_role_assignment set revoked_at = null where user_id='00000000-0000-4000-8000-000000000002';
insert into core_role_assignment(user_id,role) values ('00000000-0000-4000-8000-000000000002','company_owner');
set local role authenticated;
select throws_ok($$select approve_timesheet_step((select id from work_timesheet limit 1),'leader')$$,'P0001','SOD_VIOLATION','Owner cannot approve own timesheet');
reset role;
select throws_ok($$update work_timesheet set total_hours=99 where status='locked'$$,'P0001','LOCKED','Locked timesheet cannot be edited even by SQL admin');
insert into hr_leave_request(id,employee_id,leave_type_id,start_date,end_date,days_requested,created_by)
  select '40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007',id,current_date,current_date,1,'00000000-0000-4000-8000-000000000007' from hr_leave_type where code='annual';
update project_membership set start_date=current_date+1 where user_id='00000000-0000-4000-8000-000000000005';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}';
select is((select count(*) from hr_employee_rate),1::bigint,'HR can read sensitive rates');
select lives_ok($$insert into hr_employee(full_name) values ('New employee')$$,'HR can create onboarding employee');
select lives_ok($$select save_hr_team(null,'Platform Engineering','Core product team',true)$$,'HR can create an organization team');
select lives_ok($$select assign_hr_team_member((select id from hr_team where name='Platform Engineering'),'10000000-0000-4000-8000-000000000002','leader',current_date,null)$$,'HR can assign an active employee as team leader');
select is((select team_role from hr_team_membership limit 1),'leader','Team membership stores its organization role');
select throws_ok($$select assign_hr_team_member((select id from hr_team where name='Platform Engineering'),'10000000-0000-4000-8000-000000000002','member',current_date+1,null)$$,'23P01',null,'Overlapping membership in the same team is denied');
select throws_ok($$select assign_hr_team_member((select id from hr_team where name='Platform Engineering'),'10000000-0000-4000-8000-000000000001','leader',current_date,null)$$,'23505',null,'A team cannot have two active leaders');
select lives_ok($$select revoke_hr_team_member((select id from hr_team_membership limit 1))$$,'HR can revoke a team assignment');
select is((select status from hr_team_membership limit 1),'revoked','Team assignment revocation is audited and persisted');
select lives_ok($$select save_hr_team((select id from hr_team where name='Platform Engineering'),'Platform Engineering','Core product team',false)$$,'HR can archive an organization team');
select throws_ok($$select assign_hr_team_member((select id from hr_team where name='Platform Engineering'),'10000000-0000-4000-8000-000000000006','member',current_date,null)$$,'P0001','TEAM_NOT_ACTIVE','Archived team rejects new members');
select lives_ok($$select save_hr_team(null,'Offboarding Team',null,true)$$,'HR can create another active team');
select lives_ok($$select assign_hr_team_member((select id from hr_team where name='Offboarding Team'),'10000000-0000-4000-8000-000000000002','member',current_date,null)$$,'HR can add an employee for lifecycle test');
select throws_ok($$select approve_leave('40000000-0000-4000-8000-000000000002')$$,'P0001','SOD_VIOLATION','HR cannot approve own leave');
select throws_ok($$select assign_role(auth.uid(),'company_owner')$$,'P0001','FORBIDDEN','HR cannot escalate to owner');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","roles":["company_owner"]}';
select is((select count(*) from work_issue),0::bigint,'Future membership and forged business claims cannot unlock project');
select is(internal.has_role('company_owner'),false,'Business authorization ignores JWT business role');
reset role;
update project_membership set start_date=current_date-2,end_date=current_date-1 where user_id='00000000-0000-4000-8000-000000000005';
update core_role_assignment set expires_at=now()-interval '1 day' where user_id='00000000-0000-4000-8000-000000000005';
set local role authenticated;
select is((select count(*) from get_my_roles()),0::bigint,'Expired role assignment has no authority');
select is((select count(*) from project_membership),0::bigint,'Expired role and membership deprovision user');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select transition_employee_status('10000000-0000-4000-8000-000000000002','offboarding')$$,'Owner can begin employee offboarding');
select lives_ok($$select transition_employee_status('10000000-0000-4000-8000-000000000002','terminated')$$,'Owner can terminate offboarding employee');
select is((select status from hr_team_membership m join hr_team t on t.id=m.team_id where t.name='Offboarding Team'),'revoked','Employee termination automatically revokes HR team membership');
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select isnt(claim_email_reminder('issue_overdue','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001',current_date),null::uuid,'Service role can atomically claim a reminder');
select is(claim_email_reminder('issue_overdue','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001',current_date),null::uuid,'Duplicate reminder claim is suppressed for the same day');
update core_email_reminder_log set status='failed' where entity_id='00000000-0000-4000-8000-000000000099';
select isnt(claim_email_reminder('issue_overdue','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001',current_date),null::uuid,'Failed delivery can be claimed again for retry');
reset role;
select * from finish();
rollback;
