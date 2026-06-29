import { useCallback, useState } from 'react'
import { useJobs } from 'deepspace'
import { SCOPE_ID } from '../constants'
import { parseVideoId } from '../lib/youtube'
import type {
  VideoMeta,
  GistContent,
  QuizQuestion,
  ChatMessage,
} from '../lib/gist-pipeline'

export type GistStage = 'idle' | 'running' | 'done' | 'error'

/** A reader-created highlight, optionally annotated with a note. */
export interface Highlight {
  id: string
  text: string
  note?: string
  createdAt: number
}

export interface VideoRecord extends VideoMeta, GistContent {
  videoId: string
  transcriptText: string
  /** Cached quiz, generated lazily on the results page. */
  quiz?: QuizQuestion[]
  /** Reader's highlights + margin notes. */
  highlights?: Highlight[]
  /** User-defined tags for organizing the rail. */
  tags?: string[]
  /** "Ask this video" conversation, persisted for the owner. */
  chat?: ChatMessage[]
  /** ISO timestamp when starred, or empty/undefined when not saved. */
  savedAt?: string
  /** ISO timestamp the owner last opened this gist. */
  lastReadAt?: string
  /** 'manual' | 'auto' — how this gist was created. */
  source?: string
  /** Channel that produced it (set for auto-gisted videos). */
  channelId?: string
}

/**
 * Turns a YouTube URL into a gist by enqueuing a durable worker job
 * (`gist-video`) and observing it via `useJobs`. The pipeline now runs in the
 * worker, so closing the tab no longer kills it — the record still lands in
 * the reading list when the job finishes.
 */
export function useGist() {
  const { enqueue, jobs } = useJobs<{ url: string }>(SCOPE_ID)
  const [jobId, setJobId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const job = jobId ? jobs.find((j) => j.id === jobId) : undefined

  const stage: GistStage = localError
    ? 'error'
    : !jobId
      ? 'idle'
      : job?.status === 'succeeded'
        ? 'done'
        : job?.status === 'failed' || job?.status === 'canceled'
          ? 'error'
          : 'running'

  const result = job?.result as { recordId?: string } | undefined
  const newId = stage === 'done' ? (result?.recordId ?? null) : null
  const error =
    localError ??
    (job?.status === 'failed'
      ? job.error || 'Something went wrong while reading this video.'
      : null)
  const progress =
    stage === 'done' ? 1 : stage === 'running' ? Math.max(0.05, job?.progress ?? 0.05) : 0
  const message = stage === 'running' ? job?.progressMessage || 'Working…' : ''
  const busy = stage === 'running'

  const run = useCallback(
    async (input: string): Promise<string | null> => {
      setLocalError(null)
      setJobId(null)
      if (!parseVideoId(input)) {
        setLocalError('That doesn’t look like a YouTube link. Paste a full video URL.')
        return null
      }
      try {
        const id = await enqueue('gist-video', { url: input })
        setJobId(id)
        return id
      } catch {
        setLocalError('Couldn’t start — give it a second and try again.')
        return null
      }
    },
    [enqueue],
  )

  const reset = useCallback(() => {
    setJobId(null)
    setLocalError(null)
  }, [])

  return { stage, message, error, newId, busy, progress, run, reset }
}
