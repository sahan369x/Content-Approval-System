import fs from 'fs';
import path from 'path';
import { db } from './supabase';
import type { Activity, Comment, Member, Progress, Role, Status, Submission } from './types';

/**
 * Demo mode stores data in a local `.demo-data.json` file instead of Supabase, so the
 * site can be tried without any accounts. It turns on automatically in `npm run dev`
 * when SUPABASE_URL isn't set, or anywhere with DEMO_MODE=1. The live site on Vercel
 * always uses Supabase.
 */
export const DEMO =
  process.env.DEMO_MODE === '1' || (process.env.NODE_ENV !== 'production' && !process.env.SUPABASE_URL);

export interface SubmissionCore {
  id: string;
  editor_id: string;
  reference_url: string;
  status: Status;
  progress: Progress;
}

export interface Store {
  listMembers(includeInactive: boolean): Promise<Member[]>;
  getActiveMember(id: string): Promise<Member | null>;
  verifyPin(memberId: string, pin: string): Promise<boolean>;
  createMember(name: string, role: Role, pin: string | null): Promise<void>;
  setMemberPin(memberId: string, pin: string): Promise<void>;
  setMemberActive(memberId: string, active: boolean): Promise<void>;
  listSubmissions(editorId?: string): Promise<Submission[]>;
  getSubmission(id: string): Promise<SubmissionCore | null>;
  insertSubmission(row: { editor_id: string; reference_url: string; title: string; notes: string | null }): Promise<string>;
  /** Hides a submission. The row, its comments and history stay in the database. */
  softDeleteSubmission(id: string, actorId: string): Promise<void>;
  updateSubmission(id: string, patch: Record<string, string | null>): Promise<void>;
  insertComment(submissionId: string, authorId: string, body: string): Promise<void>;
  insertActivity(submissionId: string, actorId: string, action: string, detail: string | null): Promise<void>;
}

const DUPLICATE_NAME = 'Someone with that name already exists.';
const SUBMISSION_FIELDS =
  'id, editor_id, title, reference_url, notes, status, progress, trello_url, created_at, reviewed_at, reviewed_by, started_at, completed_at, updated_at';

function sortThreads(rows: Submission[]): Submission[] {
  for (const s of rows) {
    s.comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
    s.activity.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return rows;
}

// ------------------------------------------------------------ Supabase

const supabaseStore: Store = {
  async listMembers(includeInactive) {
    let q = db().from('members').select('id, name, role, active').order('role').order('name');
    if (!includeInactive) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) throw error;
    return data as Member[];
  },
  async getActiveMember(id) {
    const { data } = await db().from('members').select('id, name, role, active').eq('id', id).eq('active', true).maybeSingle();
    return (data as Member) ?? null;
  },
  async verifyPin(memberId, pin) {
    const { data, error } = await db().rpc('verify_pin', { p_member: memberId, p_pin: pin });
    if (error) throw new Error('Could not reach the database. Check your Supabase settings.');
    return Boolean(data);
  },
  async createMember(name, role, pin) {
    const { error } = await db().rpc('create_member', { p_name: name, p_role: role, p_pin: pin });
    if (error) throw new Error(error.code === '23505' ? DUPLICATE_NAME : error.message);
  },
  async setMemberPin(memberId, pin) {
    const { error } = await db().rpc('set_member_pin', { p_member: memberId, p_pin: pin });
    if (error) throw error;
  },
  async setMemberActive(memberId, active) {
    const { error } = await db().from('members').update({ active }).eq('id', memberId);
    if (error) throw error;
  },
  async listSubmissions(editorId) {
    let q = db()
      .from('submissions')
      .select(`${SUBMISSION_FIELDS}, comments(*), activity(*)`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (editorId) q = q.eq('editor_id', editorId);
    const { data, error } = await q;
    if (error) throw error;
    return sortThreads(data as unknown as Submission[]);
  },
  async getSubmission(id) {
    const { data, error } = await db()
      .from('submissions')
      .select('id, editor_id, reference_url, status, progress')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as SubmissionCore) ?? null;
  },
  async insertSubmission(row) {
    const { data, error } = await db().from('submissions').insert(row).select('id').single();
    if (error) throw error;
    return data.id as string;
  },
  async softDeleteSubmission(id, actorId) {
    const { error } = await db()
      .from('submissions')
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
      .eq('id', id);
    if (error) throw error;
  },
  async updateSubmission(id, patch) {
    const { error } = await db().from('submissions').update(patch).eq('id', id);
    if (error) throw error;
  },
  async insertComment(submissionId, authorId, body) {
    const { error } = await db().from('comments').insert({ submission_id: submissionId, author_id: authorId, body });
    if (error) throw error;
  },
  async insertActivity(submissionId, actorId, action, detail) {
    await db().from('activity').insert({ submission_id: submissionId, actor_id: actorId, action, detail });
  },
};

