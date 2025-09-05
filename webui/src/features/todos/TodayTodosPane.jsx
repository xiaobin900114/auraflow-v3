import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../api/supabase';
import { useToast } from '../../components/Toast/ToastProvider';
import styles from './TodayTodosPane.module.css';
import TodayTodoItem from './TodayTodoItem';

// === 新增：获取“今日起止”的帮助函数（上海时区） ===
const getTodayRange = (d = new Date()) => {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  // 生成今天0点和23:59:59
  const tz = 'Asia/Shanghai';
  const toISOInTZ = (y, m, day, hh, mm, ss) => {
    // 构造本地（上海时区）时间，再转 ISO
    const dt = new Date(Date.UTC(y, m - 1, day, hh, mm, ss));
    // 这里假定后端使用 timestamptz，传 ISO 字符串即可
    return dt.toISOString();
  };
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
  const y = Number(parts.find(p => p.type === 'year').value);
  const m = Number(parts.find(p => p.type === 'month').value);
  const day = Number(parts.find(p => p.type === 'day').value);
  return {
    startISO: toISOInTZ(y, m, day, 0, 0, 0),
    endISO:   toISOInTZ(y, m, day, 23, 59, 59),
    y, m, day
  };
};

const ymd = (d = new Date()) => {
  const f = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = f.formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${day}`;
};

const Empty = ({ text }) => <div className={styles.empty}>{text}</div>;

const AddForm = ({ handleAddMission, addText, setAddText, adding }) => (
  <form onSubmit={handleAddMission} className={styles.form}>
    <input
      className={styles.input}
      placeholder="添加今天的关键任务…（回车提交）"
      value={addText}
      onChange={(e) => setAddText(e.target.value)}
      disabled={adding}
    />
    <button className={styles.button} type="submit" disabled={adding}>
      {adding ? '添加中…' : '+'}
    </button>
  </form>
);

const sortTodos = (a, b) => {
  const pa = a.created_by === 'user' ? 0 : 1;
  const pb = b.created_by === 'user' ? 0 : 1;
  if (pa !== pb) return pa - pb;
  const ta = a.created_at ? new Date(a.created_at).getTime() : Infinity;
  const tb = b.created_at ? new Date(b.created_at).getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
};

export default function TodayTodosPane({ missionTodos = [], todos = [], onSelectTodo }) {
  const { toast } = useToast();
  const [poolList, setPoolList] = useState(() => missionTodos || []);
  const [dayList, setDayList] = useState(() => todos || []);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const pendingEditRef = useRef(false);

  useEffect(() => { if (!pendingEditRef.current) setPoolList(missionTodos || []); }, [missionTodos]);
  useEffect(() => { if (!pendingEditRef.current) setDayList(todos || []); }, [todos]);

  const groupedPool = useMemo(() => {
    const unDone = [], done = [];
    for (const t of poolList) (t.is_completed ? done : unDone).push(t);
    unDone.sort(sortTodos); done.sort(sortTodos);
    return { unDone, done };
  }, [poolList]);

  const groupedDay = useMemo(() => {
    const unDone = [], done = [];
    for (const t of dayList) (t.is_completed ? done : unDone).push(t);
    unDone.sort(sortTodos); done.sort(sortTodos);
    return { unDone, done };
  }, [dayList]);

  const completedCombined = useMemo(() => {
    const mix = [
      ...groupedPool.done.map(t => ({ item: t, fromPool: true })),
      ...groupedDay.done.map(t => ({ item: t, fromPool: false })),
    ];
    mix.sort((a, b) => sortTodos(a.item, b.item));
    return mix;
  }, [groupedPool.done, groupedDay.done]);

  // === 改动：完成 -> 若置为完成，自动移出使命必达池（is_mission_pool:false） ===
  const toggleIn = async (list, setList, todo) => {
    const snapshot = list;
    const willComplete = !todo.is_completed;
    const localPatch = { is_completed: willComplete, ...(willComplete ? { is_mission_pool: false } : {}) };

    setList(prev => prev.map(t => t.id === todo.id ? { ...t, ...localPatch, __busy: true } : t));
    try {
      const { error } = await supabase
        .from('todo_items')
        .update(localPatch)
        .eq('id', todo.id);
      if (error) throw error;
      setList(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      toast(willComplete ? '已标记完成（并已从使命必达池移出）' : '已标记未完成', 'success');
    } catch (e) {
      setList(snapshot); toast(`操作失败：${e.message || ''}`, 'error');
    }
  };

  const editIn = async (list, setList, todo, newText, onDone) => {
    const trimmed = (newText || '').trim();
    if (trimmed === todo.task_content) return onDone?.('nochange');
    pendingEditRef.current = true;
    const snapshot = list;
    const patch = { task_content: trimmed, ...(todo.created_by === 'ai_agent' ? { created_by: 'user' } : {}) };
    setList(curr => curr.map(t => t.id === todo.id ? { ...t, ...patch, __busy: true } : t));
    try {
      const { error } = await supabase.from('todo_items').update(patch).eq('id', todo.id);
      if (error) throw error;
      setList(curr => curr.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      toast('已保存', 'success'); onDone?.();
    } catch (e) {
      setList(snapshot); toast(`保存失败：${e.message || ''}`, 'error');
    } finally {
      pendingEditRef.current = false;
    }
  };
  
  const addToPool = async (todo) => {
    const snapshot = dayList;
    setDayList(curr => curr.map(t => t.id === todo.id ? { ...t, is_mission_pool: true, __busy: true } : t));
    try {
      const { error } = await supabase.rpc('add_to_mission_pool', { p_todo_id: Number(todo.id) });
      if (error) throw error;
      setDayList(curr => curr.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      toast('已加入使命必达池', 'success');
    } catch (e) {
      setDayList(snapshot); toast(`加入失败：${e.message || ''}`, 'error');
    }
  };

  const removeFromPool = async (todo) => {
    const snapshot = poolList;
    setPoolList(curr => curr.map(t => t.id === todo.id ? { ...t, is_mission_pool: false, __busy: true } : t));
    try {
      const { error } = await supabase.rpc('remove_from_mission_pool', { p_todo_id: Number(todo.id) });
      if (error) throw error;
      setPoolList(curr => curr.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
      toast('已从使命必达池移除', 'success');
    } catch (e) {
      setPoolList(snapshot); toast(`移除失败：${e.message || ''}`, 'error');
    }
  };

  // === 改动：使命必达池里“新增”→ 使用今日起止的 start_time / end_time 写入 ===
  const handleAddMission = async (e) => {
    e?.preventDefault?.();
    const text = (addText || '').trim();
    if (!text || adding) return;
    setAdding(true);

    const { startISO, endISO } = getTodayRange(new Date());
    const tempId = `temp_${Date.now()}`;
    const temp = {
      id: tempId,
      event_id: null,
      task_content: text,
      is_completed: false,
      created_by: 'user',
      is_mission_pool: true,
      start_time: startISO,
      end_time: endISO,
      __temp: true, __busy: true,
    };
    setPoolList(curr => [temp, ...curr]);
    setAddText('');

    try {
      const { data, error } = await supabase
        .from('todo_items')
        .insert({
          event_id: null,
          task_content: text,
          created_by: 'user',
          is_mission_pool: true,
          start_time: startISO,
          end_time: endISO,
        })
        .select('*').limit(1).single();
      if (error) throw error;
      setPoolList(curr => curr.map(t => t.id === tempId ? { ...data, __busy: false } : t));
      toast('已添加到使命必达池', 'success');
    } catch (e2) {
      setPoolList(curr => curr.filter(t => t.id !== tempId));
      setAddText(text);
      toast(`添加失败：${e2.message || ''}`, 'error');
    } finally {
      setAdding(false);
    }
  };

  const renderRow = (item, fromPool) => {
    const list = fromPool ? poolList : dayList;
    const setList = fromPool ? setPoolList : setDayList;
    return (
      <TodayTodoItem
        key={`${fromPool ? 'p' : 'd'}_${item.id}`}
        item={item}
        fromPool={fromPool}
        onSelectTodo={onSelectTodo}
        toggle={() => toggleIn(list, setList, item)}
        edit={(newText, onDone) => editIn(list, setList, item, newText, onDone)}
        addToPool={() => addToPool(item)}
        removeFromPool={() => removeFromPool(item)}
      />
    );
  };

  return (
    <div className={styles.wrap}>
      {/* 使命必达池 */}
      <div className={styles.section}>
        <div className={styles.hd}>
          <div className={styles.title}>使命必达池（今天）</div>
          <div className={styles.count}>{groupedPool.unDone.length}</div>
        </div>
        <AddForm handleAddMission={handleAddMission} addText={addText} setAddText={setAddText} adding={adding} />
        <div className={styles.subHd}>
          <span>未完成</span>
          <span className={styles.count}>{groupedPool.unDone.length}</span>
        </div>
        {groupedPool.unDone.length ? (
          <ul className={styles.list}>{groupedPool.unDone.map(t => renderRow(t, true))}</ul>
        ) : <Empty text="使命必达池里暂无未完成" />}
      </div>

      {/* 今日所有代办（*列表本身的筛选建议在父层，见下文“父层查询改造”*） */}
      <div className={styles.section}>
        <div className={styles.hd}>
          <div className={styles.title}>今日所有代办</div>
          <div className={styles.count}>{groupedDay.unDone.length}</div>
        </div>
        <div className={styles.subHd}>
          <span>未完成</span>
          <span className={styles.count}>{groupedDay.unDone.length}</span>
        </div>
        {groupedDay.unDone.length ? (
          <ul className={styles.list}>{groupedDay.unDone.map(t => renderRow(t, false))}</ul>
        ) : <Empty text="今天没有未完成代办" />}
      </div>

      {/* 已完成 */}
      {completedCombined.length > 0 && (
        <div className={styles.section}>
          <div
            className={styles.hd}
            style={{ cursor: 'pointer' }}
            onClick={() => setCompletedCollapsed(v => !v)}
            title={completedCollapsed ? '展开已完成' : '收起已完成'}
          >
            <div className={styles.title}>
              {completedCollapsed ? '▶ 已完成' : '▼ 已完成'}
            </div>
            <div className={`${styles.count} ${styles.muted}`}>{completedCombined.length}</div>
          </div>

          {!completedCollapsed && (
            <ul className={styles.list}>
              {completedCombined.map(({ item, fromPool }) => renderRow(item, fromPool))}
            </ul>
          )}
        </div>
      )}

    </div>
  );
}
