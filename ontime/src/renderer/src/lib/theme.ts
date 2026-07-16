import { MessageFont } from '../../../main/types'

/** Pick a legible foreground (near-black or near-white) for a given bg color. */
export function readableOn(hex: string): string {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  // relative luminance (sRGB approximation)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#141007' : '#ffffff'
}

export const MESSAGE_FONT_STACKS: Record<MessageFont, string> = {
  sans: "'Archivo', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  condensed: "'Arial Narrow', 'Archivo', system-ui, sans-serif",
}

export const MESSAGE_FONT_LABELS: Record<MessageFont, string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Mono',
  condensed: 'Condensed',
}
