import { supabase } from '../../api/supabase';

// 辅助函数：获取上海时区的 YYYY-MM-DD 格式日期
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

// --- 使命必达池操作 ---
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

// --- 日期相关操作 ---
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

// 最终导出的对象
export const todoActions = {
  mission: {
    add: addToMissionPool,
    remove: removeFromMissionPool,
  },
  date: {
    setToday: setDueDateToToday,
  },
  helpers: {
    getTodayYMD: ymd,
  }
};
