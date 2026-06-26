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
  ListChecks,
  Quote,
  BookOpen,
  Play,
} from 'lucide-react'
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, useToast } from '../../components/ui'
import { VideoEmbed, type VideoEmbedHandle } from '../../components/VideoEmbed'
import { Quiz } from '../../components/Quiz'
import type { VideoRecord } from '../../hooks/useGist'
import type { GistContent, VideoMeta, QuizQuestion } from '../../lib/gist-pipeline'
import { generateQuiz } from '../../lib/gist-pipeline'
import { buildMarkdownNotes, downloadGistPdf } from '../../lib/export'
import { formatTimestamp, watchUrl } from '../../lib/youtube'

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
        <BookOpen className="h-10 w-10 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">These notes don’t exist</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The gist you’re looking for may have been deleted.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/home">
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
        </Button>
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

  const [copied, setCopied] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(
    Array.isArray(data.quiz) ? (data.quiz as QuizQuestion[]) : null,
  )
  const [quizBusy, setQuizBusy] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)

  // Keep quiz in sync if the record streams in an update from elsewhere.
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
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      keyQuotes: Array.isArray(data.keyQuotes) ? data.keyQuotes : [],
      steps: Array.isArray(data.steps) ? data.steps : [],
    }),
    [data],
  )

  const seek = (seconds: number) => embedRef.current?.seekTo(seconds)

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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Top bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/home">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyNotes}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy notes
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={meta.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              YouTube
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Left: sticky video + header */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <VideoEmbed ref={embedRef} videoId={meta.videoId} title={meta.title} />
          <h1 className="mt-4 text-xl font-semibold leading-snug tracking-tight">{meta.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {meta.channel && <span>{meta.channel}</span>}
            {meta.duration && (
              <>
                <span aria-hidden>·</span>
                <span>{meta.duration}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: notes / quiz tabs */}
        <Tabs defaultValue="notes" className="min-w-0">
          <TabsList>
            <TabsTrigger value="notes">
              <BookOpen className="mr-1.5 h-4 w-4" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="quiz">
              <ListChecks className="mr-1.5 h-4 w-4" />
              Test yourself
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="mt-5 space-y-8 focus-visible:outline-none">
            <Notes gist={gist} onSeek={seek} />
          </TabsContent>

          <TabsContent value="quiz" className="mt-5 focus-visible:outline-none">
            <Quiz
              questions={quiz}
              generating={quizBusy}
              genError={quizError}
              onGenerate={onGenerateQuiz}
            />
          </TabsContent>
        </Tabs>
      </div>

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

function Notes({ gist, onSeek }: { gist: GistContent; onSeek: (s: number) => void }) {
  return (
    <>
      {/* TL;DR */}
      {gist.tldr && (
        <section>
          <SectionHeading>TL;DR</SectionHeading>
          <p className="text-[15px] leading-relaxed text-foreground">{gist.tldr}</p>
        </section>
      )}

      {/* Chapters */}
      {gist.chapters.length > 0 && (
        <section>
          <SectionHeading>Chapters</SectionHeading>
          <ol className="space-y-3">
            {gist.chapters.map((c, i) => (
              <li
                key={i}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onSeek(c.startSeconds)}
                    className="group inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    title="Jump to this point"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    {c.startTimestamp || formatTimestamp(c.startSeconds)}
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-snug text-foreground">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Steps */}
      {gist.steps.length > 0 && (
        <section>
          <SectionHeading icon={<ListChecks className="h-4 w-4" />}>
            Steps / recipe
          </SectionHeading>
          <ol className="space-y-2.5">
            {gist.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[15px] leading-relaxed text-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Key quotes */}
      {gist.keyQuotes.length > 0 && (
        <section>
          <SectionHeading icon={<Quote className="h-4 w-4" />}>Key quotes</SectionHeading>
          <div className="space-y-3">
            {gist.keyQuotes.map((q, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-primary/50 pl-4 text-[15px] italic leading-relaxed text-foreground"
              >
                “{q}”
              </blockquote>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function SectionHeading({
  children,
  icon,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </h2>
  )
}
