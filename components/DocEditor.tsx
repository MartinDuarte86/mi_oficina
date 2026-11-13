'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extension-placeholder'
import { api, downloadBlob, makeSaver, safeName, type Item } from '@/lib/client'
import { docxToHtml, htmlToDocx } from '@/lib/convert'
import { TopBar, useUnloadGuard, type SaveState } from './TopBar'

function parse(content: string) {
  try {
    return (JSON.parse(content) as { html?: string }).html ?? ''
  } catch {
    return content
  }
}

export default function DocEditor({ item }: { item: Item }) {
  const [title, setTitle] = useState(item.title)
  const [state, setState] = useState<SaveState>('saved')
  useUnloadGuard(state)

  const editorRef = useRef<Editor | null>(null)
  const saver = useMemo(
    () => makeSaver(() => api.update(item.id, { content: JSON.stringify({ html: editorRef.current?.getHTML() ?? '' }) }), setState),
    [item.id],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Empieza a escribir…' }),
    ],
    content: parse(item.content),
    onUpdate: () => saver.schedule(),
  })
  editorRef.current = editor

  // Guardar con Ctrl+S
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

  async function exportDocx() {
    if (!editor) return
    downloadBlob(await htmlToDocx(editor.getHTML(), title), `${safeName(title)}.docx`)
  }
  function exportHtml() {
    if (!editor) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${editor.getHTML()}</body></html>`
    downloadBlob(new Blob([html], { type: 'text/html' }), `${safeName(title)}.html`)
  }
  async function importDocx() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f || !editor) return
      if (!confirm('Esto reemplaza el contenido actual. ¿Continuar?')) return
      editor.commands.setContent(await docxToHtml(await f.arrayBuffer()), { emitUpdate: true })
    }
    input.click()
  }

  return (
    <>
      <TopBar title={title} onTitle={rename} state={state} kindClass="k-doc" letter="W">
        <button className="btn" onClick={importDocx} title="Reemplazar con un .docx">Importar .docx</button>
        <button className="btn" onClick={exportDocx}>Descargar .docx</button>
        <button className="btn" onClick={() => window.print()} title="Imprimir o guardar como PDF">PDF</button>
        <button className="btn" onClick={exportHtml}>HTML</button>
      </TopBar>
      {editor && <Toolbar editor={editor} />}
      <div className="page">
        <EditorContent editor={editor} />
      </div>
    </>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    editor.on('transaction', f)
    return () => {
      editor.off('transaction', f)
    }
  }, [editor])

  const c = () => editor.chain().focus()
  const B = ({ on, title, onClick, children }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode }) => (
    <button className={`btn icon ${on ? 'on' : ''}`} title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
  const block = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p'
  const inTable = editor.isActive('table')

  function addImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return
      if (f.size > 1_000_000 && !confirm('La imagen pesa más de 1 MB y hará el documento pesado. ¿Insertar igual?')) return
      const fr = new FileReader()
      fr.onload = () => c().setImage({ src: String(fr.result) }).run()
      fr.readAsDataURL(f)
    }
    input.click()
  }
  function addLink() {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('Dirección del enlace (vacío para quitar):', prev ?? 'https://')
    if (url === null) return
    if (url === '') c().unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="ed-toolbar">
      <B title="Deshacer (Ctrl+Z)" onClick={() => c().undo().run()}>↶</B>
      <B title="Rehacer (Ctrl+Y)" onClick={() => c().redo().run()}>↷</B>
      <span className="sep" />
      <select
        value={block}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'p') c().setParagraph().run()
          else c().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
        }}
      >
        <option value="p">Normal</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
      </select>
      <select
        title="Fuente"
        value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
        onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
      >
        <option value="">Fuente</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="Calibri, Carlito, sans-serif">Calibri</option>
        <option value="'Times New Roman', serif">Times New Roman</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="'Courier New', monospace">Courier New</option>
      </select>
      <select
        title="Tamaño"
        value={(editor.getAttributes('textStyle').fontSize as string) ?? ''}
        onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}
      >
        <option value="">Tamaño</option>
        {[10, 11, 12, 14, 16, 18, 24, 32].map((s) => (
          <option key={s} value={`${s}pt`}>{s}</option>
        ))}
      </select>
      <span className="sep" />
      <B title="Negrita (Ctrl+B)" on={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><b>B</b></B>
      <B title="Cursiva (Ctrl+I)" on={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><i>I</i></B>
      <B title="Subrayado (Ctrl+U)" on={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}><u>U</u></B>
      <B title="Tachado" on={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}><s>S</s></B>
      <label className="btn icon" title="Color de texto" style={{ position: 'relative' }}>
        A
        <input
          type="color"
          style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }}
          onChange={(e) => c().setColor(e.target.value).run()}
        />
      </label>
      <B title="Resaltar" on={editor.isActive('highlight')} onClick={() => c().toggleHighlight({ color: '#fff3a3' }).run()}>
        <span style={{ background: '#fff3a3', color: '#000', padding: '0 3px' }}>ab</span>
      </B>
      <B title="Quitar formato" onClick={() => c().unsetAllMarks().clearNodes().run()}>⨯</B>
      <span className="sep" />
      <B title="Alinear a la izquierda" on={editor.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()}>⯇</B>
      <B title="Centrar" on={editor.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()}>≡</B>
      <B title="Alinear a la derecha" on={editor.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()}>⯈</B>
      <B title="Justificar" on={editor.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()}>☰</B>
      <span className="sep" />
      <B title="Lista con viñetas" on={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>•</B>
      <B title="Lista numerada" on={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>1.</B>
      <B title="Lista de tareas" on={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}>☑</B>
      <B title="Cita" on={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>❝</B>
      <B title="Código" on={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>{'</>'}</B>
      <span className="sep" />
      <B title="Enlace" on={editor.isActive('link')} onClick={addLink}>🔗</B>
      <B title="Imagen" onClick={addImage}>🖼</B>
      <B title="Insertar tabla" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</B>
      <B title="Línea horizontal" onClick={() => c().setHorizontalRule().run()}>―</B>
      {inTable && (
        <>
          <span className="sep" />
          <B title="Agregar fila debajo" onClick={() => c().addRowAfter().run()}>+fila</B>
          <B title="Agregar columna a la derecha" onClick={() => c().addColumnAfter().run()}>+col</B>
          <B title="Eliminar fila" onClick={() => c().deleteRow().run()}>−fila</B>
          <B title="Eliminar columna" onClick={() => c().deleteColumn().run()}>−col</B>
          <B title="Combinar/separar celdas" onClick={() => c().mergeOrSplit().run()}>⊞</B>
          <B title="Eliminar tabla" onClick={() => c().deleteTable().run()}>✕tabla</B>
        </>
      )}
    </div>
  )
}
