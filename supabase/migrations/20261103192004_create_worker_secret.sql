-- The secret the cron job sends to the wiki-worker Edge Function. Generated here, inside Vault,
-- and never written down anywhere else: the cron job reads it from Vault, and
-- check_worker_secret() compares it there. pg_net lets the database call the function.

create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'wiki_worker_secret',
  'Sent by the wiki-worker cron job; checked by public.check_worker_secret()'
);
