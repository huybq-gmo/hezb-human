// Optional PostgreSQL WASM check. Install the isolated runner as documented.
import { PGlite } from '../node_modules/.cache/hezb-sql-check/node_modules/@electric-sql/pglite/dist/index.js'
import { btree_gist } from '../node_modules/.cache/hezb-sql-check/node_modules/@electric-sql/pglite/dist/contrib/btree_gist.js'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const db=new PGlite({extensions:{btree_gist}})
const root=new URL('../../',import.meta.url)
let checks=0
async function sql(statement) {return (await db.query(statement)).rows}
async function equal(statement,expected,label) {
 const rows=await sql(statement); assert.equal(Object.values(rows[0])[0],expected,label);checks++
}
async function denied(statement,message) {
 await db.exec('savepoint expected_failure')
 let failure=null
 try {await db.query(statement)}
 catch(error){failure=error}
 finally {await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure')}
 assert(failure,`Expected database rejection: ${message}`)
 assert(failure.message.includes(message),`${message}: ${failure.message}`);checks++
}
const owner='90000000-0000-4000-8000-000000000001'
const dev='90000000-0000-4000-8000-000000000002'
const other='90000000-0000-4000-8000-000000000003'
const project='90200000-0000-4000-8000-000000000001'
const employee='90300000-0000-4000-8000-000000000002'
const log='90500000-0000-4000-8000-000000000004'
const sheet='90800000-0000-4000-8000-000000000001'
async function as(user,role='authenticated') {
 await db.exec(`reset role;set local role ${role};set local request.jwt.claims='${JSON.stringify({sub:user,role})}'`)
}
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
   grant usage on schema auth,storage to anon,authenticated,service_role;
   grant execute on all functions in schema auth to anon,authenticated,service_role;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
   alter table storage.objects enable row level security;
   grant all on storage.objects to authenticated,service_role;`)
 for(const file of readdirSync(new URL('supabase/migrations/',root)).filter(file=>file.endsWith('.sql')).sort()) {
   try {await db.exec(readFileSync(new URL('supabase/migrations/'+file,root),'utf8'))}
   catch(error){throw new Error(`Migration ${file}: ${error.message}`,{cause:error})}
 }
 console.log('PASS all migrations through 017 on a fresh PostgreSQL instance')
 const fixture=readFileSync(new URL('supabase/tests/mvp_completion.test.sql',root),'utf8')
   .split('set local role anon;')[0].replace('select no_plan();','')
 await db.exec(fixture)
 await db.exec(`delete from finance_payment;delete from finance_invoice_line;delete from finance_invoice;
   insert into work_worklog(issue_id,project_id,employee_id,logged_date,hours,status,created_by)
   values('90400000-0000-4000-8000-000000000003','${project}','${employee}',current_date-14,15,'approved','${dev}');
   insert into work_timesheet(id,employee_id,project_id,period_start,period_end,total_hours,status,created_by)
   values('${sheet}','${employee}','${project}',current_date-14,current_date-14,8,'pm_approved','${dev}');
   insert into work_timesheet_line(timesheet_id,worklog_id,hours,is_billable,logged_date)
   select '${sheet}',id,hours,is_billable,logged_date from work_worklog where id='${log}';`)
 await as(owner)
 await equal(`select lock_timesheet_period('${project}',current_date-14,current_date-14)`,1,'Owner locks approved timesheet')
 await as(dev)
 await equal('select count(*)::int from admin_role_directory',1,'Role directory preserves assignment RLS')
 await equal('select count(*)::int from admin_membership_directory',1,'Membership directory preserves membership RLS')
 await equal(`select count(*)::int from work_weekly_hours where employee_id<>'${employee}'`,0,'Weekly aggregation cannot reveal other employees')
 await denied('select * from internal.adjustment_write_context','permission denied')
 const proposed=await sql(`select propose_timesheet_adjustment('${sheet}','Correct missed hour','[{"worklog_id":"${log}","hours":9}]',2) as id`)
 const adjustment=proposed[0].id;checks++
 await equal(`select status from work_timesheet_adjustment where id='${adjustment}'`,'pending','Proposal waits for independent approval')
 await db.exec('reset role')
 await equal(`select count(*)::int from core_notification where recipient_id='${owner}' and dedupe_key='ts_adjust_request_${adjustment}_${owner}'`,1,'Independent reviewer gets request notification')
 await as(dev)
 await equal(`select hours::float8 from work_worklog where id='${log}'`,8,'Proposal cannot modify approved hours')
 await denied(`select resolve_timesheet_adjustment('${adjustment}',true,'Self review',1)`,'FORBIDDEN')
 await db.exec(`reset role;insert into core_role_assignment(user_id,role) values('${dev}','company_owner')`)
 await as(dev)
 await denied(`select resolve_timesheet_adjustment('${adjustment}',true,'Owner self review',1)`,'SOD_VIOLATION')
 await db.exec(`reset role;delete from core_role_assignment where user_id='${dev}' and role='company_owner'`)
 await as(dev)
 await denied(`select propose_timesheet_adjustment('${sheet}','Duplicate','[{"worklog_id":"${log}","hours":9}]',2)`,'ADJUSTMENT_PENDING')
 await as(other)
 await denied(`select resolve_timesheet_adjustment('${adjustment}',true,'Wrong project',1)`,'FORBIDDEN')
 await denied(`select propose_timesheet_adjustment('${sheet}','Wrong employee','[{"worklog_id":"${log}","hours":9}]',2)`,'FORBIDDEN')
 await as(owner)
 await denied(`select resolve_timesheet_adjustment('${adjustment}',true,'Old version',5)`,'STALE_VERSION')
 await sql(`select resolve_timesheet_adjustment('${adjustment}',true,'Checked ticket evidence',1)`);checks++
 await equal(`select hours::float8 from work_worklog where id='${log}'`,9,'Approved correction applies to worklog')
 await equal(`select hours::float8 from work_timesheet_line where worklog_id='${log}'`,9,'Timesheet line is synchronized')
 await equal(`select total_hours::float8 from work_timesheet where id='${sheet}'`,9,'Timesheet total is synchronized')
 await equal(`select status from work_timesheet where id='${sheet}'`,'locked','Timesheet remains locked')
 await equal(`select previous_hours::float8 from work_timesheet_adjustment_line where adjustment_id='${adjustment}'`,8,'Original hours remain in immutable history')
 await equal(`select status from work_timesheet_adjustment where id='${adjustment}'`,'approved','Decision is persisted')
 await equal(`select version from work_timesheet_adjustment where id='${adjustment}'`,2,'Resolution increments version')
 await denied(`select resolve_timesheet_adjustment('${adjustment}',true,'Repeat',2)`,'INVALID_STATE')
 await db.exec('reset role')
 await equal('select count(*)::int from internal.adjustment_write_context',0,'No authorization context remains after correction')
 await denied(`update work_worklog set hours=10 where id='${log}'`,'LOCKED')
 await denied(`update work_timesheet set total_hours=10 where id='${sheet}'`,'LOCKED')
 await db.exec("set local app.allow_timesheet_adjustment='on'")
 await denied(`update work_worklog set hours=10 where id='${log}'`,'LOCKED')
 await as(dev)
 await sql(`update work_worklog set hours=12 where id='${log}'`)
 await equal(`select hours::float8 from work_worklog where id='${log}'`,9,'Direct authenticated writes stay filtered by RLS')
 await db.exec(`savepoint past_member;reset role;update project_membership set status='revoked',revoked_at=now() where user_id='${dev}' and project_id='${project}'`)
 await as(dev)
 await equal(`select sum(hours)::float8 from work_weekly_hours where logged_date=current_date-14`,24,'Own weekly totals survive revoked issue visibility')
 await db.exec('rollback to savepoint past_member;release savepoint past_member')
 await denied(`select propose_timesheet_adjustment('${sheet}','Old version','[{"worklog_id":"${log}","hours":10}]',2)`,'STALE_VERSION')
 await denied(`select propose_timesheet_adjustment('${sheet}','Invalid hours','[{"worklog_id":"${log}","hours":0}]',3)`,'INVALID_HOURS')
 await denied(`select propose_timesheet_adjustment('${sheet}','Invalid worklog','[{"worklog_id":"90500000-0000-4000-8000-000000000001","hours":1}]',3)`,'INVALID_WORKLOG')
 const rejected=(await sql(`select propose_timesheet_adjustment('${sheet}','Second proposal','[{"worklog_id":"${log}","hours":10}]',3) as id`))[0].id
 await as(owner)
 await sql(`select resolve_timesheet_adjustment('${rejected}',false,'Evidence not sufficient',1)`);checks++
 await equal(`select hours::float8 from work_worklog where id='${log}'`,9,'Rejection preserves hours')
 await equal(`select status from work_timesheet_adjustment where id='${rejected}'`,'rejected','Rejection state saved')
 await as(dev)
 const billed=(await sql(`select propose_timesheet_adjustment('${sheet}','Third proposal','[{"worklog_id":"${log}","hours":10}]',3) as id`))[0].id
 await as(owner)
 await denied(`select resolve_timesheet_adjustment('${billed}',true,'Over 24h',1)`,'DAILY_HOURS_EXCEEDED')
 await equal(`select hours::float8 from work_worklog where id='${log}'`,9,'Failed daily limit preserves all values')
 await db.exec(`savepoint stale_scenario;reset role;update work_worklog set status='approved' where id='${log}'`)
 await as(owner)
 await denied(`select resolve_timesheet_adjustment('${billed}',true,'Stale log',1)`,'STALE_VERSION')
 await db.exec('rollback to savepoint stale_scenario;release savepoint stale_scenario')
 await db.exec(`reset role;insert into finance_invoice(project_id,client_id,amount,status,source_snapshot,issued_by)
 values('${project}','90100000-0000-4000-8000-000000000001',100,'issued',jsonb_build_array(jsonb_build_object('type','worklog','period_start',current_date-14,'period_end',current_date-14)),'${owner}')`)
 await as(owner)
 await denied(`select resolve_timesheet_adjustment('${billed}',true,'Already billed',1)`,'INVOICED_WORKLOG')
 await db.exec(`reset role;delete from finance_invoice;
 insert into finance_payroll_period(month,year,status,opened_by) values(extract(month from current_date-14),extract(year from current_date-14),'locked','${owner}')`)
 await as(owner)
 await denied(`select resolve_timesheet_adjustment('${billed}',true,'Locked payroll',1)`,'PAYROLL_LOCKED')
 await sql(`select resolve_timesheet_adjustment('${billed}',false,'Requires financial review',1)`)
 await as(dev)
 const legacy=(await sql(`select request_timesheet_adjustment('${sheet}','Legacy note-only request') as id`))[0].id
 await as(owner)
 await denied(`select resolve_timesheet_adjustment('${legacy}',true,'Cannot apply note-only',1)`,'NO_CHANGES')
 await sql(`select resolve_timesheet_adjustment('${legacy}',false,'Please propose specific hours',1)`);checks++
 await equal(`select status from work_timesheet_adjustment where id='${legacy}'`,'rejected','Legacy note-only requests can be cleared')
 await db.exec('reset role;delete from finance_payroll_period;')
 await equal(`select count(*)::int from audit_log where table_name='work_timesheet_adjustment' and record_id='${adjustment}'`,2,'Request and decision both audited')
 await as(dev)
 await denied('select * from get_unsubmitted_timesheet_reminders(current_date)','permission denied')
 await as(null,'service_role')
 await equal('select count(*)::int from get_unsubmitted_timesheet_reminders(current_date)',2,'No-submission employees included for both active projects')
 await equal(`select count(*)::int from get_unsubmitted_timesheet_reminders(current_date,1,1)`,1,'Reminder pagination works')
 await equal('select extract(isodow from period_start)::int from get_unsubmitted_timesheet_reminders(current_date) limit 1',1,'Reminder starts on Monday')
 await equal('select extract(isodow from period_end)::int from get_unsubmitted_timesheet_reminders(current_date) limit 1',7,'Reminder ends on Sunday')
 await equal('select count(*)::int from get_unsubmitted_timesheet_reminders(current_date) where period_end>=current_date',0,'Current week never reminded early')
 await equal(`select draft_hours::float8 from get_unsubmitted_timesheet_reminders(current_date) where employee_id='90300000-0000-4000-8000-000000000003'`,0,'Employees without worklogs are included')
 await denied('select * from get_unsubmitted_timesheet_reminders(current_date,-1,500)','INVALID_PERIOD')
 await db.exec(`savepoint coverage;reset role;
   insert into work_timesheet(employee_id,project_id,period_start,period_end,status,created_by)
   select '${employee}','${project}',current_date-extract(isodow from current_date)::int-6,current_date-extract(isodow from current_date)::int,'submitted','${dev}';
   update work_worklog set status='submitted' where employee_id='${employee}' and logged_date>=current_date-extract(isodow from current_date)::int-6;`)
 await as(null,'service_role')
 await equal('select count(*)::int from get_unsubmitted_timesheet_reminders(current_date)',1,'Submitted coverage suppresses reminder')
 await db.exec('rollback to savepoint coverage;release savepoint coverage')
 await db.exec(`savepoint leave;reset role;
   insert into hr_leave_request(employee_id,leave_type_id,start_date,end_date,days_requested,status,created_by)
   select '${employee}',id,current_date-extract(isodow from current_date)::int-6,current_date-extract(isodow from current_date)::int,5,'approved','${dev}'
   from hr_leave_type where code='annual';`)
 await as(null,'service_role')
 await equal('select count(*)::int from get_unsubmitted_timesheet_reminders(current_date)',1,'Approved full-week leave suppresses reminder')
 await db.exec('rollback to savepoint leave;release savepoint leave')
 await db.exec(`savepoint inactive;reset role;update core_user_profile set is_active=false where id='${dev}'`)
 await as(null,'service_role')
 await equal('select count(*)::int from get_unsubmitted_timesheet_reminders(current_date)',1,'Inactive profile never receives reminder')
 await db.exec('rollback to savepoint inactive;release savepoint inactive')
 await as(null,'service_role')
 const claim=(await sql(`select claim_email_reminder('timesheet_unsubmitted','${employee}','${dev}',current_date) as id`))[0].id
 assert(claim);checks++
 await equal(`select claim_email_reminder('timesheet_unsubmitted','${employee}','${dev}',current_date)`,null,'In-flight daily claim prevents duplicate send')
 await db.exec(`reset role;update core_email_reminder_log set status='failed' where id='${claim}'`)
 await as(null,'service_role')
 await equal(`select claim_email_reminder('timesheet_unsubmitted','${employee}','${dev}',current_date)::text`,claim,'Failed delivery can be retried')
 await equal(`select attempt_count from core_email_reminder_log where id='${claim}'`,2,'Retry count is recorded')
 await db.exec('reset role;rollback')
 console.log(`PASS ${checks} PostgreSQL business/security assertions (isolated Auth/Storage shims)`)
} catch(error) {
 console.error(error.message);process.exitCode=1
} finally {await db.close()}
