import type { CollectionSchema } from 'deepspace/worker'

/**
 * A followed YouTube channel. The auto-gist cron reads each follow's channel
 * RSS feed, summarizes uploads published after `since`, and advances `since`.
 * Per-user (createdBy === the follower); only the owner manages their follows.
 * Read is owner-scoped so the cron (running as the user) can enumerate them.
 */
export const followsSchema: CollectionSchema = {
  name: 'follows',
  columns: [
    { name: 'channelId', storage: 'text', interpretation: 'plain' },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'thumbnail', storage: 'text', interpretation: 'plain' },
    { name: 'since', storage: 'text', interpretation: 'plain' }, // ISO; only gist uploads after this
    { name: 'lastCheckedAt', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: 'own', delete: 'own' },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
