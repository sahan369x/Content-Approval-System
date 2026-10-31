'use client';

import { useActionState, useState } from 'react';
import { login, type ActionResult } from './actions';
import type { Role } from '@/lib/types';

export default function LoginForm({ members }: { members: { id: string; name: string; role: Role }[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(login, {});
  const [memberId, setMemberId] = useState('');
  const needsPin = members.find((m) => m.id === memberId)?.role === 'director';

  return (
    <form action={action} className="stack">
      <label className="field">
        <span>Name</span>
        <select name="memberId" required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="" disabled>
            Select your name
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.role === 'director' ? ' (Content Director)' : ''}
            </option>
          ))}
        </select>
      </label>
      {needsPin && (
        <label className="field">
          <span>PIN</span>
          <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="\d{4,8}" autoFocus required />
        </label>
      )}
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn btn-dark btn-pill btn-block" disabled={pending || !memberId}>
        {pending ? 'Opening…' : 'Continue'}
      </button>
    </form>
  );
}
