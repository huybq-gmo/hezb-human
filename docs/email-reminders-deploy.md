# Deploy email reminders

The `email-reminders` Edge Function sends a daily reminder for overdue, open issues and timesheets waiting at the current approval step. A dry run reports counts only. Each entity/recipient pair is claimed once per Vietnam calendar day; failed sends can retry, while a stale in-flight claim can be reclaimed after ten minutes.

After migration **017**, it also reminds employees who have not fully submitted the last completed Monday–Sunday week. Candidates include active employees with effective project membership on weekdays, excluding approved leave, locked periods and submitted coverage. Employees with no worklogs are included. Missing projects are grouped into one email per employee/day; dry-run adds `totals.unsubmitted`. Candidate lookup is a service-role-only RPC, paginated in batches of 500. The weekly submission policy is documented in [timesheet follow-up](timesheet-followup-2026-10-06.md); different period/holiday policies require configuration work.

Deploy the function after applying migrations:

```sh
pnpm dlx supabase@2.119.0 functions deploy email-reminders --project-ref YOUR_PROJECT_REF
```

Set Edge Function secrets in the Supabase Dashboard or CLI. Use a long random value for the shared cron secret, then store the same value in Vault in the SQL below. Never commit the local `supabase/functions/.env` file.

```sh
pnpm dlx supabase@2.119.0 secrets set \
  REMINDER_CRON_SECRET='YOUR_LONG_RANDOM_SECRET' \
  RESEND_API_KEY='YOUR_RESEND_API_KEY' \
  EMAIL_REMINDER_FROM='Hezb ERP <reminders@example.com>' \
  ERP_BASE_URL='https://erp.example.com' \
  --project-ref YOUR_PROJECT_REF
```

Test in dry-run mode before scheduling. It returns aggregate candidate counts and does not call the email provider or write delivery records:

```sh
curl --fail-with-body 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-reminders' \
  -H 'content-type: application/json' \
  -H 'apikey: YOUR_PUBLISHABLE_KEY' \
  -H 'x-cron-secret: YOUR_LONG_RANDOM_SECRET' \
  --data '{"dry_run":true}'
```

After reviewing the counts, install a daily 08:00 Vietnam-time schedule (01:00 UTC). Run this once in the target project's SQL Editor. Replace every placeholder; keep the cron secret identical to `REMINDER_CRON_SECRET` above. Supabase Cron invokes the Edge Function using `pg_cron`, `pg_net` and Vault-held credentials.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'hezb_reminder_project_url');
select vault.create_secret('YOUR_PUBLISHABLE_KEY', 'hezb_reminder_publishable_key');
select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'hezb_reminder_cron_secret');

select cron.schedule(
  'hezb-daily-email-reminders',
  '0 1 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'hezb_reminder_project_url') || '/functions/v1/email-reminders',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'hezb_reminder_publishable_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hezb_reminder_cron_secret')
      ),
      body := '{"dry_run":false}'::jsonb
    );
  $$
);
```

The schedule and secrets are project-specific and are not installed by migrations. Inspect Cron run history and Edge Function logs after the first scheduled run. Delivery logs intentionally retain only reminder type, internal entity/recipient IDs, date, provider message ID, attempt count and a sanitized error code.
