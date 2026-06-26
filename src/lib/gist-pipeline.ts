/**
 * Client-side orchestration for turning a YouTube URL into a structured gist.
 *
 * Steps (each a paid integration call, billed to the app owner):
 *   1. metadata  — youtube/get-video-details, oEmbed proxy fallback
 *   2. transcript — apify/run-actor → poll apify/get-run until terminal
 *   3. summary   — anthropic/chat-completion, asked for strict JSON
 *
 * Everything runs in the browser while the user watches the progress UI, so
 * the calls live here rather than in a worker job. The finished result is
 * persisted as a `videos` record by the caller.
 */

import { integration } from 'deepspace'
import {
  TRANSCRIPT_ACTOR_ID,
  TRANSCRIPT_MAX_COST_USD,
  SUMMARY_MODEL,
} from '../constants'
import { formatTimestamp, formatDuration, thumbnailFor, watchUrl } from './youtube'

export interface VideoMeta {
  videoId: string
  url: string
  title: string
  channel: string
  thumbnail: string
  duration: string
}

export interface Chapter {
  title: string
  startTimestamp: string
  startSeconds: number
  summary: string
}

export interface GistContent {
  tldr: string
  chapters: Chapter[]
  keyQuotes: string[]
  steps: string[]
}

export interface QuizQuestion {
  question: string
  options: string[]
  answerIndex: number
  explanation?: string
}

export class PipelineError extends Error {}

// Roughly bound token cost / latency. ~48k chars ≈ 12k tokens of transcript.
const MAX_TRANSCRIPT_CHARS = 48_000

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

async function callIntegration<T = unknown>(
  endpoint: string,
  body: unknown,
): Promise<T> {
  const res = await integration.post(endpoint, body as Record<string, unknown>)
  if (!res || res.success !== true) {
    throw new PipelineError(
      (res && 'error' in res && typeof res.error === 'string' && res.error) ||
        `${endpoint} failed`,
    )
  }
  return res.data as T
}

// ---------------------------------------------------------------------------
// 1. Metadata
// ---------------------------------------------------------------------------

export async function fetchMetadata(videoId: string): Promise<VideoMeta> {
  const base: VideoMeta = {
    videoId,
    url: watchUrl(videoId),
    title: '',
    channel: '',
    thumbnail: thumbnailFor(videoId),
    duration: '',
  }

  // Primary: the first-party integration (spec'd path). The handler returns
  // `{ videos: [item] }`, where item carries the YouTube Data API shape plus
  // a `links`/`formatted` convenience layer added by the api-worker.
  try {
    const data = asRecord(await callIntegration('youtube/get-video-details', { id: videoId }))
    const videos = Array.isArray(data.videos) ? data.videos : []
    const item = asRecord(videos[0])
    const snippet = asRecord(item.snippet)
    const details = asRecord(item.contentDetails)
    const links = asRecord(item.links)
    const thumbs = asRecord(snippet.thumbnails)
    const best = asRecord(thumbs.maxres ?? thumbs.high ?? thumbs.medium ?? thumbs.default)

    const title = String(snippet.title ?? '')
    if (title) {
      return {
        ...base,
        title,
        channel: String(snippet.channelTitle ?? ''),
        thumbnail: String(best.url ?? links.thumbnail ?? base.thumbnail),
        duration: formatDuration(details.duration ?? ''),
      }
    }
  } catch {
    // fall through to oEmbed
  }

  // Fallback: oEmbed via our worker proxy (free, no key, very reliable).
  try {
    const res = await fetch(`/api/yt-oembed?id=${encodeURIComponent(videoId)}`)
    if (res.ok) {
      const data = asRecord(await res.json())
      return {
        ...base,
        title: String(data.title ?? ''),
        channel: String(data.author_name ?? ''),
        thumbnail: String(data.thumbnail_url ?? base.thumbnail),
      }
    }
  } catch {
    // ignore — we still return a usable base below
  }

  return { ...base, title: 'YouTube video' }
}

