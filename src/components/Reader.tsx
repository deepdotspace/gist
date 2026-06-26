import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useMutations, AuthOverlay } from 'deepspace'
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Play,
  ChevronUp,
  X,
} from 'lucide-react'
import { useToast } from './ui'
import { cn } from './ui/utils'
import { VideoEmbed, type VideoEmbedHandle } from './VideoEmbed'
import { Quiz } from './Quiz'
import type { VideoRecord } from '../hooks/useGist'
import type { GistContent, VideoMeta, QuizQuestion } from '../lib/gist-pipeline'
import { generateQuiz } from '../lib/gist-pipeline'
import { buildMarkdownNotes, downloadGistPdf } from '../lib/export'
import { watchUrl } from '../lib/youtube'

export function Reader({ recordId, data }: { recordId: string; data: VideoRecord }) {
  const embedRef = useRef<VideoEmbedHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const { isSignedIn } = useAuth()
  const { put } = useMutations<VideoRecord>('videos')

  const [tab, setTab] = useState<'read' | 'quiz'>('read')
  const [copied, setCopied] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(
    Array.isArray(data.quiz) ? (data.quiz as QuizQuestion[]) : null,
  )
  const [quizBusy, setQuizBusy] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)

  // Reset view state when switching between gists.
  useEffect(() => {
    setTab('read')
    setQuiz(Array.isArray(data.quiz) ? (data.quiz as QuizQuestion[]) : null)
    setQuizError(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [recordId]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta: VideoMeta = {
    videoId: data.videoId,
    url: data.url || watchUrl(data.videoId),
    title: data.title,
    channel: data.channel,
    thumbnail: data.thumbnail,
    duration: data.duration,
  }
  const gist: GistContent = useMemo(
    () => ({
      tldr: data.tldr,
      deepDive: Array.isArray(data.deepDive) ? data.deepDive : [],
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      keyQuotes: Array.isArray(data.keyQuotes) ? data.keyQuotes : [],
      steps: Array.isArray(data.steps) ? data.steps : [],
    }),
    [data],
  )

  const readMinutes = useMemo(() => estimateReadMinutes(gist), [gist])
  const seek = (seconds: number) => {
    embedRef.current?.seekTo(seconds)
    if (tab !== 'read') setTab('read')
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(buildMarkdownNotes(meta, gist))
      setCopied(true)
      toast.success('Notes copied', 'Paste them anywhere.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Couldn’t copy', 'Your browser blocked clipboard access.')
    }
  }

  async function downloadPdf() {
    setPdfBusy(true)
    try {
      await downloadGistPdf(meta, gist)
    } catch {
      toast.error('PDF export hit a snag', 'Falling back to your browser’s print dialog.')
      window.print()
    } finally {
      setPdfBusy(false)
    }
  }

  async function onGenerateQuiz() {
    if (!isSignedIn) {
      setShowAuth(true)
      return
    }
    setQuizBusy(true)
    setQuizError(null)
    try {
      const qs = await generateQuiz(meta.title, data.transcriptText || '')
      if (qs.length === 0) throw new Error('No questions came back.')
      setQuiz(qs)
      try {
        await put(recordId, { quiz: qs })
      } catch {
        /* caching is best-effort */
      }
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Couldn’t generate a quiz.')
    } finally {
      setQuizBusy(false)
    }
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <article className="mx-auto w-full max-w-[44rem] px-5 pb-28 pt-10 sm:px-8 lg:pt-14">
        {/* Masthead */}
        <header>
          {meta.channel && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {meta.channel}
            </p>
          )}
          <h1 className="reading-serif mt-3 text-balance text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.6rem]">
            {meta.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-x-2.5 text-[13px] text-muted-foreground">
              {meta.duration && <span>{meta.duration} watch</span>}
              {meta.duration && readMinutes > 0 && <span aria-hidden className="opacity-40">/</span>}
              {readMinutes > 0 && <span>{readMinutes} min read</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <Action label={copied ? 'Copied' : 'Copy'} onClick={copyNotes}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Action>
              <Action label="PDF" onClick={downloadPdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Action>
              <Action label="Watch" href={meta.url}>
                <ExternalLink className="h-4 w-4" />
              </Action>
            </div>
          </div>
        </header>

        {/* Video — docks to a floating mini-player on scroll */}
        <div className="mt-7">
          <StickyVideo embedRef={embedRef} videoId={meta.videoId} title={meta.title} />
        </div>

        {/* Read / Quiz toggle */}
        <div className="mt-8 flex items-center gap-1 border-b border-border">
          <SegTab active={tab === 'read'} onClick={() => setTab('read')}>
            Read
          </SegTab>
          <SegTab active={tab === 'quiz'} onClick={() => setTab('quiz')}>
            Test yourself
          </SegTab>
        </div>

        {tab === 'read' ? (
          <Notes gist={gist} onSeek={seek} />
        ) : (
          <div className="mt-8">
            <Quiz
              questions={quiz}
              generating={quizBusy}
              genError={quizError}
              onGenerate={onGenerateQuiz}
            />
          </div>
        )}
      </article>

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notes (the reading experience)                                      */
/* ------------------------------------------------------------------ */

function Notes({ gist, onSeek }: { gist: GistContent; onSeek: (s: number) => void }) {
  return (
    <div className="pt-9">
      {gist.tldr && (
        <section>
          <Eyebrow>TL;DR</Eyebrow>
          <p className="reading-serif mt-3 text-[1.4rem] font-medium leading-[1.5] tracking-[-0.005em] text-foreground">
            {gist.tldr}
          </p>
        </section>
      )}

      {gist.deepDive.length > 0 && (
        <section className="mt-12">
          <Eyebrow>The long read</Eyebrow>
          <div className="reading mt-4 space-y-5 text-foreground/90">
            {gist.deepDive.map((para, i) => (
              <p key={i} className={i === 0 ? 'dropcap' : undefined}>
                {para}
              </p>
            ))}
          </div>
        </section>
      )}

      {gist.chapters.length > 0 && (
        <section className="mt-12">
          <Eyebrow>Chapters</Eyebrow>
          <ol className="mt-5 space-y-7 border-l border-border pl-6">
            {gist.chapters.map((c, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[1.655rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
                />
                <button
                  onClick={() => onSeek(c.startSeconds)}
                  className="group inline-flex items-center gap-1.5 rounded-md font-mono text-[12px] font-medium text-primary transition-colors hover:text-primary/70"
                  title="Jump to this point in the video"
                >
                  <Play className="h-3 w-3 fill-current" />
                  {c.startTimestamp}
                </button>
                <h3 className="reading-serif mt-1 text-xl font-semibold leading-snug text-foreground">
                  {c.title}
                </h3>
                <p className="reading mt-1.5 text-[1.05rem] leading-[1.65] text-muted-foreground">
                  {c.summary}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {gist.steps.length > 0 && (
        <section className="mt-12">
          <Eyebrow>Steps</Eyebrow>
          <ol className="mt-5 space-y-4">
            {gist.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="reading-serif flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="reading pt-0.5 text-[1.08rem] leading-[1.6] text-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {gist.keyQuotes.length > 0 && (
        <section className="mt-12">
          <Eyebrow>In their words</Eyebrow>
          <div className="mt-5 space-y-7">
            {gist.keyQuotes.map((q, i) => (
              <figure key={i} className="relative pl-7">
                <span
                  aria-hidden
                  className="reading-serif absolute -left-1 -top-3 select-none text-5xl leading-none text-primary/30"
                >
                  “
                </span>
                <blockquote className="reading-serif text-[1.35rem] font-medium italic leading-[1.45] text-foreground">
                  {q}
                </blockquote>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sticky / docking video                                              */
/* ------------------------------------------------------------------ */

function StickyVideo({
  embedRef,
  videoId,
  title,
}: {
  embedRef: React.Ref<VideoEmbedHandle>
  videoId: string
  title: string
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [docked, setDocked] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Return to the top of the reading pane (its own scroll container).
  const scrollToHero = () => {
    const el = slotRef.current
    if (!el) return
    let p: HTMLElement | null = el.parentElement
    while (p && p !== document.body) {
      const oy = getComputedStyle(p).overflowY
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) break
      p = p.parentElement
    }
    if (p && p !== document.body) p.scrollTo({ top: 0, behavior: 'smooth' })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = slotRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0
        setDocked(scrolledPast)
        if (entry.isIntersecting) setDismissed(false)
      },
      { rootMargin: '-16px 0px 0px 0px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const floating = docked && !dismissed

  return (
    <div ref={slotRef} className="relative aspect-video w-full overflow-visible rounded-2xl bg-muted">
      <div
        className={cn(
          'overflow-hidden bg-black transition-[box-shadow] duration-200',
          floating
            ? 'fixed bottom-4 right-4 z-50 aspect-video w-[18rem] rounded-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)] ring-1 ring-black/10 sm:w-[22rem]'
            : 'absolute inset-0 rounded-2xl shadow-card ring-1 ring-border',
        )}
      >
        {floating && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2.5 py-1.5">
            <p className="flex-1 truncate text-[11px] font-medium text-white/90">{title}</p>
            <button
              onClick={scrollToHero}
              title="Back to top"
              className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDismissed(true)}
              title="Hide player"
              className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <VideoEmbed ref={embedRef} videoId={videoId} title={title} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </h2>
  )
}

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Action({
  children,
  label,
  onClick,
  href,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  href?: string
  disabled?: boolean
}) {
  const cls =
    'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50'
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
        <span className="hidden sm:inline">{label}</span>
      </a>
    )
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function estimateReadMinutes(gist: GistContent): number {
  const words = [gist.tldr, ...gist.deepDive, ...gist.chapters.map((c) => c.summary), ...gist.steps]
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return words > 0 ? Math.max(1, Math.round(words / 200)) : 0
}
