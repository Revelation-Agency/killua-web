/**
 * Blaine's task list: ONE authoritative list. Owner and team add requests;
 * only admin sets status, progress and notes; every change is written to the
 * task's own history.
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sha, str } from './util.js';
import { readDoc, readModifyWrite } from './store.js';

export const STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_killua: 'Waiting on Killua',
  waiting_other: 'Waiting on someone else',
  done_live: 'Done (live)',
};
export const CATEGORIES = ['Automation', 'Ads', 'Website', 'Social', 'CRM', 'Sales agent', 'Other'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY = { tasks: [], seeded: [] };

export async function loadSeed() {
  try {
    const raw = await readFile(new URL('../../scripts/seed-tasks.json', import.meta.url), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Seed files may say "Waiting on Killua" or "Medium"; map those words to the stored keys. */
function statusKey(v) {
  const x = String(v || '').trim().toLowerCase();
  return Object.keys(STATUSES).find((k) => k === x || STATUSES[k].toLowerCase() === x || (k === 'done_live' && /^done/.test(x))) || 'not_started';
}
function priorityKey(v) {
  const x = String(v || '').trim().toLowerCase();
  return x === 'medium' ? 'normal' : PRIORITIES.includes(x) ? x : 'normal';
}

const newId = () => `t_${randomBytes(5).toString('hex')}`;

function validate(input, { partial = false } = {}) {
  const errors = [];
  const out = {};
  const has = (k) => input[k] !== undefined;
  if (!partial || has('title')) {
    out.title = str(input.title, 160);
    if (out.title.length < 3) errors.push('Give the request a short title.');
  }
  if (!partial || has('details')) out.details = str(input.details, 2000);
  if (!partial || has('category')) {
    out.category = CATEGORIES.includes(input.category) ? input.category : 'Other';
  }
  if (!partial || has('priority')) {
    out.priority = PRIORITIES.includes(input.priority) ? input.priority : 'normal';
  }
  if (!partial || has('due')) {
    out.due = str(input.due, 10);
    if (out.due && !DAY.test(out.due)) errors.push('Due date must look like 2026-11-05.');
  }
  return { out, errors };
}

function mergeSeed(doc, seed, now) {
  const seen = new Set([...(doc.seeded || []), ...doc.tasks.map((t) => t.id)]);
  let changed = false;
  for (const s of seed) {
    if (!s || !s.title) continue;
    const id = String(s.id || `seed_${sha(String(s.title).trim().toLowerCase()).slice(0, 10)}`).slice(0, 60);
    if (seen.has(id)) continue;
    seen.add(id);
    const status = statusKey(s.status);
    const v = validate({ ...s, priority: priorityKey(s.priority) }).out;
    doc.tasks.push({
      id,
      ...v,
      status,
      progress: Math.max(0, Math.min(100, parseInt(s.progress, 10) || (status === 'done_live' ? 100 : 0))),
      notes: str(s.notes, 2000),
      link: /^https?:\/\//i.test(s.link || '') ? str(s.link, 500) : '',
      source: str(s.source, 120),
      requested_by: 'seed',
      requested_by_name: 'Starting list',
      created_at: now,
      updated_at: now,
      completed_at: status === 'done_live' ? now : null,
      history: [{ at: now, by: 'Starting list', role: 'system', text: `Added to the list${s.source ? ` (from: ${str(s.source, 80)})` : ''}.` }],
    });
    doc.seeded = [...(doc.seeded || []), id];
    changed = true;
  }
  return changed;
}

/** All tasks, with any new starting-list items added first time they are seen. */
export async function loadTasks(env = process.env) {
  const seed = await loadSeed();
  const doc = (await readDoc('tasks', null, env)) || structuredClone(EMPTY);
  const probe = structuredClone(doc);
  if (!mergeSeed(probe, seed, new Date().toISOString())) return doc;
  return readModifyWrite('tasks', EMPTY, (cur) => {
    mergeSeed(cur, seed, new Date().toISOString());
    return cur;
  }, env);
}

export async function addTask(user, input, env = process.env) {
  const { out, errors } = validate(input);
  if (errors.length) return { errors };
  const now = new Date().toISOString();
  const task = {
    id: newId(),
    ...out,
    status: 'not_started',
    progress: 0,
    notes: '',
    link: '',
    requested_by: user.email,
    requested_by_name: user.name,
    created_at: now,
    updated_at: now,
    completed_at: null,
    history: [{ at: now, by: user.name, role: user.role, text: `Added request "${out.title}" (${out.priority} priority${out.due ? `, due ${out.due}` : ''}).` }],
  };
  await readModifyWrite('tasks', EMPTY, (doc) => {
    doc.tasks.unshift(task);
    return doc;
  }, env);
  return { task };
}

export async function updateTask(user, id, input, env = process.env) {
  let result = { errors: ['That task was not found.'] };
  await readModifyWrite('tasks', EMPTY, (doc) => {
    const t = doc.tasks.find((x) => x.id === id);
    if (!t) return doc;
    const now = new Date().toISOString();
    const log = [];
    if (input.comment) {
      const text = str(input.comment, 1000);
      if (text) log.push(`Comment: ${text}`);
    }
    if (user.role === 'admin') {
      const { out, errors } = validate(input, { partial: true });
      if (errors.length) {
        result = { errors };
        return doc;
      }
      for (const [k, v] of Object.entries(out)) {
        if (t[k] !== v) {
          log.push(`${{ title: 'Title', details: 'Details', category: 'Category', priority: 'Priority', due: 'Due date' }[k]} changed${k === 'details' ? '' : `: ${t[k] || 'none'} to ${v || 'none'}`}.`);
          t[k] = v;
        }
      }
      if (input.status !== undefined) {
        if (!STATUSES[input.status]) {
          result = { errors: ['Unknown status.'] };
          return doc;
        }
        if (input.status !== t.status) {
          log.push(`Status: ${STATUSES[t.status]} to ${STATUSES[input.status]}.`);
          t.status = input.status;
        }
      }
      if (input.link !== undefined) {
        const link = str(input.link, 500);
        if (link && !/^https?:\/\//i.test(link)) {
          result = { errors: ['The link must start with http:// or https://'] };
          return doc;
        }
        if (link !== t.link) {
          log.push(link ? `Link added: ${link}` : 'Link removed.');
          t.link = link;
        }
      }
      if (t.status === 'done_live' && !t.link) {
        result = { errors: ['To mark this Done (live), add the link where it can be checked.'] };
        return doc;
      }
      if (input.progress !== undefined) {
        const p = Math.max(0, Math.min(100, parseInt(input.progress, 10) || 0));
        if (p !== t.progress) {
          log.push(`Progress: ${t.progress}% to ${p}%.`);
          t.progress = p;
        }
      }
      if (t.status === 'done_live' && t.progress !== 100) {
        t.progress = 100;
      }
      if (input.notes !== undefined) {
        const notes = str(input.notes, 2000);
        if (notes !== t.notes) {
          log.push(notes ? `Notes: ${notes.slice(0, 300)}` : 'Notes cleared.');
          t.notes = notes;
        }
      }
      t.completed_at = t.status === 'done_live' ? t.completed_at || now : null;
    } else if (!input.comment) {
      result = { errors: ['Only Blaine can change a task. You can add a comment.'] };
      return doc;
    }
    if (!log.length) {
      result = { task: t, unchanged: true };
      return doc;
    }
    t.updated_at = now;
    for (const text of log) t.history.push({ at: now, by: user.name, role: user.role, text });
    result = { task: t };
    return doc;
  }, env);
  return result;
}