// ---------------------------------------------------------------------------
// 2. Transcript (Apify)
// ---------------------------------------------------------------------------

interface TranscriptSegment {
  start: number
  text: string
}

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'])

export interface TranscriptResult {
  segments: TranscriptSegment[]
  /** Timestamped plain text, "[m:ss] line" per segment. */
  text: string
  truncated: boolean
}

export async function fetchTranscript(
  videoUrl: string,
  opts: { signal?: AbortSignal; onTick?: (status: string) => void } = {},
): Promise<TranscriptResult> {
  const start = asRecord(
    await callIntegration('apify/run-actor', {
      actorId: TRANSCRIPT_ACTOR_ID,
      input: { videoUrl, targetLanguage: 'en' },
      maxCostUsd: TRANSCRIPT_MAX_COST_USD,
      maxTotalChargeUsd: TRANSCRIPT_MAX_COST_USD,
    }),
  )

  const runId = String(start.jobId ?? start.id ?? '')
  if (!runId) throw new PipelineError('Could not start the transcript job.')

  // Poll until terminal. Apify transcript runs usually finish in 10–60s.
  const maxPolls = 60
  let items: unknown[] = []
  for (let i = 0; i < maxPolls; i++) {
    if (opts.signal?.aborted) throw new PipelineError('Cancelled')
    await sleep(i === 0 ? 1500 : 3000, opts.signal)

    const run = asRecord(await callIntegration('apify/get-run', { runId, offset: 0 }))
    const status = String(run.status ?? '')
    opts.onTick?.(status)

    if (status === 'SUCCEEDED') {
      items = Array.isArray(run.items) ? run.items : []
      break
    }
    if (TERMINAL.has(status)) {
      throw new PipelineError(`Transcript job ${status.toLowerCase()}.`)
    }
  }

  const segments = flattenSegments(items)
  if (segments.length === 0) {
    throw new PipelineError(
      'No transcript found for this video. It may have captions disabled.',
    )
  }

  let text = ''
  let truncated = false
  for (const seg of segments) {
    const line = `[${formatTimestamp(seg.start)}] ${seg.text}\n`
    if (text.length + line.length > MAX_TRANSCRIPT_CHARS) {
      truncated = true
      break
    }
    text += line
  }

  return { segments, text: text.trimEnd(), truncated }
}

