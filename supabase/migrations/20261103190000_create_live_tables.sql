-- Marginalia Live: the topics readers follow, Wikipedia edits to pages in those topics, and a
-- record of every worker run. In the same project as Marginalia (Assignment 4). RLS on every table.
--
-- user_id is the Clerk user id (the `sub` claim of the Clerk session token, via third-party
-- auth). The database fills it in; the app never sends it.

-- ---------- Tables ----------

-- A topic is a hub article and every article it links to (Wikipedia's "Related changes").
create table public.topics (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  hub_title text not null unique,
  label text not null,
  blurb text not null,
  sort smallint not null,
  page_count integer not null default 0,
  pages_refreshed_at timestamptz
);

-- Filled in by the worker from each hub's links, refreshed every 6 hours.
create table public.topic_pages (
  topic_id text not null references public.topics (id) on delete cascade,
  title text not null,
  primary key (topic_id, title)
);
create index topic_pages_title_idx on public.topic_pages (title);

-- What each reader follows.
create table public.follows (
  user_id text not null default (auth.jwt() ->> 'sub'),
  topic_id text not null references public.topics (id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- One row per Wikipedia edit to a page in a topic. rev_id is unique across Wikipedia, so the
-- worker inserts with `on conflict (rev_id) do nothing` and never rewrites a row.
create table public.edits (
  rev_id bigint primary key,
  rc_id bigint not null,
  title text not null,
  topic_ids text[] not null check (cardinality(topic_ids) > 0),
  editor text not null,
  is_bot boolean not null default false,
  is_new boolean not null default false,
  size_delta integer not null,
  comment text not null default '' check (char_length(comment) <= 500),
  edited_at timestamptz not null,
  saved_at timestamptz not null default now()
);
create index edits_edited_at_idx on public.edits (edited_at desc);
create index edits_topic_ids_idx on public.edits using gin (topic_ids);

-- One row per run, also when it fails. The page reads the newest for freshness; the next run
-- reads the newest cursor to know where to start.
create table public.worker_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  error text check (char_length(error) <= 500),
  scanned integer not null default 0,
  saved integer not null default 0,
  pages_changed integer not null default 0,
  cursor_at timestamptz,
  cursor_rc_id bigint,
  ms integer
);
create index worker_runs_started_at_idx on public.worker_runs (started_at desc);

-- ---------- Row-level security ----------

alter table public.topics enable row level security;
alter table public.topic_pages enable row level security;
alter table public.follows enable row level security;
alter table public.edits enable row level security;
alter table public.worker_runs enable row level security;

create policy "Signed-in readers see the topics" on public.topics
  for select to authenticated using (true);

-- topic_pages has no policies: only the worker (secret key) uses it.

create policy "Readers see what they follow" on public.follows
  for select to authenticated using ((select auth.jwt() ->> 'sub') = user_id);
create policy "Readers follow as themselves" on public.follows
  for insert to authenticated with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "Readers unfollow their own" on public.follows
  for delete to authenticated using ((select auth.jwt() ->> 'sub') = user_id);

-- The page asks for edits without filtering: this policy alone decides, for the first load and
-- for every Realtime push.
create policy "Readers see edits in topics they follow" on public.edits
  for select to authenticated using (
    topic_ids && array(select f.topic_id from public.follows f where f.user_id = (select auth.jwt() ->> 'sub'))
  );

create policy "Signed-in readers see the worker's runs" on public.worker_runs
  for select to authenticated using (true);

-- Supabase's defaults grant every privilege (truncate skips RLS). Give back only what's needed.
revoke all on public.topics, public.topic_pages, public.follows, public.edits, public.worker_runs from anon, authenticated;
grant select on public.topics, public.edits, public.worker_runs to authenticated;
grant select, insert, delete on public.follows to authenticated;

-- ---------- Realtime ----------

-- Pushes new edits and new runs to open pages. Each push is checked against the reader's RLS.
alter publication supabase_realtime add table public.edits, public.worker_runs;

-- ---------- Functions the worker calls (service_role only) ----------

-- Which topics each title belongs to. An RPC so hundreds of titles fit in the request body.
create function public.topics_for(p_titles text[])
returns table (title text, topic_ids text[])
language sql stable security invoker set search_path = ''
as $$
  select tp.title, array_agg(tp.topic_id order by tp.topic_id)
  from public.topic_pages tp
  where tp.title = any (p_titles)
  group by tp.title;
$$;

-- Makes a topic's pages exactly p_titles. Returns how many rows were added or removed.
create function public.replace_topic_pages(p_topic_id text, p_titles text[])
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  removed integer;
  added integer;
begin
  delete from public.topic_pages where topic_id = p_topic_id and title <> all (p_titles);
  get diagnostics removed = row_count;
  insert into public.topic_pages (topic_id, title)
    select p_topic_id, t from unnest(p_titles) as t
    on conflict do nothing;
  get diagnostics added = row_count;
  update public.topics
    set page_count = (select count(*) from public.topic_pages where topic_id = p_topic_id),
        pages_refreshed_at = now()
    where id = p_topic_id;
  return removed + added;
end;
$$;

-- The cron job sends a secret generated in Vault; the worker asks the database if it matches.
create function public.check_worker_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'wiki_worker_secret' and decrypted_secret = p_secret
  );
$$;

revoke execute on function public.topics_for(text[]) from public, anon, authenticated;
revoke execute on function public.replace_topic_pages(text, text[]) from public, anon, authenticated;
revoke execute on function public.check_worker_secret(text) from public, anon, authenticated;
grant execute on function public.topics_for(text[]) to service_role;
grant execute on function public.replace_topic_pages(text, text[]) to service_role;
grant execute on function public.check_worker_secret(text) to service_role;

-- ---------- The topics ----------

insert into public.topics (id, hub_title, label, blurb, sort) values
  ('pride-and-prejudice', 'Pride and Prejudice', 'The novel', 'The book, its characters, its adaptations and the people who made them.', 1),
  ('jane-austen', 'Jane Austen', 'Jane Austen', 'Her life, her family, her other novels and the places she lived.', 2),
  ('regency-era', 'Regency era', 'The Regency', 'Fashion, manners, politics and society in the years the novel came out.', 3),
  ('georgian-era', 'Georgian era', 'Georgian Britain', 'The longer century around the novel: kings, empire and industry.', 4),
  ('napoleonic-wars', 'Napoleonic Wars', 'The war', 'Why there''s a militia in Meryton: the war going on just off the page.', 5),
  ('hertfordshire', 'Hertfordshire', 'Hertfordshire', 'The Bennets'' county, where Longbourn, Meryton and Netherfield would be.', 6),
  ('derbyshire', 'Derbyshire', 'Derbyshire', 'Mr. Darcy''s county: Pemberley, the Peak and Elizabeth''s tour.', 7),
  ('london', 'London', 'London', 'Where the Gardiners live, and where Wickham and Lydia hide.', 8),
  ('brighton', 'Brighton', 'Brighton', 'Where the militia camps for the summer and Lydia longs to go.', 9),
  ('bath', 'Bath, Somerset', 'Bath', 'The spa town where Austen lived and society went to be seen.', 10);
