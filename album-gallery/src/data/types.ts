export type AestheticTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type Continent =
  | '亚洲'
  | '欧洲'
  | '非洲'
  | '北美洲'
  | '南美洲'
  | '大洋洲'
  | '中东'

export interface AlbumEntry {
  id: number
  title: string
  country: string
  countryEn: string
  continent: Continent
  tier: AestheticTier
  tierLabel: string
  mood: string
  palette: [string, string, string]
  tags: string[]
  caption: string
  imageSeed: string
}

export const TIER_META: Record<
  AestheticTier,
  { label: string; subtitle: string; color: string }
> = {
  1: { label: '一阶', subtitle: '素颜晨光', color: '#a8c4b8' },
  2: { label: '二阶', subtitle: '清水芙蓉', color: '#b8d4e8' },
  3: { label: '三阶', subtitle: '温婉如玉', color: '#e8d4c4' },
  4: { label: '四阶', subtitle: '明眸善睐', color: '#d4b8c8' },
  5: { label: '五阶', subtitle: '气韵生动', color: '#c8b878' },
  6: { label: '六阶', subtitle: '华彩流光', color: '#e8a878' },
  7: { label: '七阶', subtitle: '墨韵东方', color: '#8a9098' },
  8: { label: '八阶', subtitle: '摩登都市', color: '#9898c8' },
  9: { label: '九阶', subtitle: '先锋解构', color: '#c87898' },
  10: { label: '十阶', subtitle: '史诗肖像', color: '#d4a574' },
}
