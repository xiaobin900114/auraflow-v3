import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../api/supabase';
import DateBar from '../../components/DateBar/DateBar';
import FilterPanel from '../../components/FilterPanel/FilterPanel';
import ProjectPanel from '../projects/ProjectPanel';
import EventList from '../events/EventList';
import EventDetail from '../events/EventDetail';
import TodoPanel from '../todos/TodoPanel';
import TodayTodosPane from '../todos/TodayTodosPane';
import { ymdTZ } from '../../utils/date';
import CreateEventModal from '../events/CreateEventModal';
import { useToast } from '../../components/Toast/context';

export default function Dashboard() {
  const [allEvents, setAllEvents] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [missionTodos, setMissionTodos] = useState([]);
  const [todayTodos, setTodayTodos] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [createModalProject, setCreateModalProject] = useState(null);
  const { toast } = useToast();

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

  const activeProjectId = useMemo(() => {
    if (!activeFilter.startsWith('project-')) return null;
    const [, id] = activeFilter.split('-');
    const parsed = Number.parseInt(id, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [activeFilter]);

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    return allProjects.find(p => p.id === activeProjectId) || null;
  }, [activeProjectId, allProjects]);

  const handleOpenCreateEvent = (project) => {
    if (!project) return;
    setCreateModalProject(project);
  };

  const handleCloseCreateEvent = () => setCreateModalProject(null);

  const handleCreateEvent = useCallback(async (form) => {
    if (!createModalProject) return;
    const project = createModalProject;

    if (!form.title) {
      toast('请输入任务标题', 'error');
      throw new Error('title_required');
    }

    const startISO = form.startAt ? new Date(form.startAt).toISOString() : null;
    const endISO = form.endAt ? new Date(form.endAt).toISOString() : null;

    if (startISO && endISO && new Date(endISO) < new Date(startISO)) {
      toast('结束时间不能早于开始时间', 'error');
      throw new Error('invalid_time_range');
    }

    const eventsForProject = allEvents.filter(evt => evt.project_id === project.id);
    const metadataSource = eventsForProject.find(evt => evt.spreadsheet_id && evt.sheet_gid) || null;

    const spreadsheetId = project.spreadsheet_id
      || project.spreadsheetId
      || metadataSource?.spreadsheet_id
      || metadataSource?.spreadsheetId
      || null;

    const sheetGid = project.tasks_sheet_gid
      || project.sheet_gid
      || project.sheetGid
      || project.tasksSheetGid
      || metadataSource?.sheet_gid
      || metadataSource?.sheetGid
      || null;

    if (!spreadsheetId || !sheetGid) {
      toast('缺少 Google Sheet 配置，无法回写。请先同步项目信息。', 'error');
      throw new Error('missing_sheet_metadata');
    }

    const body = {
      title: form.title,
      status: form.status,
      priority: form.priority,
      owner: form.owner || null,
      description: form.description || null,
      start_time: startISO,
      end_time: endISO,
      project_id: project.id,
      category: project.category || metadataSource?.category || null,
      spreadsheet_id: spreadsheetId,
      sheet_gid: sheetGid,
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('create-event-with-sheet', {
        body: Object.fromEntries(
          Object.entries(body).filter(([, value]) => value !== undefined)
        ),
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        const detail = error?.context?.response?.statusText
          || error?.context?.response?.status
          || error?.message;
        throw new Error(data?.message || detail || 'Edge Function error');
      }
      if (!data?.event) {
        throw new Error(data?.message || '未返回事件数据。');
      }

      const createdEvent = data.event;

      toast('任务已创建并推送同步。', 'success');
      setSelectedEvent(createdEvent);
      setActiveFilter(`project-${createdEvent.project_id}`);
      if (startISO) {
        const parsed = new Date(startISO);
        if (!Number.isNaN(parsed.getTime())) {
          setSelectedDate(parsed);
        }
      }
      setCreateModalProject(null);
      return createdEvent;
    } catch (err) {
      console.error('[create event]', err);
      toast(`创建失败：${err.message || err}`, 'error');
      throw err;
    }
  }, [createModalProject, allEvents, toast, setActiveFilter, setSelectedEvent, setSelectedDate]);


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
            <>
              {activeProject && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
                  <div className="text-sm font-medium text-slate-700" title={activeProject.name}>{activeProject.name}</div>
                  <button
                    type="button"
                    onClick={() => handleOpenCreateEvent(activeProject)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-500"
                  >
                    <span className="text-base leading-none">＋</span>
                    <span>新增任务</span>
                  </button>
                </div>
              )}
              <EventList
                allEvents={allEvents}
                selectedDate={selectedDate}
                activeFilter={activeFilter}
                selectedEvent={selectedEvent}
                onSelectEvent={setSelectedEvent}
              />
            </>
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
      <CreateEventModal
        open={Boolean(createModalProject)}
        project={createModalProject}
        onClose={handleCloseCreateEvent}
        onSubmit={handleCreateEvent}
      />
    </section>
  );
}
