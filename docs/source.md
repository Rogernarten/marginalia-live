# The live source: Wikipedia recent changes

Called twice on 3 November 2026, 15 minutes apart, before anything was built.

## One change in the response

```json
{
  "type": "edit", "ns": 0, "title": "WorldCell", "pageid": 26436813,
  "revid": 1383617062, "old_revid": 1368805094, "rcid": 2086393097,
  "user": "GreenC bot", "bot": true, "new": false, "minor": false,
  "oldlen": 6385, "newlen": 6421, "timestamp": "2026-11-03T18:40:40Z",
  "comment": "Reformat 1 archive link; Move 1 url. …"
}
```

| field | means | changes | we need it |
|---|---|---|---|
| `rcid` | position in the recent-changes log, always increasing | every change | yes: the cursor, so the next run starts where this one stopped |
| `revid` | the new revision's id, unique across Wikipedia | every change | yes: primary key, so the same edit is never saved twice |
| `old_revid` | the revision before it (0 for a new page) | | no (the diff link only needs `revid`) |
| `title`, `pageid` | the article | | `title`: to match against topics and to link |
| `type`, `new` | `edit`, or `new` for a page just created | | `new`: shown as "new page" |
| `user` | who edited (an IP or temporary account if logged out) | | yes |
| `bot` | flagged bot account | | yes: shown, so readers can tell people from bots |
| `minor` | marked as a minor edit by the editor | | no |
| `oldlen`, `newlen` | page size in bytes before and after | | yes: `newlen - oldlen` is the "+120 bytes" |
| `timestamp` | when it was saved, UTC | | yes |
| `comment` | the edit summary, wikitext, can be empty | | yes, as plain text, cut to 500 characters |
| `continue.rccontinue` | `"20261103184655\|2086394497"`: there are more results | when over `rclimit` | yes: follow it, up to 3 requests a run |

## What changed between the two calls

| | first call, 12:40 CST | second call, 12:55 CST |
|---|---|---|
| newest `rcid` | 2086393097 | 2086396377 |
| newest `timestamp` | 18:40:40Z | 18:55:27Z |

In those 15 minutes, English Wikipedia had **1,187 article edits** (137 by bots): about 80 a
minute, or 13 every 10 seconds, which one request of 500 covers many times over. The deployed
worker saw the same rate: its first run, covering a minute, scanned 96.

Of those, **4 were to pages in the 10 topics** (7,316 pages in all):

| time (UTC) | page | size | topic |
|---|---|---|---|
| 18:42:53 | David Walliams | −130 | Brighton |
| 18:43:09 | Constitution of the United Kingdom | +11 | Georgian era |
| 18:47:35 | Energy in the United Kingdom | −5 | Georgian era |
| 18:53:13 | Battle of Berezina | 0 | Napoleonic Wars |

## Why topics, not single articles

Single articles from the novel change too rarely to watch: at 12:45 CST, *Pride and Prejudice*
had last been edited 7 days before, *Curricle* 44 days, *Elizabeth Bennet* 86 days. A topic (a hub
and every article it links to) changes often enough.

| hub | linked pages | edited in the last hour | in the last 24 h |
|---|---|---|---|
| Pride and Prejudice | 306 | 2 | 14 |
| Jane Austen | 427 | 3 | 17 |
| Regency era | 518 | 2 | 10 |
| Georgian era | 530 | 4 | 25 |
| Napoleonic Wars | 1,240 | 5 | 52 |
| Bath, Somerset | 856 | 1 | 20 |
| Derbyshire | 587 | 2 | 19 |
| Hertfordshire | 1,060 | 1 | 23 |
| Brighton | 774 | 5 | 30 |
| London | 1,984 | 5 | 81 |

These count pages, not edits: a page edited three times in the hour counts once.
