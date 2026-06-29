/**
 * Client-side entry points for the gist pipeline.
 *
 * The heavy "URL → gist" pipeline (metadata → transcript → summary) now runs
 * in a durable worker job (see src/jobs.ts + src/lib/server-pipeline.ts), so
 * it survives the tab closing and can be reused by the auto-gist cron. What
 * stays client-side are the cheap, interactive calls made from the open
 * reader: the quiz and "Ask this video" chat.
 *
 * All the prompt/parse logic lives in the runtime-agnostic ./gist-core; this
 * file just binds it to the browser `integration.post` transport.
 */

import { integration } from 'deepspace'
import { quizCore, askCore, PipelineError, type CallFn } from './gist-core'
import type { ChatMessage, QuizQuestion } from './gist-core'

// Re-export the shared types so existing imports from this module keep working.
export type {
  VideoMeta,
  Chapter,
  GistContent,
  QuizQuestion,
  ChatMessage,
} from './gist-core'
export { PipelineError } from './gist-core'

/** Browser transport: call an integration and return its unwrapped data, or throw. */
const clientCall: CallFn = async (endpoint, body) => {
  const res = await integration.post(endpoint, body as Record<string, unknown>)
  if (!res || res.success !== true) {
    throw new PipelineError(
      (res && 'error' in res && typeof res.error === 'string' && res.error) || `${endpoint} failed`,
    )
  }
  return res.data
}

export function generateQuiz(title: string, transcriptText: string): Promise<QuizQuestion[]> {
  return quizCore(clientCall, title, transcriptText)
}

export function askVideo(
  title: string,
  transcript: string,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  return askCore(clientCall, title, transcript, history, question)
}
