'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { store } from '@/lib/store';
import { clearSession, setSession } from '@/lib/session';
import { getCurrentMember } from '@/lib/data';
import type { Member, Progress, Role, Status } from '@/lib/types';

export type ActionResult = { error?: string };

const PIN_RE = /^\d{4,8}$/;

async function requireMember(role?: Role): Promise<Member> {
  const me = await getCurrentMember();
  if (!me) throw new Error('Your session expired. Please sign in again.');
  if (role && me.role !== role) throw new Error('You do not have permission to do that.');
  return me;
}

async function getSubmission(id: string) {
  const s = await store.getSubmission(id);
  if (!s) throw new Error('That submission no longer exists.');
  return s;
}

/** Director can touch anything; editors only their own submissions. */
async function getOwnedSubmission(me: Member, id: string) {
  const s = await getSubmission(id);
  if (me.role !== 'director' && s.editor_id !== me.id) throw new Error('You can only change your own submissions.');
  return s;
}

function parseLink(raw: FormDataEntryValue | null): URL {
  try {
    const url = new URL(String(raw ?? '').trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    return url;
  } catch {
    throw new Error('Please paste a full link starting with https://');
  }
}

function parseTrello(raw: FormDataEntryValue | string | null | undefined): string {
  try {
    const url = new URL(String(raw ?? '').trim());
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)trello\.com$/i.test(url.hostname)) throw new Error();
    return url.toString();
  } catch {
    throw new Error('Paste the Trello card link, e.g. https://trello.com/c/…');
  }
}

function readDetails(form: FormData) {
  const url = parseLink(form.get('url'));
  const title = String(form.get('title') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  const details: Record<string, string | null> = {
    reference_url: url.toString(),
    title: (title || url.hostname.replace(/^www\./, '')).slice(0, 200),
    notes: notes ? notes.slice(0, 4000) : null,
  };
  // The edit form only shows the Trello field once a video is done.
  if (form.has('trello')) {
    const trello = String(form.get('trello') ?? '').trim();
    details.trello_url = trello ? parseTrello(trello) : null;
  }
  return details;
}

const RESET_REVIEW = {
  status: 'pending',
  reviewed_at: null,
  reviewed_by: null,
  progress: 'not_started',
  started_at: null,
  completed_at: null,
};

/** Runs an action, turning thrown errors into a friendly { error } and refreshing pages on success. */
async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath('/', 'layout');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

// ---------------------------------------------------------------- auth

/** Editors sign in by picking their name. Only the director needs a PIN. */
export async function login(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const memberId = String(form.get('memberId') ?? '');
  const pin = String(form.get('pin') ?? '');
  if (!memberId) return { error: 'Choose your name first.' };

  let member: Member | null;
  try {
    member = await store.getActiveMember(memberId);
    if (!member) return { error: 'That person is no longer on the team.' };
    if (member.role === 'director' && !(PIN_RE.test(pin) && (await store.verifyPin(memberId, pin)))) {
      return { error: 'Wrong PIN.' };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not sign in.' };
  }
  await setSession(memberId);
  redirect(member.role === 'director' ? '/director' : '/editor');
}

export async function logout() {
  await clearSession();
  redirect('/');
}

// --------------------------------------------------------- submissions

export async function submitReference(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember('editor');
    const { reference_url, title, notes } = readDetails(form);
    const id = await store.insertSubmission({ editor_id: me.id, reference_url: reference_url!, title: title!, notes });
    await store.insertActivity(id, me.id, 'submitted', null);
  });
}

/**
 * Edit link, title or notes. If an editor changes the link on something Abdullah
 * already reviewed, it goes back to "Waiting for approval".
 */
export async function editSubmission(id: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember();
    const s = await getOwnedSubmission(me, id);
    const details = readDetails(form);
    const linkChanged = details.reference_url !== s.reference_url;
    if (details.trello_url === null && s.progress === 'done') throw new Error('Done videos need a Trello card link.');
    const resubmit = linkChanged && me.role === 'editor' && s.status !== 'pending';

    await store.updateSubmission(id, {
      ...details,
      ...(resubmit ? RESET_REVIEW : {}),
      updated_at: new Date().toISOString(),
    });
    await store.insertActivity(id, me.id, resubmit ? 'edited:resubmitted' : linkChanged ? 'edited:link' : 'edited', null);
  });
}

/** Hides the card from every board. The record stays in the database and can be restored there. */
export async function deleteSubmission(id: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember();
    await getOwnedSubmission(me, id);
    await store.insertActivity(id, me.id, 'deleted', null);
    await store.softDeleteSubmission(id, me.id);
  });
}

/** Director: approve, reject (cancel), or send back to "waiting". An optional note is posted as a comment. */
export async function reviewSubmission(id: string, decision: Status, note?: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember('director');
    if (!['approved', 'rejected', 'pending'].includes(decision)) throw new Error('Invalid decision.');
    const s = await getSubmission(id);
    if (s.status === decision) return;

    const now = new Date().toISOString();
    const patch: Record<string, string | null> =
      decision === 'pending' ? RESET_REVIEW : { status: decision, reviewed_at: now, reviewed_by: me.id };
    await store.updateSubmission(id, { ...patch, updated_at: now });

    await store.insertActivity(id, me.id, decision === 'pending' ? 'reopened' : decision, null);
    const body = note?.trim();
    if (body) await store.insertComment(id, me.id, body.slice(0, 4000));
  });
}

/** Editor: move an approved submission between Not started / In progress / Done. Done needs the Trello card link. */
export async function setProgress(id: string, progress: Progress, trelloUrl?: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember('editor');
    if (!['not_started', 'in_progress', 'done'].includes(progress)) throw new Error('Invalid progress.');
    const s = await getSubmission(id);
    if (s.editor_id !== me.id) throw new Error('You can only update your own videos.');
    if (s.status !== 'approved') throw new Error('Wait for Abdullah to approve this before starting.');
    if (s.progress === progress) return;

    const now = new Date().toISOString();
    const patch: Record<string, string | null> = { progress, updated_at: now };
    if (progress === 'not_started') Object.assign(patch, { started_at: null, completed_at: null });
    if (progress === 'in_progress') Object.assign(patch, { started_at: now, completed_at: null });
    if (progress === 'done') {
      patch.trello_url = parseTrello(trelloUrl);
      // Keep the original start time when going In progress → Done.
      patch.completed_at = now;
      if (s.progress === 'not_started') patch.started_at = now;
    }

    await store.updateSubmission(id, patch);
    await store.insertActivity(id, me.id, `progress:${progress}`, null);
  });
}

export async function addComment(id: string, body: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember();
    const text = body.trim();
    if (!text) throw new Error('Comment is empty.');
    await getOwnedSubmission(me, id);
    await store.insertComment(id, me.id, text.slice(0, 4000));
  });
}

// ---------------------------------------------------------------- team

export async function addMember(form: FormData): Promise<ActionResult> {
  return run(async () => {
    await requireMember('director');
    const name = String(form.get('name') ?? '').trim();
    if (name.length < 2) throw new Error('Name is too short.');
    await store.createMember(name, 'editor', null);
  });
}

/** Director changes their own PIN. */
export async function changeMyPin(pin: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember('director');
    if (!PIN_RE.test(pin)) throw new Error('PIN must be 4–8 digits.');
    await store.setMemberPin(me.id, pin);
  });
}

export async function setMemberActive(memberId: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const me = await requireMember('director');
    if (memberId === me.id) throw new Error("You can't deactivate yourself.");
    await store.setMemberActive(memberId, active);
  });
}