// ------------------------------------------------- Demo (local JSON file)

type MemMember = Member & { pin: string | null };
type MemSubmission = Omit<Submission, 'comments' | 'activity'> & { deleted_at: string | null; deleted_by: string | null };
interface MemDb {
  members: MemMember[];
  submissions: MemSubmission[];
  comments: Comment[];
  activity: Activity[];
  nextActivityId: number;
}

const DEMO_FILE = path.join(process.cwd(), '.demo-data.json');

function seed(): MemDb {
  const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
  const editors = ['Amir Mahdi', 'Alizera', 'Sahan', 'Thomas', 'Jhully', 'Dhruv'];
  const members: MemMember[] = [
    { id: 'm-abdullah', name: 'Abdullah', role: 'director', active: true, pin: '0011' },
    ...editors.map((name) => ({ id: `m-${name.toLowerCase().replace(/\s+/g, '-')}`, name, role: 'editor' as Role, active: true, pin: null })),
  ];
  const idOf = (name: string) => members.find((m) => m.name === name)!.id;

  const base = { notes: null, trello_url: null, reviewed_at: null, reviewed_by: null, started_at: null, completed_at: null, deleted_at: null, deleted_by: null };
  const sub = (id: string, editor: string, title: string, url: string, created: number, extra: Partial<MemSubmission> = {}): MemSubmission => ({
    ...base,
    id,
    editor_id: idOf(editor),
    title,
    reference_url: url,
    status: 'pending',
    progress: 'not_started',
    created_at: ago(created),
    updated_at: ago(created),
    ...extra,
  });
  const submissions: MemSubmission[] = [
    sub('s1', 'Sahan', 'Fast-cut travel intro', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 5, { notes: 'Want the whip-pan transitions for the Dubai vlog.' }),
    sub('s2', 'Thomas', 'Kinetic captions style', 'https://youtu.be/jNQXAC9IVRw', 26),
    sub('s3', 'Jhully', 'Documentary cold open', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 50, {
      status: 'approved', reviewed_at: ago(46), reviewed_by: 'm-abdullah',
    }),
    sub('s4', 'Amir Mahdi', 'Product B-roll montage', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', 72, {
      status: 'approved', progress: 'in_progress', reviewed_at: ago(70), reviewed_by: 'm-abdullah', started_at: ago(30),
    }),
    sub('s5', 'Dhruv', 'Shorts hook pacing', 'https://www.youtube.com/shorts/M7lc1UVf-VE', 120, {
      status: 'approved', progress: 'done', reviewed_at: ago(110), reviewed_by: 'm-abdullah', started_at: ago(100), completed_at: ago(60),
      trello_url: 'https://trello.com/c/AbCd1234/shorts-hook-pacing',
    }),
    sub('s6', 'Alizera', 'Glitch transition pack', 'https://www.instagram.com/reel/example', 96, {
      status: 'rejected', reviewed_at: ago(90), reviewed_by: 'm-abdullah',
    }),
  ];
  const comments: Comment[] = [
    { id: 'c1', submission_id: 's4', author_id: 'm-abdullah', body: 'Love this. Keep the colour grade warm like the reference.', created_at: ago(69) },
    { id: 'c2', submission_id: 's4', author_id: idOf('Amir Mahdi'), body: 'Got it, first cut by tomorrow.', created_at: ago(68) },
    { id: 'c3', submission_id: 's6', author_id: 'm-abdullah', body: 'Too flashy for our brand. Try something cleaner.', created_at: ago(90) },
  ];

  let n = 1;
  const activity: Activity[] = [];
  const log = (submission_id: string, actor_id: string, action: string, hours: number) =>
    activity.push({ id: n++, submission_id, actor_id, action, detail: null, created_at: ago(hours) });
  for (const s of submissions) log(s.id, s.editor_id, 'submitted', (Date.now() - Date.parse(s.created_at)) / 3600_000);
  log('s3', 'm-abdullah', 'approved', 46);
  log('s4', 'm-abdullah', 'approved', 70);
  log('s4', idOf('Amir Mahdi'), 'progress:in_progress', 30);
  log('s5', 'm-abdullah', 'approved', 110);
  log('s5', idOf('Dhruv'), 'progress:in_progress', 100);
  log('s5', idOf('Dhruv'), 'progress:done', 60);
  log('s6', 'm-abdullah', 'rejected', 90);

  // Background events spread over past months so the demo heatmap isn't empty. Hidden from history lists.
  for (let i = 0; i < 90; i++) {
    const s = submissions[i % submissions.length];
    log(s.id, s.editor_id, 'demo:background', 150 + ((i * 37) % 3200));
  }
  return { members, submissions, comments, activity, nextActivityId: n };
}

