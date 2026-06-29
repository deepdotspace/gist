/**
 * Shared, runtime-agnostic core for the gist pipeline.
 *
 * This module has NO imports from the client `deepspace` bundle or React, so
 * it can be imported from BOTH the browser (src/lib/gist-pipeline.ts) and the
 * Cloudflare worker (src/lib/server-pipeline.ts). The only dependency is the
 * pure `./youtube` helpers.
 *
 * The pipeline steps are parameterized by a `CallFn` — `(endpoint, body) =>
 * data` that throws on failure — so the client passes `integration.post` and
 * the worker passes `ctx.integrations.call`.
 */

import { formatTimestamp, formatDuration, thumbnailFor, watchUrl } from './youtube'

// --- config (kept here so the worker doesn't import client `constants.ts`) ---

/** Apify actor that scrapes a YouTube transcript. */
export const TRANSCRIPT_ACTOR_ID = 'pintostudio/youtube-transcript-scraper'
/** Hard cap on Apify spend per run (USD). PAY_PER_EVENT actors require this. */
export const TRANSCRIPT_MAX_COST_USD = 2
/**
 * Claude model. The anthropic integration's schema default
 * (`claude-sonnet-4-20250514`) is dead on the platform (404), so it must be
 * passed explicitly. `claude-sonnet-4-6` is verified working.
 */
export const SUMMARY_MODEL = 'claude-sonnet-4-6'

// Roughly bound token cost / latency. ~48k chars ≈ 12k tokens of transcript.
const MAX_TRANSCRIPT_CHARS = 48_000

// --- types ---

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
  deepDive: string[]
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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export class PipelineError extends Error {}

/** Calls an integration endpoint and returns the unwrapped `data`, or throws. */
export type CallFn = (endpoint: string, body: unknown) => Promise<unknown>
/** Fetches YouTube oEmbed for a video id; returns the JSON or null. */
export type OembedFn = (videoId: string) => Promise<Record<string, unknown> | null>

// ---------------------------------------------------------------------------
// 1. Metadata
// ---------------------------------------------------------------------------

export async function fetchMetadataCore(
  call: CallFn,
  oembed: OembedFn,
  videoId: string,
): Promise<VideoMeta> {
  const base: VideoMeta = {
    videoId,
    url: watchUrl(videoId),
    title: '',
    channel: '',
    thumbnail: thumbnailFor(videoId),
    duration: '',
  }

  // Primary: first-party integration. Returns `{ videos: [item] }`.
  try {
    const data = asRecord(await call('youtube/get-video-details', { id: videoId }))
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
        duration: formatDuration(String(details.duration ?? '')),
      }
    }
  } catch {
    // fall through to oEmbed
  }

  // Fallback: oEmbed (free, no key, very reliable).
  try {
    const data = await oembed(videoId)
    if (data) {
      return {
        ...base,
        title: String(data.title ?? ''),
        channel: String(data.author_name ?? ''),
        thumbnail: String(data.thumbnail_url ?? base.thumbnail),
      }
    }
  } catch {
    // ignore — usable base below
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
  text: string
  truncated: boolean
}

