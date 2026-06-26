/** YouTube URL / timestamp helpers — pure, no network. */

/**
 * Extract an 11-char video id from any common YouTube URL shape, or accept a
 * bare id. Returns null when nothing video-id-shaped is found.
 *
 * Handles: watch?v=, youtu.be/, /embed/, /shorts/, /live/, with extra query
 * params, and a raw 11-char id pasted on its own.
 */
export function parseVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Bare id
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw

  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
  }

  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const v = url.searchParams.get('v')
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v

    const m = url.pathname.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]
  }

  return null
}

/** Deterministic thumbnail URL — works without any API call. */
export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

/** Canonical watch URL for a video id. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Parse a timestamp into whole seconds. Accepts:
 *   - numbers / numeric strings of seconds ("83", "83.5")
 *   - "m:ss", "h:mm:ss"
 * Returns null when it can't be parsed.
 */
export function timestampToSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s) return null

  if (/^\d+(\.\d+)?$/.test(s)) return Math.floor(parseFloat(s))

  const parts = s.split(':').map((p) => p.trim())
  if (parts.length < 2 || parts.length > 3) return null
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null

  const nums = parts.map(parseFloat)
  let secs = 0
  for (const n of nums) secs = secs * 60 + n
  return Math.floor(secs)
}

/** Format whole seconds as "m:ss" or "h:mm:ss". */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Human duration label from an ISO 8601 duration ("PT1H2M3S") or seconds. */
export function formatDuration(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'number' && Number.isFinite(value)) return formatTimestamp(value)
  if (typeof value !== 'string') return ''
  const s = value.trim()
  if (!s) return ''

  // ISO 8601 duration
  const iso = s.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (iso) {
    const h = parseInt(iso[1] ?? '0', 10)
    const m = parseInt(iso[2] ?? '0', 10)
    const sec = parseInt(iso[3] ?? '0', 10)
    return formatTimestamp(h * 3600 + m * 60 + sec)
  }

  // Plain seconds
  if (/^\d+(\.\d+)?$/.test(s)) return formatTimestamp(parseFloat(s))

  // Already h:mm:ss-ish — pass through
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s

  return ''
}
