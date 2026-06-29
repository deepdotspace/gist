import type { CollectionSchema } from 'deepspace/worker'

/**
 * A processed video — the "gist". Created once the full pipeline
 * (metadata → transcript → Claude summary) finishes on the client, then
 * read back on the results page and the history list.
 *
 * `transcriptText` is kept so the quiz tab can be generated lazily without
 * re-scraping. Structured fields (chapters / keyQuotes / steps / quiz) are
 * JSON columns — pass values directly, they come back already parsed.
 */
export const videosSchema: CollectionSchema = {
  name: 'videos',
  columns: [
    { name: 'videoId', storage: 'text', interpretation: 'plain' },
    { name: 'url', storage: 'text', interpretation: 'plain' },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'channel', storage: 'text', interpretation: 'plain' },
    { name: 'thumbnail', storage: 'text', interpretation: 'plain' },
    { name: 'duration', storage: 'text', interpretation: 'plain' },
    { name: 'tldr', storage: 'text', interpretation: 'plain' },
    { name: 'deepDive', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'chapters', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'keyQuotes', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'steps', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'transcriptText', storage: 'text', interpretation: 'plain' },
    { name: 'quiz', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'highlights', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'tags', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'chat', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'savedAt', storage: 'text', interpretation: 'plain' },
    { name: 'lastReadAt', storage: 'text', interpretation: 'plain' },
    { name: 'source', storage: 'text', interpretation: 'plain' }, // 'manual' | 'auto'
    { name: 'channelId', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    // Public read so a results link is shareable; only signed-in members
    // can create (each create triggers paid integration calls), and people
    // can only edit/delete their own gists.
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
