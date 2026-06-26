import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Sparkles, MessagesSquare } from 'lucide-react'
import { cn } from './ui/utils'
import type { ChatMessage } from '../lib/gist-pipeline'

const SUGGESTIONS = [
  'What are the key takeaways?',
  'What’s the single most important point?',
  'Did they mention any tools, names, or resources?',
]

export function AskVideo({
  messages,
  busy,
  error,
  canEdit,
  onSend,
}: {
  messages: ChatMessage[]
  busy: boolean
  error: string | null
  canEdit: boolean
  onSend: (q: string) => void
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, busy])

  if (!canEdit) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <MessagesSquare className="h-7 w-7 text-muted-foreground" />
        <p className="reading-serif mt-3 text-lg font-semibold">Ask this video</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Chatting with a video is available on your own gists. Make this gist
          yours to ask follow-up questions about it.
        </p>
      </div>
    )
  }

  function submit() {
    const q = draft.trim()
    if (!q || busy) return
    onSend(q)
    setDraft('')
  }

  return (
    <div className="mt-6 flex min-h-[20rem] flex-col">
      <div className="flex-1 space-y-4">
        {messages.length === 0 && !busy && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask anything about this video
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Answers come straight from the transcript, with timestamps when useful.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-[13px] text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                m.role === 'user'
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'reading rounded-bl-md bg-secondary text-foreground',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-secondary px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the transcript…
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 mt-4 flex items-end gap-2 bg-background pb-1 pt-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Ask about this video…"
          className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
        />
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
