import { redirect } from 'next/navigation';
import { getCurrentMember, listMembers, listSubmissions } from '@/lib/data';
import AppShell from '@/components/AppShell';
import Board from '@/components/Board';
import TeamPanel from '@/components/TeamPanel';
import { countByColumn, Heatmap, HeroCard, QuickStats, RecentActivity, StatusBreakdown } from '@/components/Widgets';

export const dynamic = 'force-dynamic';

export default async function DirectorPage() {
  const me = await getCurrentMember();
  if (!me) redirect('/');
  if (me.role !== 'director') redirect('/editor');

  const [submissions, members] = await Promise.all([listSubmissions(), listMembers(true)]);
  const counts = countByColumn(submissions);
  const weekAgo = Date.now() - 7 * 24 * 3600_000;
  const sentThisWeek = submissions.filter((s) => Date.parse(s.created_at) > weekAgo).length;

  return (
    <AppShell
      me={me}
      title="Overview"
      nav={[
        { href: '#top', label: 'Overview', icon: 'overview' },
        { href: '#board', label: 'Approval board', icon: 'board', badge: counts.waiting },
        { href: '#team', label: 'Team', icon: 'team' },
      ]}
      callout={
        counts.waiting > 0
          ? { title: `${counts.waiting} waiting`, body: 'References are waiting for your review. Oldest ones are listed first.', href: '#board', cta: 'Review now' }
          : { title: 'All caught up', body: 'Nothing is waiting for review. New references will show up on the board.', href: '#board', cta: 'Open board' }
      }
    >
      <div className="grid grid-top">
        <HeroCard
          label="Waiting for your review"
          value={counts.waiting}
          unit={counts.waiting === 1 ? 'reference' : 'references'}
          sub={
            <>
              <strong>+{sentThisWeek}</strong> sent this week
            </>
          }
          link={{ href: '#board', label: 'Review' }}
        />
        <QuickStats submissions={submissions} />
      </div>
      <div className="grid grid-mid">
        <Heatmap submissions={submissions} />
        <StatusBreakdown submissions={submissions} />
      </div>
      <Board submissions={submissions} members={members} me={me} />
      <div className="grid grid-bottom">
        <RecentActivity submissions={submissions} members={members} />
        <TeamPanel members={members} submissions={submissions} />
      </div>
    </AppShell>
  );
}
