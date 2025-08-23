// =================================================================
// 文件: src/features/dashboard/Dashboard.jsx
// 描述: 仪表盘主页面（事件/今日代办/详情/待办列）
// 注意：依赖 utils/date 的 ymdTZ（Asia/Shanghai 自然日）
// =================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabase';
import DateBar from '../../components/DateBar/DateBar';
import FilterPanel from '../../components/FilterPanel/FilterPanel';
import EventList from '../events/EventList';
import EventDetail from '../events/EventDetail';
import TodoPanel from '../todos/TodoPanel';
import TodayTodosPane from '../todos/TodayTodosPane';
import { ymdTZ } from '../../utils/date';

export default function Dashboard() {
  const [allEvents, setAllEvents] = useState([]);
  const [missionTodos, setMissionTodos] = useState([]); // 今日使命必达池
  const [todayTodos, setTodayTodos] = useState([]);     // 今日（非池，独立+事件跨日，来自 RPC）
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);

  // 统一按上海自然日取 “today”
  const todaySH = useCallback(() => ymdTZ(new Date(), 'Asia/Shanghai'), []);

  // 加载数据（事件 / 今日使命池 / 今日非池）
  const loadInitialData = useCallback(async () => {
    const today = todaySH();

    // 1) 事件列表
    const { data: evts, error: evErr } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });
    if (evErr) console.error('[events] select error', evErr);
    setAllEvents(evts || []);

    // 2) 使命必达池（今天）
    const { data: pool, error: poolErr } = await supabase
      .from('todo_items')
      .select('*, events(id, title)')
      .eq('is_mission_pool', true)
      .eq('due_date', today)
      // user 置顶（user > ai_agent），再按创建时间升序
      .order('created_by', { ascending: false })
      .order('created_at', { ascending: true });
    if (poolErr) console.error('[todos pool today] select error', poolErr);
    setMissionTodos(pool || []);

    // 3) 今日全部（非池）：优先用 RPC（独立 + 事件跨日），失败时回退到 due_date 精确匹配
    let rows = [];
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_today_todos_shanghai');
    if (rpcErr) {
      console.warn('[rpc get_today_todos_shanghai] fallback to due_date eq', today, rpcErr);
      const { data: fallback, error: fbErr } = await supabase
        .from('todo_items')
        .select('*, events(id, title)')
        .eq('due_date', today)
        .neq('is_mission_pool', true) // 注意包含 NULL
        .order('created_by', { ascending: false })
        .order('created_at', { ascending: true });
      if (fbErr) console.error('[todos fallback] select error', fbErr);
      rows = fallback || [];
    } else {
      rows = rpcRows || [];
      // 把 RPC 的扁平 events 字段拼回 { events: { id, title } }，以复用现有交互
      rows = rows
        .filter(r => r.is_mission_pool !== true) // “非池”专区
        .map(r => ({
          ...r,
          events: r.events_id ? { id: r.events_id, title: r.events_title } : null,
        }))
        // user 置顶 -> created_at 升序（与你之前一致）
        .sort(
          (a, b) =>
            (a.created_by === 'user' ? 0 : 1) - (b.created_by === 'user' ? 0 : 1) ||
            new Date(a.created_at) - new Date(b.created_at)
        );
    }
    setTodayTodos(rows);

    // 调试：一次性确认条数
    console.log('[today]', today, 'pool=', (pool || []).length, 'nonPool=', rows.length);
  }, [todaySH]);

  // Realtime 监听（todo_items / events 任意变动都刷新）
  useEffect(() => {
    loadInitialData();

    const channelTodos = supabase
      .channel('todos-today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, loadInitialData)
      .subscribe();

    const channelEvents = supabase
      .channel('events-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, loadInitialData)
      .subscribe();

    return () => {
      supabase.removeChannel(channelTodos);
      supabase.removeChannel(channelEvents);
    };
  }, [loadInitialData]);

  // 点击 Today 列里的某条（独立 or 事件型）
  const handleSelectEvent = (item) => {
    // TodayTodosPane 里传上来的 item 可能是独立 todo（没有 events）
    if (item?.events?.id) {
      const parentEvent = allEvents.find(e => e.id === item.events.id);
      setSelectedEvent(parentEvent || null);
    } else {
      // 若直接点了 EventList 列的事件卡片，会把 event 对象传进来
      setSelectedEvent(item || null);
    }
  };

  return (
    <section className="h-full flex flex-col">
      <DateBar
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onLogout={() => supabase.auth.signOut()}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* 左：分类/筛选 */}
        <div className="flex-[1] column bg-gray-50">
          <FilterPanel
            allEvents={allEvents}
            // “今日待办”数量：把 使命池 + 非池 合起来用于数量展示
            todayTodos={[...(missionTodos || []), ...(todayTodos || [])]}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
          />
        </div>

        {/* 中左：事件列表 / 今日代办 切换 */}
        <div className="flex-[1.5] column bg-white p-0">
          {activeFilter === 'today_todos' ? (
            <TodayTodosPane
              missionTodos={missionTodos}
              todos={todayTodos}
              onSelectTodo={handleSelectEvent}
            />
          ) : (
            <EventList
              allEvents={allEvents}
              selectedDate={selectedDate}
              activeFilter={activeFilter}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
            />
          )}
        </div>

        {/* 中右：事件详情 */}
        <div className="flex-[2] column bg-white">
          <EventDetail event={selectedEvent} />
        </div>

        {/* 右：事件内 Todo 面板 */}
        <div className="flex-[1.5] column bg-gray-50">
          <TodoPanel event={selectedEvent} />
        </div>
      </div>
    </section>
  );
}
