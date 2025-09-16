import React, { useState, useEffect } from 'react';

function toInputValue(date) {
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function CreateEventModal({ open, project, onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('to_do');
  const [priority, setPriority] = useState('medium');
  const [owner, setOwner] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(() => toInputValue(new Date()));
  const [endAt, setEndAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setStatus('to_do');
    setPriority('medium');
    setOwner('');
    setDescription('');
    setStartAt(toInputValue(new Date()));
    setEndAt('');
    setIsSaving(false);
  }, [open]);

  if (!open || !project) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit || isSaving) return;
    setIsSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        status,
        priority,
        owner: owner.trim(),
        description: description.trim(),
        startAt,
        endAt,
      });
    } catch {
      // 错误提示由父级通过 Toast 统一处理
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-slate-800">为「{project.name}」添加任务</h2>
          <p className="text-xs text-slate-500 mt-1">保存后会写入数据库并同步到关联的 Google Sheet。</p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-title">标题</label>
            <input
              id="event-title"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="任务标题"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-status">状态</label>
              <select
                id="event-status"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="to_do">to_do</option>
                <option value="in_progress">in_progress</option>
                <option value="done">done</option>
                <option value="on_hold">on_hold</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-priority">优先级</label>
              <select
                id="event-priority"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-start">开始时间</label>
              <input
                type="datetime-local"
                id="event-start"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-end">结束时间</label>
              <input
                type="datetime-local"
                id="event-end"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                min={startAt || undefined}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-owner">负责人</label>
            <input
              id="event-owner"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="可选"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="event-description">描述</label>
            <textarea
              id="event-description"
              rows={4}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选说明"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={isSaving ? undefined : onClose}
              className="px-3 py-2 text-sm text-slate-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-60"
              disabled={isSaving}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-3 py-2 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-500 disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? '保存中…' : '保存并同步'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
