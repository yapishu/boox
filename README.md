# %boox


## `|install ~matwet %boox` 

An ebook reader and library manager for Urbit. Upload books to S3, read them in-browser, track your progress, and share collections with other ships.

<img width="1028" height="932" alt="image" src="https://github.com/user-attachments/assets/7d5f2206-f5da-4aae-9eec-81602a058676" />

## Features

- **Read in browser** — PDF (pdf.js), EPUB (epub.js), MOBI, TXT, Markdown, HTML
- **S3 storage** — books stored on S3 via Landscape's `%storage` agent
- **Reading positions** — synced progress across devices
- **Collections** — organize books, share with other ships or publish publicly
- **Annotations** — highlight text and add notes in both EPUB and PDF
  - EPUB: CFI-based text anchoring via epub.js
  - PDF: text layer overlay for selection and persistent highlights
  - Notations visible on public collection pages
- **Social** — browse friends' shared collections, send books to pals, view friend notations on books you both own (matched by title+author)
- **Public pages** — unauthenticated collection pages with inline reader, swipe navigation, font/zoom controls, and deep linking
- **Readable toggle** — control whether public collections allow reading or are showcase-only
- **OPDS catalog** — expose your library to any OPDS-compatible reader (with Basic Auth)
- **PDF zoom** — scale in/out with localStorage persistence
- **EPUB typography** — adjustable font size, font family, and line height
- **Mobile responsive** — touch swipe navigation, compact layouts, icon-only nav on narrow screens
- **URL deep linking** — hash-based position preservation for private and public readers
- **Library pagination** — configurable 10/20/50 per page
- **Bulk upload** — add multiple books at once
- **PWA** — installable as a standalone app on mobile/desktop

<img width="816" height="537" alt="image" src="https://github.com/user-attachments/assets/955311cf-ee9c-47d1-b832-3cf7a6474558" />

## Structure

```
desk/                   Urbit desk (deployed to ship)
  app/boox.hoon           Main agent — API, state, OPDS, inline public page HTML
  sur/boox.hoon           Types: book, position, collection, notation, state-0..6
  mar/boox-action.hoon    JSON<->noun action mark
  mar/boox-update.hoon    Update mark
  lib/                    Standard libraries (server, dbug, etc.)

ui/                     Frontend source (Vite)
  index.html              SPA entry point
  js/api.js               API client (BooxAPI)
  js/app.js               UI rendering, state, collections, social
  js/reader.js            Multi-format reader with annotations and zoom
  js/s3.js                S3 upload/signing (requires HTTPS — Web Crypto API)
  css/app.css             Styles
  vite.config.js          Vite config — uses vite-plugin-singlefile
```

Agent state is at `state-6`: books, positions, book-order, collections, pending, opds-enabled, opds-password, readable-colls, notations.

## Development

### Frontend

```sh
cd ui
npm install
npm run dev
```

Vite proxies `/apps/boox/api` to `localhost:8080` during dev. Edit files in `ui/`, not `desk/www/`.

The build uses `vite-plugin-singlefile` to inline all JS and CSS into a single `index.html`, avoiding MIME type issues with docket's glob serving.

```sh
npm run build    # outputs to ui/dist/
```

## API

All endpoints under `/apps/boox/api`. Authenticated endpoints require an Eyre session cookie.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/books` | Eyre | List all books with notation counts |
| GET | `/book/<id>` | Eyre | Single book with full notations |
| GET | `/s3-config` | Eyre | S3 config from system `%storage` |
| GET | `/collections` | Eyre | List collections |
| GET | `/settings` | Eyre | OPDS settings |
| GET | `/pals` | Eyre | Combined pals mutuals + contacts |
| GET | `/pending` | Eyre | Pending book imports |
| GET | `/opds` | Basic | OPDS catalog feed |
| GET | `/public/collections` | None | Public collection list |
| GET | `/public/<token>` | None | Public collection JSON with notations |
| GET | `/public/<token>/page` | None | Public collection HTML page with inline reader |
| POST | `/` | Eyre | Poke with action JSON |

### Actions (POST)

```json
{"action": "add-book", "book-id": "0v...", "title": "...", ...}
{"action": "remove-book", "book-id": "0v..."}
{"action": "set-position", "book-id": "0v...", "value": "...", "progress": 42}
{"action": "add-notation", "book-id": "0v...", "nid": "0v...", "anchor": "...", "selected": "...", "note": "..."}
{"action": "remove-notation", "book-id": "0v...", "nid": "0v..."}
{"action": "create-collection", "name": "...", "description": "..."}
{"action": "share-collection", "name": "..."}
{"action": "publish-collection", "name": "..."}
{"action": "toggle-readable", "name": "..."}
{"action": "toggle-opds"}
{"action": "send-book", "book-id": "0v...", "to": "~ship"}
```

### OPDS

When enabled, an OPDS catalog is served at `/apps/boox/api/opds` with Basic Auth (username: ship name, password: configurable or `+code`).

## Notes

- S3 upload requires HTTPS or localhost — the Web Crypto API (`crypto.subtle`) is only available in secure contexts.
- State upgrades (new `state-N`) require a nuke+revive cycle on the agent.
- Frontend is distributed as a glob via docket (`glob-http`), not from Clay.
