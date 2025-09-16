import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './Toast.module.css';
import { ToastCtx } from './context';

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(1);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'info', duration = 2200) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration) {
      setTimeout(() => remove(id), duration);
    }
  }, [remove]);

  // 键盘 ESC 清空
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setToasts([]); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className={styles.wrap} aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
