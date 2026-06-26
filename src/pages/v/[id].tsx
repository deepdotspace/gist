import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutations, useAuth, AuthOverlay } from 'deepspace'
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Play,
  ChevronUp,
  X,
  BookText,
} from 'lucide-react'
import { useToast } from '../../components/ui'
import { cn } from '../../components/ui/utils'
import { VideoEmbed, type VideoEmbedHandle } from '../../components/VideoEmbed'
import { Quiz } from '../../components/Quiz'
import type { VideoRecord } from '../../hooks/useGist'
import type { GistContent, VideoMeta, QuizQuestion } from '../../lib/gist-pipeline'
import { generateQuiz } from '../../lib/gist-pipeline'
import { buildMarkdownNotes, downloadGistPdf } from '../../lib/export'
import { watchUrl } from '../../lib/youtube'

export default function ResultPage() {
  const { id } = useParams<{ id: string }>()
  const { records, status } = useQuery<VideoRecord>('videos')
  const record = records.find((r) => r.recordId === id)

  if (status === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading notes…
      </div>
    )
  }

  if (!record) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <BookText className="h-10 w-10 text-muted-foreground" />
        <div>
          <h1 className="reading-serif text-2xl font-semibold">These notes don’t exist</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The gist you’re looking for may have been deleted.
          </p>
        </div>
        <Link
          to="/home"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back home
        </Link>
      </div>
    )
  }

  return <Result recordId={record.recordId} data={record.data} />
}

function Result({ recordId, data }: { recordId: string; data: VideoRecord }) {
  const embedRef = useRef<VideoEmbedHandle>(null)
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

  useEffect(() => {
    if (Array.isArray(data.quiz) && !quiz) setQuiz(data.quiz as QuizQuestion[])
  }, [data.quiz, quiz])

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
    <div className="min-h-full bg-background pb-28">
      {/* Utility row — aligned to the reading column */}
      <div className="mx-auto w-full max-w-[44rem] px-5 pt-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Link
            to="/home"
            className="-ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All gists
          </Link>
          <div className="flex items-center gap-1">
            <IconAction label={copied ? 'Copied' : 'Copy'} onClick={copyNotes}>
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </IconAction>
            <IconAction label="PDF" onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </IconAction>
            <IconAction label="Watch" href={meta.url}>
              <ExternalLink className="h-4 w-4" />
            </IconAction>
          </div>
        </div>
      </div>

      {/* Article */}
      <article className="mx-auto w-full max-w-[44rem] px-5 sm:px-6">
        {/* Masthead */}
        <header className="pt-7">
          {meta.channel && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {meta.channel}
            </p>
          )}
          <h1 className="reading-serif mt-3 text-balance text-[2.1rem] font-semibold leading-[1.12] tracking-[-0.01em] text-foreground sm:text-[2.6rem]">
            {meta.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            {meta.duration && <span>{meta.duration} watch</span>}
            {meta.duration && readMinutes > 0 && <span aria-hidden className="opacity-40">/</span>}
            {readMinutes > 0 && <span>{readMinutes} min read</span>}
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
      {/* TL;DR — lead */}
      {gist.tldr && (
        <section>
          <Eyebrow>TL;DR</Eyebrow>
          <p className="reading-serif mt-3 text-[1.4rem] font-medium leading-[1.5] tracking-[-0.005em] text-foreground">
            {gist.tldr}
          </p>
        </section>
      )}

      {/* The long read */}
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

      {/* Chapters — timeline */}
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

      {/* Steps */}
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

      {/* Key quotes — pull quotes */}
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

  // "Back to top" returns to the top of the article. The app's scroll
  // container is <main>, not the window, so walk up to the real scroller and
  // scroll it (scrolling to 0 guarantees the hero is back in view → undock).
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
        if (entry.isIntersecting) setDismissed(false) // re-arm when hero is back in view
      },
      // Account for the sticky top nav (~56px) so docking triggers cleanly.
      { rootMargin: '-72px 0px 0px 0px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const floating = docked && !dismissed

  return (
    <div
      ref={slotRef}
      className="relative aspect-video w-full overflow-visible rounded-2xl bg-muted"
    >
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

function IconAction({
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
  const words =
    [gist.tldr, ...gist.deepDive, ...gist.chapters.map((c) => c.summary), ...gist.steps]
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
  return words > 0 ? Math.max(1, Math.round(words / 200)) : 0
}
