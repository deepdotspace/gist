import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useQuery, useMutations, AuthOverlay } from 'deepspace'
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Trash2,
  ListChecks,
  Quote,
  Youtube,
} from 'lucide-react'
import { cn } from '../components/ui/utils'
import { useGist } from '../hooks/useGist'
import { parseVideoId, thumbnailFor } from '../lib/youtube'
import type { VideoRecord } from '../hooks/useGist'

export default function HomePage() {
  const { isSignedIn, userId } = useAuth()
  const navigate = useNavigate()
  const gist = useGist()
  const [url, setUrl] = useState('')
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    if (gist.stage === 'done' && gist.newId) {
      navigate(`/v/${gist.newId}`)
    }
  }, [gist.stage, gist.newId, navigate])

  function submit() {
    if (gist.busy || !url.trim()) return
    if (!isSignedIn) {
      setShowAuth(true)
      return
    }
    void gist.run(url.trim())
  }

  const looksValid = !!parseVideoId(url)

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <Ambient />

      <div className="relative mx-auto max-w-2xl px-5 pb-28 pt-20 sm:px-6 sm:pt-28">
        {/* Hero */}
        <section className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Read it · don’t watch it
          </p>
          <h1 className="reading-serif mx-auto mt-5 max-w-xl text-balance text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.015em] sm:text-6xl">
            The gist of any video, in a good read.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground">
            Paste a YouTube link. Get a TL;DR, a long-read summary, a chapter
            breakdown with clickable timestamps, key quotes, and how-to steps —
            the kind of notes you’d rather read than sit through.
          </p>
        </section>

        {/* Input */}
        <section className="mx-auto mt-9 max-w-xl">
          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl border bg-card px-2 py-2 shadow-card transition-colors',
              gist.stage === 'error'
                ? 'border-destructive/40'
                : 'border-border focus-within:border-primary/60 focus-within:shadow-card-hover',
            )}
          >
            <Youtube className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={gist.busy}
              placeholder="Paste a YouTube URL…"
              className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
              aria-label="YouTube video URL"
            />
            <button
              onClick={submit}
              disabled={gist.busy || (!!url && !looksValid)}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
            >
              {gist.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span className="hidden sm:inline">Get the gist</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {gist.busy && (
            <div className="mt-5">
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${Math.round(gist.progress * 100)}%` }}
                />
              </div>
              <p className="mt-2.5 text-center text-sm text-muted-foreground">{gist.message}</p>
            </div>
          )}

          {gist.stage === 'error' && gist.error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-foreground">{gist.error}</p>
                <button
                  onClick={() => gist.reset()}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {!isSignedIn && !gist.busy && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              You’ll sign in first — it keeps your reading list in one place.
            </p>
          )}
        </section>

        <History userId={userId} />
      </div>

      {showAuth && (
        <AuthOverlay
          onClose={() => {
            setShowAuth(false)
            if (url.trim()) void gist.run(url.trim())
          }}
        />
      )}
    </div>
  )
}

function History({ userId }: { userId: string | null }) {
  const { records, status } = useQuery<VideoRecord>('videos', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { remove } = useMutations<VideoRecord>('videos')
  const navigate = useNavigate()

  const mine = userId ? records.filter((r) => r.createdBy === userId) : []

  if (status === 'loading' || !userId || mine.length === 0) return null

  return (
    <section className="mx-auto mt-20 max-w-xl">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Your reading list
      </h2>
      <div className="mt-3 divide-y divide-border border-y border-border">
        {mine.map((r) => {
          const v = r.data
          const stepCount = Array.isArray(v.steps) ? v.steps.length : 0
          const quoteCount = Array.isArray(v.keyQuotes) ? v.keyQuotes.length : 0
          return (
            <article
              key={r.recordId}
              onClick={() => navigate(`/v/${r.recordId}`)}
              className="group flex cursor-pointer items-center gap-4 py-4 transition-opacity"
            >
              <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border sm:w-32">
                <img
                  src={v.thumbnail || thumbnailFor(v.videoId)}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="reading-serif line-clamp-1 text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                  {v.title}
                </h3>
                {v.channel && <p className="text-xs text-muted-foreground">{v.channel}</p>}
                <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">{v.tldr}</p>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {stepCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="h-3 w-3" />
                      {stepCount} steps
                    </span>
                  )}
                  {quoteCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Quote className="h-3 w-3" />
                      {quoteCount} quotes
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void remove(r.recordId)
                }}
                className="shrink-0 rounded-md p-2 text-muted-foreground opacity-0 transition-colors hover:bg-secondary hover:text-destructive group-hover:opacity-100"
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[460px] w-[760px] -translate-x-1/2 rounded-full bg-primary/10 blur-[130px]" />
    </div>
  )
}
