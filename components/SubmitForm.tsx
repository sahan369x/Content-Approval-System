'use client';

import { useRef, useState, useTransition } from 'react';
import { submitReference } from '@/app/actions';
import Icon from './Icon';

export default function SubmitForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(undefined);
    setSent(false);
    start(async () => {
      const res = await submitReference(data);
      if (res.error) return setError(res.error);
      formRef.current?.reset();
      setSent(true);
    });
  }

  return (
    <section className="card" id="submit">
      <div className="card-head">
        <h2>New reference</h2>
        {sent && <span className="chip tone-lime">Sent for approval</span>}
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="stack">
        <label className="field">
          <span>Reference link</span>
          <input name="url" type="url" placeholder="https://youtube.com/watch?v=…" required />
        </label>
        <label className="field">
          <span>Title</span>
          <input name="title" maxLength={200} placeholder="Optional" />
        </label>
        <label className="field">
          <span>Notes for Abdullah</span>
          <textarea name="notes" rows={2} maxLength={4000} placeholder="What to take from this style, and which video it's for" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-dark btn-pill" disabled={pending}>
          <Icon name="send" size={15} /> {pending ? 'Sending…' : 'Send for approval'}
        </button>
      </form>
    </section>
  );
}
