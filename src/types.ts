export type AestheticLevel = 1 | 2 | 3 | 4 | 5;

export interface AlbumEntry {
  id: number;
  title: string;
  country: string;
  countryZh: string;
  region: string;
  aestheticLevel: AestheticLevel;
  aestheticLabel: string;
  styleTags: string[];
  mood: string;
  palette: [string, string, string];
  photographerNote: string;
  imageUrl: string;
}

export const AESTHETIC_LEVELS: Record<
  AestheticLevel,
  { label: string; subtitle: string }
> = {
  1: { label: "素真", subtitle: "肌理与呼吸，近乎无妆的纪实感" },
  2: { label: "日常", subtitle: "街头与自然光里的生活美学" },
  3: { label: "叙形", subtitle: "时装、建筑与文化符号的编织" },
  4: { label: "典仪", subtitle: "仪式感、织物与历史质感的升华" },
  5: { label: "诗境", subtitle: "超现实光影与梦境式构图" },
};
