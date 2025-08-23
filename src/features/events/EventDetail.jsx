import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabase';
import Note from '../notes/Note';
import styles from './EventDetail.module.css';

const STATUS_OPTIONS = ['to_do', 'in_progress', 'done', 'on_hold', 'cancelled'];

// 仅日期（上海时区），格式 mm/dd/yy
const fmtDateOnlyUS = (d) => {
  if (!d) return '';
  const tz = 'Asia/Shanghai';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
};

const getStartEnd = (evt) => {
  const startISO = evt?.start_at_utc || evt?.start_time || evt?.start || evt?.starts_at;
  const endISO   = evt?.end_at_utc   || evt?.end_time   || evt?.end   || evt?.ends_at;
  const s = startISO ? new Date(startISO) : null;
  const e = endISO ? new Date(endISO) : null;
  return { s, e };
};

// 只显示日期：同日展示一个日期，跨日展示 "mm/dd/yy – mm/dd/yy"
const fmtRangeDateOnly = (evt) => {
  const { s, e } = getStartEnd(evt);
  if (!s && !e) return '';
  if (s && e) {
    const sameDay =
      fmtDateOnlyUS(s) === fmtDateOnlyUS(e);
    return sameDay ? fmtDateOnlyUS(s) : `${fmtDateOnlyUS(s)} – ${fmtDateOnlyUS(e)}`;
  }
  if (s && !e) return fmtDateOnlyUS(s);
  if (!s && e) return fmtDateOnlyUS(e);
  return '';
};

export default function EventDetail({ event }) {
  const [notes, setNotes] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [status, setStatus] = useState(event?.status || 'to_do');
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    setStatus(event?.status || 'to_do');
  }, [event?.id, event?.status]);

  const fetchNotes = useCallback(async () => {
    if (!event?.id) { setNotes([]); return; }
    const { data } = await supabase
      .from('event_notes')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at');
    setNotes(data || []);
  }, [event?.id]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  useEffect(() => {
    if (!event?.id) return;

    const chNotes = supabase
      .channel(`realtime-notes-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_notes', filter: `event_id=eq.${event.id}` }, fetchNotes)
      .subscribe();

    const chEventRow = supabase
      .channel(`realtime-event-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${event.id}` }, () => {})
      .subscribe();

    return () => {
      supabase.removeChannel(chNotes);
      supabase.removeChannel(chEventRow);
    };
  }, [event?.id, fetchNotes]);

  const handleGenerateSummary = async () => {
    if (!event) return;
    setIsGenerating(true);
    try {
      await supabase.functions.invoke('generate-summary', { body: { event_uid: event.event_uid } });
    } catch (err) {
      alert('生成失败: ' + (err.message || err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    const content = e.target.elements.noteContent.value;
    if (content && event) {
      await supabase.from('event_notes').insert({ event_id: event.id, note_content: content });
      e.target.reset();
    }
  };

  const handleUpdateNote = async (noteId, newContent) => {
    await supabase.from('event_notes').update({ note_content: newContent }).eq('id', noteId);
  };

  const handleStatusChange = async (e) => {
    const next = e.target.value;
    if (!event?.id || next === status) return;
    setStatus(next);
    setSavingStatus(true);
    try {
      const { error } = await supabase.from('events').update({ status: next }).eq('id', event.id);
      if (error) throw error;
    } catch (err) {
      setStatus(event?.status || 'to_do');
      alert(`更新状态失败：${err.message || err}`);
    } finally {
      setSavingStatus(false);
    }
  };

  if (!event) {
    return <div className={styles.placeholder}>从列表中选择一个任务以查看详情</div>;
  }

  const dateLine = fmtRangeDateOnly(event);

  return (
    <div key={event.id} className="p-4 space-y-4">
      {/* 标题行：标题 + 状态下拉（更克制） */}
      <div className="flex justify-between items-center gap-2">
        <h2 className={`${styles.title} mr-2`}>{event.title}</h2>
        <select
          className="border rounded px-2 py-1 text-sm text-slate-700"
          value={status}
          onChange={handleStatusChange}
          disabled={savingStatus}
          aria-label="event status"
          title="状态"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {savingStatus && <span className="text-[12px] text-slate-500">保存中…</span>}
      </div>

      {/* 日期行：仅日期，淡化显示 */}
      {dateLine ? (
        <div className="text-xs text-slate-500 -mt-2">{dateLine}</div>
      ) : null}

      {/* 分类（保持原样，可选） */}
      {event.category ? (
        <div className={`${styles.category} mt-1`}>{event.category}</div>
      ) : null}

      {/* 描述 */}
      <div>
        <div className={styles.description}>
          {(() => {
            const text = event.description || '无描述';
            const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/\n/);
            return blocks.map((p, i) => <p key={i} className={styles.p}>{p}</p>);
          })()}
        </div>
      </div>

      {/* AI 摘要 */}
      <div>
        <h3 className={styles.subtitle}>AI 摘要</h3>
        <div className={styles.aiSummary}>
          {(() => {
            const text = event.ai_summary || '暂无摘要。';
            const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/\n/);
            return blocks.map((p, i) => <p key={i} className={styles.p}>{p}</p>);
          })()}
        </div>
        <button
          onClick={handleGenerateSummary}
          disabled={isGenerating}
          className={styles.button}
        >
          {isGenerating ? '生成中...' : '生成/更新'}
        </button>
      </div>

      {/* 笔记 */}
      <div>
        <h3 className={styles.subtitle}>笔记</h3>
        <div className="space-y-2">
          {notes.length === 0 ? (
            <div className={styles.placeholder}>暂无笔记</div>
          ) : (
            notes.map(note => <Note key={note.id} note={note} onSave={handleUpdateNote} />)
          )}
        </div>

        <form onSubmit={handleAddNote} className={styles.addNoteForm}>
          <div className="text-[11px] text-slate-500 mb-1">新增笔记</div>
          <div className="flex gap-2">
            <input name="noteContent" className={styles.input} placeholder="输入新的笔记内容…" required />
            <button type="submit" className={styles.addButton}>+</button>
          </div>
        </form>
      </div>
    </div>
  );
}
