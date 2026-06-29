import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { resolveChannel } from '../lib/channel'

export const actions: Record<string, ActionHandler<Env>> = {
  // Resolve a channel URL / @handle / video URL / channelId to channel info.
  // The client then creates the `follows` record itself (so it's owned by the
  // caller). Keyless — avoids the broken YouTube Data API.
  resolveChannel: async ({ params }) => {
    const input = String((params as { input?: unknown }).input ?? '').trim()
    if (!input) return { success: false, error: 'Paste a channel link or @handle.' }
    const info = await resolveChannel(input)
    if (!info) {
      return {
        success: false,
        error: 'Couldn’t find that channel. Try its URL, @handle, or a video link.',
      }
    }
    return { success: true, data: info }
  },
}
