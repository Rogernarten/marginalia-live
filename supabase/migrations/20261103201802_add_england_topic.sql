-- An 11th topic: England, where the whole novel happens. Its pages are edited about as often as
-- London's (17 edits in the hour measured at 2 PM CST on 3 Nov), so a reader who follows it sees
-- edits arrive within minutes. The worker fills in its pages on its next run, since
-- pages_refreshed_at starts empty.

update public.topics set sort = sort + 1 where sort >= 6;

insert into public.topics (id, hub_title, label, blurb, sort) values
  ('england', 'England', 'England', 'The country the whole novel happens in: its counties, towns, law and church.', 6);
