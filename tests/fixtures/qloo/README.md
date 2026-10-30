# Synthetic Qloo fixtures

Used by `lib/qloo/mock.ts` when `QLOO_MODE=mock` (the default without a key) and by unit tests.

Everything here is **invented**: venue, artist, film and show names are fictional and every ID starts with `FIX-`. Never paste real Qloo responses into this folder; live responses are cached only in the database.

- `places.json`: venues placed by offset in metres (`dx` east, `dy` north) from whatever point is queried, so mock guides work for any property. `tags` are real Qloo tag URNs from `lib/qloo/tags.ts` (taxonomy, not response data).
- `artists.json`, `movies.json`, `tv_shows.json`: media entities for the playlist and film shelf.