function load(): MemDb {
  try {
    return JSON.parse(fs.readFileSync(DEMO_FILE, 'utf8')) as MemDb;
  } catch {
    const fresh = seed();
    persist(fresh);
    return fresh;
  }
}

function persist(data: MemDb) {
  try {
    fs.writeFileSync(DEMO_FILE, JSON.stringify(data, null, 1));
  } catch {
    // Read-only filesystem: demo still works, it just won't survive a restart.
  }
}

// Cached on globalThis so hot reloads in `npm run dev` share one copy.
const g = globalThis as unknown as { __contentDemo?: MemDb };
const mem = () => (g.__contentDemo ??= load());
const save = () => persist(mem());
const newId = () => crypto.randomUUID();
const publicMember = ({ pin: _pin, ...m }: MemMember): Member => m;
const live = (s: MemSubmission) => !s.deleted_at;

const demoStore: Store = {
  async listMembers(includeInactive) {
    return mem()
      .members.filter((m) => includeInactive || m.active)
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
      .map(publicMember);
  },
  async getActiveMember(id) {
    const m = mem().members.find((x) => x.id === id && x.active);
    return m ? publicMember(m) : null;
  },
  async verifyPin(memberId, pin) {
    return mem().members.some((m) => m.id === memberId && m.active && m.pin !== null && m.pin === pin);
  },
  async createMember(name, role, pin) {
    const d = mem();
    if (d.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) throw new Error(DUPLICATE_NAME);
    d.members.push({ id: newId(), name, role, active: true, pin });
    save();
  },
  async setMemberPin(memberId, pin) {
    const m = mem().members.find((x) => x.id === memberId);
    if (m) m.pin = pin;
    save();
  },
  async setMemberActive(memberId, active) {
    const m = mem().members.find((x) => x.id === memberId);
    if (m) m.active = active;
    save();
  },
  async listSubmissions(editorId) {
    const d = mem();
    const rows = d.submissions
      .filter((s) => live(s) && (!editorId || s.editor_id === editorId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(({ deleted_at: _d, deleted_by: _b, ...s }) => ({
        ...s,
        comments: d.comments.filter((c) => c.submission_id === s.id).map((c) => ({ ...c })),
        activity: d.activity.filter((a) => a.submission_id === s.id).map((a) => ({ ...a })),
      }));
    return sortThreads(rows);
  },
  async getSubmission(id) {
    const s = mem().submissions.find((x) => x.id === id && live(x));
    return s ? { id: s.id, editor_id: s.editor_id, reference_url: s.reference_url, status: s.status, progress: s.progress } : null;
  },
  async insertSubmission(row) {
    const now = new Date().toISOString();
    const id = newId();
    mem().submissions.push({
      ...row, id, status: 'pending', progress: 'not_started', trello_url: null, created_at: now, updated_at: now,
      reviewed_at: null, reviewed_by: null, started_at: null, completed_at: null, deleted_at: null, deleted_by: null,
    });
    save();
    return id;
  },
  async softDeleteSubmission(id, actorId) {
    const s = mem().submissions.find((x) => x.id === id);
    if (s) Object.assign(s, { deleted_at: new Date().toISOString(), deleted_by: actorId });
    save();
  },
  async updateSubmission(id, patch) {
    const s = mem().submissions.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    save();
  },
  async insertComment(submissionId, authorId, body) {
    mem().comments.push({ id: newId(), submission_id: submissionId, author_id: authorId, body, created_at: new Date().toISOString() });
    save();
  },
  async insertActivity(submissionId, actorId, action, detail) {
    const d = mem();
    d.activity.push({ id: d.nextActivityId++, submission_id: submissionId, actor_id: actorId, action, detail, created_at: new Date().toISOString() });
    save();
  },
};

export const store: Store = DEMO ? demoStore : supabaseStore;
