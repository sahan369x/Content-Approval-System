import type { ReactNode } from 'react';
import { logout } from '@/app/actions';
import { DEMO } from '@/lib/store';
import type { Member } from '@/lib/types';
import AutoRefresh from './AutoRefresh';
import Avatar from './Avatar';
import Icon, { type IconName } from './Icon';
import ThemeToggle from './ThemeToggle';

interface Props {
  me: Member;
  title: string;
  nav: { href: string; label: string; icon: IconName; badge?: number }[];
  /** The tinted card above the profile in the sidebar. */
  callout: { title: string; body: string; href: string; cta: string };
  actions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({ me, title, nav, callout, actions, children }: Props) {
  return (
    <div className="app">
      <AutoRefresh />
      <div className="shell">
        <aside className="sidebar">
          <a href="#top" className="logo">
            <span className="logo-mark" />
            <span>
              Content
              <br />
              Approval
            </span>
          </a>
          <nav className="nav">
            {nav.map((item, i) => (
              <a key={item.href} href={item.href} className={i === 0 ? 'on' : ''}>
                <Icon name={item.icon} />
                {item.label}
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </a>
            ))}
          </nav>

          <div className="callout">
            <span className="callout-art" aria-hidden="true" />
            <h3>{callout.title}</h3>
            <p>{callout.body}</p>
            <a href={callout.href} className="btn btn-dark btn-pill">
              {callout.cta} <Icon name="arrow" size={14} />
            </a>
          </div>

          <div className="profile">
            <Avatar name={me.name} size={36} />
            <span className="profile-text">
              <strong>{me.name}</strong>
              <small>{me.role === 'director' ? 'Content Director' : 'Editor'}</small>
            </span>
            <form action={logout}>
              <button className="icon-btn" aria-label="Switch user" title="Switch user">
                <Icon name="logout" />
              </button>
            </form>
          </div>
        </aside>

        <main className="main" id="top">
          <header className="main-head">
            <h1>
              {title}
              {DEMO && <span className="demo-tag">Demo</span>}
            </h1>
            <div className="main-actions">
              {actions}
              <ThemeToggle />
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
