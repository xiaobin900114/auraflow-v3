import React, { useState, useRef, useEffect } from 'react';
import styles from './Note.module.css';

export default function Note({ note, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.note_content || '');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(content.length, content.length);
    }
  }, [isEditing, content]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(note.id, content);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // 段落渲染：双换行分段，单换行保留
  const renderParagraphs = (text) => {
    if (!text) return null;
    const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/\n/);
    return blocks.map((p, i) => (
      <p key={i} className={styles.contentP}>{p}</p>
    ));
  };

  const canToggle = !isEditing; // 编辑态禁用展开/收起

  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <span className={styles.date}>{new Date(note.created_at).toLocaleString()}</span>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className={styles.editButton}>编辑</button>
        )}
      </div>

      {!isEditing ? (
        <div>
          <div
            className={`${styles.content} ${!expanded ? styles.clamp : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => canToggle && setExpanded(!expanded)}
            onKeyDown={(e) => {
              if (!canToggle) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); }
            }}
            aria-expanded={expanded}
            title={expanded ? '点击收起' : '点击展开'}
          >
            {renderParagraphs(note.note_content || '')}
          </div>
          <button
            type="button"
            className={`${styles.expandButton} ${!canToggle ? styles.disabled : ''}`}
            onClick={() => canToggle && setExpanded(!expanded)}
            disabled={!canToggle}
          >
            {expanded ? '收起' : '展开全部'}
          </button>
        </div>
      ) : (
        <div className={styles.editor}>
          <textarea
            ref={textRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows="4"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
              if (e.key === 'Escape') { e.preventDefault(); setContent(note.note_content || ''); setIsEditing(false); }
            }}
          />
          <div className={styles.actions}>
            <button onClick={handleSave} className={styles.saveButton} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button onClick={() => { setContent(note.note_content || ''); setIsEditing(false); }} className={styles.cancelButton}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
