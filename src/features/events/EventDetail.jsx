import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabase';
import Note from '../notes/Note';
import styles from './EventDetail.module.css';

export default function EventDetail({ event }) {
  const [notes, setNotes] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!event) { setNotes([]); return; }
    const { data } = await supabase
      .from('event_notes')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at');
    setNotes(data || []);
  }, [event]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // 订阅当前事件的 notes 与 event 自身
  useEffect(() => {
    if (!event?.id) return;

    // notes 频道
    const chNotes = supabase
      .channel(`realtime-notes-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_notes', filter: `event_id=eq.${event.id}` }, (_p) => {
        // 简单稳妥：发生变更即刷新列表
        fetchNotes();
      })
      .subscribe();

    // event 本体（ai_summary 或 title/description 等变化）
    const chEventRow = supabase
      .channel(`realtime-event-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${event.id}` }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          // 覆盖当前 event 引用（父组件并不一定会推送，这里本地兜底）
          // 该组件本地没有 event 的 setState，因此只触发一次强制渲染可用 key
          // 更简单：触发一次无害的 setNotes，或依赖父组件的全局 events 监听更新
          // 这里选择无操作，因为父组件 Dashboard 有全局 events 订阅，会传入新的 event
        }
      })
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
      // 生成后 events 表会被更新，Dashboard 的 events 订阅会让本组件收到新的 event
    } catch (err) {
      alert('生成失败: ' + err.message);
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
      // 插入后 chNotes 会触发 fetchNotes()
    }
  };

  const handleUpdateNote = async (noteId, newContent) => {
    await supabase.from('event_notes').update({ note_content: newContent }).eq('id', noteId);
    // 更新后 chNotes 会触发 fetchNotes()
  };

  const renderParagraphs = (text) => {
    if (!text) return <p className={styles.p}>无</p>;
    const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/\n/);
    return blocks.map((p, i) => <p key={i} className={styles.p}>{p}</p>);
  };

  if (!event) {
    return <div className={styles.placeholder}>从列表中选择一个任务以查看详情</div>;
  }

  return (
    <div key={event.id} className="p-4 space-y-4">
      <div>
        <div className={styles.category}>{event.category || '-'}</div>
        <h2 className={styles.title}>{event.title}</h2>
      </div>

      <div>
        <div className={styles.description}>
          {renderParagraphs(event.description || '无描述')}
        </div>
      </div>

      <div>
        <h3 className={styles.subtitle}>AI 摘要</h3>
        <div className={styles.aiSummary}>
          {renderParagraphs(event.ai_summary || '暂无摘要。')}
        </div>
        <button
          onClick={handleGenerateSummary}
          disabled={isGenerating}
          className={styles.button}
        >
          {isGenerating ? '生成中...' : '生成/更新'}
        </button>
      </div>

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
