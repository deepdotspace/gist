# Gist

**Read the gist of any YouTube video.** Paste a link and Gist gives you back the
readable version — a TL;DR, a chapter breakdown with clickable timestamps, key
quotes, and a "just the steps / recipe" extract for how-to videos. It's the thing
you'd rather read than watch. Export the notes as a polished PDF, or test yourself
with an auto-generated quiz.

Live: **https://gist.app.space**

Built on the [DeepSpace SDK](https://docs.deep.space) (Cloudflare Workers).

## How it works

Paste a YouTube URL → Gist runs a three-step pipeline, all billed to the app owner
through the DeepSpace integration proxy:

1. **Metadata** — `youtube/get-video-details`, with a keyless YouTube oEmbed
   fallback (`/api/yt-oembed`) when that endpoint is unavailable.
2. **Transcript** — starts a YouTube-transcript actor on Apify
   (`apify/run-actor`) and polls `apify/get-run` until the run is terminal.
3. **Structured notes** — `anthropic/chat-completion` (Claude) turns the
   timestamped transcript into JSON: `{ tldr, chapters, keyQuotes, steps }`.

The finished gist is stored as a `videos` record so it shows up in your history
and at a shareable `/v/:id` results page.

### Features

- **Single input box** → clean results page with the video embedded and
  click-to-seek timestamps.
- **Copy notes** as Markdown, **Download PDF** typeset via the `latex-compiler`
  integration (falls back to the browser print dialog).
- **History** of everything you've processed.
- **Test yourself** — a secondary tab that generates a 5-question quiz from the
  same transcript (reused from memory, so it's cheap) and scores you.

## Project layout

| Path | What's there |
|---|---|
| `src/pages/home.tsx` | Input box + history |
| `src/pages/v/[id].tsx` | Results page (notes / quiz tabs) |
| `src/lib/gist-pipeline.ts` | Metadata → transcript → summary orchestration |
| `src/lib/latex.ts` / `src/lib/export.ts` | PDF + copy-notes export |
| `src/hooks/useGist.ts` | Pipeline state machine |
| `src/schemas/videos-schema.ts` | The `videos` collection |
| `worker.ts` | Hono worker (adds the `/api/yt-oembed` proxy) |

## Develop

```sh
npx deepspace login   # one-time
npx deepspace dev      # http://localhost:5173
npx deepspace deploy   # → gist.app.space
```
