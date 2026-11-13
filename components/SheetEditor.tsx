'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import esES from '@univerjs/preset-sheets-core/locales/es-ES'
import '@univerjs/preset-sheets-core/lib/index.css'
import { api, downloadBlob, makeSaver, safeName, type Item } from '@/lib/client'
import { emptyWorkbook, workbookToXlsx, xlsxToWorkbook, type WorkbookData } from '@/lib/convert'
import { TopBar, useUnloadGuard, type SaveState } from './TopBar'

type API = ReturnType<typeof createUniver>['univerAPI']
const MUTATION = 2 // CommandType.MUTATION: cambios reales en los datos

function parse(content: string, title: string): WorkbookData {
  try {
    const d = JSON.parse(content) as WorkbookData
    if (d && d.sheetOrder?.length) return d
  } catch {}
  return emptyWorkbook(title)
}

export default function SheetEditor({ item }: { item: Item }) {
  const host = useRef<HTMLDivElement>(null)
  const apiRef = useRef<API | null>(null)
  const [title, setTitle] = useState(item.title)
  const [state, setState] = useState<SaveState>('saved')
  const [reloadKey, setReloadKey] = useState(0)
  const dataRef = useRef<WorkbookData>(parse(item.content, item.title))
  useUnloadGuard(state)

  const snapshot = () => (apiRef.current?.getActiveWorkbook()?.save() as unknown as WorkbookData) ?? dataRef.current
  const saver = useMemo(() => makeSaver(() => api.update(item.id, { content: JSON.stringify(snapshot()) }), setState, 1500), [item.id])

  useEffect(() => {
    if (!host.current) return
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ES_ES,
      locales: { [LocaleType.ES_ES]: mergeLocales(esES) },
      presets: [UniverSheetsCorePreset({ container: host.current })],
    })
    apiRef.current = univerAPI
    univerAPI.createWorkbook(dataRef.current as never)
    const sub = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (e: { type?: number; options?: { fromCollab?: boolean } }) => {
      if (e.type === MUTATION) saver.schedule()
    })
    return () => {
      sub.dispose()
      saver.flush()
      apiRef.current = null
      univer.dispose()
    }
  }, [reloadKey, saver])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saver.flush()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [saver])

  async function rename(t: string) {
    setTitle(t)
    await api.update(item.id, { title: t })
  }

  async function exportXlsx() {
    downloadBlob(await workbookToXlsx(snapshot()), `${safeName(title)}.xlsx`)
  }

  function exportCsv() {
    const wb = snapshot()
    const sh = wb.sheets[wb.sheetOrder[0]]
    const rows = Object.keys(sh.cellData ?? {}).map(Number)
    const maxR = rows.length ? Math.max(...rows) : -1
    let maxC = -1
    for (const r of rows) for (const c of Object.keys(sh.cellData[r] ?? {})) maxC = Math.max(maxC, Number(c))
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    for (let r = 0; r <= maxR; r++) {
      const line: string[] = []
      for (let c = 0; c <= maxC; c++) line.push(esc(sh.cellData[r]?.[c]?.v))
      lines.push(line.join(','))
    }
    downloadBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }), `${safeName(title)}.csv`)
  }

  function importXlsx() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      if (!confirm('Esto reemplaza toda la hoja actual. ¿Continuar?')) return
      dataRef.current = await xlsxToWorkbook(await f.arrayBuffer(), title)
      await api.update(item.id, { content: JSON.stringify(dataRef.current) })
      setReloadKey((k) => k + 1)
    }
    input.click()
  }

  return (
    <>
      <TopBar title={title} onTitle={rename} state={state} kindClass="k-sheet" letter="X">
        <button className="btn" onClick={importXlsx}>Importar .xlsx</button>
        <button className="btn" onClick={exportXlsx}>Descargar .xlsx</button>
        <button className="btn" onClick={exportCsv}>CSV</button>
      </TopBar>
      <div className="sheet-host" ref={host} key={reloadKey} />
    </>
  )
}
