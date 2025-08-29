import React, { useMemo } from 'react';
import styles from './ProjectPanel.module.css';

// --- 辅助函数 (用于日期计算) ---
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

export default function ProjectPanel({ projects = [], allEvents = [], activeFilter, onSelectProject, selectedDate }) {
  
  const projectCounts = useMemo(() => {
    // 👈 核心修改：先筛选出对应日期的事件，如果日期为 null (所有事件)，则使用全部事件
    const eventsToCount = selectedDate
      ? allEvents.filter(e => overlapsDay(e, ...Object.values(dayBounds(selectedDate))))
      : allEvents;

    // 基于筛选后的事件列表进行计数
    const counts = new Map();
    for (const event of eventsToCount) {
      if (event.project_id) {
        counts.set(event.project_id, (counts.get(event.project_id) || 0) + 1);
      }
    }
    return counts;
  }, [allEvents, selectedDate]); // 👈 核心修改：添加 selectedDate 作为依赖项

  const activeProjectId = activeFilter.startsWith('project-')
    ? parseInt(activeFilter.split('-')[1], 10)
    : null;

  const ProjectButton = ({ project, count }) => {
    const isActive = activeProjectId === project.id;
    return (
      <button
        onClick={() => onSelectProject(project)}
        className={`${styles.button} ${isActive ? styles.active : ''}`}
      >
        <span>{project.name}</span>
        <span className={styles.count}>{count}</span>
      </button>
    );
  };

  return (
    <div className={styles.container}>
      {projects.map(proj => (
        <ProjectButton
          key={proj.id}
          project={proj}
          count={projectCounts.get(proj.id) || 0}
        />
      ))}
    </div>
  );
}
