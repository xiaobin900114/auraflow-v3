import React, { useEffect, useRef, useState } from 'react';
import styles from './TodoPanel.module.css';

// --- Icons (Copied from TodayTodoItem.jsx) ---
const PlusIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.actionIcon} {...props}>
    <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
  </svg>
);
const MinusIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.actionIcon} {...props}>
    <path d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" />
  </svg>
);


export default function TodoItem({ todo, onToggle, onEdit, onToggleMissionPool, showCreatorLabel = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.task_content || '');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  // 👈 **关键修正**: 将 busy 的定义移到所有 hooks 的最前面
  // The 'busy' variable must be declared before it is used in any hooks.
  const busy = !!todo.__busy || submitting;

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

  // Now this useEffect can safely use the 'busy' variable.
  useEffect(() => {
    if (!busy && !editing) {
      setText(todo.task_content || '');
    }
  }, [todo.task_content, busy, editing]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onEdit(text,
      () => { setSubmitting(false); setEditing(false); },
      () => { setSubmitting(false); }
    );
  };

  const cancel = () => {
    setText(todo.task_content || '');
    setEditing(false);
  };

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
      />
      
      <div className={styles.contentWrap}>
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
      </div>

      {/* 你添加的功能代码 (保持不变) */}
      <div className={styles.actionsWrap}>
        <button 
          className={styles.iconBtn} 
          onClick={() => !busy && onToggleMissionPool?.()}
          disabled={busy}
          title={todo.is_mission_pool ? '移出使命必达池' : '加入使命必达池'}
        >
          {todo.is_mission_pool ? <MinusIcon /> : <PlusIcon />}
        </button>
      </div>
    </li>
  );
}

