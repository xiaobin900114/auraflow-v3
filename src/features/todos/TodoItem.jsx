import React, { useEffect, useRef, useState } from 'react';
import styles from './TodoPanel.module.css';

export default function TodoItem({ todo, onToggle, onEdit, showCreatorLabel = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.task_content || '');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(text.length, text.length);
    }
  }, [editing, text]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [editing, text]);

  // 外部 todo 变化时，若非忙碌且非编辑，保持展示同步
  useEffect(() => {
    if (!busy && !editing) setText(todo.task_content || '');
  }, [todo.task_content]); // eslint-disable-line

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onEdit(text,
      () => { setSubmitting(false); setEditing(false); }, // 成功
      () => { setSubmitting(false); /* 失败保留编辑态与文本 */ }
    );
  };

  const cancel = () => {
    setText(todo.task_content || '');
    setEditing(false);
  };

  const busy = !!todo.__busy || submitting;

  const badge =
    !showCreatorLabel ? null :
    todo.created_by === 'ai_agent'
      ? <span className={styles.badgeAi} title="AI 创建">AI</span>
      : <span className={styles.badgeUser} title="用户创建">User</span>;

  return (
    <li className={`${styles.todoItem} ${busy ? styles.busy : ''}`}>
      <input
        type="checkbox"
        checked={!!todo.is_completed}
        onChange={() => !busy && onToggle()}
        className={styles.checkbox}
        disabled={busy}
        aria-disabled={busy}
        aria-checked={!!todo.is_completed}
      />

      {!editing ? (
        <div
          className={`${styles.todoText} ${todo.is_completed ? styles.doneText : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => !busy && setEditing(true)}
          onKeyDown={(e) => {
            if (busy) return;
            if (e.key === 'Enter') setEditing(true);
          }}
          title="点击编辑"
        >
          <span className={styles.textLine}>{todo.task_content}</span>
          {badge && <span className={styles.badgeWrap}>{badge}</span>}
        </div>
      ) : (
        <div className={styles.editorRow}>
          <textarea
            ref={inputRef}
            className={`${styles.todoInput} ${styles.editing}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            rows={1}
            disabled={busy}
            onBlur={submit}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
          />
          {badge && <span className={styles.badgeWrap}>{badge}</span>}
        </div>
      )}
    </li>
  );
}
