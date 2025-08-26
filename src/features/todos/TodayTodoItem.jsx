import React, { useEffect, useRef, useState } from 'react';
import styles from './TodayTodosPane.module.css';

// --- Icons ---
const PlusIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
    <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
  </svg>
);
const MinusIcon = (props) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
    <path d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" />
  </svg>
);
const CaretRight = (props) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
    <path d="M7 5l6 5-6 5V5z" />
  </svg>
);
const CaretDown = (props) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
    <path d="M5 7l5 6 5-6H5z" />
  </svg>
);

export default function TodayTodoItem({
  item, fromPool, onSelectTodo, toggle, edit, addToPool, removeFromPool
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.task_content || '');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);
  const busy = !!item.__busy;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(text.length, text.length);
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [editing, text]);

  useEffect(() => {
    if (!item.__busy && !editing) setText(item.task_content || '');
  }, [item.task_content, item.__busy, editing]);

  const hasEvent = !!item?.events?.id;
  const needClamp = !expanded && (item.task_content || '').length > 38;

  const onSubmit = async () => {
    if (!editing) return;
    await edit(text, () => setEditing(false));
  };
  const onCancel = () => { setText(item.task_content || ''); setEditing(false); };

  return (
    <li className={`${styles.item} ${busy ? styles.busy : ''}`}>
      <div className={styles.rowTop}>
        <input
          className={styles.chk}
          type="checkbox"
          checked={!!item.is_completed}
          onChange={() => !busy && toggle()}
          disabled={busy}
        />
        {!editing ? (
          <div className={styles.textWrap}>
            <div
              className={`${styles.txt} ${item.is_completed ? styles.done : ''} ${needClamp ? styles.clamp2 : ''}`}
              role="button"
              onClick={() => !busy && setEditing(true)}
              title="点击编辑"
            >
              {item.task_content}
            </div>
          </div>
        ) : (
          <div className={styles.editRow}>
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
              onBlur={onSubmit}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit(); }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
              }}
            />
          </div>
        )}
      </div>
      <div className={styles.rowBottom}>
        <div className={styles.srcRow}>
            <span className={styles.badgePrimary}>
                {item.created_by === 'ai_agent' ? 'AI' : 'User'}
            </span>
            <button
                onClick={() => hasEvent && onSelectTodo?.(item)}
                className={styles.src}
                disabled={!hasEvent}
                title={hasEvent ? item.events.title : '无关联事件'}
            >
                {hasEvent ? `来自：${item.events.title}` : '独立待办'}
            </button>
        </div>
        <div className={styles.actions}>
          {fromPool ? (
            <button className={styles.iconBtn} disabled={busy} onClick={removeFromPool} title="移出使命必达池">
              <MinusIcon />
            </button>
          ) : (
            <button className={styles.iconBtn} disabled={busy} onClick={addToPool} title="加入使命必达池">
              <PlusIcon />
            </button>
          )}
          {!editing && (item.task_content || '').length > 38 && (
            <button className={styles.caretBtn} onClick={() => setExpanded(v => !v)} title={expanded ? '收起' : '展开'}>
              {expanded ? <CaretDown /> : <CaretRight />}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
