/** 示意影像：Picsum 按 seed 稳定出图，可改为自有 CDN */
export function albumImageUrl(seed: string, width = 600, height = 750): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`
}
