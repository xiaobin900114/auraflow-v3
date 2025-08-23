import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../api/supabase';
import { useToast } from '../../components/Toast/ToastProvider';
import styles from './TodayTodosPane.module.css';

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

// --- Helper Components & Icons (Moved outside for stability) ---

const PlusIcon = (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
        <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
    </svg>
);
const MinusIcon = (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
        <path d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" />
    </svg>
);
const CaretRight = (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
        <path d="M7 5l6 5-6 5V5z" />
    </svg>
);
const CaretDown = (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon} {...props}>
        <path d="M5 7l5 6 5-6H5z" />
    </svg>
);
const Empty = ({ text }) => <div className={styles.empty}>{text}</div>;

// ✅ 修复：将 AddForm 组件定义移到父组件外部
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

// ✅ 修复：将 Row 组件定义移到父组件外部
const Row = ({ 
    item, fromPool, list, setList, onSelectTodo,
    toggleIn, editIn, addToPool, removeFromPool 
}) => {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(item.task_content || '');
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef(null);
    const busy = !!item.__busy;

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(text.length, text.length);
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
        }
    }, [editing, text]);

    useEffect(() => {
        if (!item.__busy && !editing) setText(item.task_content || '');
    }, [item.task_content, item.__busy, editing]);

    const hasEvent = !!item?.events?.id;
    const needClamp = !expanded && (item.task_content || '').length > 38;

    const onSubmit = async () => {
        if (!editing) return;
        await editIn(list, setList, item, text, () => setEditing(false));
    };
    const onCancel = () => { setText(item.task_content || ''); setEditing(false); };

    return (
        <li className={`${styles.item} ${busy ? styles.busy : ''}`}>
            {/* 第一行：勾选 + 正文 */}
            <div className={styles.rowTop}>
                <input
                    className={styles.chk}
                    type="checkbox"
                    checked={!!item.is_completed}
                    onChange={() => !busy && toggleIn(list, setList, item)}
                    disabled={busy}
                    aria-disabled={busy}
                    aria-checked={!!item.is_completed}
                />

                {!editing ? (
                    <div className={styles.textWrap}>
                        <div
                            className={`${styles.txt} ${item.is_completed ? styles.done : ''} ${needClamp ? styles.clamp2 : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => !busy && setEditing(true)}
                            onKeyDown={(e) => {
                                if (busy) return;
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); }
                            }}
                            title="点击编辑"
                        >
                            {item.task_content}
                        </div>
                    </div>
                ) : (
                    <div className={styles.editRow}>
                        <textarea
                            ref={inputRef}
                            className={`${styles.todoInput} ${styles.editing}`}
                            value={text}
                            onChange={(e) => {
                                setText(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            rows={1}
                            disabled={busy}
                            onBlur={onSubmit}
                            onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit(); }
                                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
                                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                            }}
                        />
                    </div>
                )}
            </div>

            {/* 第二行：左=标签+来源，右=图标按钮（+/-）+ caret */}
            <div className={styles.rowBottom}>
                <div className={styles.srcRow}>
                    <span className={styles.badgePrimary}>
                        {item.created_by === 'ai_agent' ? 'AI' : 'User'}
                    </span>
                    <button
                        onClick={() => hasEvent && onSelectTodo?.(item)}
                        className={styles.src}
                        disabled={!hasEvent}
                        title={hasEvent ? item.events.title : '无关联事件'}
                    >
                        {hasEvent ? `来自：${item.events.title}` : '独立待办'}
                    </button>
                </div>

                <div className={styles.actions}>
                    {fromPool ? (
                        <button
                            className={styles.iconBtn}
                            disabled={busy}
                            onClick={() => removeFromPool(item)}
                            title="移出使命必达池"
                            aria-label="移出使命必达池"
                        >
                            <MinusIcon />
                        </button>
                    ) : (
                        <button
                            className={styles.iconBtn}
                            disabled={busy}
                            onClick={() => addToPool(item, false)}
                            title="加入使命必达池"
                            aria-label="加入使命必达池"
                        >
                            <PlusIcon />
                        </button>
                    )}

                    {!editing && (item.task_content || '').length > 38 && (
                        <button
                            className={styles.caretBtn}
                            onClick={() => setExpanded(v => !v)}
                            title={expanded ? '收起' : '展开'}
                            aria-label={expanded ? '收起' : '展开'}
                        >
                            {expanded ? <CaretDown /> : <CaretRight />}
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
};


// 组内排序：User 置顶 -> created_at 升序
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

    const toggleIn = async (list, setList, todo) => {
        const snapshot = list;
        setList(prev => prev.map(t => t.id === todo.id ? { ...t, is_completed: !t.is_completed, __busy: true } : t));
        try {
            const { error } = await supabase.from('todo_items')
                .update({ is_completed: !todo.is_completed })
                .eq('id', todo.id);
            if (error) throw error;
            setList(prev => prev.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
            toast(!todo.is_completed ? '已标记完成' : '已标记未完成', 'success');
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

    const addToPool = async (todo, fromPool) => {
        const list = fromPool ? poolList : dayList;
        const setList = fromPool ? setPoolList : setDayList;
        const snapshot = list;
        setList(curr => curr.map(t => t.id === todo.id ? { ...t, is_mission_pool: true, __busy: true } : t));
        try {
            const { error } = await supabase.rpc('add_to_mission_pool', { p_todo_id: Number(todo.id) });
            if (error) throw error;
            setList(curr => curr.map(t => t.id === todo.id ? { ...t, __busy: false } : t));
            toast('已加入使命必达池', 'success');
        } catch (e) {
            setList(snapshot); toast(`加入失败：${e.message || ''}`, 'error');
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

    const handleAddMission = async (e) => {
        e?.preventDefault?.();
        const text = (addText || '').trim();
        if (!text || adding) return;
        setAdding(true);
        const today = ymd(new Date());
        const tempId = `temp_${Date.now()}`;
        const temp = {
            id: tempId, event_id: null, task_content: text, is_completed: false,
            created_by: 'user', due_date: today, is_mission_pool: true, __temp: true, __busy: true,
        };
        setPoolList(curr => [temp, ...curr]);
        setAddText('');

        try {
            const { data, error } = await supabase
                .from('todo_items')
                .insert({
                    event_id: null, task_content: text, is_completed: false,
                    created_by: 'user', due_date: today, is_mission_pool: true,
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

    const renderRow = (item, fromPool) => (
        <Row 
            key={`${fromPool ? 'p' : 'd'}_${item.id}`}
            item={item} 
            fromPool={fromPool}
            list={fromPool ? poolList : dayList}
            setList={fromPool ? setPoolList : setDayList}
            onSelectTodo={onSelectTodo}
            toggleIn={toggleIn}
            editIn={editIn}
            addToPool={addToPool}
            removeFromPool={removeFromPool}
        />
    );

    return (
        <div className={styles.wrap}>
            <div className={styles.section}>
                <div className={styles.hd}>
                    <div className={styles.title}>使命必达池（今天）</div>
                    <div className={styles.count}>{groupedPool.unDone.length + groupedPool.done.length}</div>
                </div>

                {/* ✅ 修复：通过 props 传递数据和方法 */}
                <AddForm 
                    handleAddMission={handleAddMission}
                    addText={addText}
                    setAddText={setAddText}
                    adding={adding}
                />

                <div className={styles.subHd}><span>未完成</span><span className={styles.count}>{groupedPool.unDone.length}</span></div>
                {groupedPool.unDone.length ? (
                    <ul className={styles.list}>{groupedPool.unDone.map(t => renderRow(t, true))}</ul>
                ) : <Empty text="使命必达池里暂无未完成" />}

                {groupedPool.done.length > 0 && (
                    <>
                        <div className={styles.subHdMuted}><span>已完成</span><span className={`${styles.count} ${styles.muted}`}>{groupedPool.done.length}</span></div>
                        <ul className={styles.list}>{groupedPool.done.map(t => renderRow(t, true))}</ul>
                    </>
                )}
            </div>

            <div className={styles.section}>
                <div className={styles.hd}>
                    <div className={styles.title}>今日所有代办</div>
                    <div className={styles.count}>{groupedDay.unDone.length + groupedDay.done.length}</div>
                </div>

                <div className={styles.subHd}><span>未完成</span><span className={styles.count}>{groupedDay.unDone.length}</span></div>
                {groupedDay.unDone.length ? (
                    <ul className={styles.list}>{groupedDay.unDone.map(t => renderRow(t, false))}</ul>
                ) : <Empty text="今天没有未完成代办" />}

                {groupedDay.done.length > 0 && (
                    <>
                        <div className={styles.subHdMuted}><span>已完成</span><span className={`${styles.count} ${styles.muted}`}>{groupedDay.done.length}</span></div>
                        <ul className={styles.list}>{groupedDay.done.map(t => renderRow(t, false))}</ul>
                    </>
                )}
            </div>
        </div>
    );
}