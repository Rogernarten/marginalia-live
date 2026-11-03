-- Runs the wiki-worker Edge Function every 10 seconds, and trims old rows every hour.
-- Apply once the function is deployed (verify_jwt off: cron has no user token) and a call by
-- hand has worked.

create extension if not exists pg_cron with schema pg_catalog;

-- About 260,000 calls a month; the free plan includes 500,000.
select cron.schedule(
  'wiki-worker',
  '10 seconds',
  $$
  select net.http_post(
    url := 'https://ubekbovayxutwuxkzvhq.supabase.co/functions/v1/wiki-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wiki_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 9000
  );
  $$
);

-- Keep the tables small: a day of runs, a week of edits.
select cron.schedule(
  'wiki-worker-cleanup',
  '17 * * * *',
  $$
  delete from public.worker_runs where started_at < now() - interval '1 day';
  delete from public.edits where edited_at < now() - interval '7 days';
  delete from cron.job_run_details where end_time < now() - interval '1 day';
  $$
);
