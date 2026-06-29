/**
 * Background-job handlers (invoked by AppJobRoom in worker.ts).
 *
 * `gist-video` runs the full URL→gist pipeline durably in the worker, so it
 * survives the user closing the tab and shares one code path with the
 * auto-gist cron (src/cron.ts). The finished `videos` record is created as the
 * user who enqueued the job (`job.enqueuedBy`), so it lands in their list;
 * integrations are billed to the app owner via buildCronContext.
 */

import { buildCronContext, type Job, type JobContext } from 'deepspace/worker'
import { buildGist } from './lib/server-pipeline'
import { parseVideoId } from './lib/youtube'

// CronEnv isn't exported; the worker Env structurally satisfies buildCronContext.
type GistJobEnv = { APP_NAME: string; OWNER_USER_ID?: string }
type CronEnvArg = Parameters<typeof buildCronContext>[0]

export async function runJob(
  job: Job,
  ctx: JobContext,
  env: GistJobEnv,
): Promise<unknown | void> {
  if (job.type === 'gist-video') {
    const { url, source, channelId } = (job.payload ?? {}) as {
      url?: string
      source?: string
      channelId?: string
    }
    const videoId = url ? parseVideoId(url) : null
    if (!videoId) throw new Error('That doesn’t look like a YouTube link.')

    // Act as the enqueuing user for the record write; integrations bill the owner.
    const actingUserId = job.enqueuedBy || env.OWNER_USER_ID || ''
    const cx = buildCronContext(env as unknown as CronEnvArg, actingUserId, `app:${env.APP_NAME}`)

    ctx.progress(0.05, 'Starting…')
    const data = await buildGist(
      (endpoint, body) => cx.integrations.call(endpoint, body as Record<string, unknown>),
      videoId,
      {
        signal: ctx.signal,
        onProgress: (p, msg) => ctx.progress(p, msg),
        source: source ?? 'manual',
        channelId,
      },
    )

    const created = (await cx.records.create(
      'videos',
      data as unknown as Record<string, unknown>,
    )) as { recordId: string }
    return { recordId: created.recordId, title: data.title }
  }

  throw new Error(`Unknown job type: ${job.type}`)
}
