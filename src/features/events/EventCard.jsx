// =================================================================
// 文件: src/features/events/EventCard.jsx
// =================================================================
import React from 'react';
import styles from './EventList.module.css'; // Reuse styles from EventList

const fmtTime = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function EventCard({ event, isSelected, onSelect }) {
    return (
        <div onClick={onSelect} className={`${styles.card} ${isSelected ? styles.selected : ''}`}>
          <div className={styles.category}>{event.category || event.project_name || '—'}</div>
          <div className={styles.title}>{event.title}</div>
          <div className={styles.meta}>
            <span>{fmtTime(event.start_time || event.created_at)}</span>
            <span className={styles.status}>{event.status || '-'}</span>
          </div>
        </div>
    )
}