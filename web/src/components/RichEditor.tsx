"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const ToolbarBtn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    style={{
      padding: "4px 10px",
      borderRadius: 6,
      border: "1px solid var(--glass-border)",
      background: active ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.05)",
      color: active ? "var(--accent-primary)" : "var(--text-secondary)",
      cursor: "pointer",
      fontSize: "0.85rem",
      fontFamily: "Outfit, sans-serif",
      fontWeight: active ? 700 : 400,
      lineHeight: 1.4,
      transition: "all 0.15s",
    }}
  >
    {children}
  </button>
);

export default function RichEditor({ value, onChange, placeholder = "Write here…" }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        style: "min-height: 220px; outline: none; padding: 4px 2px; line-height: 1.8; font-size: 0.92rem; color: var(--text-primary);",
      },
    },
  });

  // Sync content when value changes externally (e.g. opening an existing policy)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        border: "1px solid var(--glass-border)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        overflow: "hidden",
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "10px 12px",
          borderBottom: "1px solid var(--glass-border)",
          background: "rgba(0,0,0,0.2)",
        }}
      >
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><s>S</s></ToolbarBtn>

        <div style={{ width: 1, background: "var(--glass-border)", margin: "0 4px" }} />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">H2</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">H3</ToolbarBtn>

        <div style={{ width: 1, background: "var(--glass-border)", margin: "0 4px" }} />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">• List</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">1. List</ToolbarBtn>

        <div style={{ width: 1, background: "var(--glass-border)", margin: "0 4px" }} />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">" Quote</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Horizontal Rule">─ Rule</ToolbarBtn>

        <div style={{ flex: 1 }} />

        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="Undo">↩ Undo</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="Redo">↪ Redo</ToolbarBtn>
      </div>

      {/* ── Editor Area ── */}
      <div style={{ padding: "14px 16px" }}>
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .tiptap p { margin: 0 0 8px 0; }
        .tiptap h2 { font-size: 1.2rem; font-weight: 700; margin: 16px 0 8px; color: white; }
        .tiptap h3 { font-size: 1.05rem; font-weight: 700; margin: 14px 0 6px; color: white; }
        .tiptap ul, .tiptap ol { padding-left: 24px; margin: 8px 0; }
        .tiptap li { margin-bottom: 4px; }
        .tiptap strong { color: white; }
        .tiptap blockquote { border-left: 3px solid var(--accent-primary); padding-left: 12px; color: var(--text-secondary); margin: 10px 0; }
        .tiptap hr { border: none; border-top: 1px solid var(--glass-border); margin: 16px 0; }
        .tiptap p.is-editor-empty:first-child::before { color: var(--text-secondary); content: attr(data-placeholder); float: left; height: 0; pointer-events: none; font-style: italic; }
      `}</style>
    </div>
  );
}
