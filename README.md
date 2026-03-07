# %boox

<img width="946" height="599" alt="image" src="https://github.com/user-attachments/assets/26be4077-fbdc-45d1-85ed-b7cb5fd231e4" />

An ebook reader and library manager for Urbit. Upload books to S3, read them in-browser, track your progress, and share collections with other ships.

## Features

- **Read in browser** — PDF (pdf.js), EPUB (epub.js), MOBI, TXT, Markdown, HTML
- **S3 storage** — books stored on S3 via Landscape's `%storage` agent
- **Reading positions** — synced progress across devices
- **Collections** — organize books, share with other ships or publish publicly
- **OPDS catalog** — expose your library to any OPDS-compatible reader (with Basic Auth)
- **Bulk upload** — add multiple books at once
- **PWA** — installable as a standalone app on mobile/desktop

<img width="816" height="537" alt="image" src="https://github.com/user-attachments/assets/955311cf-ee9c-47d1-b832-3cf7a6474558" />

## Structure

```
desk/                   Urbit desk (deployed to ship)
  app/boox.hoon           Main agent — API, OPDS, PWA assets
  sur/boox.hoon           Types: book, position, collection, action, update
  mar/boox-action.hoon    JSON<->noun action mark
  mar/boox-update.hoon    Update mark
  lib/                    Standard libraries (server, dbug, etc.)

ui/                     Frontend source (Vite)
  index.html              SPA entry point
  main.js                 Entry — imports modules, registers service worker
  js/api.js               API client (BooxAPI)
  js/app.js               UI rendering and state (App)
  js/reader.js            Book reader (Reader)
  js/s3.js                S3 upload (S3Upload)
  css/app.css             Styles
  vite.config.js          Vite config — uses vite-plugin-singlefile
```

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

All endpoints are under `/apps/boox/api` and require Eyre authentication (cookie).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books` | List all books |
| GET | `/api/book/<id>` | Get a single book |
| GET | `/api/s3-config` | S3 configuration (from system `%storage`) |
| GET | `/api/collections` | List collections |
| GET | `/api/settings` | OPDS settings |
| POST | `/api` | Poke with action JSON |

### Actions (POST /api)

```json
{"add-book": {"book-id": "0v...", "book": {...}}}
{"remove-book": {"book-id": "0v..."}}
{"update-metadata": {"book-id": "0v...", "title": "...", ...}}
{"set-position": {"book-id": "0v...", "position": {...}}}
{"reorder-books": {"order": ["0v...", ...]}}
{"create-collection": {"name": "...", "description": "..."}}
{"toggle-opds": null}
{"send-book": {"book-id": "0v...", "to": "~ship"}}
```

### OPDS

When enabled, an OPDS catalog is served at `/apps/boox/api/opds` with Basic Auth (username: ship name, password: configurable or `+code`).
