import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  Highlighter,
  Trash2,
  Tag as TagIcon,
  Plus,
  X as XIcon,
  StickyNote,
} from 'lucide-react'
import { useToast } from './ui'
import { cn } from './ui/utils'
import { VideoEmbed, type VideoEmbedHandle } from './VideoEmbed'
import { Quiz } from './Quiz'
import { AskVideo } from './AskVideo'
import type { VideoRecord, Highlight } from '../hooks/useGist'
import type { GistContent, VideoMeta, QuizQuestion, ChatMessage } from '../lib/gist-pipeline'
import { generateQuiz, askVideo } from '../lib/gist-pipeline'
import { buildMarkdownNotes, downloadGistPdf } from '../lib/export'
import { watchUrl } from '../lib/youtube'

type Tab = 'read' | 'notes' | 'ask' | 'quiz'

export function Reader({
  recordId,
  data,
  canEdit,
}: {
  recordId: string
  data: VideoRecord
  canEdit: boolean
}) {
  const embedRef = useRef<VideoEmbedHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const proseRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const { isSignedIn } = useAuth()
  const { put } = useMutations<VideoRecord>('videos')

  const [tab, setTab] = useState<Tab>('read')
  const [copied, setCopied] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [focusHl, setFocusHl] = useState<string | null>(null)

  // Highlights
  const [highlights, setHighlights] = useState<Highlight[]>(
    Array.isArray(data.highlights) ? data.highlights : [],
  )
  // Selection bubble (phase 1) — anchored at the live text selection.
  const [sel, setSel] = useState<{ text: string; top: number; bottom: number; left: number } | null>(
    null,
  )
  // Inline note editor (phase 2) — a sticky popover for one highlight's note.
  const [noteEditor, setNoteEditor] = useState<{ id: string; x: number; y: number } | null>(null)
  // Custom hover tooltip showing a truncated note preview.
  const [hoverNote, setHoverNote] = useState<{ note: string; x: number; y: number } | null>(null)

  // Quiz
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(
    Array.isArray(data.quiz) ? (data.quiz as QuizQuestion[]) : null,
  )
  const [quizBusy, setQuizBusy] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)

  // Ask this video (chat)
  const [chat, setChat] = useState<ChatMessage[]>(Array.isArray(data.chat) ? data.chat : [])
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Tags
  const [tags, setTags] = useState<string[]>(Array.isArray(data.tags) ? data.tags : [])

  // Reset per-gist view state.
  useEffect(() => {
    setTab('read')
    setSel(null)
    setNoteEditor(null)
    setHoverNote(null)
    setFocusHl(null)
    setHighlights(Array.isArray(data.highlights) ? data.highlights : [])
    setQuiz(Array.isArray(data.quiz) ? (data.quiz as QuizQuestion[]) : null)
    setQuizError(null)
    setChat(Array.isArray(data.chat) ? data.chat : [])
    setChatError(null)
    setTags(Array.isArray(data.tags) ? data.tags : [])
    scrollRef.current?.scrollTo({ top: 0 })
  }, [recordId])

  // Mark the gist read when its owner opens it (drives the unread dot).
  const readMarked = useRef<string | null>(null)
  useEffect(() => {
    if (!canEdit || readMarked.current === recordId) return
    readMarked.current = recordId
    put(recordId, { lastReadAt: new Date().toISOString() }).catch(() => {})
  }, [recordId, canEdit, put])

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

  // Always-latest highlights so mutators called from a closing popover (which
  // captured an older render) don't write a stale array back.
  const highlightsRef = useRef(highlights)
  highlightsRef.current = highlights

  const persist = useCallback(
    (next: Highlight[]) => {
      setHighlights(next)
      put(recordId, { highlights: next }).catch(() => {
        toast.error('Couldn’t save highlight', 'Your change may not stick.')
      })
    },
    [put, recordId, toast],
  )

  /** Create (or find a duplicate) highlight; returns its id, or null if too short. */
  const addHighlight = (text: string): string | null => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length < 3) return null
    const existing = highlightsRef.current.find((h) => h.text === clean)
    setSel(null)
    window.getSelection()?.removeAllRanges()
    if (existing) return existing.id
    const hl: Highlight = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text: clean,
      createdAt: Date.now(),
    }
    persist([...highlightsRef.current, hl])
    return hl.id
  }
  const updateNote = (id: string, note: string) =>
    persist(highlightsRef.current.map((h) => (h.id === id ? { ...h, note: note || undefined } : h)))
  const removeHighlight = (id: string) =>
    persist(highlightsRef.current.filter((h) => h.id !== id))

  // "Highlight" — just mark it. "+ Note" — mark it, then open the inline editor.
  const highlightOnly = () => sel && addHighlight(sel.text)
  const highlightWithNote = () => {
    if (!sel) return
    const { bottom, left } = sel
    const id = addHighlight(sel.text)
    if (id) setNoteEditor({ id, x: left, y: bottom })
  }

  // Detect a text selection inside the prose to offer a "Highlight" button.
  function onProseMouseUp() {
    if (!canEdit) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return setSel(null)
    const text = selection.toString().trim()
    if (text.length < 3) return setSel(null)
    const range = selection.getRangeAt(0)
    if (!proseRef.current?.contains(range.commonAncestorContainer)) return setSel(null)
    const rect = range.getBoundingClientRect()
    setSel({ text, top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
  }

  // Hide the selection toolbar on scroll / when the selection collapses.
  useEffect(() => {
    if (!sel) return
    const hide = () => setSel(null)
    const onSelChange = () => {
      const s = window.getSelection()
      if (!s || s.isCollapsed) setSel(null)
    }
    const sc = scrollRef.current
    sc?.addEventListener('scroll', hide, { passive: true })
    document.addEventListener('selectionchange', onSelChange)
    return () => {
      sc?.removeEventListener('scroll', hide)
      document.removeEventListener('selectionchange', onSelChange)
    }
  }, [sel])

  // Clicking a highlight opens the inline note editor right at the mark.
  const onClickMark = (id: string, rect: DOMRect) => {
    setHoverNote(null)
    setNoteEditor({ id, x: rect.left + rect.width / 2, y: rect.bottom })
  }

  // Custom hover tooltip (truncated note preview) via event delegation on the prose.
  useEffect(() => {
    const root = proseRef.current
    if (tab !== 'read' || !root) return
    const onOver = (e: Event) => {
      const m = (e.target as HTMLElement).closest?.('mark[data-hl-id]')
      if (!m) return
      const h = highlights.find((x) => x.id === m.getAttribute('data-hl-id'))
      if (!h?.note) return setHoverNote(null)
      const r = m.getBoundingClientRect()
      setHoverNote({ note: h.note, x: r.left + r.width / 2, y: r.top })
    }
    const onOut = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('mark[data-hl-id]')) setHoverNote(null)
    }
    root.addEventListener('mouseover', onOver)
    root.addEventListener('mouseout', onOut)
    return () => {
      root.removeEventListener('mouseover', onOver)
      root.removeEventListener('mouseout', onOut)
    }
  }, [tab, highlights])

  // Close the inline note editor on outside-click / Escape.
  useEffect(() => {
    if (!noteEditor) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-note-editor]')) setNoteEditor(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNoteEditor(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [noteEditor])
  // Jump from Notes back to the marked text in the article.
  const jumpToMark = (id: string) => {
    setTab('read')
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`mark[data-hl-id="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.animate(
        [{ filter: 'brightness(1)' }, { filter: 'brightness(1.4)' }, { filter: 'brightness(1)' }],
        { duration: 900 },
      )
    })
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(buildMarkdownNotes(meta, gist, highlights))
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
    if (!isSignedIn) return setShowAuth(true)
    setQuizBusy(true)
    setQuizError(null)
    try {
      const qs = await generateQuiz(meta.title, data.transcriptText || '')
      if (qs.length === 0) throw new Error('No questions came back.')
      setQuiz(qs)
      try {
        await put(recordId, { quiz: qs })
      } catch {
        /* best-effort cache */
      }
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Couldn’t generate a quiz.')
    } finally {
      setQuizBusy(false)
    }
  }

  async function onAsk(question: string) {
    const next = [...chat, { role: 'user', content: question } as ChatMessage]
    setChat(next)
    setChatBusy(true)
    setChatError(null)
    try {
      const answer = await askVideo(meta.title, data.transcriptText || '', chat, question)
      const finalMsgs = [...next, { role: 'assistant', content: answer } as ChatMessage]
      setChat(finalMsgs)
      put(recordId, { chat: finalMsgs }).catch(() => {})
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Couldn’t get an answer.')
    } finally {
      setChatBusy(false)
    }
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24)
    if (!t || tags.includes(t)) return
    const next = [...tags, t]
    setTags(next)
    put(recordId, { tags: next }).catch(() => {})
  }
  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t)
    setTags(next)
    put(recordId, { tags: next }).catch(() => {})
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
          <TagBar tags={tags} canEdit={canEdit} onAdd={addTag} onRemove={removeTag} />
        </header>

        {/* Video — docks to a floating mini-player on scroll */}
        <div className="mt-7">
          <StickyVideo embedRef={embedRef} videoId={meta.videoId} title={meta.title} />
        </div>

        {/* Tabs */}
        <div className="mt-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          <SegTab active={tab === 'read'} onClick={() => setTab('read')}>
            Read
          </SegTab>
          <SegTab active={tab === 'notes'} onClick={() => setTab('notes')}>
            Notes
            {highlights.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {highlights.length}
              </span>
            )}
          </SegTab>
          <SegTab active={tab === 'ask'} onClick={() => setTab('ask')}>
            Ask
          </SegTab>
          <SegTab active={tab === 'quiz'} onClick={() => setTab('quiz')}>
            Test yourself
          </SegTab>
        </div>

        {tab === 'read' && (
          <div ref={proseRef} onMouseUp={onProseMouseUp}>
            <Notes gist={gist} highlights={highlights} onSeek={seek} onClickMark={onClickMark} />
            {canEdit && highlights.length === 0 && (
              <p className="mt-10 flex items-center gap-2 text-[13px] text-muted-foreground">
                <Highlighter className="h-3.5 w-3.5" />
                Tip: select any text to highlight it and add a note.
              </p>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <HighlightsPanel
            highlights={highlights}
            canEdit={canEdit}
            focusId={focusHl}
            onClearFocus={() => setFocusHl(null)}
            onJump={jumpToMark}
            onUpdateNote={updateNote}
            onRemove={removeHighlight}
          />
        )}

        {tab === 'ask' && (
          <AskVideo
            messages={chat}
            busy={chatBusy}
            error={chatError}
            canEdit={canEdit}
            onSend={onAsk}
          />
        )}

        {tab === 'quiz' && (
          <div className="mt-8">
            <Quiz questions={quiz} generating={quizBusy} genError={quizError} onGenerate={onGenerateQuiz} />
          </div>
        )}
      </article>

      {/* Selection bubble — highlight, or highlight + add a note inline */}
      {sel && !noteEditor && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', top: sel.top - 46, left: sel.left, transform: 'translateX(-50%)' }}
          className="z-50 flex items-center overflow-hidden rounded-lg bg-foreground text-[13px] font-medium text-background shadow-lg"
        >
          <button
            onClick={highlightOnly}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-background/15"
          >
            <Highlighter className="h-3.5 w-3.5" />
            Highlight
          </button>
          <span aria-hidden className="h-5 w-px bg-background/25" />
          <button
            onClick={highlightWithNote}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-background/15"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Note
          </button>
        </div>
      )}

      {/* Inline note editor — anchored at the highlight */}
      {noteEditor &&
        (() => {
          const h = highlights.find((x) => x.id === noteEditor.id)
          if (!h) return null
          return (
            <InlineNoteEditor
              key={noteEditor.id}
              highlight={h}
              canEdit={canEdit}
              x={noteEditor.x}
              y={noteEditor.y}
              onCommit={(note) => updateNote(h.id, note)}
              onDelete={() => removeHighlight(h.id)}
              onClose={() => setNoteEditor(null)}
            />
          )
        })()}

      {/* Hover tooltip — truncated note preview */}
      {hoverNote && !noteEditor && (
        <div
          style={{ position: 'fixed', top: hoverNote.y - 8, left: hoverNote.x, transform: 'translate(-50%, -100%)' }}
          className="pointer-events-none z-50 max-w-[18rem] rounded-lg bg-foreground px-3 py-2 text-[12px] leading-snug text-background shadow-lg"
        >
          {truncate(hoverNote.note, 100)}
        </div>
      )}

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notes (the reading experience)                                      */
/* ------------------------------------------------------------------ */

function Notes({
  gist,
  highlights,
  onSeek,
  onClickMark,
}: {
  gist: GistContent
  highlights: Highlight[]
  onSeek: (s: number) => void
  onClickMark: (id: string, rect: DOMRect) => void
}) {
  const hl = (text: string) => renderHighlighted(text, highlights, onClickMark)
  return (
    <div className="pt-9">
      {gist.tldr && (
        <section>
          <Eyebrow>TL;DR</Eyebrow>
          <p className="reading-serif mt-3 text-[1.4rem] font-medium leading-[1.5] tracking-[-0.005em] text-foreground">
            {hl(gist.tldr)}
          </p>
        </section>
      )}

      {gist.deepDive.length > 0 && (
        <section className="mt-12">
          <Eyebrow>The long read</Eyebrow>
          <div className="reading mt-4 space-y-5 text-foreground/90">
            {gist.deepDive.map((para, i) => (
              <p key={i} className={i === 0 ? 'dropcap' : undefined}>
                {hl(para)}
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
                  {hl(c.summary)}
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
                <span className="reading pt-0.5 text-[1.08rem] leading-[1.6] text-foreground">{hl(s)}</span>
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
                  {hl(q)}
                </blockquote>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Wrap saved highlight substrings in <mark>, leaving the rest as text. */
function renderHighlighted(
  text: string,
  highlights: Highlight[],
  onClickMark: (id: string, rect: DOMRect) => void,
): ReactNode {
  if (!highlights.length) return text
  const ranges: { start: number; end: number; h: Highlight }[] = []
  for (const h of highlights) {
    if (!h.text) continue
    const idx = text.indexOf(h.text)
    if (idx !== -1) ranges.push({ start: idx, end: idx + h.text.length, h })
  }
  if (!ranges.length) return text
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const r of ranges) {
    if (r.start < cursor) continue // skip overlaps
    if (r.start > cursor) nodes.push(text.slice(cursor, r.start))
    nodes.push(
      <mark
        key={key++}
        data-hl-id={r.h.id}
        data-has-note={r.h.note ? 'true' : 'false'}
        className="gist-highlight"
        onClick={(e) => onClickMark(r.h.id, (e.currentTarget as HTMLElement).getBoundingClientRect())}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    )
    cursor = r.end
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

/* ------------------------------------------------------------------ */
/* Highlights & notes panel                                            */
/* ------------------------------------------------------------------ */

function HighlightsPanel({
  highlights,
  canEdit,
  focusId,
  onClearFocus,
  onJump,
  onUpdateNote,
  onRemove,
}: {
  highlights: Highlight[]
  canEdit: boolean
  focusId: string | null
  onClearFocus: () => void
  onJump: (id: string) => void
  onUpdateNote: (id: string, note: string) => void
  onRemove: (id: string) => void
}) {
  if (highlights.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <Highlighter className="h-7 w-7 text-muted-foreground" />
        <p className="reading-serif mt-3 text-lg font-semibold">No highlights yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {canEdit
            ? 'Go to the Read tab and select any sentence to highlight it. Add your own notes here.'
            : 'The reader hasn’t highlighted anything in this gist.'}
        </p>
      </div>
    )
  }

  const ordered = [...highlights].sort((a, b) => a.createdAt - b.createdAt)
  return (
    <div className="mt-8 space-y-4">
      {ordered.map((h) => (
        <HighlightRow
          key={h.id}
          highlight={h}
          canEdit={canEdit}
          focused={focusId === h.id}
          onClearFocus={onClearFocus}
          onJump={() => onJump(h.id)}
          onUpdateNote={(note) => onUpdateNote(h.id, note)}
          onRemove={() => onRemove(h.id)}
        />
      ))}
    </div>
  )
}

function HighlightRow({
  highlight,
  canEdit,
  focused,
  onClearFocus,
  onJump,
  onUpdateNote,
  onRemove,
}: {
  highlight: Highlight
  canEdit: boolean
  focused: boolean
  onClearFocus: () => void
  onJump: () => void
  onUpdateNote: (note: string) => void
  onRemove: () => void
}) {
  const [note, setNote] = useState(highlight.note ?? '')
  const rowRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setNote(highlight.note ?? ''), [highlight.note])

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      noteRef.current?.focus()
      const t = setTimeout(onClearFocus, 1600)
      return () => clearTimeout(t)
    }
  }, [focused])

  function commit() {
    const trimmed = note.trim()
    if (trimmed !== (highlight.note ?? '')) onUpdateNote(trimmed)
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        focused ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <blockquote
          onClick={onJump}
          className="reading-serif flex-1 cursor-pointer border-l-2 border-primary/40 pl-3 text-[15px] italic leading-snug text-foreground hover:border-primary"
          title="Jump to this in the article"
        >
          {highlight.text}
        </blockquote>
        {canEdit && (
          <button
            onClick={onRemove}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
            aria-label="Delete highlight"
            title="Delete highlight"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {canEdit ? (
        <textarea
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commit}
          placeholder="Add a note…"
          rows={note ? 2 : 1}
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
        />
      ) : (
        highlight.note && (
          <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
            {highlight.note}
          </p>
        )
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline note editor (popover anchored at a highlight)                */
/* ------------------------------------------------------------------ */

function InlineNoteEditor({
  highlight,
  canEdit,
  x,
  y,
  onCommit,
  onDelete,
  onClose,
}: {
  highlight: Highlight
  canEdit: boolean
  x: number
  y: number
  onCommit: (note: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(highlight.note ?? '')
  const draftRef = useRef(draft)
  draftRef.current = draft
  const skipCommit = useRef(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const original = highlight.note ?? ''

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }, [])

  // Commit the latest draft whenever the editor closes (outside-click, Escape,
  // Save). Mount-only ([] deps): the commit must fire on unmount, not on every
  // re-render; refs (draftRef/skipCommit) carry the latest values.
  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => {
    if (skipCommit.current) return
    const v = draftRef.current.trim()
    if (v !== original) onCommit(v)
  }
  useEffect(() => () => commitRef.current(), [])

  const left = Math.min(Math.max(x, 150), window.innerWidth - 150)
  const top = Math.min(y + 8, window.innerHeight - 190)

  return (
    <div
      data-note-editor
      style={{ position: 'fixed', top, left, transform: 'translateX(-50%)' }}
      className="z-50 w-72 rounded-xl border border-border bg-card p-3 shadow-xl"
    >
      <blockquote className="reading-serif mb-2 line-clamp-2 border-l-2 border-primary/40 pl-2 text-[13px] italic text-muted-foreground">
        {highlight.text}
      </blockquote>
      {canEdit ? (
        <>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onClose()
              }
            }}
            placeholder="Add a note…"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() => {
                skipCommit.current = true
                onDelete()
                onClose()
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              onClick={onClose}
              className="rounded-md bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Save
            </button>
          </div>
        </>
      ) : highlight.note ? (
        <p className="text-sm text-foreground">{highlight.note}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No note on this highlight.</p>
      )}
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s
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

function TagBar({
  tags,
  canEdit,
  onAdd,
  onRemove,
}: {
  tags: string[]
  canEdit: boolean
  onAdd: (t: string) => void
  onRemove: (t: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [val, setVal] = useState('')
  if (tags.length === 0 && !canEdit) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-foreground"
        >
          <TagIcon className="h-3 w-3 text-muted-foreground" />
          {t}
          {canEdit && (
            <button
              onClick={() => onRemove(t)}
              className="ml-0.5 text-muted-foreground hover:text-destructive"
              aria-label={`Remove tag ${t}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit &&
        (adding ? (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAdd(val)
                setVal('')
                setAdding(false)
              } else if (e.key === 'Escape') {
                setVal('')
                setAdding(false)
              }
            }}
            onBlur={() => {
              if (val.trim()) onAdd(val)
              setVal('')
              setAdding(false)
            }}
            placeholder="tag…"
            className="w-24 rounded-full border border-border bg-background px-2.5 py-1 text-[12px] outline-none focus:border-primary/50"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Tag
          </button>
        ))}
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
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
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        '-mb-px flex items-center border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors',
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
  children: ReactNode
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
