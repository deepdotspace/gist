/**
 * Cron tasks. `auto-gist-digest` runs daily: for every followed channel it
 * reads the public RSS feed, auto-gists uploads published since the last
 * check (as the follower, billed to the owner), then emails each user a
 * digest of their new reads.
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import { buildGist } from './lib/server-pipeline'
import { fetchChannelFeed } from './lib/channel'

export const tasks: CronTask[] = [
  { name: 'auto-gist-digest', schedule: '0 8 * * *', timezone: 'America/New_York' },
]

type CronEnvArg = Parameters<typeof buildCronContext>[0]
type Env = { APP_NAME: string; OWNER_USER_ID: string }
type Envelope = { recordId: string; data: Record<string, unknown>; createdBy: string }

// Bound owner cost / cron wall-time per run.
const MAX_GISTS_PER_RUN = 8

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === 'auto-gist-digest') {
    await runAutoGistDigest(env)
  }
}

export async function runAutoGistDigest(env: Env): Promise<void> {
  const scope = `app:${env.APP_NAME}`
  const owner = buildCronContext(env as unknown as CronEnvArg, env.OWNER_USER_ID, scope)

  const follows = (await owner.records.query('follows', { limit: 1000 })) as Envelope[]
  if (!follows.length) return

  const users = (await owner.records.query('users', { limit: 5000 })) as Envelope[]
  const emailById = new Map(users.map((u) => [u.recordId, String(u.data.email ?? '')]))
  const stats = (await owner.records.query('stats', { limit: 5000 })) as Envelope[]
  const statsByUser = new Map(stats.map((s) => [s.createdBy, s]))

  // Group follows by the user who created them.
  const byUser = new Map<string, Envelope[]>()
  for (const f of follows) {
    const list = byUser.get(f.createdBy) ?? []
    list.push(f)
    byUser.set(f.createdBy, list)
  }

  const nowIso = new Date().toISOString()
  let budget = MAX_GISTS_PER_RUN

  for (const [userId, userFollows] of byUser) {
    const cx = buildCronContext(env as unknown as CronEnvArg, userId, scope)
    const call = (endpoint: string, body: unknown) =>
      cx.integrations.call(endpoint, body as Record<string, unknown>)
    const newGists: { title: string; recordId: string; channel: string }[] = []

    for (const follow of userFollows) {
      if (budget <= 0) break
      const f = follow.data
      const channelId = String(f.channelId ?? '')
      if (!channelId) continue

      let feed
      try {
        feed = await fetchChannelFeed(channelId)
      } catch {
        continue
      }

      const since = f.since ? Date.parse(String(f.since)) : 0
      const fresh = feed
        .filter((v) => v.published && Date.parse(v.published) > since)
        .sort((a, b) => Date.parse(a.published) - Date.parse(b.published))

      let newest = since
      for (const v of fresh) {
        if (budget <= 0) break
        try {
          const data = await buildGist(call, v.videoId, { source: 'auto', channelId })
          const created = (await cx.records.create(
            'videos',
            data as unknown as Record<string, unknown>,
          )) as { recordId: string }
          newGists.push({ title: data.title, recordId: created.recordId, channel: String(f.title ?? '') })
          budget--
        } catch {
          // skip a single failing video (e.g. no captions, content-filter)
        }
        newest = Math.max(newest, Date.parse(v.published))
      }

      try {
        await cx.records.update('follows', follow.recordId, {
          since: newest > since ? new Date(newest).toISOString() : f.since ?? nowIso,
          lastCheckedAt: nowIso,
        })
      } catch {
        /* best-effort */
      }
    }

    // Digest email (default on unless explicitly disabled).
    const st = statsByUser.get(userId)
    const digestOn = !st || st.data.emailDigest == null || Number(st.data.emailDigest) === 1
    const email = emailById.get(userId)
    if (newGists.length && digestOn && email) {
      try {
        await owner.integrations.call('email/send', {
          from: 'Gist <gist@updates.app.space>',
          to: email,
          subject:
            newGists.length === 1
              ? `Your Gist digest — 1 new read`
              : `Your Gist digest — ${newGists.length} new reads`,
          html: renderDigest(env.APP_NAME, newGists),
        })
        if (st) await cx.records.update('stats', st.recordId, { lastDigestAt: nowIso })
      } catch {
        /* email best-effort */
      }
    }
  }
}

function renderDigest(
  appName: string,
  gists: { title: string; recordId: string; channel: string }[],
): string {
  const base = `https://${appName}.app.space`
  const items = gists
    .map(
      (g) => `
      <tr><td style="padding:10px 0;border-bottom:1px solid #e7e5e4;">
        <a href="${base}/v/${g.recordId}" style="color:#1c1917;text-decoration:none;font-weight:600;font-size:16px;">${escapeHtml(g.title)}</a>
        <div style="color:#78716c;font-size:13px;margin-top:2px;">${escapeHtml(g.channel)} · ready to read</div>
      </td></tr>`,
    )
    .join('')
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8f7f5;padding:28px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:28px;">
      <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#0284c7;font-weight:600;">Gist</div>
      <h1 style="font-size:22px;margin:8px 0 4px;color:#1c1917;">Fresh from the channels you follow</h1>
      <p style="color:#78716c;font-size:14px;margin:0 0 12px;">We read ${gists.length} new ${gists.length === 1 ? 'video' : 'videos'} so you don't have to.</p>
      <table style="width:100%;border-collapse:collapse;">${items}</table>
      <a href="${base}" style="display:inline-block;margin-top:20px;background:#0284c7;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Open Gist</a>
      <p style="color:#a8a29e;font-size:12px;margin-top:20px;">You're getting this because you follow channels on Gist. Turn digests off in the Following tab.</p>
    </div>
  </div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
