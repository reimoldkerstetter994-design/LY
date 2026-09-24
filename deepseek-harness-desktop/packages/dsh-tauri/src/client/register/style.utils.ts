export function getSidebarStyle() {
  const sidebar = document.querySelector('[data-slot="sidebar"] > div')
  if (!sidebar)
    return null
  const computedStyle = getComputedStyle(sidebar)
  return {
    background: computedStyle.background,
  }
}

export function getOverlayMarkedStyle() {
  const overlay = document.querySelector('div[class^="_mask_"]')
  if (!overlay)
    return null
  const computedStyle = getComputedStyle(overlay)

  return {
    inset: computedStyle.inset,
    background: computedStyle.background,
    backdropFilter: computedStyle.backdropFilter,
    bottom: '-1px',
  }
}

export function getFrameStyle() {
  const frame = document.querySelector('div[class$="_frame"]')
  if (!frame)
    return null
  const computedStyle = getComputedStyle(frame)
  return {
    background: computedStyle.background,
  }
}