export async function fetchTranscriptCore(
  call: CallFn,
  videoUrl: string,
  opts: { signal?: AbortSignal; onTick?: (status: string) => void } = {},
): Promise<TranscriptResult> {
  const start = asRecord(
    await call('apify/run-actor', {
      actorId: TRANSCRIPT_ACTOR_ID,
      input: { videoUrl, targetLanguage: 'en' },
      maxCostUsd: TRANSCRIPT_MAX_COST_USD,
      maxTotalChargeUsd: TRANSCRIPT_MAX_COST_USD,
    }),
  )

  const runId = String(start.jobId ?? start.id ?? '')
  if (!runId) throw new PipelineError('Could not start the transcript job.')

  const maxPolls = 60
  let items: unknown[] = []
  for (let i = 0; i < maxPolls; i++) {
    if (opts.signal?.aborted) throw new PipelineError('Cancelled')
    await sleep(i === 0 ? 1500 : 3000, opts.signal)

    const run = asRecord(await call('apify/get-run', { runId, offset: 0 }))
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
    throw new PipelineError('No transcript found for this video. It may have captions disabled.')
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
  "deepDive": string[],        // 3-6 paragraphs: a thorough, well-written prose version of the video
  "chapters": [                // 3-8 logical sections in order
    { "title": string, "startTimestamp": string, "summary": string }
  ],
  "keyQuotes": string[],       // 2-5 verbatim memorable lines from the transcript
  "steps": string[]            // ONLY for how-to/tutorial/recipe videos: ordered, imperative steps. Empty array otherwise.
}

Rules:
- "tldr" is the quick gist. "deepDive" is the satisfying long read: 3-6 flowing paragraphs (each a separate array item) that walk through the video's actual content, argument, examples, and conclusions in order — enough that the reader genuinely doesn't need to watch it. Write it as clean editorial prose, not bullet points, and don't just restate the tldr.
- "startTimestamp" must be copied from the transcript timestamps (format "m:ss" or "h:mm:ss") and mark where that chapter begins.
- Each chapter "summary" is 1-3 sentences capturing what's covered.
- Only populate "steps" when the video is genuinely instructional. Otherwise return [].
- Keep everything faithful to the transcript. Do not invent facts.`

export async function summarizeCore(
  call: CallFn,
  meta: VideoMeta,
  transcriptText: string,
): Promise<GistContent> {
  const userMsg = `Video title: ${meta.title || 'Unknown'}
Channel: ${meta.channel || 'Unknown'}

Transcript:
${transcriptText}`

  const data = asRecord(
    await call('anthropic/chat-completion', {
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
    deepDive: toStringArray(parsed.deepDive),
    chapters: chapters.map(normalizeChapter).filter((c) => c.title || c.summary),
    keyQuotes: toStringArray(parsed.keyQuotes),
    steps: toStringArray(parsed.steps),
  }
}

// ---------------------------------------------------------------------------
// Quiz + Ask (Claude)
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

export async function quizCore(
  call: CallFn,
  title: string,
  transcriptText: string,
): Promise<QuizQuestion[]> {
  const data = asRecord(
    await call('anthropic/chat-completion', {
      model: SUMMARY_MODEL,
      max_tokens: 2048,
      system: QUIZ_SYSTEM,
      messages: [{ role: 'user', content: `Video: ${title}\n\nTranscript:\n${transcriptText}` }],
    }),
  )
  const parsed = asRecord(parseJson(extractText(data)))
  const questions = Array.isArray(parsed.questions) ? parsed.questions : []
  return questions.map(normalizeQuestion).filter((q): q is QuizQuestion => q !== null)
}

const ASK_SYSTEM = (title: string, transcript: string) =>
  `You are answering questions about ONE YouTube video, using only its transcript below. Rules:
- Answer strictly from the transcript. If it isn't covered, say so briefly — don't make things up.
- Be concise and conversational (a few sentences). Use plain text, no markdown headers.
- When it helps, cite the moment with a timestamp copied from the transcript, like [2:40].

Video title: ${title}
Transcript (each line is "[m:ss] ..."):
${transcript}`

export async function askCore(
  call: CallFn,
  title: string,
  transcript: string,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: question },
  ]
  const data = asRecord(
    await call('anthropic/chat-completion', {
      model: SUMMARY_MODEL,
      max_tokens: 1024,
      system: ASK_SYSTEM(title, transcript),
      messages,
    }),
  )
  const answer = extractText(data).trim()
  if (!answer) throw new PipelineError('No answer came back. Please try again.')
  return answer
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function normalizeChapter(raw: unknown): Chapter {
  const r = asRecord(raw)
  const ts = String(r.startTimestamp ?? r.timestamp ?? '0:00').trim()
  return {
    title: String(r.title ?? '').trim(),
    startTimestamp: ts,
    startSeconds: parseTs(ts),
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
