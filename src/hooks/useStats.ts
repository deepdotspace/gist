import { useEffect, useRef } from 'react'
import { useQuery, useMutations } from 'deepspace'

export interface Stats {
  lastActiveDate: string // YYYY-MM-DD (local)
  streak: number
  longest: number
  totalRead: number
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`)
  const db = new Date(`${b}T00:00:00`)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/**
 * Per-user reading streak. Reads the user's `stats` row and, once per session,
 * records "active today" — incrementing the streak on consecutive days and
 * resetting it after a gap. One row per user (recordId === userId).
 */
export function useStats(userId: string | null | undefined) {
  const { records, status } = useQuery<Stats>('stats')
  const { create, put } = useMutations<Stats>('stats')
  const bumped = useRef(false)

  // One stats row per user, identified by its creator.
  const mine = userId ? records.find((r) => r.createdBy === userId) : undefined
  const stats = mine?.data

  useEffect(() => {
    if (!userId || status !== 'ready' || bumped.current) return
    bumped.current = true
    const today = todayStr()

    if (!mine) {
      void create({ lastActiveDate: today, streak: 1, longest: 1, totalRead: 1 }).catch(() => {})
      return
    }
    if (mine.data.lastActiveDate === today) return // already counted today

    const gap = mine.data.lastActiveDate ? daysBetween(mine.data.lastActiveDate, today) : 999
    const streak = gap === 1 ? (mine.data.streak || 0) + 1 : 1
    void put(mine.recordId, {
      lastActiveDate: today,
      streak,
      longest: Math.max(mine.data.longest || 0, streak),
      totalRead: (mine.data.totalRead || 0) + 1,
    }).catch(() => {})
  }, [userId, status, mine, create, put])

  // Reset the once-per-session guard when the user changes.
  useEffect(() => {
    bumped.current = false
  }, [userId])

  return { stats }
}
