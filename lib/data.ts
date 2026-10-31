import { store } from './store';
import { getSessionMemberId } from './session';
import type { Member, Submission } from './types';

export function listMembers(includeInactive = false): Promise<Member[]> {
  return store.listMembers(includeInactive);
}

export async function getCurrentMember(): Promise<Member | null> {
  const id = await getSessionMemberId();
  return id ? store.getActiveMember(id) : null;
}

/** All submissions (director) or just one editor's, with comments + activity attached. */
export function listSubmissions(editorId?: string): Promise<Submission[]> {
  return store.listSubmissions(editorId);
}
