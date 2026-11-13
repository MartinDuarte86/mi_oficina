export type Layout = 'title' | 'content' | 'image'
export interface Slide {
  id: string
  layout: Layout
  title: string
  body: string // texto; en "content" cada línea es una viñeta
  image?: string // data URL o https
  bg: string
  color: string
  notes?: string
}
export interface Deck {
  version: 1
  slides: Slide[]
}

export const THEMES: { name: string; bg: string; color: string }[] = [
  { name: 'Claro', bg: '#ffffff', color: '#1d2330' },
  { name: 'Oscuro', bg: '#1d2330', color: '#ffffff' },
  { name: 'Azul', bg: '#1f4fd1', color: '#ffffff' },
  { name: 'Verde', bg: '#0f6b47', color: '#ffffff' },
  { name: 'Arena', bg: '#f4ecdc', color: '#3b2f1e' },
]

const rid = () => Math.random().toString(36).slice(2, 10)

export function newSlide(layout: Layout = 'content', theme = THEMES[0]): Slide {
  return { id: rid(), layout, title: '', body: '', bg: theme.bg, color: theme.color }
}

export function emptyDeck(): Deck {
  return { version: 1, slides: [newSlide('title')] }
}

export function parseDeck(content: string): Deck {
  try {
    const d = JSON.parse(content) as Deck
    if (d?.slides?.length) return d
  } catch {}
  return emptyDeck()
}
