import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../api/supabase';
import { useToast } from '../../components/Toast/context';
import TodoItem from './TodoItem';
import styles from './TodoPanel.module.css';

export default function TodoPanel({ event }) {
  const { toast } = useToast();
  const [todos, setTodos] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [doneCollapsed, setDoneCollapsed] = useState(true);


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

  const toggleComplete = async (todo) => {
    const snapshot = todos;
    // 完成时自动移出使命必达池
    const willComplete = !todo.is_completed;
    const patch = { is_completed: willComplete, ...(willComplete ? { is_mission_pool: false } : {}) };

    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, ...patch, __busy: true } : t));
    try {
      const { error } = await supabase
        .from('todo_items')
        .update(patch)
        .eq('id', todo.id);
      if (error) throw error;
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      toast(willComplete ? '已标记完成（并已从使命必达池移出）' : '已标记未完成', 'success');
    } catch (e) {
      setTodos(snapshot);
      toast(`操作失败：${e.message || ''}`, 'error');
    }
  };

  // === 新增：切换使命必达池（支持加入/移出） ===
  const toggleMissionPool = async (todo) => {
    const snapshot = todos;
    const willAdd = !todo.is_mission_pool;

    // 本地乐观更新 + busy 标记
    setTodos(prev =>
      prev.map(t =>
        t.id === todo.id ? { ...t, is_mission_pool: willAdd, __busy: true } : t
      )
    );

    try {
      if (willAdd) {
        const { error } = await supabase.rpc('add_to_mission_pool', { p_todo_id: Number(todo.id) });
        if (error) throw error;
        toast('已加入使命必达池', 'success');
      } else {
        const { error } = await supabase.rpc('remove_from_mission_pool', { p_todo_id: Number(todo.id) });
        if (error) throw error;
        toast('已从使命必达池移除', 'success');
      }

      // 去掉 busy
      setTodos(prev =>
        prev.map(t => (t.id === todo.id ? { ...t, __busy: false } : t))
      );
    } catch (e) {
      // 回滚
      setTodos(snapshot);
      toast(`操作失败：${e.message || ''}`, 'error');
    }
  };


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

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const text = (addText || '').trim();
    if (!event || !text || adding) return;
    setAdding(true);

    const tempId = `temp_${Date.now()}`;
    // 继承 event 的 start_time / end_time
    const temp = {
      id: tempId,
      event_id: event.id,
      task_content: text,
      is_completed: false,
      created_by: 'user',
      start_time: event.start_time,
      end_time: event.end_time,
      __temp: true, __busy: true
    };
    setTodos(curr => [temp, ...curr]);
    setAddText('');

    try {
      const { data, error } = await supabase
        .from('todo_items')
        .insert({
          event_id: event.id,
          task_content: text,
          created_by: 'user',
          start_time: event.start_time,
          end_time: event.end_time,
        })
        .select('*').limit(1).single();
      if (error) throw error;
      setTodos(curr => curr.map(t => t.id === tempId ? { ...data, __busy: false } : t));
      toast('已添加', 'success');
    } catch (e2) {
      setTodos(curr => curr.filter(t => t.id !== tempId));
      setAddText(text);
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
              onToggleMissionPool={() => toggleMissionPool(todo)}
              showCreatorLabel
            />
          ))}
        </ul>
      </div>
      <div className={styles.group}>
        <div
          className={styles.groupHd}
          style={{ cursor: 'pointer' }}
          onClick={() => setDoneCollapsed(v => !v)}
          title={doneCollapsed ? '展开已完成' : '收起已完成'}
        >
          <div className={styles.subtitle}>
            {doneCollapsed ? '▶ 已完成' : '▼ 已完成'}
          </div>
          <div className={`${styles.count} ${styles.muted}`}>{grouped.done.length}</div>
        </div>

        {!doneCollapsed && (
          <ul className={styles.list}>
            {grouped.done.map(todo => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => toggleComplete(todo)}
                onEdit={(newText, onDone, onError) => updateText(todo, newText, onDone, onError)}
                onToggleMissionPool={() => toggleMissionPool(todo)}
                showCreatorLabel
              />
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
