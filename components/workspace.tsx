'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Bot, CalendarDays, ChevronRight, Command, GitBranch, Inbox, Layers3, LogOut, Menu, Search, Settings2, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { api, post, Loading } from './ui';
import { Overview } from './views/overview';
import { Leads, Appointments } from './views/records';
import { InboxView } from './views/inbox';
import { Knowledge, Automations, Executions } from './views/operations';
import { SettingsView } from './views/settings';
import { CustomerChat } from './customer-chat';
const nav = [
  { id: 'overview', title: 'Overview', icon: Layers3, description: 'A clear view of your connected operations.' },
  { id: 'inbox', title: 'Unified inbox', icon: Inbox, description: 'Every channel. One continuous customer experience.' },
  { id: 'assistant', title: 'AI assistant', icon: Sparkles, description: 'Experience your customer-facing agent in a separate session.' },
  { id: 'leads', title: 'Relationships', icon: Users, description: 'Turn meaningful conversations into lasting relationships.' },
  { id: 'appointments', title: 'Appointments', icon: CalendarDays, description: 'A shared calendar with conflict-safe scheduling.' },
  { id: 'knowledge', title: 'Knowledge', icon: Layers3, description: 'Give your agent a reliable source of business truth.' },
  { id: 'automations', title: 'Automations', icon: GitBranch, description: 'Less repetitive work. More room for your team.' },
  { id: 'executions', title: 'Activity & logs', icon: Activity, description: 'See what ran, what changed and what needs attention.' },
  { id: 'settings', title: 'Connections', icon: Settings2, description: 'Your infrastructure, credentials and connected channels.' }
];
export function Workspace({ screen }: { screen: string }) {
  const [ready, setReady] = useState(false), [menu, setMenu] = useState(false), [search, setSearch] = useState(''), [palette, setPalette] = useState(false);
  useEffect(() => { api('auth/status').then(d => { if (!d.authenticated) window.location.replace('/login'); else setReady(true); }).catch(() => window.location.replace('/login')); }, []);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setPalette(v => !v); } if (e.key === 'Escape') { setPalette(false); setMenu(false); } }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, []);
  const current = nav.find(n => n.id === screen)!;
  if (!ready) return <div className="boot"><span className="brand-mark">A<span/></span><Loading/></div>;
  return <div className="workspace"><a className="skip-link" href="#main">Skip to content</a>{menu && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMenu(false)}/>}
    <aside className={'sidebar ' + (menu ? 'sidebar-open' : '')}><Link href="/" className="brand"><span className="brand-mark">A<span/></span><span>AgentFlow<small>AI OPERATIONS</small></span></Link>
      <div className="workspace-switch"><span className="company-avatar">N</span><div>Nexa Digital<small>Demonstration workspace</small></div><ChevronRight size={15}/></div>
      <div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation">{nav.map((n, i) => <Link key={n.id} href={n.id === 'overview' ? '/' : '/' + n.id} onClick={() => setMenu(false)} className={'nav-item ' + (screen === n.id ? 'active' : '') + (i === 8 ? ' nav-settings' : '')} aria-current={screen === n.id ? 'page' : undefined}><n.icon size={18}/>{n.title}{screen === n.id && <span className="nav-dot"/>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="trust-card"><ShieldCheck size={19}/><div>Built on real actions<p>No simulated AI replies.<br/>Every action leaves a record.</p></div></div><div className="operator"><span className="avatar">AD</span><div>Administrator<small>Workspace operator</small></div><button className="icon-button" aria-label="Sign out" onClick={async () => { await post('auth/logout'); window.location.assign('/login'); }}><LogOut size={17}/></button></div></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{current.title}</strong></div><div className="topbar-actions"><button className="search-trigger" onClick={() => setPalette(true)}><Search size={15}/><span>Find a page</span><kbd>Ctrl K</kbd></button><a href="/chat" target="_blank" rel="noreferrer" className="button subtle">Open customer chat <ArrowUpRight size={14}/></a><span className="avatar small">AD</span></div></header>
      <main id="main" tabIndex={-1}><div className="page-heading"><div><div className="eyebrow">YOUR INTELLIGENT WORKSPACE</div><h1>{current.title}<span>.</span></h1><p>{current.description}</p></div><div className="page-date">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}<small>Fictional business · Real integrations</small></div></div>
        {screen === 'overview' && <Overview/>}{screen === 'inbox' && <InboxView/>}{screen === 'assistant' && <CustomerChat embedded/>}{screen === 'leads' && <Leads/>}{screen === 'appointments' && <Appointments/>}{screen === 'knowledge' && <Knowledge/>}{screen === 'automations' && <Automations/>}{screen === 'executions' && <Executions/>}{screen === 'settings' && <SettingsView/>}
        <footer className="page-footer"><span><span className="tiny-dot"/> AgentFlow AI</span><span>Thoughtfully automated. Human controlled.</span></footer>
      </main>
    </div>{palette && <div className="modal-backdrop" onClick={() => setPalette(false)}><section className="command-palette panel" role="dialog" aria-modal="true" aria-label="Find a page" onClick={e => e.stopPropagation()}><div className="command-input"><Search size={20}/><input autoFocus placeholder="Where would you like to go?" value={search} onChange={e => setSearch(e.target.value)}/><button className="icon-button" onClick={() => setPalette(false)} aria-label="Close search"><X size={18}/></button></div>{nav.filter(n => n.title.toLowerCase().includes(search.toLowerCase())).map(n => <Link key={n.id} href={n.id === 'overview' ? '/' : '/' + n.id} onClick={() => { setPalette(false); setSearch(''); }}><n.icon size={18}/><span>{n.title}</span><ChevronRight size={16}/></Link>)}</section></div>}
  </div>;
}
