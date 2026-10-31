'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { deleteSubmission, reviewSubmission, setProgress, type ActionResult } from '@/app/actions';
import { COLUMNS, columnOf, type ColumnKey, type Member, type Progress, type Status, type Submission } from '@/lib/types';
import { platformOf, thumbnailOf } from '@/lib/links';
import { pstShort } from '@/lib/time';
import Avatar from './Avatar';
import DetailPanel from './DetailPanel';
import Icon from './Icon';

interface Props {
  submissions: Submission[];
  members: Member[];
  me: Member;
}

type Move = { kind: 'review'; status: Status } | { kind: 'progress'; progress: Progress };

const PROGRESS_FOR: Partial<Record<ColumnKey, Progress>> = { approved: 'not_started', in_progress: 'in_progress', done: 'done' };

/**
 * What dropping a card on a column means, or null if that drop isn't allowed.
 * Abdullah moves cards between Waiting / Approved / Not approved (his decisions).
 * Editors move their own approved cards between Approved / In progress / Done.
 */
function moveFor(me: Member, s: Submission, target: ColumnKey): Move | null {
  if (columnOf(s) === target) return null;
  if (me.role === 'director') {
    if (target === 'waiting') return { kind: 'review', status: 'pending' };
    if (target === 'rejected') return { kind: 'review', status: 'rejected' };
    if (target === 'approved' && s.status !== 'approved') return { kind: 'review', status: 'approved' };
    return null;
  }
  if (s.editor_id !== me.id || s.status !== 'approved') return null;
  const progress = PROGRESS_FOR[target];
  return progress ? { kind: 'progress', progress } : null;
}

function stampFor(s: Submission, col: ColumnKey): [string, string] {
  if (col === 'approved') return ['Approved', pstShort(s.reviewed_at)];
  if (col === 'in_progress') return ['Started', pstShort(s.started_at)];
  if (col === 'done') return ['Done', pstShort(s.completed_at)];
  if (col === 'rejected') return ['Declined', pstShort(s.reviewed_at)];
  return ['Sent', pstShort(s.created_at)];
}

