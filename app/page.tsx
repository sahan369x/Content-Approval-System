import { redirect } from 'next/navigation';
import { getCurrentMember, listMembers } from '@/lib/data';
import { DEMO } from '@/lib/store';
import { APP_NAME } from '@/lib/types';
import ThemeToggle from '@/components/ThemeToggle';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const me = await getCurrentMember();
  if (me) redirect(me.role === 'director' ? '/director' : '/editor');

  const members = await listMembers();

  return (
    <main className="login">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <div className="login-card">
        <div className="logo">
          <span className="logo-mark" />
          <span>{APP_NAME}</span>
        </div>
        <div>
          <h1>Who are you?</h1>
          <p className="muted">Pick your name to open your board.</p>
        </div>
        <LoginForm members={members.map((m) => ({ id: m.id, name: m.name, role: m.role }))} />
        {DEMO && (
          <p className="login-note">
            Demo mode, with sample data saved on this computer. Abdullah&rsquo;s PIN is <span className="mono">0011</span>.
          </p>
        )}
      </div>
    </main>
  );
}
