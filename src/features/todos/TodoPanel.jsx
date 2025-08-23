import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../api/supabase';
import { useToast } from '../../components/Toast/ToastProvider';
import TodoItem from './TodoItem';
import styles from './TodoPanel.module.css';

export default function TodoPanel({ event }) {
  const { toast } = useToast();
  const [todos, setTodos] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');

  const fetchTodos = useCallback(async () => {
    if (!event) { setTodos([]); return; }
    const { data, error } = await supabase
      .from('todo_items')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at');
    if (error) {
      toast(`加载 todo 失败：${error.message}`, 'error');
      return;
    }
    setTodos(data || []);
  }, [event, toast]);

  useEffect(() => {
    fetchTodos();
    if (!event) return;
    const channel = supabase
      .channel(`details-todos-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items', filter: `event_id=eq.${event.id}` }, fetchTodos)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [event, fetchTodos]);

  const grouped = useMemo(() => {
    const pending = [], done = [];
    for (const t of todos) (t.is_completed ? done : pending).push(t);
    return { pending, done };
  }, [todos]);

  // 勾选切换（乐观）
  const toggleComplete = async (todo) => {
    const snapshot = todos;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_completed: !t.is_completed, __busy: true } : t));
    try {
      const { error } = await supabase
        .from('todo_items')
        .update({ is_completed: !todo.is_completed })
        .eq('id', todo.id);
      if (error) throw error;
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      toast(!todo.is_completed ? '已标记完成' : '已标记未完成', 'success');
    } catch (e) {
      setTodos(snapshot); // 回滚
      toast(`操作失败：${e.message || ''}`, 'error');
    }
  };

  // 文本更新：如果是 AI 创建的（ai_agent），一并把 created_by 改成 'user'
  const updateText = async (todo, newText, onDone, onError) => {
    const trimmed = (newText || '').trim();
    if (trimmed === todo.task_content) return onDone?.('nochange');

    const snapshot = todos;
    const patch = { task_content: trimmed, ...(todo.created_by === 'ai_agent' ? { created_by: 'user' } : {}) };
    setTodos(curr => curr.map(t => t.id === todo.id ? { ...t, ...patch, __busy: true } : t));
    try {
      const { error } = await supabase
        .from('todo_items')
        .update(patch)
        .eq('id', todo.id);
      if (error) throw error;
      setTodos(curr => curr.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      onDone?.();
      toast('已保存', 'success');
    } catch (e) {
      setTodos(snapshot);
      onError?.(e);
      toast(`保存失败：${e.message || ''}`, 'error');
    }
  };

  // 新增：明确写入 created_by: 'user'
  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const text = (addText || '').trim();
    if (!event || !text || adding) return;

    setAdding(true);
    const tempId = `temp_${Date.now()}`;
    const temp = { id: tempId, event_id: event.id, task_content: text, is_completed: false, created_by: 'user', __temp: true, __busy: true };
    setTodos(curr => [temp, ...curr]);
    setAddText('');

    try {
      const { data, error } = await supabase
        .from('todo_items')
        .insert({ event_id: event.id, task_content: text, created_by: 'user' })
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      setTodos(curr => curr.map(t => t.id === tempId ? { ...data, __busy: false } : t));
      toast('已添加', 'success');
    } catch (e2) {
      setTodos(curr => curr.filter(t => t.id !== tempId)); // 回滚临时项
      setAddText(text); // 保留输入以便重试
      toast(`添加失败：${e2.message || ''}`, 'error');
    } finally {
      setAdding(false);
    }
  };

  if (!event) {
    return <div className={styles.placeholder}>选择任务后显示该任务的 Todo</div>;
  }

  return (
    <div className={styles.wrap} aria-label="待办清单" role="region">
      <h3 className={styles.title}>待办清单</h3>

      <form onSubmit={handleAdd} className={styles.form}>
        <input
          name="todoContent"
          className={styles.input}
          placeholder="添加新的待办事项…"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          disabled={adding}
          aria-disabled={adding}
        />
        <button type="submit" className={styles.button} disabled={adding}>
          {adding ? '添加中…' : '+'}
        </button>
      </form>

      <div className={styles.group}>
        <div className={styles.groupHd}>
          <div className={styles.subtitle}>未完成</div>
          <div className={styles.count}>{grouped.pending.length}</div>
        </div>
        <ul className={styles.list}>
          {grouped.pending.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleComplete(todo)}
              onEdit={(newText, onDone, onError) => updateText(todo, newText, onDone, onError)}
              showCreatorLabel
            />
          ))}
        </ul>
      </div>

      <div className={styles.group}>
        <div className={styles.groupHd}>
          <div className={styles.subtitle}>已完成</div>
          <div className={`${styles.count} ${styles.muted}`}>{grouped.done.length}</div>
        </div>
        <ul className={styles.list}>
          {grouped.done.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleComplete(todo)}
              onEdit={(newText, onDone, onError) => updateText(todo, newText, onDone, onError)}
              showCreatorLabel
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
