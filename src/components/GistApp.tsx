import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useQuery,
  useMutations,
  useAuthProfileReady,
  signOut,
  AuthOverlay,
} from 'deepspace'
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Youtube,
  PanelLeft,
  X,
  LogOut,
  Sparkles,
  BookText,
} from 'lucide-react'
import { cn } from './ui/utils'
import { ConfirmModal } from './ui'
import { Reader } from './Reader'
import { useGist, type VideoRecord } from '../hooks/useGist'
import { parseVideoId, thumbnailFor } from '../lib/youtube'

export function GistApp({ selectedId }: { selectedId?: string }) {
  const navigate = useNavigate()
  const gist = useGist()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })

  const { records, status } = useQuery<VideoRecord>('videos', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { remove } = useMutations<VideoRecord>('videos')
  const mine = user?.id ? records.filter((r) => r.createdBy === user.id) : []
  const selected = selectedId ? records.find((r) => r.recordId === selectedId) : undefined
  const canEdit = !!user?.id && selected?.createdBy === user.id

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await remove(pendingDelete.id)
      if (pendingDelete.id === selectedId) navigate('/home')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  // Navigate to the freshly created gist when the pipeline finishes.
  useEffect(() => {
    if (gist.stage === 'done' && gist.newId) navigate(`/v/${gist.newId}`)
  }, [gist.stage, gist.newId, navigate])

  // Close the mobile drawer on selection change.
  useEffect(() => setDrawerOpen(false), [selectedId])

  function openCompose() {
    if (selectedId) navigate('/home')
    if (gist.stage === 'error') gist.reset()
    setDrawerOpen(false)
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[290px] flex-col border-r border-border bg-card/50 backdrop-blur-xl transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand + compose */}
        <div className="px-4 pb-3 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={openCompose}
              className="flex items-center gap-2"
              title="Gist"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookText className="h-3.5 w-3.5" />
              </span>
              <span className="reading-serif text-lg font-semibold tracking-tight text-foreground">
                Gist
              </span>
            </button>
            <button
              onClick={() => setDrawerOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={openCompose}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
              !selectedId
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:bg-secondary',
            )}
          >
            <Plus className="h-4 w-4" />
            New gist
          </button>
        </div>

        {/* Reading list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reading list
          </p>
          {status === 'loading' ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="px-2 py-3 text-[13px] leading-relaxed text-muted-foreground">
              {isSignedIn
                ? 'Nothing yet. Paste a YouTube link to make your first gist.'
                : 'Sign in to save the videos you read.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {mine.map((r) => (
                <ListItem
                  key={r.recordId}
                  record={r}
                  active={r.recordId === selectedId}
                  onOpen={() => navigate(`/v/${r.recordId}`)}
                  onDelete={() => setPendingDelete({ id: r.recordId, title: r.data.title })}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Account */}
        <Account
          isSignedIn={isSignedIn}
          name={user?.name}
          email={user?.email}
          imageUrl={user?.imageUrl}
          onSignIn={() => setShowAuth(true)}
        />
      </aside>

      {/* Main pane */}
      <main className="relative min-w-0 flex-1 overflow-hidden bg-background">
        {/* Floating menu button (mobile) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="absolute left-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-foreground shadow-card backdrop-blur lg:hidden"
          aria-label="Open menu"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        {selectedId ? (
          status === 'loading' ? (
            <Centered>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </Centered>
          ) : selected ? (
            <Reader recordId={selected.recordId} data={selected.data} canEdit={canEdit} />
          ) : (
            <Centered>
              <div className="text-center">
                <BookText className="mx-auto h-9 w-9 text-muted-foreground" />
                <p className="reading-serif mt-3 text-xl font-semibold">This gist doesn’t exist</p>
                <button onClick={() => navigate('/home')} className="mt-3 text-sm text-primary hover:underline">
                  Start a new one
                </button>
              </div>
            </Centered>
          )
        ) : (
          <Compose
            gist={gist}
            isSignedIn={isSignedIn}
            onNeedAuth={() => setShowAuth(true)}
          />
        )}
      </main>

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this gist?"
        description={
          pendingDelete
            ? `“${truncate(pendingDelete.title, 80)}” and its highlights & notes will be permanently removed.`
            : ''
        }
        confirmText="Delete"
        cancelText="Keep"
        variant="destructive"
        loading={deleting}
      />
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/* ------------------------------------------------------------------ */
/* Compose (empty / new-gist state)                                    */
/* ------------------------------------------------------------------ */

function Compose({
  gist,
  isSignedIn,
  onNeedAuth,
}: {
  gist: ReturnType<typeof useGist>
  isSignedIn: boolean
  onNeedAuth: () => void
}) {
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit() {
    if (gist.busy || !url.trim()) return
    if (!isSignedIn) {
      onNeedAuth()
      return
    }
    void gist.run(url.trim())
  }

  const looksValid = !!parseVideoId(url)

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          Read it · don’t watch it
        </span>

        <h1 className="reading-serif mt-6 text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.015em] sm:text-5xl">
          The gist of any video, in a good read.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          Paste a YouTube link and get a TL;DR, a long-read summary, a chapter
          breakdown with clickable timestamps, key quotes, and how-to steps.
        </p>

        <div
          className={cn(
            'mx-auto mt-8 flex items-center gap-2 rounded-2xl border bg-card px-2 py-2 text-left shadow-card transition-colors',
            gist.stage === 'error'
              ? 'border-destructive/40'
              : 'border-border focus-within:border-primary/60 focus-within:shadow-card-hover',
          )}
        >
          <Youtube className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
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
          <div className="mt-6">
            <div className="mx-auto h-1 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${Math.round(gist.progress * 100)}%` }}
              />
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">{gist.message}</p>
          </div>
        )}

        {gist.stage === 'error' && gist.error && (
          <div className="mx-auto mt-5 flex max-w-sm items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-foreground">{gist.error}</p>
              <button onClick={gist.reset} className="mt-1 text-xs font-medium text-primary hover:underline">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!isSignedIn && !gist.busy && (
          <p className="mt-4 text-xs text-muted-foreground">
            You’ll sign in first — it keeps your reading list in one place.
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sidebar bits                                                        */
/* ------------------------------------------------------------------ */

function ListItem({
  record,
  active,
  onOpen,
  onDelete,
}: {
  record: { recordId: string; data: VideoRecord; createdBy: string }
  active: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const v = record.data
  return (
    <li>
      <div
        onClick={onOpen}
        className={cn(
          'group flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-colors',
          active ? 'bg-secondary' : 'hover:bg-secondary/60',
        )}
      >
        <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
          <img
            src={v.thumbnail || thumbnailFor(v.videoId)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'line-clamp-2 text-[13px] font-medium leading-snug',
              active ? 'text-foreground' : 'text-foreground/90',
            )}
          >
            {v.title}
          </p>
          {v.channel && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{v.channel}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void onDelete()
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-background hover:text-destructive group-hover:opacity-100"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}

function Account({
  isSignedIn,
  name,
  email,
  imageUrl,
  onSignIn,
}: {
  isSignedIn: boolean
  name?: string
  email?: string
  imageUrl?: string
  onSignIn: () => void
}) {
  return (
    <div className="border-t border-border p-3">
      {isSignedIn ? (
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
            {imageUrl ? (
              <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              (name?.[0] ?? email?.[0] ?? '?').toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">{name || 'Signed in'}</p>
            {email && <p className="truncate text-[11px] text-muted-foreground">{email}</p>}
          </div>
          <button
            onClick={() => signOut()}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onSignIn}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">{children}</div>
  )
}
