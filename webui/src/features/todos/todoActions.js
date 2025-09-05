import { supabase } from '../../api/supabase';

// 获取 YYYY-MM-DD（上海）
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

// 新：今日起止（ISO）
const getTodayRangeISO = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
  const y = Number(parts.find(p => p.type === 'year').value);
  const m = Number(parts.find(p => p.type === 'month').value);
  const day = Number(parts.find(p => p.type === 'day').value);
  const toISO = (Y, M, D, hh, mm, ss) => new Date(Date.UTC(Y, M - 1, D, hh, mm, ss)).toISOString();
  return { startISO: toISO(y,m,day,0,0,0), endISO: toISO(y,m,day,23,59,59) };
};

// --- 使命必达池操作（保持不变） ---
const addToMissionPool = async ({ todo, list, setList, toast }) => {
  const snapshot = list;
  setList(prev => prev.map(t => t.id === todo.id ? { ...t, is_mission_pool: true, __busy: true } : t));
  try {
    const { error } = await supabase.rpc('add_to_mission_pool', { p_todo_id: Number(todo.id) });
    if (error) throw error;
    setList(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
    toast('已加入使命必达池', 'success');
  } catch (e) {
    setList(snapshot);
    toast(`加入失败：${e.message || ''}`, 'error');
  }
};

const removeFromMissionPool = async ({ todo, list, setList, toast }) => {
  const snapshot = list;
  setList(curr => curr.map(t => t.id === todo.id ? { ...t, is_mission_pool: false, __busy: true } : t));
  try {
    const { error } = await supabase.rpc('remove_from_mission_pool', { p_todo_id: Number(todo.id) });
    if (error) throw error;
    setList(curr => curr.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
    toast('已从使命必达池移除', 'success');
  } catch (e) {
    setList(snapshot);
    toast(`移除失败：${e.message || ''}`, 'error');
  }
};

// --- 旧：仍保留（due_date 迁移期） ---
const setDueDateToToday = async ({ todo, list, setList, toast }) => {
  const today = ymd();
  if (todo.due_date === today) {
    toast('该待办已是今日待办', 'info');
    return;
  }
  const snapshot = list;
  setList(prev => prev.map(t => t.id === todo.id ? { ...t, due_date: today, __busy: true } : t));
  try {
    const { error } = await supabase
      .from('todo_items')
      .update({ due_date: today })
      .eq('id', todo.id);
    if (error) throw error;
    setList(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
    toast('已加入今日待办', 'success');
  } catch (e) {
    setList(snapshot);
    toast(`操作失败：${e.message || ''}`, 'error');
  }
};

// --- 新：把范围设为今天（start_time / end_time） ---
const setRangeToToday = async ({ todo, list, setList, toast }) => {
  const { startISO, endISO } = getTodayRangeISO();
  const snapshot = list;
  setList(prev => prev.map(t => t.id === todo.id ? { ...t, start_time: startISO, end_time: endISO, __busy: true } : t));
  try {
    const { error } = await supabase
      .from('todo_items')
      .update({ start_time: startISO, end_time: endISO })
      .eq('id', todo.id);
    if (error) throw error;
    setList(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
    toast('已设置为今日范围', 'success');
  } catch (e) {
    setList(snapshot);
    toast(`操作失败：${e.message || ''}`, 'error');
  }
};

export const todoActions = {
  mission: {
    add: addToMissionPool,
    remove: removeFromMissionPool,
  },
  date: {
    setToday: setDueDateToToday,    // 兼容旧逻辑
    setTodayRange: setRangeToToday, // 新逻辑
  },
  helpers: {
    getTodayYMD: ymd,
  }
};
