import { forwardRef, useImperativeHandle, useState } from 'react'

export interface VideoEmbedHandle {
  /** Jump the player to a timestamp (in seconds) and start playing. */
  seekTo: (seconds: number) => void
}

/**
 * Embedded YouTube player. Seeking is done by reloading the iframe with a
 * `start=` param + autoplay — reliable and dependency-free (no IFrame JS API
 * wiring / origin handshake to get wrong).
 */
export const VideoEmbed = forwardRef<VideoEmbedHandle, { videoId: string; title?: string }>(
  function VideoEmbed({ videoId, title }, ref) {
    const [start, setStart] = useState<number | null>(null)
    const [nonce, setNonce] = useState(0)

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        setStart(Math.max(0, Math.floor(seconds)))
        setNonce((n) => n + 1)
      },
    }))

    const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
    if (start != null) {
      params.set('start', String(start))
      params.set('autoplay', '1')
    }
    const src = `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`

    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-card">
        <iframe
          key={nonce}
          src={src}
          title={title ?? 'YouTube video player'}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  },
)
