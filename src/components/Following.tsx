import { useState } from 'react'
import { getAuthToken } from 'deepspace'
import { Plus, Loader2, Trash2, Youtube, Bell, BellOff, Rss } from 'lucide-react'
import { cn } from './ui/utils'
import { ConfirmModal, useToast } from './ui'
import { useFollows } from '../hooks/useFollows'

async function callAction<T>(
  name: string,
  params: unknown,
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAuthToken()}`,
    },
    body: JSON.stringify(params),
  })
  return res.json()
}

type ChannelInfo = { channelId: string; title: string; thumbnail: string }

export function Following({
  userId,
  digestOn,
  onToggleDigest,
}: {
  userId?: string
  digestOn: boolean
  onToggleDigest: (v: boolean) => void
}) {
  const { follows, create, remove } = useFollows(userId)
  const toast = useToast()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingUnfollow, setPendingUnfollow] = useState<{ id: string; title: string } | null>(null)

  async function addFollow() {
    const v = input.trim()
    if (!v || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await callAction<ChannelInfo>('resolveChannel', { input: v })
      if (!res.success || !res.data) {
        setError(res.error || 'Couldn’t find that channel.')
        return
      }
      const info = res.data
      if (follows.some((f) => f.data.channelId === info.channelId)) {
        setError('You already follow that channel.')
        setInput('')
        return
      }
      await create({
        channelId: info.channelId,
        title: info.title,
        thumbnail: info.thumbnail,
        since: new Date().toISOString(),
        lastCheckedAt: '',
      })
      setInput('')
      toast.success('Following', `New uploads from ${info.title} will be gisted for you.`)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-28 pt-10 sm:px-8 lg:pt-14">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Following</p>
        <h1 className="reading-serif mt-2 text-balance text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[2.4rem]">
          Auto-gist the channels you care about
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          Follow a YouTube channel and Gist will read each new upload for you — the summaries land
          in your reading list, and we’ll email you a digest.
        </p>

        {/* Add channel */}
        <div className="mt-7">
          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl border bg-card px-2 py-2 shadow-card transition-colors',
              error ? 'border-destructive/40' : 'border-border focus-within:border-primary/60',
            )}
          >
            <Youtube className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFollow()}
              disabled={busy}
              placeholder="Channel URL, @handle, or a video link…"
              className="h-10 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              onClick={addFollow}
              disabled={busy || !input.trim()}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Follow
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>

        {/* Digest toggle */}
        <button
          onClick={() => onToggleDigest(!digestOn)}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/50"
        >
          {digestOn ? (
            <Bell className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Email me a digest</p>
            <p className="text-[12px] text-muted-foreground">
              {digestOn ? 'On — a daily summary of new reads.' : 'Off — new reads only appear in your list.'}
            </p>
          </div>
          <span
            className={cn(
              'relative h-5 w-9 shrink-0 rounded-full transition-colors',
              digestOn ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                digestOn ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </span>
        </button>

        {/* Followed channels */}
        <div className="mt-8">
          {follows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <Rss className="h-7 w-7 text-muted-foreground" />
              <p className="reading-serif mt-3 text-lg font-semibold">No channels yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Paste a channel link above to start auto-gisting its uploads.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {follows.map((f) => (
                <li key={f.recordId} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                    {f.data.thumbnail ? (
                      <img
                        src={f.data.thumbnail}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Youtube className="h-5 w-5 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{f.data.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      Following since {formatSince(f.data.since)}
                    </p>
                  </div>
                  <button
                    onClick={() => setPendingUnfollow({ id: f.recordId, title: f.data.title })}
                    className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label={`Unfollow ${f.data.title}`}
                    title="Unfollow"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingUnfollow}
        onClose={() => setPendingUnfollow(null)}
        onConfirm={() => {
          if (pendingUnfollow) void remove(pendingUnfollow.id).catch(() => {})
          setPendingUnfollow(null)
        }}
        title="Unfollow channel?"
        description={
          pendingUnfollow
            ? `Gist will stop auto-reading new uploads from “${pendingUnfollow.title}.” Your existing gists stay.`
            : ''
        }
        confirmText="Unfollow"
        variant="destructive"
      />
    </div>
  )
}

function formatSince(iso?: string): string {
  if (!iso) return 'today'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'today'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
