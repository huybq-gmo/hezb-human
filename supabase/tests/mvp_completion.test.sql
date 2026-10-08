-- Isolated local/test database only; all fixtures roll back.
begin;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
 ('90000000-0000-4000-8000-000000000001','completion-owner@example.test','{}'),
 ('90000000-0000-4000-8000-000000000002','completion-dev@example.test','{}'),
 ('90000000-0000-4000-8000-000000000003','completion-other@example.test','{}');
insert into core_role_assignment(user_id,role) values
 ('90000000-0000-4000-8000-000000000001','company_owner'),
 ('90000000-0000-4000-8000-000000000002','developer'),
 ('90000000-0000-4000-8000-000000000003','developer');
insert into hr_employee(id,user_id,full_name,status,hire_date) values
 ('90300000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','Completion Dev','active',current_date-365),
 ('90300000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003','Completion Other','active',current_date-365);
insert into project_client(id,name) values
 ('90100000-0000-4000-8000-000000000001','Completion Client'),
 ('90100000-0000-4000-8000-000000000002','Completion Other Client');
insert into project_project(id,client_id,name,billing_type) values
 ('90200000-0000-4000-8000-000000000001','90100000-0000-4000-8000-000000000001','Completion Project','hourly'),
 ('90200000-0000-4000-8000-000000000002','90100000-0000-4000-8000-000000000002','Completion Other Project','hourly');
insert into project_membership(project_id,user_id,project_role,start_date) values
 ('90200000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','developer',current_date-365),
 ('90200000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003','developer',current_date-365);
insert into work_issue(id,project_id,title,type,status,reporter_id,created_by) values
 ('90400000-0000-4000-8000-000000000001','90200000-0000-4000-8000-000000000001','Completion Epic','epic','backlog','90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002'),
 ('90400000-0000-4000-8000-000000000002','90200000-0000-4000-8000-000000000001','Completion Story','story','backlog','90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002'),
 ('90400000-0000-4000-8000-000000000003','90200000-0000-4000-8000-000000000001','Completion Task','task','backlog','90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002'),
 ('90400000-0000-4000-8000-000000000004','90200000-0000-4000-8000-000000000002','Outside Epic','epic','backlog','90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003');
insert into work_worklog(id,issue_id,project_id,employee_id,logged_date,hours,status,created_by) values
 ('90500000-0000-4000-8000-000000000001','90400000-0000-4000-8000-000000000003','90200000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000002',current_date-2,2,'draft','90000000-0000-4000-8000-000000000002'),
 ('90500000-0000-4000-8000-000000000002','90400000-0000-4000-8000-000000000003','90200000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000002',current_date-2,1,'draft','90000000-0000-4000-8000-000000000002'),
 ('90500000-0000-4000-8000-000000000003','90400000-0000-4000-8000-000000000003','90200000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000002',current_date-3,3,'submitted','90000000-0000-4000-8000-000000000002'),
 ('90500000-0000-4000-8000-000000000004','90400000-0000-4000-8000-000000000003','90200000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000002',current_date-14,8,'approved','90000000-0000-4000-8000-000000000002');
insert into hr_leave_request(employee_id,leave_type_id,start_date,end_date,days_requested,status,created_by)
 select '90300000-0000-4000-8000-000000000002',t.id,d.day,d.day,1,'approved','90000000-0000-4000-8000-000000000002'
 from hr_leave_type t cross join lateral (
   select min(day)::date as day from generate_series((current_date-14)::timestamp,(current_date-8)::timestamp,interval '1 day') s(day)
   where extract(isodow from day)<6
 ) d where t.code='annual';
insert into project_allocation(project_id,employee_id,project_role,allocation_percent,start_date,end_date,status,requested_by) values
 ('90200000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000002','developer',50,current_date-30,current_date,'approved','90000000-0000-4000-8000-000000000001');
insert into hr_team(id,name) values ('90700000-0000-4000-8000-000000000001','Completion Team');
insert into hr_team_membership(team_id,employee_id,team_role,start_date) values
 ('90700000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000002','leader',current_date-30),
 ('90700000-0000-4000-8000-000000000001','90300000-0000-4000-8000-000000000003','member',current_date-30);
insert into hr_skill(employee_id,skill_name,level) values ('90300000-0000-4000-8000-000000000002','TypeScript','expert');

insert into finance_invoice(id,project_id,client_id,status,amount,source_snapshot,issued_by)
 values('90600000-0000-4000-8000-000000000001','90200000-0000-4000-8000-000000000001','90100000-0000-4000-8000-000000000001','issued',100,'{}','90000000-0000-4000-8000-000000000001');
