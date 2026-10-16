import type { AlbumEntry } from '../data/types'
import { TIER_META } from '../data/types'
import { albumImageUrl } from '../lib/imageUrl'

interface PhotoCardProps {
  entry: AlbumEntry
  onOpen: (entry: AlbumEntry) => void
}

export function PhotoCard({ entry, onOpen }: PhotoCardProps) {
  const tier = TIER_META[entry.tier]

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="group relative w-full cursor-pointer overflow-hidden rounded-2xl border border-white/8 bg-[#141218] text-left shadow-lg shadow-black/40 transition hover:-translate-y-1 hover:border-[#d4a574]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a574]"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <img
          src={albumImageUrl(entry.imageSeed, 480, 600)}
          alt={`${entry.country} · ${entry.title}`}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-60 mix-blend-multiply"
          style={{
            background: `linear-gradient(160deg, ${entry.palette[0]} 0%, transparent 45%, ${entry.palette[2]} 100%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-16">
          <span
            className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-black"
            style={{ backgroundColor: tier.color }}
          >
            {tier.label} · {entry.tierLabel}
          </span>
          <h3
            className="font-[family-name:var(--font-display)] text-xl leading-tight text-white"
          >
            {entry.title}
          </h3>
          <p className="mt-1 text-sm text-white/75">
            {entry.country}
            <span className="text-white/45"> / {entry.countryEn}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {entry.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/55"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  )
}
