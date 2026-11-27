# aniyashi — Omega Infinity V5

An anime discovery and streaming web app. The catalog is live (never a seeded local list),
and playback only ever comes from uploads published by rights holders on their own official
channels. Episodes without an authorized upload are labelled unavailable instead of faked.

## Run it

```bash
npm install
npm run dev      # Vite dev server + API on one port
```

Production:

```bash
npm run build    # builds client into dist/
npm start        # Express serves dist/ + the API on 0.0.0.0:$PORT (default 3000)
```

No credentials, API keys, paid services or database add-ons are required.

## What is real

| Area | Implementation |
| --- | --- |
| Metadata + search | Live AniList GraphQL (`https://graphql.anilist.co`). Search returns the provider's full result count (e.g. `naruto` → 5000 records, 416 pages) with pagination, filters and sorting applied server-side. |
| Artwork | AniList cover/banner URLs with a layered fallback (large → medium → branded placeholder). No YouTube thumbnails are used as posters. |
| Episode lists | Real episode counts from metadata (Naruto 220, Shippuden 500, Sonic X 78). Episode titles come from Jikan when that API is reachable; otherwise the numbered index is shown and labelled as such. |
| Playback sources | `data/official-sources.json` — an allowlist of full episodes uploaded by official publishers. Every entry is verified through YouTube's oEmbed endpoint before it is served; a source that fails verification is reported unavailable, never marked playable. |
| Availability | Each episode carries a state: `verified-playable`, `provider-available`, `unverified`, `regional-restriction`, `embedding-prohibited`, `temporarily-unavailable`, `no-authorized-source`. Series totals and available/verified counts are shown separately. |
| Player | Official YouTube IFrame API for embedded episodes; native HTML5 + HLS.js (lazy-loaded) and DASH-capable handling for direct MP4/HLS manifests. Explicit state machine — no infinite spinner. Documented player errors (2/5/100/101/150/153) map to readable messages. |
| Progress | Real player time updates saved per user (JSON store) or to localStorage for guests; Continue Watching, history, resume and "remove" all work off that data. |
| Accounts | scrypt password hashing, opaque 30-day session cookies, server-side authorization. |

## Administrator access

The **first account registered becomes the administrator** (role `admin`); every later
registration is a `member`. There are no default credentials. Register your own account
immediately after the first start, then open `/admin`.

`/admin` returns 401 when signed out and 403 for a member — verified.

## Honest limitations

- **Most anime have no authorized playback source.** AniList/Jikan supply metadata, not
  video. Only episodes present in `data/official-sources.json` can play. Naruto, for
  example, is fully searchable and its 220 episodes are listed, but none are playable
  because no rights holder publishes it for embedding.
- **Verified playable example:** Sonic X episode 1 (official TMS upload) and the Gundam
  SEED Destiny episodes registered in the source file. Availability is re-checked and can
  change when a publisher removes a video.
- **Region restrictions are not bypassed.** A video can be embeddable yet blocked in your
  country; the player then shows the provider's own message.
- **Storage is a single JSON document** (`data/app-state.json`), chosen because the Free
  hosting plan includes no managed database. It is durable for normal single-instance use
  but is not a substitute for PostgreSQL at scale. `DATA_DIR` relocates it.
- **Jikan may be unreachable** from some networks; episode *titles* then fall back to a
  numbered index (clearly labelled), while counts, search and artwork keep working.
- **No community, watch-party or AI assistant features** are implemented — they were
  listed as optional after core playback, and building them on top of missing authorized
  sources would have added surface area without adding playable content.

## Adding authorized sources

Edit `data/official-sources.json` (or use `/admin` → providers → test). Each episode needs
the official publisher, channel name, video id and a rights note. `npm run discover` checks
a configured list of official publisher channels for new candidate uploads and records
them in `data/discovered-candidates.json` for review; nothing is published automatically
unless the uploader is on the allowlist.

## Project layout

```
server/            Express API (ESM)
  lib/             anilist client, normalization, cache, store, auth, rate limiting
  streaming/       ANIYASHI STREAMING CORE: providers, resolver, verification
  routes/          catalog, account, admin
client/src/        React 19 + TypeScript + Vite
  components/      navbar, cards, hero, player, episode rail, primitives
  pages/           home, browse, detail, watch, lists, library, profile, admin, auth
data/              official source allowlist (+ runtime state, git-ignored)
```

## Checks

```bash
npm run build    # client type-check + production bundle
npm test         # API smoke checks against a local server
```
