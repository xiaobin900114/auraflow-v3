// src/features/events/EventCard.jsx
import React from 'react';
import styles from './EventList.module.css';

// 仅日期（上海时区） mm/dd/yy
const fmtDateOnlyUS = (d) => {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(d));
};

const getStartEnd = (e) => {
  const s = e.start_at_utc || e.start_time || e.start || e.end_time;
  const ed = e.end_at_utc || e.end_time || e.end || s;
  return { s: s ? new Date(s) : null, e: ed ? new Date(ed) : null };
};

// 同日显示一个日期；跨日显示 A – B
const dateLine = (event) => {
  const { s, e } = getStartEnd(event);
  if (!s && !e) return '';
  if (s && e) {
    const a = fmtDateOnlyUS(s);
    const b = fmtDateOnlyUS(e);
    return a === b ? a : `${a} – ${b}`;
  }
  if (s && !e) return fmtDateOnlyUS(s);
  if (!s && e) return fmtDateOnlyUS(e);
  return '';
};

export default function EventCard({ event, isSelected, onSelect, muted = false }) {
  const status = String(event.status || 'to_do').toLowerCase();
  const category = event.category || event.project_name || '—';

  return (
    <div
      className={[
        styles.card,
        isSelected ? styles.selected : '',
        muted ? styles.cardMuted : '',
      ].join(' ')}
      onClick={onSelect}
      title={event.title}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(); }}
    >
      {/* 顶部：分类 */}
      <div className={styles.metaTop}>
        <span className={styles.category}>{category}</span>
        {/* 顶部不再显示时间 */}
        <span />
      </div>

      {/* 标题（克制样式） */}
      <div className={styles.title} title={event.title}>
        {event.title}
      </div>

      {/* 底部：左=起止日期；右=状态；无 AI 标签 */}
      <div className={styles.metaBottom}>
        <span className={styles.datetime}>{dateLine(event)}</span>
        <span className={styles.status}>{status}</span>
      </div>
    </div>
  );
}
