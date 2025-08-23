// =================================================================
// 文件: src/components/FilterPanel/FilterPanel.jsx
// =================================================================
import React from 'react';
import styles from './FilterPanel.module.css';

export default function FilterPanel({ allEvents, todayTodos, activeFilter, setActiveFilter }) {
  const categoryCounts = allEvents.reduce((acc, e) => {
    const c = e.category || 'uncategorized';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

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
      <FilterButton filter="all" text="所有任务" count={allEvents.length} />
      <FilterButton filter="today_todos" text="今日待办" count={todayTodos.length} />
      <hr className="my-2" />
      {Object.entries(categoryCounts).map(([category, count]) => (
        <FilterButton key={category} filter={category} text={category} count={count} />
      ))}
    </div>
  );
}