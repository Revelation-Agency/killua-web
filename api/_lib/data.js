/** Loads everything the views need, with a few seconds of in-memory caching. */
import { readDoc } from './store.js';
import { PULL_IDS } from './sources/index.js';
import { ingestSnapshot } from './ingest.js';
import { loadTasks } from './tasks.js';

const PUSH = {
  nexa: { label: 'Nexa call history', staleHours: 36, needs: [{ who: 'Revelation', what: 'Set up the agent that pulls Nexa call history twice a day and posts it to the dashboard (see docs/dashboard-setup.md, "Ingest").' }] },
  email_leads: { label: 'Leads emailed to the leads inbox', staleHours: 72, needs: [{ who: 'Revelation', what: 'Set up the agent that reads the leads@ inbox and posts each lead to the dashboard.' }] },
  sales_agent: { label: 'AI sales assistant activity', staleHours: 72, needs: [{ who: 'Revelation', what: 'Have the sales assistant post each event it records to the dashboard.' }] },
  other_ads: { label: 'TikTok and other ad platforms', staleHours: 96, needs: [{ who: 'Taj', what: 'Tell Revelation which other ad platforms are running so reporting can be pointed here.' }] },
};
export const PUSH_SOURCES = PUSH;

let cache = { at: 0, value: null };
export const bustCache = () => {
  cache = { at: 0, value: null };
};

export async function loadAll(env = process.env, { fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 8000) return cache.value;
  const snaps = {};
  const docs = {};
  await Promise.all([
    ...PULL_IDS.map(async (id) => {
      snaps[id] = await readDoc(`snapshots/${id}`, null, env);
    }),
    ...Object.keys(PUSH).map(async (id) => {
      docs[id] = await readDoc(`ingest/${id}`, null, env);
    }),
  ]);
  const push = {};
  for (const [id, cfg] of Object.entries(PUSH)) push[id] = ingestSnapshot(id, cfg.label, docs[id], cfg);
  const [social, tasks] = await Promise.all([readDoc('social', null, env), loadTasks(env)]);
  const value = { snaps, push, social: social || { posts: [], as_of: null }, tasks };
  cache = { at: Date.now(), value };
  return value;
}
