import { redirect } from 'next/navigation';
import { getCurrentMember, listMembers, listSubmissions } from '@/lib/data';
import AppShell from '@/components/AppShell';
import Board from '@/components/Board';
import Icon from '@/components/Icon';
import SubmitForm from '@/components/SubmitForm';
import { countByColumn, HeroCard, StatusBreakdown } from '@/components/Widgets';

export const dynamic = 'force-dynamic';

export default async function EditorPage() {
  const me = await getCurrentMember();
  if (!me) redirect('/');
  if (me.role === 'director') redirect('/director');

  const [submissions, members] = await Promise.all([listSubmissions(me.id), listMembers(true)]);
  const counts = countByColumn(submissions);
  const toEdit = counts.approved + counts.in_progress;

  return (
    <AppShell
      me={me}
      title={`Hi, ${me.name.split(' ')[0]}`}
      nav={[
        { href: '#top', label: 'Overview', icon: 'overview' },
        { href: '#submit', label: 'New reference', icon: 'plus' },
        { href: '#board', label: 'My board', icon: 'board', badge: toEdit },
      ]}
      callout={{
        title: 'Finished a video?',
        body: 'Open its card, mark it Done and paste the Trello card link so Abdullah can find it.',
        href: '#board',
        cta: 'Open my board',
      }}
      actions={
        <a href="#submit" className="btn btn-dark btn-pill">
          <Icon name="plus" size={15} /> New reference
        </a>
      }
    >
      <div className="grid grid-top">
        <div className="col-stack">
          <HeroCard
            label="Ready to edit"
            value={toEdit}
            unit={toEdit === 1 ? 'video' : 'videos'}
            sub={
              <>
                <strong>{counts.waiting}</strong> waiting · <strong>{counts.done}</strong> done
              </>
            }
            link={{ href: '#board', label: 'My board' }}
          />
          <StatusBreakdown submissions={submissions} />
        </div>
        <SubmitForm />
      </div>
      <Board submissions={submissions} members={members} me={me} />
    </AppShell>
  );
}
