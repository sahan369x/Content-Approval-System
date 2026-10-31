export type Role = 'director' | 'editor';
export type Status = 'pending' | 'approved' | 'rejected';
export type Progress = 'not_started' | 'in_progress' | 'done';

export interface Member {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface Comment {
  id: string;
  submission_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Activity {
  id: number;
  submission_id: string;
  actor_id: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  editor_id: string;
  title: string;
  reference_url: string;
  notes: string | null;
  status: Status;
  progress: Progress;
  trello_url: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  comments: Comment[];
  activity: Activity[];
}

export type ColumnKey = 'waiting' | 'approved' | 'in_progress' | 'done' | 'rejected';

export function columnOf(s: Pick<Submission, 'status' | 'progress'>): ColumnKey {
  if (s.status === 'pending') return 'waiting';
  if (s.status === 'rejected') return 'rejected';
  if (s.progress === 'in_progress') return 'in_progress';
  if (s.progress === 'done') return 'done';
  return 'approved';
}

export const COLUMNS: { key: ColumnKey; label: string; short: string }[] = [
  { key: 'waiting', label: 'Waiting for approval', short: 'Waiting' },
  { key: 'approved', label: 'Approved', short: 'Approved' },
  { key: 'in_progress', label: 'In progress', short: 'In progress' },
  { key: 'done', label: 'Done', short: 'Done' },
  { key: 'rejected', label: 'Not approved', short: 'Declined' },
];

export const APP_NAME = 'Content Approval System';
