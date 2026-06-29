/**
 * YouTube channel helpers — keyless. Used by the follow flow and the auto-gist
 * cron. Avoids the (currently broken) YouTube Data API entirely:
 *   - resolveChannel: scrape a channel/handle/video URL for its channelId.
 *   - fetchChannelFeed: read the public per-channel RSS feed for recent uploads.
 *
 * Worker-safe (no client imports; uses global fetch + regex, since Cloudflare
 * Workers have no DOMParser).
 */

const UA = 'Gist/1.0 (+https://gist.app.space)'
const CHANNEL_ID = /(UC[\w-]{20,})/

export interface ChannelInfo {
  channelId: string
  title: string
  thumbnail: string
}

export interface FeedVideo {
  videoId: string
  title: string
  published: string // ISO
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

/** Resolve a channel URL / @handle / video URL / raw channelId to channel info. */
export async function resolveChannel(input: string): Promise<ChannelInfo | null> {
  const raw = input.trim()

  // Direct channelId in a /channel/UC… URL or pasted bare.
  let channelId = ''
  const direct = raw.match(/channel\/(UC[\w-]{20,})/) || raw.match(/^(UC[\w-]{20,})$/)
  if (direct) channelId = direct[1]

  // Figure out a page to fetch for the rest (and for channelId if unknown).
  let pageUrl: string
  if (channelId) pageUrl = `https://www.youtube.com/channel/${channelId}`
  else if (/^https?:\/\//.test(raw)) pageUrl = raw
  else pageUrl = `https://www.youtube.com/@${raw.replace(/^@/, '')}`

  let html = ''
  try {
    const r = await fetch(pageUrl, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' } })
    if (r.ok) html = await r.text()
  } catch {
    /* ignore — handled below */
  }

  if (!channelId) {
    const m =
      html.match(/"(?:channelId|externalId)":"(UC[\w-]{20,})"/) ||
      html.match(/channel\/(UC[\w-]{20,})/) ||
      html.match(CHANNEL_ID)
    if (m) channelId = m[1]
  }
  if (!channelId) return null

  // Title/avatar — prefer the RSS feed's channel title (stable), fall back to og.
  let title = ''
  let thumbnail = ''
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)
  if (og) thumbnail = og[1]

  try {
    const feed = await fetchChannelFeedRaw(channelId)
    title = feed.title
  } catch {
    /* ignore */
  }
  if (!title) {
    const t =
      html.match(/<meta property="og:title" content="([^"]+)"/) ||
      html.match(/"author":"([^"]+)"/)
    if (t) title = decodeEntities(t[1])
  }

  return { channelId, title: title || 'YouTube channel', thumbnail }
}

async function fetchChannelFeedRaw(
  channelId: string,
): Promise<{ title: string; videos: FeedVideo[] }> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`feed ${r.status}`)
  const xml = await r.text()

  // Feed-level title is the first <title> before any <entry>.
  const head = xml.split('<entry>')[0]
  const titleMatch = head.match(/<title>([^<]*)<\/title>/)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''

  const videos: FeedVideo[] = []
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  for (const e of entries) {
    const vid = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
    const t = e.match(/<title>([^<]*)<\/title>/)?.[1]
    const pub = e.match(/<published>([^<]+)<\/published>/)?.[1]
    if (vid) {
      videos.push({
        videoId: vid,
        title: t ? decodeEntities(t).trim() : '',
        published: pub ?? '',
      })
    }
  }
  return { title, videos }
}

/** Recent uploads for a channel, newest first (as the feed orders them). */
export async function fetchChannelFeed(channelId: string): Promise<FeedVideo[]> {
  const { videos } = await fetchChannelFeedRaw(channelId)
  return videos
}
