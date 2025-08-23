import React, { useMemo } from 'react';
import EventCard from './EventCard';
import styles from './EventList.module.css';

function getEventRange(e) {
  const startStr = e.start_at_utc || e.start_time || e.created_at;
  const endStr   = e.end_at_utc   || e.end_time   || startStr;
  const start = startStr ? new Date(startStr) : null;
  const end   = endStr ? new Date(endStr) : null;
  return { start, end };
}
function dayBounds(date) {
  const dStart = new Date(date); dStart.setHours(0,0,0,0);
  const dEnd   = new Date(date); dEnd.setHours(23,59,59,999);
  return { dStart, dEnd };
}
function overlapsDay(e, dayStart, dayEnd) {
  const { start, end } = getEventRange(e);
  if (!start || !end) return false;
  return start <= dayEnd && end >= dayStart;
}
function sortByStart(a, b) {
  const { start: sa } = getEventRange(a);
  const { start: sb } = getEventRange(b);
  if (sa && sb) return sa - sb;
  if (sa && !sb) return -1;
  if (!sa && sb) return 1;
  return 0;
}
const isCompleted = (e) =>
  ['done', 'cancelled'].includes(String(e.status || '').toLowerCase());

export default function EventList({ allEvents, selectedDate, activeFilter, selectedEvent, onSelectEvent }) {
  const { active, completed } = useMemo(() => {
    const { dStart, dEnd } = dayBounds(selectedDate);
    let list = allEvents.filter(e => overlapsDay(e, dStart, dEnd));
    if (activeFilter !== 'all') {
      list = list.filter(e => (e.category || 'uncategorized') === activeFilter);
    }
    list = list.sort(sortByStart);
    return {
      active: list.filter(e => !isCompleted(e)),
      completed: list.filter(isCompleted),
    };
  }, [allEvents, selectedDate, activeFilter]);

  if (!active.length && !completed.length) {
    return <div className={styles.empty}>无任务</div>;
  }

  return (
    <div>
      {/* 进行中 */}
      {active.length > 0 && (
        <div className={styles.container}>
          {active.map(event => (
            <EventCard
              key={event.id}
              event={event}
              isSelected={selectedEvent?.id === event.id}
              onSelect={() => onSelectEvent(event)}
            />
          ))}
        </div>
      )}

      {/* 已完成（done / cancelled） */}
      {completed.length > 0 && (
        <>
          <div className={styles.sectionHeader}>
            <span className={styles.divider} />
            <span className={styles.sectionTitle}>已完成（{completed.length}）</span>
            <span className={styles.divider} />
          </div>

          {/* 使用 completedWrap（若有新CSS会生效）；再叠加内联弱化兜底 */}
          <div className={`${styles.container} ${styles.completedWrap || ''}`} style={{ opacity: 0.9 }}>
            {completed.map(event => (
              <EventCard
                key={event.id}
                event={event}
                muted      // 👈 传入“淡化”标记；EventCard 内会内联处理
                isSelected={selectedEvent?.id === event.id}
                onSelect={() => onSelectEvent(event)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
