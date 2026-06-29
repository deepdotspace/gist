import { useQuery, useMutations } from 'deepspace'

export interface FollowRecord {
  channelId: string
  title: string
  thumbnail: string
  since: string
  lastCheckedAt?: string
}

/** The signed-in user's followed channels. */
export function useFollows(userId: string | undefined) {
  const { records, status } = useQuery<FollowRecord>('follows', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { create, remove } = useMutations<FollowRecord>('follows')
  const follows = userId ? records.filter((r) => r.createdBy === userId) : []
  return { follows, status, create, remove }
}