function flattenSegments(items: unknown[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  const pushSeg = (raw: unknown) => {
    const r = asRecord(raw)
    const text = String(r.text ?? r.line ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return
    const startNum =
      typeof r.start === 'number'
        ? r.start
        : typeof r.start === 'string'
          ? parseFloat(r.start)
          : typeof r.offset === 'number'
            ? r.offset / 1000
            : 0
    out.push({ start: Number.isFinite(startNum) ? startNum : 0, text })
  }

  for (const item of items) {
    const rec = asRecord(item)
    if (Array.isArray(rec.data)) rec.data.forEach(pushSeg)
    else if (Array.isArray(rec.transcript)) rec.transcript.forEach(pushSeg)
    else if (rec.text || rec.line) pushSeg(rec)
  }
  return out
}

// ---------------------------------------------------------------------------
// 3. Summary (Claude)
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM = `You are an expert note-taker. You turn a video transcript into clean, readable notes that someone would rather read than watch the video.

You will receive a transcript where each line is prefixed with its timestamp like "[m:ss] ...".

Return ONLY a JSON object (no markdown fences, no prose) with exactly this shape:
{
  "tldr": string,              // 2-4 sentence summary of the whole video
  "chapters": [                // 3-8 logical sections in order
    { "title": string, "startTimestamp": string, "summary": string }
  ],
  "keyQuotes": string[],       // 2-5 verbatim memorable lines from the transcript
  "steps": string[]            // ONLY for how-to/tutorial/recipe videos: ordered, imperative steps. Empty array otherwise.
}

Rules:
- "startTimestamp" must be copied from the transcript timestamps (format "m:ss" or "h:mm:ss") and mark where that chapter begins.
- Each chapter "summary" is 1-3 sentences capturing what's covered.
- Only populate "steps" when the video is genuinely instructional. Otherwise return [].
- Keep everything faithful to the transcript. Do not invent facts.`

export async function summarize(
  meta: VideoMeta,
  transcriptText: string,
): Promise<GistContent> {
  const userMsg = `Video title: ${meta.title || 'Unknown'}
Channel: ${meta.channel || 'Unknown'}

Transcript:
${transcriptText}`

  const data = asRecord(
    await callIntegration('anthropic/chat-completion', {
      model: SUMMARY_MODEL,
      max_tokens: 4096,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    }),
  )

  const parsed = asRecord(parseJson(extractText(data)))
  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : []

  return {
    tldr: String(parsed.tldr ?? '').trim(),
    chapters: chapters.map(normalizeChapter).filter((c) => c.title || c.summary),
    keyQuotes: toStringArray(parsed.keyQuotes),
    steps: toStringArray(parsed.steps),
  }
}

// ---------------------------------------------------------------------------
// Quiz (Claude) — reuses the stored transcript, generated on demand
// ---------------------------------------------------------------------------

const QUIZ_SYSTEM = `You write short comprehension quizzes from a video transcript.

Return ONLY a JSON object (no markdown fences) with this shape:
{
  "questions": [
    {
      "question": string,
      "options": string[],      // exactly 4 plausible options
      "answerIndex": number,    // 0-based index of the correct option
      "explanation": string     // one sentence on why it's correct
    }
  ]
}

Write exactly 5 questions that test whether someone understood the main ideas. Base every question and option strictly on the transcript. Vary the position of the correct answer.`

export async function generateQuiz(
  title: string,
  transcriptText: string,
): Promise<QuizQuestion[]> {
  const data = asRecord(
    await callIntegration('anthropic/chat-completion', {
      model: SUMMARY_MODEL,
      max_tokens: 2048,
      system: QUIZ_SYSTEM,
      messages: [
        { role: 'user', content: `Video: ${title}\n\nTranscript:\n${transcriptText}` },
      ],
    }),
  )

  const parsed = asRecord(parseJson(extractText(data)))
  const questions = Array.isArray(parsed.questions) ? parsed.questions : []
  return questions
    .map(normalizeQuestion)
    .filter((q): q is QuizQuestion => q !== null)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizeChapter(raw: unknown): Chapter {
  const r = asRecord(raw)
  const ts = String(r.startTimestamp ?? r.timestamp ?? '0:00').trim()
  const startSeconds = parseTs(ts)
  return {
    title: String(r.title ?? '').trim(),
    startTimestamp: ts,
    startSeconds,
    summary: String(r.summary ?? '').trim(),
  }
}

function parseTs(ts: string): number {
  const parts = ts.split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return 0
  let s = 0
  for (const n of parts) s = s * 60 + n
  return s
}

function normalizeQuestion(raw: unknown): QuizQuestion | null {
  const r = asRecord(raw)
  const question = String(r.question ?? '').trim()
  const options = toStringArray(r.options)
  let answerIndex = Number(r.answerIndex)
  if (!question || options.length < 2) return null
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    answerIndex = 0
  }
  return {
    question,
    options,
    answerIndex,
    explanation: r.explanation ? String(r.explanation).trim() : undefined,
  }
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x ?? '').trim()).filter(Boolean)
}

function extractText(data: Record<string, unknown>): string {
  const content = data.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const r = asRecord(b)
        return r.type === 'text' || r.text ? String(r.text ?? '') : ''
      })
      .join('')
  }
  // OpenAI-style fallback
  const choices = data.choices
  if (Array.isArray(choices)) {
    return String(asRecord(asRecord(choices[0]).message).content ?? '')
  }
  return ''
}

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Grab the first {...} block as a fallback.
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        /* noop */
      }
    }
    throw new PipelineError('The model did not return valid notes. Please try again.')
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new PipelineError('Cancelled'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new PipelineError('Cancelled'))
      },
      { once: true },
    )
  })
}
