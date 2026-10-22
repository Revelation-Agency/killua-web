/** Social & content calendar posts. Dashboard edits and agent ingest share one list. */
import { randomBytes } from 'node:crypto';
import { readDoc, readModifyWrite } from './store.js';
import { validateRecord } from './ingest.js';

export async function loadSocial(env = process.env) {
  return (await readDoc('social', null, env)) || { posts: [], as_of: null };
}

/** Create (no id) or edit (id given). Returns { post } or { errors }. */
export async function savePost(user, input, env = process.env) {
  const isNew = !input.id;
  const id = isNew ? `p_${randomBytes(6).toString('hex')}` : String(input.id).slice(0, 80);
  const r = validateRecord('social', { ...input, id });
  if (!r.value) return { errors: r.errors.map((e) => e.replace('scheduled_at', 'date').replace('platform', 'platform')) };
  let result = { errors: ['That post was not found.'] };
  await readModifyWrite('social', { posts: [] }, (doc) => {
    const now = new Date().toISOString();
    const i = doc.posts.findIndex((p) => p.id === id);
    if (isNew) {
      const post = { ...r.value, id, origin: 'dashboard', created_by: user.name, first_seen_at: now, updated_at: now, updated_by: user.name };
      doc.posts.push(post);
      result = { post };
    } else if (i >= 0) {
      doc.posts[i] = { ...doc.posts[i], ...r.value, id, updated_at: now, updated_by: user.name };
      result = { post: doc.posts[i] };
    }
    doc.as_of = now;
    return doc;
  }, env);
  return result;
}

export async function deletePost(id, env = process.env) {
  let found = false;
  await readModifyWrite('social', { posts: [] }, (doc) => {
    const n = doc.posts.length;
    doc.posts = doc.posts.filter((p) => p.id !== id);
    found = doc.posts.length < n;
    return doc;
  }, env);
  return found;
}
