import React, { useState, useRef, useEffect } from 'react';
import styles from './Note.module.css';

export default function Note({ note, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  // 关键修正 #1: 为编辑模式创建一个独立的 state，防止父组件刷新导致光标跳动
  const [editingContent, setEditingContent] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const textRef = useRef(null);

  // 关键修正 #2: 封装一个可重用的函数来调整文本框高度
  const adjustTextareaHeight = () => {
    if (textRef.current) {
      const textarea = textRef.current;
      textarea.style.height = 'auto'; // 必须先重置，才能正确计算 scrollHeight
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  // 关键修正 #3: 这个 effect 只在进入编辑模式时触发一次
  useEffect(() => {
    if (isEditing) {
      // 从 note prop 初始化编辑内容
      setEditingContent(note.note_content || '');
      
      // 使用 setTimeout 确保 DOM 渲染完毕后再执行聚焦和调整
      setTimeout(() => {
        if (textRef.current) {
          textRef.current.focus();
          // 将光标移动到文末
          const len = textRef.current.value.length;
          textRef.current.setSelectionRange(len, len);
          adjustTextareaHeight(); // 调整初始高度
        }
      }, 0);
    }
  }, [isEditing, note.note_content]); // 依赖 isEditing

  // 当编辑内容变化时，实时调整高度
  useEffect(() => {
    if (isEditing) {
      adjustTextareaHeight();
    }
  }, [editingContent, isEditing]);

  const handleSave = async () => {
    if (saving || editingContent.trim() === note.note_content) {
        setIsEditing(false);
        return;
    }
    setSaving(true);
    try {
      await onSave(note.id, editingContent.trim());
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };
  
  // 关键修正 #4: 重新实现键盘事件
  const handleKeyDown = (e) => {
    // Enter 保存, Shift+Enter 换行 (默认行为)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // 阻止默认的 Enter 换行
      handleSave();
    }
    // Escape 取消
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  // 段落渲染功能保持不变
  const renderParagraphs = (text) => {
    if (!text) return null;
    const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/\n/);
    return blocks.map((p, i) => (
      <p key={i} className={styles.contentP}>{p}</p>
    ));
  };

  const canToggle = !isEditing;

  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <span className={styles.date}>{new Date(note.created_at).toLocaleString()}</span>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className={styles.editButton}>编辑</button>
        )}
      </div>

      {!isEditing ? (
        // 展示模式 (您的原有逻辑)
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
        // 编辑模式 (已修正)
        <div className={styles.editor}>
          <textarea
            ref={textRef}
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave} // 失去焦点时自动保存
          />
          <div className={styles.actions}>
            <button onClick={handleSave} className={styles.saveButton} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button onClick={handleCancel} className={styles.cancelButton}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
