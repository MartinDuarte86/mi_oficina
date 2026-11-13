'use client'
// Conversión entre formatos de Office y los formatos internos de los editores.

/* ---------------- Word (.docx) → HTML ---------------- */
export async function docxToHtml(buf: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const r = await mammoth.convertToHtml({ arrayBuffer: buf })
  return r.value
}

/* ---------------- HTML → Word (.docx) ---------------- */
export async function htmlToDocx(html: string, title: string): Promise<Blob> {
  const r = await fetch('/api/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, title }),
  })
  if (!r.ok) throw new Error('No se pudo generar el .docx')
  return r.blob()
}

/* ---------------- Excel (.xlsx) ↔ Univer ---------------- */
type CellData = Record<number, Record<number, { v?: string | number | boolean; f?: string; s?: string }>>
interface SheetData {
  id: string
  name: string
  rowCount: number
  columnCount: number
  cellData: CellData
  mergeData?: { startRow: number; endRow: number; startColumn: number; endColumn: number }[]
  columnData?: Record<number, { w: number }>
}
export interface WorkbookData {
  id: string
  name: string
  appVersion?: string
  locale?: string
  styles: Record<string, unknown>
  sheetOrder: string[]
  sheets: Record<string, SheetData>
}

export function emptyWorkbook(name = 'Libro'): WorkbookData {
  return {
    id: 'wb',
    name,
    styles: {},
    sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Hoja1', rowCount: 1000, columnCount: 26, cellData: {} } },
  }
}

export async function xlsxToWorkbook(buf: ArrayBuffer, name: string): Promise<WorkbookData> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const out: WorkbookData = { id: 'wb', name, styles: {}, sheetOrder: [], sheets: {} }
  const styleIds = new Map<string, string>()
  const styleFor = (cell: import('exceljs').Cell) => {
    const st: Record<string, unknown> = {}
    const f = cell.font
    if (f?.bold) st.bl = 1
    if (f?.italic) st.it = 1
    if (f?.size) st.fs = f.size
    if (f?.color?.argb) st.cl = { rgb: '#' + f.color.argb.slice(-6) }
    const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined
    if (fill?.type === 'pattern' && fill.fgColor?.argb) st.bg = { rgb: '#' + fill.fgColor.argb.slice(-6) }
    if (cell.numFmt && cell.numFmt !== 'General') st.n = { pattern: cell.numFmt }
    if (!Object.keys(st).length) return undefined
    const key = JSON.stringify(st)
    if (!styleIds.has(key)) {
      const id = 'st' + styleIds.size
      styleIds.set(key, id)
      out.styles[id] = st
    }
    return styleIds.get(key)
  }
  let n = 0
  wb.eachSheet((ws) => {
    const id = 's' + ++n
    const cellData: CellData = {}
    let maxR = 0
    let maxC = 0
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const ri = r - 1
        const ci = c - 1
        maxR = Math.max(maxR, ri)
        maxC = Math.max(maxC, ci)
        const v = cell.value as unknown
        const d: { v?: string | number | boolean; f?: string; s?: string } = {}
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>
          if ('formula' in o || 'sharedFormula' in o) {
            if (typeof o.formula === 'string') d.f = '=' + o.formula
            const res = o.result
            if (res != null && typeof res !== 'object') d.v = res as string | number | boolean
          } else if ('richText' in o) {
            d.v = (o.richText as { text: string }[]).map((t) => t.text).join('')
          } else if ('text' in o) {
            d.v = String(o.text)
          } else if (v instanceof Date) {
            // número de serie de Excel
            d.v = v.getTime() / 86400000 + 25569
          }
        } else if (v != null) {
          d.v = v as string | number | boolean
        }
        const s = styleFor(cell)
        if (s) d.s = s
        ;(cellData[ri] ??= {})[ci] = d
      })
    })
    const columnData: Record<number, { w: number }> = {}
    ws.columns?.forEach((col, i) => {
      if (col?.width) columnData[i] = { w: Math.round(col.width * 7.5) }
    })
    const mergeData: SheetData['mergeData'] = []
    const merges = (ws as unknown as { _merges?: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges
    for (const m of Object.values(merges ?? {})) {
      const { top, left, bottom, right } = m.model
      mergeData.push({ startRow: top - 1, endRow: bottom - 1, startColumn: left - 1, endColumn: right - 1 })
    }
    out.sheetOrder.push(id)
    out.sheets[id] = {
      id,
      name: ws.name,
      rowCount: Math.max(1000, maxR + 100),
      columnCount: Math.max(26, maxC + 5),
      cellData,
      mergeData,
      columnData,
    }
  })
  if (!out.sheetOrder.length) return emptyWorkbook(name)
  return out
}

export async function workbookToXlsx(data: WorkbookData): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  for (const sid of data.sheetOrder) {
    const sh = data.sheets[sid]
    if (!sh) continue
    const ws = wb.addWorksheet(sh.name.slice(0, 31) || sid)
    for (const [r, row] of Object.entries(sh.cellData ?? {})) {
      for (const [c, cell] of Object.entries(row ?? {})) {
        if (!cell) continue
        const x = ws.getCell(Number(r) + 1, Number(c) + 1)
        const raw = cell.v
        if (cell.f) x.value = { formula: cell.f.replace(/^=/, ''), result: raw as never }
        else if (raw !== undefined && raw !== null && raw !== '') x.value = raw as never
        const st = (typeof cell.s === 'string' ? data.styles[cell.s] : cell.s) as Record<string, any> | undefined
        if (st) {
          x.font = {
            bold: !!st.bl,
            italic: !!st.it,
            size: st.fs,
            color: st.cl?.rgb ? { argb: 'FF' + String(st.cl.rgb).replace('#', '') } : undefined,
          }
          if (st.bg?.rgb) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + String(st.bg.rgb).replace('#', '') } }
          if (st.n?.pattern) x.numFmt = st.n.pattern
        }
      }
    }
    for (const [c, col] of Object.entries(sh.columnData ?? {})) {
      if (col?.w) ws.getColumn(Number(c) + 1).width = col.w / 7.5
    }
    for (const m of sh.mergeData ?? []) {
      ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1)
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/* ---------------- CSV → Univer ---------------- */
export function csvToWorkbook(text: string, name: string): WorkbookData {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const wb = emptyWorkbook(name)
  const cd: CellData = {}
  rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      if (v === '') return
      const num = Number(v)
      ;(cd[ri] ??= {})[ci] = { v: v.trim() !== '' && !isNaN(num) ? num : v }
    }),
  )
  wb.sheets.s1.cellData = cd
  wb.sheets.s1.rowCount = Math.max(1000, rows.length + 100)
  return wb
}
