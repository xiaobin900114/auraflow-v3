import React, { useMemo } from 'react';
import EventCard from './EventCard';
import styles from './EventList.module.css';

/**
 * 解析事件的开始/结束时间，兼容多种列名：
 * 优先使用 v1 的 start_at_utc/end_at_utc；其次回退到 start_time/end_time；最后回退到 created_at。
 */
function getEventRange(e) {
  const startStr = e.start_at_utc || e.start_time || e.created_at;
  const endStr   = e.end_at_utc   || e.end_time   || startStr;
  const start = startStr ? new Date(startStr) : null;
  const end   = endStr ? new Date(endStr) : null;
  return { start, end };
}

/** 返回某天的起止（本地时区） */
function dayBounds(date) {
  const dStart = new Date(date);
  dStart.setHours(0, 0, 0, 0);
  const dEnd = new Date(date);
  dEnd.setHours(23, 59, 59, 999);
  return { dStart, dEnd };
}

/** 判断一个事件是否与指定“天区间”有重叠（闭区间重叠） */
function overlapsDay(e, dayStart, dayEnd) {
  const { start, end } = getEventRange(e);
  if (!start || !end) return false;
  // 只要 [start, end] 与 [dayStart, dayEnd] 有交集就显示
  return start <= dayEnd && end >= dayStart;
}

/** 排序规则：按开始时间升序（无开始时间的放后面） */
function sortByStart(a, b) {
  const { start: sa } = getEventRange(a);
  const { start: sb } = getEventRange(b);
  if (sa && sb) return sa - sb;
  if (sa && !sb) return -1;
  if (!sa && sb) return 1;
  return 0;
}

export default function EventList({ allEvents, selectedDate, activeFilter, selectedEvent, onSelectEvent }) {
  const filteredEvents = useMemo(() => {
    const { dStart, dEnd } = dayBounds(selectedDate);

    let list = allEvents.filter(e => overlapsDay(e, dStart, dEnd));

    if (activeFilter !== 'all') {
      list = list.filter(e => (e.category || 'uncategorized') === activeFilter);
    }

    return list.sort(sortByStart);
  }, [allEvents, selectedDate, activeFilter]);

  if (!filteredEvents.length) {
    return <div className={styles.empty}>无任务</div>;
  }

  return (
    <div className={styles.container}>
      {filteredEvents.map(event => (
        <EventCard
          key={event.id}
          event={event}
          isSelected={selectedEvent?.id === event.id}
          onSelect={() => onSelectEvent(event)}
        />
      ))}
    </div>
  );
}
