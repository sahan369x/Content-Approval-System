'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  addComment,
  deleteSubmission,
  editSubmission,
  reviewSubmission,
  setProgress,
  type ActionResult,
} from '@/app/actions';
import { COLUMNS, columnOf, type Member, type Progress, type Submission } from '@/lib/types';
import { platformOf, thumbnailOf } from '@/lib/links';
import { duration, pst } from '@/lib/time';
import Avatar from './Avatar';
import Icon from './Icon';

interface Props {
  submission: Submission;
  byId: Map<string, Member>;
  me: Member;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  submitted: 'sent it for approval',
  approved: 'approved it',
  rejected: 'declined it',
  reopened: 'moved it back to waiting',
  edited: 'edited the details',
  'edited:link': 'changed the link',
  'edited:resubmitted': 'changed the link and resent it for approval',
  'progress:not_started': 'reset it to not started',
  'progress:in_progress': 'started editing',
  'progress:done': 'marked it done',
  deleted: 'deleted it',
};

const PROGRESS: { key: Progress; label: string }[] = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

export default function DetailPanel({ submission: s, byId, me, onClose }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [askTrello, setAskTrello] = useState(false);
  const [trello, setTrello] = useState('');

  const isDirector = me.role === 'director';
  const isOwner = s.editor_id === me.id;
  const canManage = isDirector || isOwner;
  const col = columnOf(s);
  const colLabel = COLUMNS.find((c) => c.key === col)!.label;
  const editorName = byId.get(s.editor_id)?.name ?? 'Unknown';
  const thumb = thumbnailOf(s.reference_url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function act(fn: () => Promise<ActionResult>, after?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else after?.();
    });
  }

  function pickProgress(p: Progress) {
    if (p === 'done') {
      setTrello(s.trello_url ?? '');
      setAskTrello(true);
      return;
    }
    setAskTrello(false);
    act(() => setProgress(s.id, p));
  }

  function postComment() {
    if (!comment.trim()) return;
    act(() => addComment(s.id, comment), () => setComment(''));
  }

  function onDelete() {
    if (confirm(`Delete "${s.title}"? It disappears from every board but stays saved in the database.`)) {
      act(() => deleteSubmission(s.id), onClose);
    }
  }

  const waited = duration(s.created_at, s.reviewed_at);
  const editTime = duration(s.started_at, s.completed_at);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={s.title}>
        <div className="drawer-head">
          <span className={`pill st-${col}`}>
            <span className={`swatch st-${col}`} /> {colLabel}
          </span>
          <div className="drawer-tools">
            {canManage && !editing && (
              <>
                <button className="icon-btn" onClick={() => setEditing(true)} title="Edit" aria-label="Edit">
                  <Icon name="edit" />
                </button>
                <button className="icon-btn danger" disabled={pending} onClick={onDelete} title="Delete" aria-label="Delete">
                  <Icon name="trash" />
                </button>
              </>
            )}
            <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {editing ? (
          <form
            className="stack panel"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              act(() => editSubmission(s.id, data), () => setEditing(false));
            }}
          >
            <label className="field">
              <span>Reference link</span>
              <input name="url" type="url" defaultValue={s.reference_url} required />
            </label>
            <label className="field">
              <span>Title</span>
              <input name="title" defaultValue={s.title} maxLength={200} />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea name="notes" rows={3} defaultValue={s.notes ?? ''} maxLength={4000} />
            </label>
            {s.progress === 'done' && (
              <label className="field">
                <span>Trello card link</span>
                <input name="trello" type="url" defaultValue={s.trello_url ?? ''} placeholder="https://trello.com/c/…" required />
              </label>
            )}
            {!isDirector && s.status !== 'pending' && <p className="muted small">Changing the reference link sends this back to Abdullah for approval.</p>}
            <div className="row">
              <button className="btn btn-dark btn-pill" disabled={pending}>
                Save changes
              </button>
              <button type="button" className="btn btn-pill btn-soft" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="drawer-title">
            <h2>{s.title}</h2>
            <span className="drawer-who">
              <Avatar name={editorName} size={24} /> {editorName} · {platformOf(s.reference_url)}
            </span>
            <a className="preview" href={s.reference_url} target="_blank" rel="noopener noreferrer">
              {thumb ? <img src={thumb} alt="" /> : <span className="thumb-none big">{platformOf(s.reference_url)}</span>}
              <span className="preview-cta">
                Open reference <Icon name="external" size={14} />
              </span>
            </a>
            {s.trello_url && (
              <a className="trello-link" href={s.trello_url} target="_blank" rel="noopener noreferrer">
                <Icon name="trello" size={18} />
                <span>
                  <strong>Trello card</strong>
                  <small>{s.trello_url}</small>
                </span>
                <Icon name="external" size={14} />
              </a>
            )}
            {s.notes && <p className="prewrap notes">{s.notes}</p>}
          </div>
        )}

        {isDirector && (
          <div className="panel">
            <h4>Decision</h4>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the editor (optional, posted as a comment)" />
            <div className="row">
              {s.status !== 'approved' && (
                <button className="btn btn-pill btn-lime" disabled={pending} onClick={() => act(() => reviewSubmission(s.id, 'approved', note), () => setNote(''))}>
                  <Icon name="check" size={15} /> Approve
                </button>
              )}
              {s.status !== 'rejected' && (
                <button className="btn btn-pill btn-coral" disabled={pending} onClick={() => act(() => reviewSubmission(s.id, 'rejected', note), () => setNote(''))}>
                  <Icon name="x" size={15} /> Decline
                </button>
              )}
              {s.status !== 'pending' && (
                <button className="btn btn-pill btn-soft" disabled={pending} onClick={() => act(() => reviewSubmission(s.id, 'pending', note), () => setNote(''))}>
                  Back to waiting
                </button>
              )}
            </div>
          </div>
        )}

        {isOwner && s.status === 'approved' && (
          <div className="panel">
            <h4>Progress</h4>
            <div className="progress-pick">
              {PROGRESS.map((p) => (
                <button
                  key={p.key}
                  className={`${s.progress === p.key ? 'on' : ''} pp-${p.key} ${askTrello && p.key === 'done' ? 'asking' : ''}`}
                  disabled={pending}
                  onClick={() => pickProgress(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {askTrello && (
              <form
                className="trello-ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => setProgress(s.id, 'done', trello), () => setAskTrello(false));
                }}
              >
                <label className="field">
                  <span>Paste the Trello card link for this video</span>
                  <input type="url" value={trello} onChange={(e) => setTrello(e.target.value)} placeholder="https://trello.com/c/…" autoFocus required />
                </label>
                <div className="row">
                  <button className="btn btn-dark btn-pill" disabled={pending || !trello.trim()}>
                    <Icon name="flag" size={15} /> Mark as done
                  </button>
                  <button type="button" className="btn btn-pill btn-soft" onClick={() => setAskTrello(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {isOwner && s.status === 'pending' && <p className="panel muted">Waiting for Abdullah to review.</p>}
        {isOwner && s.status === 'rejected' && <p className="panel muted">Declined. Check the comments, then edit the link or send a new one.</p>}

        <div className="panel">
          <h4>Times (Pacific)</h4>
          <dl className="times">
            <dt>Sent</dt>
            <dd>{pst(s.created_at)}</dd>
            {s.reviewed_at && (
              <>
                <dt>{s.status === 'rejected' ? 'Declined' : 'Approved'}</dt>
                <dd>
                  {pst(s.reviewed_at)}
                  {waited && <span className="muted"> · {waited} later</span>}
                </dd>
              </>
            )}
            {s.started_at && (
              <>
                <dt>Started</dt>
                <dd>{pst(s.started_at)}</dd>
              </>
            )}
            {s.completed_at && (
              <>
                <dt>Done</dt>
                <dd>
                  {pst(s.completed_at)}
                  {editTime && <span className="muted"> · took {editTime}</span>}
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className="panel">
          <h4>Comments</h4>
          {s.comments.length === 0 && <p className="muted small">No comments yet.</p>}
          <ul className="comments">
            {s.comments.map((c) => {
              const author = byId.get(c.author_id);
              const name = author?.name ?? 'Unknown';
              return (
                <li key={c.id} className={author?.role === 'director' ? 'from-director' : ''}>
                  <Avatar name={name} size={28} />
                  <div>
                    <div className="comment-meta">
                      <strong>{name}</strong>
                      {author?.role === 'director' && <span className="chip tone-lav">Director</span>}
                      <span className="mono muted">{pst(c.created_at)}</span>
                    </div>
                    <p className="prewrap">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {canManage && (
            <div className="composer">
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && postComment()}
                placeholder="Write a comment… (Ctrl+Enter to send)"
              />
              <button className="icon-btn filled" disabled={pending || !comment.trim()} onClick={postComment} aria-label="Send comment">
                <Icon name="send" />
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <h4>History</h4>
          <ol className="history">
            {s.activity.filter((a) => !a.action.startsWith('demo:')).map((a) => (
              <li key={a.id}>
                <span>
                  <strong>{(a.actor_id && byId.get(a.actor_id)?.name) || 'Someone'}</strong> {ACTION_LABELS[a.action] ?? a.action}
                </span>
                <span className="mono muted">{pst(a.created_at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
