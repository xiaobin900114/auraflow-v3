import React, { useMemo } from 'react';
import styles from './FilterPanel.module.css';

// --- 辅助函数 (从 EventList.jsx 复制而来，用于日期计算) ---
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
// --- 辅助函数结束 ---

export default function FilterPanel({ allEvents, todayTodos, activeFilter, setActiveFilter, selectedDate }) {
  
  // 👈 核心修改：先筛选出选定日期的所有事件
  const eventsForSelectedDate = useMemo(() => {
    if (!selectedDate) return allEvents;
    const { dStart, dEnd } = dayBounds(selectedDate);
    return allEvents.filter(e => overlapsDay(e, dStart, dEnd));
  }, [allEvents, selectedDate]);

  // 👈 核心修改：基于筛选后的事件列表进行分类计数
  const categoryCounts = useMemo(() => {
    return eventsForSelectedDate.reduce((acc, e) => {
      const c = e.category || 'uncategorized';
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
  }, [eventsForSelectedDate]);

  const FilterButton = ({ filter, text, count }) => (
    <button
      onClick={() => setActiveFilter(filter)}
      className={`${styles.button} ${activeFilter === filter ? styles.active : ''}`}
    >
      <span className="capitalize">{text}</span>
      <span className={styles.count}>{count}</span>
    </button>
  );

  return (
    <div className={styles.container}>
      {/* 👈 核心修改： "所有任务" 的数量现在也只统计当天的 */}
      <FilterButton filter="all" text="所有任务" count={eventsForSelectedDate.length} />
      <FilterButton filter="today_todos" text="今日待办" count={todayTodos.length} />
      <hr className="my-2" />
      {Object.entries(categoryCounts).map(([category, count]) => (
        <FilterButton key={category} filter={category} text={category} count={count} />
      ))}
    </div>
  );
}
