import 'server-only'
import { neon } from '@neondatabase/serverless'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

export type Kind = 'doc' | 'sheet' | 'slides' | 'file'

export interface ItemMeta {
  id: string
  kind: Kind
  title: string
  mime: string | null
  size: number
  updated_at: string
}
export interface Item extends ItemMeta {
  content: string
}

interface Store {
  list(): Promise<ItemMeta[]>
  get(id: string): Promise<Item | null>
  create(i: Omit<Item, 'id' | 'updated_at'>): Promise<ItemMeta>
  update(id: string, patch: Partial<Pick<Item, 'title' | 'content'>>): Promise<ItemMeta | null>
  remove(id: string): Promise<void>
}

const newId = () => crypto.randomBytes(9).toString('base64url')

// ---------- Postgres (Neon) ----------
function pgStore(url: string): Store {
  const sql = neon(url)
  let ready: Promise<unknown> | null = null
  const init = () =>
    (ready ??= sql`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      mime TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  const meta = 'id, kind, title, mime, size, updated_at'
  return {
    async list() {
      await init()
      return (await sql.query(`SELECT ${meta} FROM items ORDER BY updated_at DESC`)) as ItemMeta[]
    },
    async get(id) {
      await init()
      const r = (await sql`SELECT * FROM items WHERE id = ${id}`) as Item[]
      return r[0] ?? null
    },
    async create(i) {
      await init()
      const id = newId()
      const r = await sql.query(
        `INSERT INTO items (id, kind, title, content, mime, size) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${meta}`,
        [id, i.kind, i.title, i.content, i.mime, i.size],
      )
      return (r as ItemMeta[])[0]
    },
    async update(id, p) {
      await init()
      const r = await sql.query(
        `UPDATE items SET title = COALESCE($2, title), content = COALESCE($3, content),
         size = CASE WHEN $3::text IS NULL THEN size ELSE length($3::text) END, updated_at = now()
         WHERE id = $1 RETURNING ${meta}`,
        [id, p.title ?? null, p.content ?? null],
      )
      return (r as ItemMeta[])[0] ?? null
    },
    async remove(id) {
      await init()
      await sql`DELETE FROM items WHERE id = ${id}`
    },
  }
}

// ---------- Archivos locales (solo desarrollo) ----------
function fileStore(): Store {
  const dir = path.join(process.cwd(), 'data')
  const file = (id: string) => path.join(dir, `${id.replace(/[^\w-]/g, '')}.json`)
  const read = async (id: string) => {
    try {
      return JSON.parse(await fs.readFile(file(id), 'utf8')) as Item
    } catch {
      return null
    }
  }
  const strip = ({ content: _c, ...m }: Item): ItemMeta => m
  return {
    async list() {
      await fs.mkdir(dir, { recursive: true })
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'))
      const items = (await Promise.all(names.map((n) => read(n.slice(0, -5))))).filter(Boolean) as Item[]
      return items.map(strip).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },
    get: read,
    async create(i) {
      await fs.mkdir(dir, { recursive: true })
      const item: Item = { ...i, id: newId(), updated_at: new Date().toISOString() }
      await fs.writeFile(file(item.id), JSON.stringify(item))
      return strip(item)
    },
    async update(id, p) {
      const cur = await read(id)
      if (!cur) return null
      const next: Item = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)), updated_at: new Date().toISOString() }
      if (p.content != null) next.size = p.content.length
      await fs.writeFile(file(id), JSON.stringify(next))
      return strip(next)
    },
    async remove(id) {
      await fs.rm(file(id), { force: true })
    },
  }
}

let store: Store | null = null
export function db(): Store {
  if (store) return store
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (url) return (store = pgStore(url))
  if (process.env.VERCEL) throw new Error('Falta DATABASE_URL: conecta una base Neon en Vercel → Storage')
  return (store = fileStore())
}