export default function Board({ submissions, members, me }: Props) {
  const isDirector = me.role === 'director';
  const [editor, setEditor] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ColumnKey | null>(null);
  // Where a card was just dropped, shown immediately while the server catches up.
  const [moved, setMoved] = useState<Record<string, ColumnKey>>({});
  const [trelloFor, setTrelloFor] = useState<string | null>(null);
  const [trello, setTrello] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  // Fresh server data replaces the optimistic positions.
  useEffect(() => setMoved({}), [submissions]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(undefined), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const editors = useMemo(
    () => members.filter((m) => m.role === 'editor' && (m.active || submissions.some((s) => s.editor_id === m.id))),
    [members, submissions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return submissions.filter((s) => {
      if (editor !== 'all' && s.editor_id !== editor) return false;
      if (!q) return true;
      const hay = `${s.title} ${s.reference_url} ${s.notes ?? ''} ${byId.get(s.editor_id)?.name ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [submissions, editor, query, byId]);

  const grouped = useMemo(() => {
    const g: Record<ColumnKey, Submission[]> = { waiting: [], approved: [], in_progress: [], done: [], rejected: [] };
    for (const s of filtered) g[moved[s.id] ?? columnOf(s)].push(s);
    // Waiting: oldest first so nothing gets forgotten. Everything else: newest first.
    g.waiting.reverse();
    return g;
  }, [filtered, moved]);

  const selected = openId ? submissions.find((s) => s.id === openId) ?? null : null;
  const dragging = dragId ? submissions.find((s) => s.id === dragId) ?? null : null;

  function act(fn: () => Promise<ActionResult>, undo?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        undo?.();
      }
    });
  }

  function drop(s: Submission, target: ColumnKey) {
    const move = moveFor(me, s, target);
    if (!move) return;
    if (move.kind === 'progress' && move.progress === 'done') {
      setTrello(s.trello_url ?? '');
      setTrelloFor(s.id);
      return;
    }
    if (move.kind === 'review' && move.status === 'pending' && s.started_at && !confirm('Move back to waiting? This clears its progress and times.')) return;

    setMoved((m) => ({ ...m, [s.id]: target }));
    const undo = () => setMoved(({ [s.id]: _, ...rest }) => rest);
    act(() => (move.kind === 'review' ? reviewSubmission(s.id, move.status) : setProgress(s.id, move.progress)), undo);
  }

  function confirmDone(e: React.FormEvent) {
    e.preventDefault();
    const id = trelloFor!;
    setMoved((m) => ({ ...m, [id]: 'done' }));
    setTrelloFor(null);
    act(() => setProgress(id, 'done', trello), () => {
      setMoved(({ [id]: _, ...rest }) => rest);
      setTrelloFor(id);
    });
  }

  function remove(s: Submission) {
    if (!confirm(`Delete "${s.title}"? It disappears from every board but stays saved in the database.`)) return;
    act(() => deleteSubmission(s.id));
  }

  const trelloCard = trelloFor ? submissions.find((s) => s.id === trelloFor) : null;

  return (
    <section className="card board-card" id="board">
      <div className="card-head wrap">
        <div className="board-title">
          <h2>{isDirector ? 'Approval board' : 'My board'}</h2>
          <span className="muted small">Drag cards between columns</span>
        </div>
        <div className="board-tools">
          {isDirector && (
            <div className="segmented-pills">
              <button className={editor === 'all' ? 'on' : ''} onClick={() => setEditor('all')}>
                All
              </button>
              {editors.map((m) => (
                <button key={m.id} className={editor === m.id ? 'on' : ''} onClick={() => setEditor(m.id)}>
                  {m.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <label className="search">
            <Icon name="search" size={16} />
            <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      </div>

      {error && !trelloFor && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}

      <div className={`board ${dragging ? 'is-dragging' : ''}`}>
        {COLUMNS.map((col) => {
          const accepts = dragging ? moveFor(me, dragging, col.key) !== null : false;
          return (
            <div
              key={col.key}
              className={`column ${dragging ? (accepts ? 'can-drop' : 'no-drop') : ''} ${overCol === col.key && accepts ? 'drop-over' : ''}`}
              onDragOver={(e) => {
                if (!accepts) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overCol !== col.key) setOverCol(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (dragging) drop(dragging, col.key);
                setDragId(null);
              }}
            >
              <div className="column-head">
                <span className={`swatch st-${col.key}`} />
                <h3>{col.label}</h3>
                <span className="column-count">{grouped[col.key].length}</span>
              </div>
              <div className="cards">
                {grouped[col.key].length === 0 && <p className="empty">{dragging && accepts ? 'Drop here' : 'No cards'}</p>}
                {grouped[col.key].map((s) => {
                  const thumb = thumbnailOf(s.reference_url);
                  const shownCol = moved[s.id] ?? columnOf(s);
                  const [label, when] = stampFor(s, shownCol);
                  const editorName = byId.get(s.editor_id)?.name ?? 'Unknown';
                  const canManage = isDirector || s.editor_id === me.id;
                  const draggable = COLUMNS.some((c) => moveFor(me, s, c.key) !== null);
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      className={`tile ${draggable ? 'draggable' : ''} ${dragId === s.id ? 'dragging' : ''} ${moved[s.id] && pending ? 'saving' : ''}`}
                      draggable={draggable}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', s.id);
                        setDragId(s.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      onClick={() => setOpenId(s.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpenId(s.id))}
                    >
                      {canManage && (
                        <button
                          className="tile-delete"
                          aria-label={`Delete ${s.title}`}
                          title="Delete"
                          disabled={pending}
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(s);
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                      {thumb ? (
                        <img className="thumb" src={thumb} alt="" loading="lazy" draggable={false} />
                      ) : (
                        <span className="thumb thumb-none">{platformOf(s.reference_url)}</span>
                      )}
                      <span className="tile-title">{s.title}</span>
                      <span className="tile-meta">
                        {isDirector && (
                          <span className="tile-who">
                            <Avatar name={editorName} size={20} />
                            {editorName}
                          </span>
                        )}
                        <span className="tile-time mono">
                          {label} {when}
                        </span>
                      </span>
                      {(s.comments.length > 0 || s.trello_url) && (
                        <span className="tile-foot">
                          {s.comments.length > 0 && (
                            <span className="chip tone-sand">
                              <Icon name="message" size={13} /> {s.comments.length}
                            </span>
                          )}
                          {s.trello_url && (
                            <span className="chip tone-sky">
                              <Icon name="trello" size={13} /> Trello
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {trelloCard && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setTrelloFor(null)}>
          <form className="dialog" onSubmit={confirmDone} role="dialog" aria-label="Add Trello link">
            <span className="quick-icon tone-mint">
              <Icon name="trello" />
            </span>
            <h3>Mark &ldquo;{trelloCard.title}&rdquo; as done</h3>
            <p className="muted small">Paste the Trello card link for this video so Abdullah can find it.</p>
            <input type="url" value={trello} onChange={(e) => setTrello(e.target.value)} placeholder="https://trello.com/c/…" autoFocus required />
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn btn-dark btn-pill" disabled={!trello.trim()}>
                <Icon name="flag" size={15} /> Mark as done
              </button>
              <button type="button" className="btn btn-pill btn-soft" onClick={() => setTrelloFor(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && <DetailPanel submission={selected} byId={byId} me={me} onClose={() => setOpenId(null)} />}
    </section>
  );
}
