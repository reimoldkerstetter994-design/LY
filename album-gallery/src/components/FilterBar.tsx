import { CONTINENTS } from '../data/album'
import type { AestheticTier, Continent } from '../data/types'
import { TIER_META } from '../data/types'

export type SortMode = 'tier' | 'country' | 'continent'

interface FilterBarProps {
  tier: AestheticTier | 'all'
  continent: Continent | 'all'
  sort: SortMode
  query: string
  onTier: (t: AestheticTier | 'all') => void
  onContinent: (c: Continent | 'all') => void
  onSort: (s: SortMode) => void
  onQuery: (q: string) => void
  resultCount: number
}

export function FilterBar({
  tier,
  continent,
  sort,
  query,
  onTier,
  onContinent,
  onSort,
  onQuery,
  resultCount,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-white/8 bg-[#0c0b0f]/92 px-4 py-4 backdrop-blur-md md:mx-0 md:rounded-2xl md:border md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="flex min-w-[140px] flex-col gap-1 text-xs text-white/45">
            美感层次
            <select
              value={tier}
              onChange={(e) =>
                onTier(
                  e.target.value === 'all'
                    ? 'all'
                    : Number(e.target.value) as AestheticTier,
                )
              }
              className="rounded-lg border border-white/12 bg-[#16141c] px-3 py-2 text-sm text-white"
            >
              <option value="all">全部十阶</option>
              {(Object.keys(TIER_META) as unknown as AestheticTier[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {TIER_META[t].label} · {TIER_META[t].subtitle}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col gap-1 text-xs text-white/45">
            洲别
            <select
              value={continent}
              onChange={(e) =>
                onContinent(e.target.value as Continent | 'all')
              }
              className="rounded-lg border border-white/12 bg-[#16141c] px-3 py-2 text-sm text-white"
            >
              <option value="all">全球</option>
              {CONTINENTS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col gap-1 text-xs text-white/45">
            排序
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as SortMode)}
              className="rounded-lg border border-white/12 bg-[#16141c] px-3 py-2 text-sm text-white"
            >
              <option value="tier">按美感层次</option>
              <option value="country">按国家</option>
              <option value="continent">按洲别</option>
            </select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-white/45">
            搜索
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="国家、标题、标签…"
              className="rounded-lg border border-white/12 bg-[#16141c] px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </label>
        </div>
        <p className="text-sm text-white/50 lg:pb-2">
          显示 <span className="text-[#d4a574]">{resultCount}</span> / 50 帧
        </p>
      </div>
    </div>
  )
}
