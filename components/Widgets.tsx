import { COLUMNS, columnOf, type ColumnKey, type Member, type Submission } from '@/lib/types';
import { duration, pstDayKey, pstShort } from '@/lib/time';
import Avatar from './Avatar';
import Icon, { type IconName } from './Icon';

export function countByColumn(submissions: Submission[]): Record<ColumnKey, number> {
  const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, 0])) as Record<ColumnKey, number>;
  for (const s of submissions) counts[columnOf(s)]++;
  return counts;
}

function avgDuration(pairs: [string | null, string | null][]): string {
  const valid = pairs.filter(([a, b]) => a && b) as [string, string][];
  if (!valid.length) return '—';
  const avgMs = valid.reduce((sum, [a, b]) => sum + (Date.parse(b) - Date.parse(a)), 0) / valid.length;
  return duration(new Date(0).toISOString(), new Date(avgMs).toISOString()) ?? '—';
}

// ------------------------------------------------------------- Hero card

export function HeroCard(props: {
  label: string;
  value: number;
  unit: string;
  sub: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <section className="card hero">
      <div className="card-head">
        <h2>{props.label}</h2>
        {props.link && (
          <a href={props.link.href} className="hero-link">
            {props.link.label} <Icon name="arrow" size={14} />
          </a>
        )}
      </div>
      <div className="hero-value">
        <span>{props.value}</span>
        <span className="hero-unit">{props.unit}</span>
      </div>
      <div className="hero-foot">
        <span>{props.sub}</span>
        <span>Updated {pstShort(new Date().toISOString())} PT</span>
      </div>
    </section>
  );
}

// ----------------------------------------------------------- Quick stats

export function QuickStats({ submissions }: { submissions: Submission[] }) {
  const c = countByColumn(submissions);
  const tiles: { icon: IconName; label: string; value: string | number; tone: string }[] = [
    { icon: 'check', label: 'Approved', value: c.approved, tone: 'lime' },
    { icon: 'play', label: 'In progress', value: c.in_progress, tone: 'purple' },
    { icon: 'flag', label: 'Done', value: c.done, tone: 'mint' },
    { icon: 'x', label: 'Declined', value: c.rejected, tone: 'coral' },
    { icon: 'hourglass', label: 'Avg. review', value: avgDuration(submissions.map((s) => [s.created_at, s.reviewed_at])), tone: 'lav' },
    { icon: 'timer', label: 'Avg. edit', value: avgDuration(submissions.map((s) => [s.started_at, s.completed_at])), tone: 'sky' },
  ];
  return (
    <section className="card quick">
      {tiles.map((t) => (
        <div key={t.label} className="quick-tile">
          <span className={`quick-icon tone-${t.tone}`}>
            <Icon name={t.icon} size={17} />
          </span>
          <strong>{t.value}</strong>
          <small>{t.label}</small>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------ Status breakdown

export function StatusBreakdown({ submissions }: { submissions: Submission[] }) {
  const c = countByColumn(submissions);
  const total = submissions.length || 1;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Status breakdown</h2>
        <a href="#board" className="text-link">
          Open board
        </a>
      </div>
      <div className="stack-bar">
        {COLUMNS.filter((col) => c[col.key] > 0).map((col) => (
          <span key={col.key} className={`st-${col.key}`} style={{ flexGrow: c[col.key] }} title={`${col.label}: ${c[col.key]}`} />
        ))}
        {submissions.length === 0 && <span className="stack-empty" />}
      </div>
      <ul className="legend">
        {COLUMNS.map((col) => (
          <li key={col.key}>
            <span className={`swatch st-${col.key}`} />
            <span className="legend-label">{col.short}</span>
            <span className="legend-count mono">{c[col.key]}</span>
            <span className="legend-pct">{Math.round((c[col.key] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --------------------------------------------------------------- Heatmap

const WEEKS = 22;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One square per day (Pacific time) for the last ~5 months, shaded by how much happened that day. */
export function Heatmap({ submissions }: { submissions: Submission[] }) {
  const perDay = new Map<string, number>();
  for (const s of submissions) for (const a of s.activity) perDay.set(pstDayKey(a.created_at), (perDay.get(pstDayKey(a.created_at)) ?? 0) + 1);

  const today = new Date(`${pstDayKey(new Date())}T00:00:00Z`);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (WEEKS - 1) * 7 - today.getUTCDay());

  const days: { key: string; count: number; future: boolean }[] = [];
  const monthLabels: (string | null)[] = [];
  for (let w = 0; w < WEEKS; w++) {
    let label: string | null = null;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + w * 7 + d);
      const key = day.toISOString().slice(0, 10);
      if (day.getUTCDate() === 1 || (w === 0 && d === 0)) label = MONTHS[day.getUTCMonth()];
      days.push({ key, count: perDay.get(key) ?? 0, future: day > today });
    }
    monthLabels.push(label);
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const total = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Team activity</h2>
        <span className="muted small">{total} updates · last {WEEKS} weeks</span>
      </div>
      <div className="heatmap" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
        {days.map((d) => (
          <span key={d.key} className={`heat heat-${d.future ? 'x' : level(d.count)}`} title={`${d.key}: ${d.count} update${d.count === 1 ? '' : 's'}`} />
        ))}
      </div>
      <div className="heatmap-months" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
        {monthLabels.map((m, i) => (
          <span key={i}>{m ?? ''}</span>
        ))}
      </div>
      <div className="heat-legend">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat heat-${l}`} />
        ))}
        More
      </div>
    </section>
  );
}

// ------------------------------------------------------- Recent activity

const FEED_LABELS: Record<string, [string, string]> = {
  submitted: ['Sent', 'lav'],
  approved: ['Approved', 'lime'],
  rejected: ['Declined', 'coral'],
  reopened: ['Reopened', 'sand'],
  edited: ['Edited', 'sand'],
  'edited:link': ['Link changed', 'sand'],
  'edited:resubmitted': ['Resent', 'lav'],
  'progress:not_started': ['Reset', 'sand'],
  'progress:in_progress': ['Started', 'purple'],
  'progress:done': ['Done', 'mint'],
  deleted: ['Deleted', 'coral'],
};

export function RecentActivity({ submissions, members }: { submissions: Submission[]; members: Member[] }) {
  const names = new Map(members.map((m) => [m.id, m.name]));
  const feed = submissions
    .flatMap((s) => s.activity.filter((a) => a.action !== 'edited' && !a.action.startsWith('demo:')).map((a) => ({ a, s })))
    .sort((x, y) => y.a.created_at.localeCompare(x.a.created_at))
    .slice(0, 7);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Recent activity</h2>
      </div>
      {feed.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="feed">
        {feed.map(({ a, s }) => {
          const who = (a.actor_id && names.get(a.actor_id)) || 'Someone';
          const [verb, tone] = FEED_LABELS[a.action] ?? [a.action, 'sand'];
          return (
            <li key={a.id}>
              <Avatar name={who} size={34} />
              <span className="feed-text">
                <strong>{who}</strong>
                <span className="feed-title">{s.title}</span>
              </span>
              <span className="feed-side">
                <span className={`chip tone-${tone}`}>{verb}</span>
                <span className="mono muted">{pstShort(a.created_at)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
