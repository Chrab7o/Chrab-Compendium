import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { uploadEntryImage } from '../lib/entryImages'

function ToolbarButton({ active, ...props }) {
  return <button type="button" className={active ? 'active' : undefined} {...props} />
}

// Authors markdown (the storage format used everywhere else in the app —
// entries.content, rendered via ReactMarkdown+remarkGfm) as rich text, so
// editing looks like the actual final page instead of raw markdown syntax.
// `content` is only used for the editor's initial value; pair with a `key`
// prop on the parent so switching entries forces a fresh mount instead of
// trying to resync content into an already-initialized editor.
export default function RichTextEditor({ content, onChange }) {
  const fileInputRef = useRef(null)
  const toolbarRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: false } }),
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ html: false, linkify: true }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown())
    },
    editorProps: {
      attributes: { class: 'entry-content rich-editor-content' },
    },
  })

  // Phone keyboards have no Tab, so nesting a bullet needs its own buttons.
  // Shown only inside a list; useEditorState re-renders on cursor moves.
  const inList = useEditorState({
    editor,
    selector: ({ editor }) => editor?.isActive('listItem') ?? false,
  })

  async function handleImagePick(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file || !editor) return
    try {
      const url = await uploadEntryImage(file)
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err) {
      alert(`Image upload failed: ${err.message}`)
    }
  }

  function setLink() {
    const url = prompt('Link URL:')
    if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  // Phones get one Format button that opens the tools as a top-to-bottom menu
  // (CSS hides the toggle on wider screens, where the tools are one row).
  useEffect(() => {
    if (!menuOpen) return
    function close(e) {
      if (e.type === 'keydown' ? e.key === 'Escape' : !toolbarRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  if (!editor) return null

  return (
    <div className="rich-editor">
      {/* mousedown default would take focus from the text, closing a phone's keyboard. */}
      <div className="editor-toolbar" ref={toolbarRef} onMouseDown={(e) => e.preventDefault()}>
        <button
          type="button"
          className="editor-toolbar-toggle"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Format {menuOpen ? '▴' : '▾'}
        </button>
        <div
          className={`editor-toolbar-items${menuOpen ? ' is-open' : ''}`}
          // Indent/Outdent keep it open: nesting often takes a few taps.
          onClick={(e) => e.target.closest('button:not([data-keep-open])') && setMenuOpen(false)}
        >
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            Bold
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            Italic
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </ToolbarButton>
          {inList && (
            <>
              <ToolbarButton
                aria-label="Indent list item"
              data-keep-open
                onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
              >
                Indent →
              </ToolbarButton>
              <ToolbarButton
                aria-label="Outdent list item"
              data-keep-open
                onClick={() => editor.chain().focus().liftListItem('listItem').run()}
              >
                ← Outdent
              </ToolbarButton>
            </>
          )}
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            Quote
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            Code
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('link')} onClick={setLink}>
            Link
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}
          >
            Table
          </ToolbarButton>
          <ToolbarButton onClick={() => fileInputRef.current?.click()}>Image</ToolbarButton>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImagePick}
          style={{ display: 'none' }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
