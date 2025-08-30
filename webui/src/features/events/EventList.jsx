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
  const hasEndTime = e.end_at_utc || e.end_time;
  const hasStartTime = e.start_at_utc || e.start_time;
  if (hasEndTime && !hasStartTime) {
    const end = new Date(hasEndTime);
    return end >= dayStart && end <= dayEnd;
  }
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
    let list;

    // 👈 核心修改：如果 selectedDate 为 null，则显示所有事件；否则按日期筛选
    if (!selectedDate) {
      list = [...allEvents]; // 创建一个副本以进行后续操作
    } else {
      const { dStart, dEnd } = dayBounds(selectedDate);
      list = allEvents.filter(e => overlapsDay(e, dStart, dEnd));
    }

    // 后续的分类或项目筛选逻辑保持不变
    if (activeFilter.startsWith('project-')) {
      const projectId = parseInt(activeFilter.split('-')[1], 10);
      list = list.filter(e => e.project_id === projectId);
    } else if (activeFilter !== 'all') {
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
      {completed.length > 0 && (
        <>
          <div className={styles.sectionHeader}>
            <span className={styles.divider} />
            <span className={styles.sectionTitle}>已完成（{completed.length}）</span>
            <span className={styles.divider} />
          </div>
          <div className={`${styles.container} ${styles.completedWrap || ''}`} style={{ opacity: 0.9 }}>
            {completed.map(event => (
              <EventCard
                key={event.id}
                event={event}
                muted
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
