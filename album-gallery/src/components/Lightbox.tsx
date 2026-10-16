import { useEffect } from 'react'
import type { AlbumEntry } from '../data/types'
import { TIER_META } from '../data/types'
import { albumImageUrl } from '../lib/imageUrl'

interface LightboxProps {
  entry: AlbumEntry
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export function Lightbox({
  entry,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const tier = TIER_META[entry.tier]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121018] shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1 text-sm text-white/80 hover:bg-black/70"
        >
          关闭
        </button>
        <div className="relative min-h-[40vh] flex-1 bg-black md:min-h-0">
          <img
            src={albumImageUrl(entry.imageSeed, 900, 1125)}
            alt={entry.title}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex w-full flex-col justify-between p-6 md:w-[min(100%,22rem)] md:p-8">
          <div>
            <p className="text-xs tracking-[0.2em] text-[#d4a574]">
              第 {index + 1} / {total} 帧
            </p>
            <h2
              className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white"
            >
              {entry.title}
            </h2>
            <p className="mt-2 text-white/70">
              {entry.country} · {entry.continent}
            </p>
            <div
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tier.color }}
              />
              <span className="text-sm text-white/85">
                {tier.label} {tier.subtitle}（美感层次 {entry.tier}）
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              {entry.caption}
            </p>
            <p className="mt-2 text-xs text-white/40">情绪：{entry.mood}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onPrev}
              className="flex-1 rounded-xl border border-white/15 py-2 text-sm text-white/80 hover:bg-white/5"
            >
              上一帧
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex-1 rounded-xl bg-[#d4a574]/20 py-2 text-sm text-[#e8d4bc] hover:bg-[#d4a574]/30"
            >
              下一帧
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
