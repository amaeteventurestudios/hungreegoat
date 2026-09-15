/* Focus mode from the original: countdown timer + to-do list (kept in localStorage). */
import { useEffect, useState } from 'react';
const key = 'hg.todos';
export default function FocusPanel() {
  const [end, setEnd] = useState<number | null>(null); const [left, setLeft] = useState(0); const [h, setH] = useState(0); const [m, setM] = useState(25);
  const [todos, setTodos] = useState<{ t: string; done: boolean }[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }); const [txt, setTxt] = useState('');
  useEffect(() => { if (end == null) return; const i = setInterval(() => { const l = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(l); if (l === 0) { setEnd(null); try { new Notification('HUNGREE Goat', { body: 'Focus session complete.' }); } catch {} } }, 500); return () => clearInterval(i); }, [end]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(todos)); } catch {} }, [todos]);
  const start = () => { const secs = h * 3600 + m * 60; if (!secs) return; setEnd(Date.now() + secs * 1000); setLeft(secs); try { Notification.requestPermission?.(); } catch {} };
  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (<>
    <h4>Focus Mode</h4>
    <div className="timer">{end == null ? (<div className="setup"><label>h<input type="number" min={0} max={12} value={h} onChange={e => setH(+e.target.value)} /></label><label>min<input type="number" min={0} max={59} value={m} onChange={e => setM(+e.target.value)} /></label><button className="go" onClick={start}>Start</button></div>) : (<div className="running"><div className="digits">{fmt(left)}</div><button className="go" onClick={() => setEnd(null)}>Stop</button></div>)}</div>
    <h4>To do list</h4>
    <form className="todo-add" onSubmit={e => { e.preventDefault(); if (txt.trim()) { setTodos([...todos, { t: txt.trim(), done: false }]); setTxt(''); } }}><input value={txt} onChange={e => setTxt(e.target.value)} placeholder="Add a task…" aria-label="New task" /><button type="submit">+</button></form>
    <ul className="todos">{todos.map((t, i) => <li key={i} className={t.done ? 'done' : ''}><label><input type="checkbox" checked={t.done} onChange={() => setTodos(todos.map((x, n) => n === i ? { ...x, done: !x.done } : x))} />{t.t}</label><button onClick={() => setTodos(todos.filter((_, n) => n !== i))} aria-label="Remove">✕</button></li>)}</ul>
  </>);
}
