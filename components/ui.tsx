'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Check, LoaderCircle, RefreshCw, X } from 'lucide-react';
export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch('/api/' + path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data: any; try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Check the application terminal.'); }
  if (!response.ok) { if (response.status === 401 && !path.startsWith('auth') && !path.startsWith('chat')) window.location.assign('/login'); throw new Error(data.error || `Request failed (${response.status})`); }
  return data;
}
export const post = (path: string, data: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(data) });
export function useData(path: string | null, poll = 0) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => { let live = true; let busy = false; setData(null); setLoading(true); setError('');
    const load = async () => { if (!path || busy) return; busy = true; try { const value = await api(path); if (live) { setData(value); setError(''); } } catch (e: any) { if (live) setError(e.message); } finally { busy = false; if (live) setLoading(false); } };
    void load(); const timer = poll ? setInterval(load, poll) : undefined;
    return () => { live = false; if (timer) clearInterval(timer); };
  }, [path, poll, revision]);
  return { data, error, loading, refresh };
}
export function useAction() {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  async function run(fn: () => Promise<any>, success = 'Changes saved.') { setBusy(true); setError(''); setNotice(''); try { const value = await fn(); setNotice(success); return value; } catch (e: any) { setError(e.message); return null; } finally { setBusy(false); } }
  return { busy, notice, error, run, clear: () => { setNotice(''); setError(''); } };
}
export function Notice({ error, message }: { error?: string; message?: string }) { if (!error && !message) return null; return <div role={error ? 'alert' : 'status'} className={'notice ' + (error ? 'notice-error' : 'notice-success')}>{error ? <AlertCircle size={17}/> : <Check size={17}/>}<span>{error || message}</span></div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><div className="empty-orbit"><span/></div><h3>{title}</h3><p>{children || 'Your real activity will appear here. No sample records have been added.'}</p></div>; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={22}/> Loading your workspace</div>; }
export function Badge({ value }: { value: string }) { return <span className={'badge badge-' + value.replace(/[^a-z_]/g, '')}>{value.replaceAll('_', ' ')}</span>; }
export function Channel({ value }: { value: string }) { const short: Record<string,string> = { website: 'W', whatsapp: 'WA', telegram: 'TG', slack: '#' }; return <span className={'channel channel-' + value} title={value}>{short[value] || value.slice(0, 2).toUpperCase()}</span>; }
export function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={'panel ' + className}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>; }
export function Refresh({ onClick }: { onClick: () => void }) { return <button className="button subtle" onClick={onClick}><RefreshCw size={15}/> Refresh</button>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) { return <button className="button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={16}/>} {children}</button>; }
export function Stat({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon: ReactNode }) { return <div className="stat"><div className="stat-label">{label}<span>{icon}</span></div><strong>{value}</strong><small>{note}</small></div>; }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) { useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [close]); return <div className="modal-backdrop" onClick={close}><section className="modal panel" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}><div className="panel-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></div>{children}</section></div>; }
export const date = (value: string | null, detailed = false) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', ...(detailed ? { timeStyle: 'short' as const } : {}) }).format(new Date(value)) : 'Not yet';
export const initials = (name: string) => name.split(' ').slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
