import { useMemo, useState } from 'react'
import { ALBUM } from './data/album'
import type { AlbumEntry, AestheticTier, Continent } from './data/types'
import { TIER_META } from './data/types'
import { FilterBar, type SortMode } from './components/FilterBar'
import { Lightbox } from './components/Lightbox'
import { PhotoCard } from './components/PhotoCard'

function compareEntries(a: AlbumEntry, b: AlbumEntry, sort: SortMode): number {
  if (sort === 'tier') return a.tier - b.tier || a.id - b.id
  if (sort === 'country') return a.country.localeCompare(b.country, 'zh')
  return a.continent.localeCompare(b.continent, 'zh') || a.id - b.id
}

export default function App() {
  const [tier, setTier] = useState<AestheticTier | 'all'>('all')
  const [continent, setContinent] = useState<Continent | 'all'>('all')
  const [sort, setSort] = useState<SortMode>('tier')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALBUM.filter((e) => {
      if (tier !== 'all' && e.tier !== tier) return false
      if (continent !== 'all' && e.continent !== continent) return false
      if (!q) return true
      const hay = [
        e.title,
        e.country,
        e.countryEn,
        e.continent,
        e.tierLabel,
        e.mood,
        ...e.tags,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }).sort((a, b) => compareEntries(a, b, sort))
  }, [tier, continent, sort, query])

  const openIndex = openId === null ? -1 : filtered.findIndex((e) => e.id === openId)
  const openEntry = openIndex >= 0 ? filtered[openIndex] : null

  const navigate = (delta: number) => {
    if (filtered.length === 0) return
    const next = (openIndex + delta + filtered.length) % filtered.length
    setOpenId(filtered[next].id)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 md:px-8">
      <header className="mb-10 text-center md:mb-14">
        <p className="text-xs tracking-[0.35em] text-[#d4a574]">WORLD PORTRAIT ALBUM</p>
        <h1
          className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-white md:text-6xl"
        >
          寰宇之美
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/55 md:text-base">
          五十帧女性肖像相册：横跨七大洲文化语境，以「十阶美感」从素颜晨光到史诗肖像，
          记录多元而非单一标准的美。每帧含国家、情绪、标签与策展文案，可按层次浏览。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {(Object.keys(TIER_META) as unknown as AestheticTier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(tier === t ? 'all' : t)}
              className="rounded-full border px-3 py-1 text-xs transition"
              style={{
                borderColor: tier === t ? TIER_META[t].color : 'rgba(255,255,255,0.12)',
                backgroundColor:
                  tier === t ? `${TIER_META[t].color}33` : 'transparent',
                color: tier === t ? TIER_META[t].color : 'rgba(255,255,255,0.5)',
              }}
            >
              {TIER_META[t].label}
            </button>
          ))}
        </div>
      </header>

      <FilterBar
        tier={tier}
        continent={continent}
        sort={sort}
        query={query}
        onTier={setTier}
        onContinent={setContinent}
        onSort={setSort}
        onQuery={setQuery}
        resultCount={filtered.length}
      />

      <section
        className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        aria-label="相册网格"
      >
        {filtered.map((entry) => (
          <PhotoCard key={entry.id} entry={entry} onOpen={(e) => setOpenId(e.id)} />
        ))}
      </section>

      {filtered.length === 0 && (
        <p className="py-20 text-center text-white/45">没有匹配的帧，请调整筛选条件。</p>
      )}

      {openEntry && (
        <Lightbox
          entry={openEntry}
          index={openIndex}
          total={filtered.length}
          onClose={() => setOpenId(null)}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
        />
      )}

      <footer className="mt-16 border-t border-white/8 pt-8 text-center text-xs text-white/35">
        影像为示意占位（Picsum seed），正式出版请替换为拥有肖像权的授权素材。
      </footer>
    </div>
  )
}
