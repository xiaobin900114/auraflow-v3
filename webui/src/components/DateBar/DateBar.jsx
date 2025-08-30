import React from 'react';
import styles from './DateBar.module.css';

const dKey = d => new Date(d).toISOString().split('T')[0];
const fmtDay = d => new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export default function DateBar({ selectedDate, setSelectedDate, onLogout }) {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i - 3);
    return d;
  });

  return (
    <div className={styles.container}>
        <div className={styles.buttons}>
          {/* 👈 新增：“所有事件”按钮 */}
          <button
            onClick={() => setSelectedDate(null)}
            className={!selectedDate ? styles.active : styles.button}
          >
            所有事件
          </button>

          {dates.map((date, i) => (
            <button
              key={i}
              onClick={() => setSelectedDate(date)}
              // 👈 修改：确保 selectedDate 存在时才比较
              className={selectedDate && dKey(date) === dKey(selectedDate) ? styles.active : styles.button}
            >
              {i === 3 ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`}
            </button>
          ))}
        </div>
        <div className={styles.display}>
          {/* 👈 修改：根据 selectedDate 是否存在来显示不同文本 */}
          当前视图：<span>{selectedDate ? fmtDay(selectedDate) : '所有事件'}</span>
          <button onClick={onLogout} className={styles.logout}>登出</button>
        </div>
    </div>
  );
}
