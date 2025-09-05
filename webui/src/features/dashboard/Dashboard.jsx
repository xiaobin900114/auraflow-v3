import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabase';
import DateBar from '../../components/DateBar/DateBar';
import FilterPanel from '../../components/FilterPanel/FilterPanel';
import ProjectPanel from '../projects/ProjectPanel';
import EventList from '../events/EventList';
import EventDetail from '../events/EventDetail';
import TodoPanel from '../todos/TodoPanel';
import TodayTodosPane from '../todos/TodayTodosPane';
import { ymdTZ } from '../../utils/date';

export default function Dashboard() {
  const [allEvents, setAllEvents] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [missionTodos, setMissionTodos] = useState([]);
  const [todayTodos, setTodayTodos] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);

  // ... 其他函数保持不变 ...
  const todaySH = useCallback(() => ymdTZ(new Date(), 'Asia/Shanghai'), []);
  
  // === 新增：今天的时间范围（上海时区） ===
  const getTodayRangeISO = (d = new Date()) => {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const y = Number(parts.find(p => p.type === 'year').value);
    const m = Number(parts.find(p => p.type === 'month').value);
    const day = Number(parts.find(p => p.type === 'day').value);
    const toISO = (Y, M, D, hh, mm, ss) =>
      new Date(Date.UTC(Y, M - 1, D, hh, mm, ss)).toISOString();
    return {
      startISO: toISO(y, m, day, 0, 0, 0),        // 今天 00:00:00（ISO）
      endISO: toISO(y, m, day, 23, 59, 59),     // 今天 23:59:59（ISO）
    };
  };


  // const loadInitialData = useCallback(async () => {
  //   const today = todaySH();
  //   const [
  //     { data: evts, error: evErr },
  //     { data: projs, error: projErr },
  //     { data: pool, error: poolErr },
  //     { data: rpcRows, error: rpcErr }
  //   ] = await Promise.all([
  //     supabase.from('events').select('*').order('created_at', { ascending: false }),
  //     supabase.from('projects').select('*').order('name', { ascending: true }),
  //     supabase.from('todo_items').select('*, events(id, title)').eq('is_mission_pool', true).eq('due_date', today).order('created_by', { ascending: false }).order('created_at', { ascending: true }),
  //     supabase.rpc('get_today_todos_shanghai')
  //   ]);
  //   if (evErr) console.error('[events] select error', evErr);
  //   setAllEvents(evts || []);
  //   if (projErr) console.error('[projects] select error', projErr);
  //   setAllProjects(projs || []);
  //   if (poolErr) console.error('[todos pool today] select error', poolErr);
  //   setMissionTodos(pool || []);
  //   let rows = [];
  //   if (rpcErr) {
  //      console.warn('[rpc get_today_todos_shanghai] fallback to due_date eq', today, rpcErr);
  //      const { data: fallback, error: fbErr } = await supabase.from('todo_items').select('*, events(id, title)').eq('due_date', today).neq('is_mission_pool', true).order('created_by', { ascending: false }).order('created_at', { ascending: true });
  //     if (fbErr) console.error('[todos fallback] select error', fbErr);
  //     rows = fallback || [];
  //   } else {
  //       rows = rpcRows || [];
  //       rows = rows.filter(r => r.is_mission_pool !== true).map(r => ({ ...r, events: r.events_id ? { id: r.events_id, title: r.events_title } : null, })).sort((a, b) => (a.created_by === 'user' ? 0 : 1) - (b.created_by === 'user' ? 0 : 1) || new Date(a.created_at) - new Date(b.created_at));
  //   }
  //   setTodayTodos(rows);
  //   console.log('[today]', today, 'projects=', (projs || []).length, 'pool=', (pool || []).length, 'nonPool=', rows.length);
  // }, [todaySH]);

  const loadInitialData = useCallback(async () => {
    const today = todaySH(); // 仍可用于日志
    const { startISO, endISO } = getTodayRangeISO();

    // 1) 基础数据（events / projects）
    const [
      { data: evts, error: evErr },
      { data: projs, error: projErr },
    ] = await Promise.all([
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('name', { ascending: true }),
    ]);
    if (evErr) console.error('[events] select error', evErr);
    setAllEvents(evts || []);
    if (projErr) console.error('[projects] select error', projErr);
    setAllProjects(projs || []);

    // 2) 使命必达池：仅看 is_mission_pool=true（不再按日期过滤）
    const { data: pool, error: poolErr } = await supabase
      .from('todo_items')
      .select('*, events(id, title)')
      .eq('is_mission_pool', true)
      .order('created_by', { ascending: false })
      .order('created_at', { ascending: true });
    if (poolErr) console.error('[todos mission pool] select error', poolErr);
    setMissionTodos(pool || []);

    // 3) 今日所有代办：按“与今天有时间交集”
    //    条件：start_time <= 今天结束 && end_time >= 今天开始
    //    并且排除使命必达池（is_mission_pool !== true），避免重复出现在两个区块
    const { data: rows, error: dayErr } = await supabase
      .from('todo_items')
      .select('*, events(id, title)')
      .lte('start_time', endISO)
      .gte('end_time', startISO)
      .neq('is_mission_pool', true)
      .order('created_by', { ascending: false })
      .order('created_at', { ascending: true });

    if (dayErr) {
      console.error('[today todos by time-range] select error', dayErr);
      setTodayTodos([]);
    } else {
      // 与原逻辑保持一致的映射/排序（最小改动）
      const normalized = (rows || [])
        .map(r => ({
          ...r,
          events: r.events?.id ? r.events : (r.events_id ? { id: r.events_id, title: r.events_title } : null)
        }))
        .sort((a, b) =>
          (a.created_by === 'user' ? 0 : 1) - (b.created_by === 'user' ? 0 : 1) ||
          new Date(a.created_at) - new Date(b.created_at)
        );
      setTodayTodos(normalized);
    }

    console.log(
      '[today]', today,
      'projects=', (projs || []).length,
      'pool=', (pool || []).length,
      'nonPool=', (rows || []).length
    );
  }, [todaySH]);

  
  useEffect(() => {
    loadInitialData();
    const channelAll = supabase.channel('auraflow-db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, loadInitialData).on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, loadInitialData).on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, loadInitialData).subscribe();
    return () => { supabase.removeChannel(channelAll); };
  }, [loadInitialData]);
  
  useEffect(() => { setSelectedEvent(null); }, [activeFilter]);

  const handleSelectEvent = (item) => {
    if (item?.events?.id) {
      const parentEvent = allEvents.find(e => e.id === item.events.id);
      setSelectedEvent(parentEvent || null);
    } else {
      setSelectedEvent(item || null);
    }
  };
  
  const handleSelectProject = (project) => {
    const newFilter = `project-${project.id}`;
    if (activeFilter === newFilter) {
      setActiveFilter('all');
    } else {
      setActiveFilter(newFilter);
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
        <div className="flex-[1] column bg-gray-50 divide-y divide-gray-200">
          <FilterPanel
            allEvents={allEvents}
            todayTodos={todayTodos}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            selectedDate={selectedDate} // 👈 核心修改：将 selectedDate 传递下去
          />
          <ProjectPanel
            projects={allProjects}
            allEvents={allEvents}
            activeFilter={activeFilter}
            onSelectProject={handleSelectProject}
            selectedDate={selectedDate}
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