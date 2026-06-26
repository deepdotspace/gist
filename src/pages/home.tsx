import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useQuery, useMutations, AuthOverlay } from 'deepspace'
import {
  ArrowRight,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
  ListChecks,
  Quote,
  Youtube,
} from 'lucide-react'
import { Button } from '../components/ui'
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

  // Navigate to the result once the pipeline finishes and the record exists.
  useEffect(() => {
    if (gist.stage === 'done' && gist.newId) {
      navigate(`/v/${gist.newId}`)
    }
  }, [gist.stage, gist.newId, navigate])

  function submit() {
    if (gist.busy) return
    if (!url.trim()) return
    if (!isSignedIn) {
      setShowAuth(true)
      return
    }
    void gist.run(url.trim())
  }

  const looksValid = !!parseVideoId(url)

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <BackgroundDecor />

      <div className="relative mx-auto max-w-3xl px-6 pb-24 pt-16 sm:pt-24">
        {/* Hero */}
        <section className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            Read it, don’t watch it
          </span>

          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            Get the{' '}
            <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
              gist
            </span>{' '}
            of any video
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            Paste a YouTube link and get a clean TL;DR, chapter breakdown with
            clickable timestamps, key quotes, and the steps for how-to videos.
          </p>
        </section>

        {/* Input */}
        <section className="mx-auto mt-10 max-w-2xl">
          <div
            className={cn(
              'flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-card transition-colors sm:flex-row sm:items-center',
              gist.stage === 'error' ? 'border-destructive/40' : 'border-border focus-within:border-primary/50',
            )}
          >
            <div className="flex flex-1 items-center gap-2 px-3">
              <Youtube className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
                disabled={gist.busy}
                placeholder="https://www.youtube.com/watch?v=…"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                aria-label="YouTube video URL"
              />
            </div>
            <Button
              size="lg"
              onClick={submit}
              disabled={gist.busy || (!!url && !looksValid)}
              className="shrink-0"
            >
              {gist.busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                <>
                  Get the gist
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Status line */}
          {gist.busy && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${Math.round(gist.progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-center text-sm text-muted-foreground">{gist.message}</p>
            </div>
          )}

          {gist.stage === 'error' && gist.error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p>{gist.error}</p>
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
              You’ll be asked to sign in — it keeps your history in one place.
            </p>
          )}
        </section>

        {/* History */}
        <History userId={userId} />
      </div>

      {showAuth && (
        <AuthOverlay
          onClose={() => {
            setShowAuth(false)
            // If they signed in and there's a pending URL, kick it off.
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

  // Single-player: show only the signed-in user's own gists.
  const mine = userId ? records.filter((r) => r.createdBy === userId) : []

  if (status === 'loading' || !userId || mine.length === 0) {
    return null
  }

  return (
    <section className="mt-16">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your history
        </h2>
      </div>

      <div className="space-y-3">
        {mine.map((r) => {
          const v = r.data
          const stepCount = Array.isArray(v.steps) ? v.steps.length : 0
          const quoteCount = Array.isArray(v.keyQuotes) ? v.keyQuotes.length : 0
          return (
            <article
              key={r.recordId}
              onClick={() => navigate(`/v/${r.recordId}`)}
              className="group flex cursor-pointer gap-4 rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-44">
                <img
                  src={v.thumbnail || thumbnailFor(v.videoId)}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <h3 className="line-clamp-1 font-semibold text-foreground">{v.title}</h3>
                {v.channel && (
                  <p className="text-xs text-muted-foreground">{v.channel}</p>
                )}
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{v.tldr}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
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
                className="self-start rounded-md p-2 text-muted-foreground opacity-0 transition-colors hover:bg-secondary hover:text-destructive group-hover:opacity-100"
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

function BackgroundDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 h-[260px] w-[460px] rounded-full bg-primary/10 blur-[100px]" />
    </div>
  )
}