insert into finance_payment(invoice_id,amount,payment_date,status)
 select '90600000-0000-4000-8000-000000000001',1,current_date,'confirmed' from generate_series(1,55);
insert into finance_payment(invoice_id,amount,payment_date,status)
 values('90600000-0000-4000-8000-000000000001',10,current_date,'pending');

set local role anon;
select throws_ok('select * from finance_invoice_payment_summary','42501',null,'Anon cannot read invoice payment summary');
select throws_ok('select * from project_client_contact','42501',null,'Anon cannot read client contacts');
select throws_ok($$select get_dashboard_utilization(current_date-14,current_date-8)$$,'42501',null,'Anon cannot call reporting RPC');
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000002',null,1)$$,'42501',null,'Anon cannot set issue parent');
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select save_project_client_contact(null,'90100000-0000-4000-8000-000000000001','Denied',null,null,null,false)$$,'P0001','FORBIDDEN','Developer cannot write client contacts');
select throws_ok($$insert into project_client_contact(client_id,full_name) values('90100000-0000-4000-8000-000000000001','Bypass')$$,'42501',null,'Direct contact writes are denied');
select is((select count(*) from finance_invoice_payment_summary),0::bigint,'Developer cannot read financial aggregates');
select lives_ok($$update work_worklog set hours=3,work_type='review' where id='90500000-0000-4000-8000-000000000001' and version=1$$,'Own draft worklog can update hours and work type');
select is((select work_type from work_worklog where id='90500000-0000-4000-8000-000000000001'),'review','Draft work type changed');
select is((select version from work_worklog where id='90500000-0000-4000-8000-000000000001'),2,'Draft edit increments version');
select lives_ok($$update work_worklog set hours=9 where id='90500000-0000-4000-8000-000000000001' and version=1$$,'Stale draft update affects no rows');
select is((select hours from work_worklog where id='90500000-0000-4000-8000-000000000001'),3::numeric,'Stale update preserves hours');
select lives_ok($$delete from work_worklog where id='90500000-0000-4000-8000-000000000002' and status='draft'$$,'Own draft can be deleted');
select is((select count(*) from work_worklog where id='90500000-0000-4000-8000-000000000002'),0::bigint,'Draft deletion removed one row');
select lives_ok($$update work_worklog set hours=9 where id='90500000-0000-4000-8000-000000000003'$$,'Submitted update is filtered by RLS');
select is((select hours from work_worklog where id='90500000-0000-4000-8000-000000000003'),3::numeric,'Submitted hours stay unchanged');
select lives_ok($$delete from work_worklog where id='90500000-0000-4000-8000-000000000003'$$,'Submitted deletion is filtered by RLS');
select is((select count(*) from work_worklog where id='90500000-0000-4000-8000-000000000003'),1::bigint,'Submitted worklog is retained');
select lives_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000002','90400000-0000-4000-8000-000000000001',1)$$,'Reporter can link backlog story to epic');
select is((select parent_id from work_issue where id='90400000-0000-4000-8000-000000000002'),'90400000-0000-4000-8000-000000000001'::uuid,'Parent link saved');
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000002',null,1)$$,'P0001','STALE_VERSION','Parent changes reject stale issue version');
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000001','90400000-0000-4000-8000-000000000002',1)$$,'P0001','PARENT_CYCLE','Parent cycles are denied');
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000001','90400000-0000-4000-8000-000000000001',1)$$,'P0001','INVALID_PARENT','Self parent is denied');
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000003','90400000-0000-4000-8000-000000000004',1)$$,'P0001','INVALID_PARENT','Cross-project parent is denied');
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000001','90400000-0000-4000-8000-000000000003',1)$$,'P0001','INVALID_PARENT_TYPE','Task cannot be an epic/story parent');
select is((select count(*) from hr_team_skill_matrix),0::bigint,'Developer cannot read HR team skill matrix');
select is((select count(*) from get_dashboard_utilization(current_date-14,current_date-8)),1::bigint,'Developer reporting is scoped to own employee');
select is((select approved_hours from get_dashboard_utilization(current_date-14,current_date-8)),8::numeric,'Report excludes draft/submitted/out-of-period worklogs');
select is((select capacity_hours from get_dashboard_utilization(current_date-14,current_date-8)),32::numeric,'Report excludes weekends and approved leave');
select is((select utilization_pct from get_dashboard_utilization(current_date-14,current_date-8)),25::numeric,'Utilization uses actual capacity denominator');
select is((select capacity_hours from get_dashboard_utilization(current_date-14,current_date-8,'90200000-0000-4000-8000-000000000001')),16::numeric,'Project capacity uses approved allocation');
select throws_ok($$select get_dashboard_utilization(current_date,current_date-1)$$,'P0001','INVALID_REPORT_RANGE','Reversed reporting dates denied');
select throws_ok($$select get_dashboard_utilization(current_date-14,current_date-8,null,-1,50)$$,'P0001','INVALID_REPORT_RANGE','Negative reporting offset denied');
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$select set_issue_parent('90400000-0000-4000-8000-000000000002',null,2)$$,'P0001','FORBIDDEN','Nonmember cannot change issue parent');
select throws_ok($$select get_dashboard_utilization(current_date-14,current_date-8,'90200000-0000-4000-8000-000000000001')$$,'P0001','FORBIDDEN','Nonmember cannot request project utilization');
select lives_ok($$delete from work_worklog where id='90500000-0000-4000-8000-000000000001'$$,'Other employee deletion is filtered by RLS');
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from work_worklog where id='90500000-0000-4000-8000-000000000001'),1::bigint,'Other employee cannot delete draft');
select lives_ok($$select save_project_client_contact(null,'90100000-0000-4000-8000-000000000001','First','first@example.test','123','PM',true)$$,'Owner creates first primary contact');
select lives_ok($$select save_project_client_contact(null,'90100000-0000-4000-8000-000000000001','Second','second@example.test',null,'Tech Lead',true)$$,'Owner promotes another primary contact');
select is((select count(*) from project_client_contact where client_id='90100000-0000-4000-8000-000000000001' and is_primary),1::bigint,'Client has at most one primary contact');
select is((select is_primary from project_client_contact where email='first@example.test'),false,'Former primary contact is demoted');
select throws_ok($$select save_project_client_contact((select id from project_client_contact where email='first@example.test'),'90100000-0000-4000-8000-000000000001','First',null,null,null,false,1)$$,'P0001','STALE_VERSION','Contact edit rejects stale version');
select throws_ok($$select save_project_client_contact((select id from project_client_contact where email='first@example.test'),'90100000-0000-4000-8000-000000000002','First',null,null,null,false,2)$$,'P0001','NOT_FOUND','Contact cannot be moved to another client');
select throws_ok($$select save_project_client_contact(null,'90100000-0000-4000-8000-000000000001','Bad','invalid-email',null,null,false)$$,'P0001','INVALID_CONTACT','Invalid contact email denied');
select throws_ok($$select delete_project_client_contact((select id from project_client_contact where email='first@example.test'),1)$$,'P0001','STALE_VERSION','Contact deletion rejects stale version');
select lives_ok($$select delete_project_client_contact((select id from project_client_contact where email='first@example.test'),2)$$,'Owner deletes contact with current version');
select is((select count(*) from project_client_contact where email='first@example.test'),0::bigint,'Contact deletion removes record');
select is((select count(*) from hr_team_skill_matrix where team_id='90700000-0000-4000-8000-000000000001'),2::bigint,'Skill matrix includes members without skills');
select is((select skills->0->>'skill_name' from hr_team_skill_matrix where employee_id='90300000-0000-4000-8000-000000000002'),'TypeScript','Skill matrix contains actual employee skill');
select is((select skills from hr_team_skill_matrix where employee_id='90300000-0000-4000-8000-000000000003'),'[]'::jsonb,'Member with no skills has empty skill list');
select is((select count(*) from get_dashboard_utilization(current_date-14,current_date-8)),2::bigint,'Owner sees all eligible active employees');
select is((select total_count from get_dashboard_utilization(current_date-14,current_date-8,null,1,1)),2::bigint,'Reporting page preserves full result count');
select is((select confirmed_amount from finance_invoice_payment_summary where invoice_id='90600000-0000-4000-8000-000000000001'),55::numeric,'Invoice confirmed total covers payments beyond first 50 rows');
select is((select pending_amount from finance_invoice_payment_summary where invoice_id='90600000-0000-4000-8000-000000000001'),10::numeric,'Invoice pending total excludes confirmed payments');
reset role;

-- Verify a locked source date cannot be escaped by moving the draft elsewhere.
insert into work_timesheet_period_lock(project_id,period_start,period_end,locked_by)
 values('90200000-0000-4000-8000-000000000001',current_date-2,current_date-2,'90000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claims='{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$update work_worklog set logged_date=current_date-1 where id='90500000-0000-4000-8000-000000000001'$$,'P0001','LOCKED','Moving a draft out of locked source period is denied');
select throws_ok($$delete from work_worklog where id='90500000-0000-4000-8000-000000000001'$$,'P0001','LOCKED','Deleting draft in locked period is denied');
reset role;
select * from finish();
rollback;
