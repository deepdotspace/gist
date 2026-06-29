/**
 * Worker-side pipeline: turns a YouTube video id into the full set of record
 * fields. Runs inside a durable job (user-triggered) or the auto-gist cron,
 * using an injected `call` (e.g. `ctx.integrations.call`, billed to the owner).
 *
 * Worker-safe: imports only the runtime-agnostic ./gist-core and pure ./youtube.
 */

import {
  fetchMetadataCore,
  fetchTranscriptCore,
  summarizeCore,
  type CallFn,
  type VideoMeta,
  type GistContent,
} from './gist-core'

export interface GistRecordData extends VideoMeta, GistContent {
  videoId: string
  transcriptText: string
  /** 'manual' | 'auto' — how the gist was created. */
  source?: string
  /** Channel that produced it (set for auto-gisted videos). */
  channelId?: string
}

/** Server-side oEmbed fetch — no CORS in the worker, so hit YouTube directly. */
async function workerOembed(videoId: string): Promise<Record<string, unknown> | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Gist/1.0 (+https://gist.app.space)' } })
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function buildGist(
  call: CallFn,
  videoId: string,
  opts: {
    signal?: AbortSignal
    onProgress?: (p: number, msg: string) => void
    source?: string
    channelId?: string
  } = {},
): Promise<GistRecordData> {
  const p = opts.onProgress ?? (() => {})

  p(0.1, 'Looking up the video…')
  const meta = await fetchMetadataCore(call, workerOembed, videoId)

  p(0.3, 'Pulling the transcript…')
  const transcript = await fetchTranscriptCore(call, meta.url, { signal: opts.signal })

  p(0.75, 'Reading it so you don’t have to…')
  const gist = await summarizeCore(call, meta, transcript.text)

  p(0.95, 'Saving your notes…')
  return {
    ...meta,
    ...gist,
    videoId,
    transcriptText: transcript.text,
    source: opts.source ?? 'manual',
    ...(opts.channelId ? { channelId: opts.channelId } : {}),
  }
}
