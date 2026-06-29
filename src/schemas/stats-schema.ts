import type { CollectionSchema } from 'deepspace/worker'

/**
 * Per-user reading stats (one row per user, recordId === userId). Powers the
 * reading-streak badge. Owner-only read/write — nobody needs to see anyone
 * else's streak.
 */
export const statsSchema: CollectionSchema = {
  name: 'stats',
  columns: [
    { name: 'lastActiveDate', storage: 'text', interpretation: 'plain' }, // YYYY-MM-DD
    { name: 'streak', storage: 'number', interpretation: 'plain' },
    { name: 'longest', storage: 'number', interpretation: 'plain' },
    { name: 'totalRead', storage: 'number', interpretation: 'plain' },
    { name: 'emailDigest', storage: 'number', interpretation: 'plain' }, // 1 = on (default), 0 = off
    { name: 'lastDigestAt', storage: 'text', interpretation: 'plain' }, // ISO of last digest email
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
