import { useCallback, useRef, useState } from 'react'
import { useMutations } from 'deepspace'
import { parseVideoId } from '../lib/youtube'
import {
  fetchMetadata,
  fetchTranscript,
  summarize,
  PipelineError,
  type VideoMeta,
  type GistContent,
  type QuizQuestion,
} from '../lib/gist-pipeline'

export type GistStage =
  | 'idle'
  | 'metadata'
  | 'transcript'
  | 'summarize'
  | 'saving'
  | 'done'
  | 'error'

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
}

const STAGE_LABEL: Record<GistStage, string> = {
  idle: '',
  metadata: 'Looking up the video…',
  transcript: 'Pulling the transcript…',
  summarize: 'Reading it so you don’t have to…',
  saving: 'Saving your notes…',
  done: 'Done',
  error: '',
}

// Rough progress weighting so the bar moves sensibly between stages.
const STAGE_PROGRESS: Record<GistStage, number> = {
  idle: 0,
  metadata: 0.12,
  transcript: 0.4,
  summarize: 0.8,
  saving: 0.95,
  done: 1,
  error: 0,
}

export function useGist() {
  const { create } = useMutations<Record<string, unknown>>('videos')
  const [stage, setStage] = useState<GistStage>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newId, setNewId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStage('idle')
    setMessage('')
    setError(null)
    setNewId(null)
  }, [])

  const run = useCallback(
    async (input: string): Promise<string | null> => {
      const videoId = parseVideoId(input)
      if (!videoId) {
        setStage('error')
        setError('That doesn’t look like a YouTube link. Paste a full video URL.')
        return null
      }

      const controller = new AbortController()
      abortRef.current = controller
      setError(null)
      setNewId(null)

      try {
        setStage('metadata')
        setMessage(STAGE_LABEL.metadata)
        const meta = await fetchMetadata(videoId)

        setStage('transcript')
        setMessage(STAGE_LABEL.transcript)
        const transcript = await fetchTranscript(meta.url, {
          signal: controller.signal,
          onTick: (status) => {
            if (status === 'RUNNING' || status === 'READY') {
              setMessage('Pulling the transcript… (this can take a moment)')
            }
          },
        })

        setStage('summarize')
        setMessage(STAGE_LABEL.summarize)
        const gist = await summarize(meta, transcript.text)

        setStage('saving')
        setMessage(STAGE_LABEL.saving)
        const record: VideoRecord = {
          ...meta,
          ...gist,
          transcriptText: transcript.text,
        }
        const id = await create(record as unknown as Record<string, unknown>)

        setNewId(id)
        setStage('done')
        setMessage(STAGE_LABEL.done)
        return id
      } catch (err) {
        if (controller.signal.aborted) {
          setStage('idle')
          return null
        }
        const msg =
          err instanceof PipelineError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Something went wrong while reading this video.'
        setStage('error')
        setError(msg)
        return null
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [create],
  )

  const busy = stage !== 'idle' && stage !== 'error' && stage !== 'done'

  return {
    stage,
    message,
    error,
    newId,
    busy,
    progress: STAGE_PROGRESS[stage],
    run,
    reset,
  }
}
