'use client';

import { useRef, useState, useTransition } from 'react';
import { addMember, changeMyPin, setMemberActive, type ActionResult } from '@/app/actions';
import { COLUMNS, columnOf, type ColumnKey, type Member, type Submission } from '@/lib/types';
import { pstShort } from '@/lib/time';
import Avatar from './Avatar';
import Icon from './Icon';

export default function TeamPanel({ members, submissions }: { members: Member[]; submissions: Submission[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function act(fn: () => Promise<ActionResult>, after?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else after?.();
    });
  }

  const rows = members
    .filter((m) => m.role === 'editor')
    .map((m) => {
      const mine = submissions.filter((s) => s.editor_id === m.id);
      const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, 0])) as Record<ColumnKey, number>;
      for (const s of mine) counts[columnOf(s)]++;
      const last = mine.flatMap((s) => s.activity.filter((a) => a.actor_id === m.id && !a.action.startsWith('demo:')).map((a) => a.created_at)).sort().at(-1) ?? null;
      return { m, counts, last };
    });

  return (
    <section className="card" id="team">
      <div className="card-head">
        <h2>Team</h2>
        <button
          className="btn btn-pill btn-soft"
          disabled={pending}
          onClick={() => {
            const pin = prompt('New PIN for Abdullah (4–8 digits):');
            if (pin) act(() => changeMyPin(pin), () => alert('PIN updated.'));
          }}
        >
          <Icon name="lock" size={15} /> Change my PIN
        </button>
      </div>

      <div className="table-scroll">
        <table className="team">
          <thead>
            <tr>
              <th>Editor</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="num">
                  <span className={`swatch st-${c.key}`} /> {c.short}
                </th>
              ))}
              <th>Last active (PT)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, counts, last }) => (
              <tr key={m.id} className={m.active ? '' : 'inactive'}>
                <td>
                  <span className="team-name">
                    <Avatar name={m.name} size={28} />
                    {m.name}
                    {!m.active && <span className="chip tone-sand">Inactive</span>}
                  </span>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="num mono">
                    {counts[c.key]}
                  </td>
                ))}
                <td className="mono muted">{pstShort(last)}</td>
                <td className="right">
                  <button className="text-link" disabled={pending} onClick={() => act(() => setMemberActive(m.id, !m.active))}>
                    {m.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        ref={formRef}
        className="add-member"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          act(() => addMember(data), () => formRef.current?.reset());
        }}
      >
        <input name="name" placeholder="New editor's name" required minLength={2} />
        <button className="btn btn-dark btn-pill" disabled={pending}>
          <Icon name="plus" size={15} /> Add editor
        </button>
        {error && <span className="error">{error}</span>}
      </form>
    </section>
  );
}
