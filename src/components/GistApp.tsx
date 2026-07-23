import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  Search,
  Star,
  Flame,
  Rss,
} from 'lucide-react'
import { cn } from './ui/utils'
import { ConfirmModal } from './ui'
import { Reader } from './Reader'
import { Following } from './Following'
import { useGist, type VideoRecord } from '../hooks/useGist'
import { useStats } from '../hooks/useStats'
import { parseVideoId, thumbnailFor } from '../lib/youtube'

export function GistApp({ selectedId, view }: { selectedId?: string; view?: 'following' }) {
  const navigate = useNavigate()
  const gist = useGist()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'saved' | string>('all') // 'all' | 'saved' | 'tag:<t>'
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const { stats, setEmailDigest } = useStats(user?.id)
  const digestOn = stats?.emailDigest == null ? true : Number(stats.emailDigest) === 1

  const { records, status } = useQuery<VideoRecord>('videos', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { remove, put } = useMutations<VideoRecord>('videos')
  const mine = user?.id ? records.filter((r) => r.createdBy === user.id) : []
  const selected = selectedId ? records.find((r) => r.recordId === selectedId) : undefined
  const canEdit = !!user?.id && selected?.createdBy === user.id

  const allTags = Array.from(
    new Set(mine.flatMap((r) => (Array.isArray(r.data.tags) ? r.data.tags : []))),
  ).sort()

  const q = search.trim().toLowerCase()
  const visible = mine.filter((r) => {
    const v = r.data
    if (filter === 'saved' && !v.savedAt) return false
    if (filter.startsWith('tag:') && !(v.tags || []).includes(filter.slice(4))) return false
    if (q) {
      const hay = [v.title, v.channel, v.tldr, (v.tags || []).join(' '), v.transcriptText]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const toggleSave = (r: { recordId: string; data: VideoRecord }) =>
    put(r.recordId, { savedAt: r.data.savedAt ? '' : new Date().toISOString() }).catch(() => {})

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
    if (selectedId || view) navigate('/home')
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
              <img src="/favicon.svg?v=2" alt="" className="h-6 w-6 rounded-md" />

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
              !selectedId && !view
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:bg-secondary',
            )}
          >
            <Plus className="h-4 w-4" />
            New gist
          </button>

          <button
            onClick={() => {
              navigate('/following')
              setDrawerOpen(false)
            }}
            className={cn(
              'mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              view === 'following'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Rss className="h-4 w-4" />
            Following
          </button>
        </div>

        {/* Search */}
        {mine.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your gists…"
                className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Clear search">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        {mine.length > 0 && (allTags.length > 0 || mine.some((r) => r.data.savedAt)) && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </FilterChip>
            {mine.some((r) => r.data.savedAt) && (
              <FilterChip active={filter === 'saved'} onClick={() => setFilter('saved')}>
                <Star className="h-3 w-3" /> Saved
              </FilterChip>
            )}
            {allTags.map((t) => (
              <FilterChip
                key={t}
                active={filter === `tag:${t}`}
                onClick={() => setFilter(filter === `tag:${t}` ? 'all' : `tag:${t}`)}
              >
                {t}
              </FilterChip>
            ))}
          </div>
        )}

        {/* Reading list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {status === 'loading' ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="px-2 py-3 text-[13px] leading-relaxed text-muted-foreground">
              {isSignedIn
                ? 'Nothing yet. Paste a YouTube link to make your first gist.'
                : 'Sign in to save the videos you read.'}
            </p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-muted-foreground">No gists match.</p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((r) => (
                <ListItem
                  key={r.recordId}
                  record={r}
                  active={r.recordId === selectedId}
                  saved={!!r.data.savedAt}
                  unread={!r.data.lastReadAt}
                  onOpen={() => navigate(`/v/${r.recordId}`)}
                  onToggleSave={() => toggleSave(r)}
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
          streak={stats?.streak ?? 0}
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

        {view === 'following' ? (
          isSignedIn ? (
            <Following userId={user?.id} digestOn={digestOn} onToggleDigest={setEmailDigest} />
          ) : (
            <Centered>
              <div className="text-center">
                <Rss className="mx-auto h-9 w-9 text-muted-foreground" />
                <p className="reading-serif mt-3 text-xl font-semibold">Follow your channels</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Sign in to follow channels and get their uploads auto-gisted.
                </p>
                <button onClick={() => setShowAuth(true)} className="mt-3 text-sm font-medium text-primary hover:underline">
                  Sign in
                </button>
              </div>
            </Centered>
          )
        ) : selectedId ? (
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
  saved,
  unread,
  onOpen,
  onToggleSave,
  onDelete,
}: {
  record: { recordId: string; data: VideoRecord; createdBy: string }
  active: boolean
  saved: boolean
  unread: boolean
  onOpen: () => void
  onToggleSave: () => void
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
              'line-clamp-2 text-[13px] leading-snug',
              active ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
            )}
          >
            {unread && (
              <span
                aria-label="Unread"
                className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-primary align-middle"
              />
            )}
            {v.title}
          </p>
          {v.channel && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{v.channel}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSave()
            }}
            className={cn(
              'rounded p-1 transition-colors hover:bg-background',
              saved
                ? 'text-primary'
                : 'text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100',
            )}
            aria-label={saved ? 'Unsave' : 'Save'}
            title={saved ? 'Saved' : 'Save'}
          >
            <Star className={cn('h-3.5 w-3.5', saved && 'fill-current')} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              void onDelete()
            }}
            className="rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-background hover:text-destructive group-hover:opacity-100"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  )
}

function FilterChip({
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
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Account({
  isSignedIn,
  name,
  email,
  imageUrl,
  streak,
  onSignIn,
}: {
  isSignedIn: boolean
  name?: string
  email?: string
  imageUrl?: string
  streak: number
  onSignIn: () => void
}) {
  return (
    <div className="border-t border-border p-3">
      {isSignedIn ? (
        <>
          {streak > 0 && (
            <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[12px] font-medium text-foreground">
              <Flame className="h-3.5 w-3.5 text-primary" />
              {streak}-day reading streak
            </div>
          )}
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
        </>
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
