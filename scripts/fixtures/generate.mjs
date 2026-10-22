/**
 * Writes the recorded-style fixture files this folder holds. The shapes follow
 * the real GoHighLevel, Meta, Google Sheets and Search Console answers; the
 * people and numbers are invented. "Now" for every fixture is 2026-10-21 13:00
 * Pacific (20:00 UTC); verify-dashboard.mjs freezes the clock to that moment.
 *
 *   node scripts/fixtures/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = (name, obj) => writeFileSync(join(dir, name), JSON.stringify(obj, null, 1) + '\n');
let seed = 7;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (s) => new Date(s).toISOString();

// ------------------------------------------------------------------ GoHighLevel
const pipelines = [
  { id: 'pl_solar', name: 'Solar', stages: ['New Lead', 'Attempting Contact', 'Contacted / Working', 'Appointment Booked', 'Confirmed', 'Appointment Ran', 'Closing', 'Won', 'Lost'].map((name, i) => ({ id: `st_solar_${i}`, name, position: i })) },
  { id: 'pl_roof', name: 'Roofing', stages: ['New Lead', 'Appointment Booked', 'Won', 'Lost'].map((name, i) => ({ id: `st_roof_${i}`, name, position: i })) },
];
const contacts = [];
const opportunities = [];
const addPerson = ({ id, first, last, phone, email, created, source, stage = null, status = 'open', value = 0, tags = [], oppSource, pipeline = 'pl_solar', attribution }) => {
  contacts.push({ id, firstName: first, lastName: last, contactName: `${first} ${last}`, phone, email, source, tags, dateAdded: iso(created), attributionSource: attribution || undefined });
  if (stage != null) {
    const pl = pipelines.find((p) => p.id === pipeline);
    opportunities.push({
      id: `opp_${id}`, name: `${first} ${last}`, contactId: id, pipelineId: pipeline, pipelineStageId: pl.stages[stage].id, status, monetaryValue: value,
      source: oppSource ?? source, createdAt: iso(created), updatedAt: iso(created), contact: { id, name: `${first} ${last}`, email, phone },
    });
  }
};
// the stories
addPerson({ id: 'c_jane', first: 'Jane', last: 'Adams', phone: '+15595552111', email: 'jane.adams@gmail.com', created: '2026-10-20T16:00:00Z', source: 'Facebook', stage: 2, oppSource: 'Facebook / Instagram ads' });
addPerson({ id: 'c_bob', first: 'Bob', last: 'Noopp', phone: '+15595552122', email: 'bob@gmail.com', created: '2026-10-21T15:00:00Z', source: 'Facebook' });
addPerson({ id: 'c_carl', first: 'Carl', last: 'Silent', phone: '+15595552133', email: 'carl@gmail.com', created: '2026-10-21T14:00:00Z', source: 'Facebook', stage: 0, oppSource: 'Facebook / Instagram ads' });
addPerson({ id: 'c_dana', first: 'Dana', last: 'Typo', phone: '+15595552144', email: 'dana@real.com', created: '2026-10-20T20:00:00Z', source: 'RYNO website forms', stage: 1 });
addPerson({ id: 'c_sam', first: 'Sam', last: 'Slow', phone: '+15595552155', email: 'sam@gmail.com', created: '2026-10-19T17:00:00Z', source: 'RYNO website forms', stage: 2 });
addPerson({ id: 'c_test', first: 'TEST', last: 'Lead', phone: '+15595550100', email: 'test@example.com', created: '2026-10-21T12:00:00Z', source: 'Facebook', stage: 0 });
addPerson({ id: 'c_won', first: 'Wendy', last: 'Winner', phone: '+15595552166', email: 'wendy@gmail.com', created: '2026-09-02T17:00:00Z', source: 'EG4 referral', stage: 7, status: 'won', value: 24000 });
// filler: 250 older people, enough to need three pages
const srcs = ['EG4 referral', 'Cold calling', 'PG&E referral', 'RYNO website forms', 'Sold install (partner)', ''];
for (let i = 0; i < 250; i++) {
  const day = 1 + Math.floor(rnd() * 88); // Jul 5 .. Oct 1
  const created = new Date(Date.UTC(2026, 6, 5) + day * 86400000 + Math.floor(rnd() * 80000000));
  const status = rnd() < 0.15 ? 'won' : rnd() < 0.1 ? 'lost' : 'open';
  addPerson({ id: `c_f${i}`, first: `Filler${i}`, last: pick(['Ng', 'Lopez', 'Kim', 'Patel', 'Smith']), phone: `+1559555${String(2000 + i).slice(-4)}`.replace(/^\+1559555(\d{4})$/, (m, d) => `+1559${6000000 + Number(d)}`), email: `filler${i}@example-home.com`, created, source: pick(srcs), stage: status === 'won' ? 7 : Math.floor(rnd() * 7), status, value: status === 'won' ? 18000 : 0 });
}
out('ghl-pipelines.json', { pipelines });
out('ghl-opportunities.json', { opportunities });
out('ghl-contacts.json', { contacts });
out('ghl-users.json', { users: [{ id: 'u_robin', name: 'Robin Martinez' }, { id: 'u_taj', name: 'Taj Pamma' }] });
out('ghl-calendars.json', { calendars: [{ id: 'cal_robin', name: 'Robin Appointments' }, { id: 'cal_general', name: 'General Sales' }, { id: '2tn3NQUMCfrluZO4jABH', name: "Blaine McKenzie's Personal Calendar" }] });
out('ghl-events.json', {
  events: [
    { id: 'ev1', title: 'Jane Adams: solar visit', calendarId: 'cal_robin', contactId: 'c_jane', appointmentStatus: 'confirmed', startTime: '2026-10-23T18:00:00-07:00', endTime: '2026-10-23T19:00:00-07:00', dateAdded: '2026-10-20T19:00:00Z', assignedUserId: 'u_robin' },
    { id: 'ev2', title: 'Wendy Winner: closing', calendarId: 'cal_robin', contactId: 'c_won', appointmentStatus: 'showed', startTime: '2026-10-19T11:00:00-07:00', endTime: '2026-10-19T12:00:00-07:00', dateAdded: '2026-10-14T19:00:00Z', assignedUserId: 'u_robin' },
    { id: 'ev3', title: 'Filler3: no show', calendarId: 'cal_robin', contactId: 'c_f3', appointmentStatus: 'noshow', startTime: '2026-10-15T11:00:00-07:00', endTime: '2026-10-15T12:00:00-07:00', dateAdded: '2026-10-10T19:00:00Z' },
    { id: 'ev4', title: 'Filler4: cancelled', calendarId: 'cal_general', contactId: 'c_f4', appointmentStatus: 'cancelled', startTime: '2026-10-16T11:00:00-07:00', endTime: '2026-10-16T12:00:00-07:00', dateAdded: '2026-10-11T19:00:00Z' },
    { id: 'ev5', title: 'Dentist', calendarId: '2tn3NQUMCfrluZO4jABH', startTime: '2026-10-22T09:00:00-07:00', endTime: '2026-10-22T10:00:00-07:00', dateAdded: '2026-10-01T19:00:00Z' },
  ],
});
const msg = (id, direction, type, at, extra = {}) => ({ id, direction, messageType: type, dateAdded: at, ...extra });
out('ghl-messages.json', {
  c_jane: [msg('m1', 'outbound', 'TYPE_SMS', '2026-10-20T16:00:20Z', { source: 'workflow' }), msg('m2', 'outbound', 'TYPE_CALL', '2026-10-20T16:12:00Z', { userId: 'u_robin', meta: { call: { duration: 240, status: 'completed' } } }), msg('m3', 'inbound', 'TYPE_SMS', '2026-10-20T16:30:00Z')],
  c_dana: [msg('m4', 'outbound', 'TYPE_SMS', '2026-10-20T20:20:00Z', { userId: 'u_robin' })],
  c_sam: [msg('m5', 'outbound', 'TYPE_SMS', '2026-10-19T17:00:30Z', { source: 'workflow' }), msg('m6', 'outbound', 'TYPE_SMS', '2026-10-19T20:00:00Z', { userId: 'u_robin' })],
  c_bob: [msg('m7', 'outbound', 'TYPE_CALL', '2026-10-21T15:12:00Z', { userId: 'u_robin', meta: { call: { duration: 0, status: 'no-answer' } } })],
});

// ------------------------------------------------------------------ Meta
const days = [];
for (let d = new Date('2026-08-22T12:00:00Z'); d <= new Date('2026-10-21T12:00:00Z'); d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10));
const daily = [];
for (const day of days) {
  if (day < '2026-10-17') continue;
  const n = Number(day.slice(8)) - 16; // 1..5
  daily.push({ day, campaign_id: '111', adset_id: '1111', ad_id: '11111', spend: 25, impressions: 2400 + n * 100, clicks: 40 + n, link: 30 + n, leads: 2 });
  daily.push({ day, campaign_id: '111', adset_id: '1111', ad_id: '11112', spend: 15, impressions: 1600, clicks: 20, link: 14, leads: 1 });
  daily.push({ day, campaign_id: '222', adset_id: '2222', ad_id: '22221', spend: 5, impressions: 600, clicks: 8, link: 5, leads: 0 });
}
out('meta-base.json', {
  account: { name: 'VIP-Taj', currency: 'USD', account_status: 1, spend_cap: '500000', amount_spent: '21500', balance: '1200', timezone_name: 'America/Los_Angeles' },
  campaigns: [{ id: '111', name: 'VIP-Taj Solar Leads', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '4000', objective: 'OUTCOME_LEADS' }, { id: '222', name: 'Roofing test', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '500', objective: 'OUTCOME_LEADS' }, { id: '333', name: 'Old paused', status: 'PAUSED', effective_status: 'PAUSED', daily_budget: '1000', objective: 'OUTCOME_LEADS' }],
  adsets: [{ id: '1111', name: 'Homeowners 30mi', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '4000', campaign_id: '111' }, { id: '2222', name: 'Roof owners', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '500', campaign_id: '222' }],
  ads: [{ id: '11111', name: 'Video 1', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '111', adset_id: '1111' }, { id: '11112', name: 'Image 2', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '111', adset_id: '1111' }, { id: '22221', name: 'Roof image', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '222', adset_id: '2222' }],
  names: { campaigns: { 111: 'VIP-Taj Solar Leads', 222: 'Roofing test' }, adsets: { 1111: 'Homeowners 30mi', 2222: 'Roof owners' }, ads: { 11111: 'Video 1', 11112: 'Image 2', 22221: 'Roof image' } },
  daily,
  page: {
    published: { data: [{ id: 'PG_1', message: 'Fall solar savings are here.', created_time: '2026-10-18T17:00:00+0000', permalink_url: 'https://www.facebook.com/KilluaHome/posts/1', reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } }] },
    scheduled: { data: [{ id: 'PG_2', message: 'Roof check week.', scheduled_publish_time: 1761500000, permalink_url: '' }] },
  },
});

// ------------------------------------------------------------------ Google Ads sheet + Search Console
const sheet = [['date', 'campaign', 'type', 'status', 'cost', 'impressions', 'clicks', 'conversions', 'conv_value']];
for (const day of days.filter((d) => d >= '2026-10-01')) {
  sheet.push([day, 'Solar Search', 'SEARCH', 'ENABLED', 30, 900, 60, 3, 0]);
  sheet.push([day, 'Solar PMax', 'PERFORMANCE_MAX', 'ENABLED', 20, 4000, 90, 2, 0]);
  sheet.push([day, 'YouTube Awareness', 'VIDEO', 'PAUSED', 8, 6000, 30, 0, 0]);
}
out('google-ads-sheet.json', { range: 'Daily!A1:L20000', majorDimension: 'ROWS', values: sheet });
const gdays = days.filter((d) => d >= '2026-09-23' && d <= '2026-10-19');
out('gsc.json', {
  total: { rows: [{ clicks: 310, impressions: 9100, ctr: 0.034, position: 14.2 }] },
  daily: { rows: gdays.map((d, i) => ({ keys: [d], clicks: 8 + (i % 7), impressions: 300 + i * 4, ctr: 0.03, position: 14 })) },
  queries: { rows: [{ keys: ['solar installation fresno'], clicks: 40, impressions: 800, ctr: 0.05, position: 6.1 }, { keys: ['roof repair clovis'], clicks: 12, impressions: 500, ctr: 0.024, position: 11.4 }] },
  pages: { rows: [{ keys: ['https://killuahome.com/solar-installation/'], clicks: 90, impressions: 2100, ctr: 0.043, position: 9.9 }] },
});

// ------------------------------------------------------------------ pushed by agents
out('ingest-nexa.json', {
  records: [
    { message_id: '0000338981', received_at: '2026-10-19 13:05', kind: 'lead_outcome', lead_name: 'Sam Slow', phone: '(559) 555-2155', outcome: 'QUALIFIED APPOINTMENT SET', status: 'FOLLOW UP NOT REQUIRED', details: 'Wants a quote this week.', ghl_contact_id: 'c_sam' },
    { message_id: '0000338989', received_at: '2026-10-20 09:04', kind: 'lead_outcome', lead_name: 'Jane Adams', phone: '5595552111', email: 'jane.adams@gmail.com', outcome: 'QUALIFIED APPOINTMENT SET', details: 'Roof is 12 years old.', attempts: [{ at: '2026-10-20 09:04', result: 'Answered' }] },
    { message_id: '0000338990', received_at: '2026-10-21 08:10', kind: 'followup_dispatch', lead_name: 'Bob Noopp', phone: '5595552122', outcome: 'WEB LEAD FOLLOWUP', status: 'NO ANSWER' },
    { message_id: '0000338991', received_at: '2026-10-20 13:30', kind: 'lead_outcome', lead_name: 'Dana Typo', phone: '5595552144', email: 'dana@typo.com', outcome: 'LEAD - CALL BACK', flags: ['email mismatch'] },
    { message_id: '0000338992', received_at: '2026-10-21 07:20', kind: 'lead_outcome', lead_name: 'Eve Elsewhere', phone: '5595552177', outcome: 'LEAD - QUALIFIED NOT INTERESTED', status: 'FOLLOW UP NOT REQUIRED' },
  ],
});
out('ingest-email-leads.json', {
  records: [
    { received_at: '2026-10-19T09:59:00-07:00', subject: 'New Killua lead: Sam Slow - Solar installation (Ad: RYNO / Website / Form)', phone: '5595552155', email: 'sam@gmail.com' },
    { received_at: '2026-10-20T08:59:30-07:00', subject: 'New Killua lead: Jane Adams - Solar installation (Ad: Facebook / VIP-Taj Solar Leads / Video 1)', phone: '5595552111', email: 'jane.adams@gmail.com' },
    { received_at: '2026-10-21T07:59:00-07:00', subject: 'New Killua lead: Bob Noopp - Roof repair (Ad: Facebook / Roofing test / Roof image)', phone: '5595552122', email: 'bob@gmail.com' },
    { received_at: '2026-10-21T07:00:00-07:00', subject: 'New Killua lead: Carl Silent - Battery storage (Ad: Facebook / VIP-Taj Solar Leads / Image 2)', phone: '5595552133', email: 'carl@gmail.com' },
    { received_at: '2026-10-20T12:55:00-07:00', subject: 'New Killua lead: Dana Typo - Roof inspection (Ad: RYNO / Website / Form)', phone: '5595552144', email: 'dana@typo.com' },
    { received_at: '2026-10-21T06:00:00-07:00', subject: 'New Killua lead: Eve Elsewhere - Solar repair (Ad: Facebook / VIP-Taj Solar Leads / Video 1)', phone: '5595552177', email: 'eve@gmail.com' },
    { received_at: '2026-10-21T05:00:00-07:00', subject: 'TEST New Killua lead: TEST Lead - Solar installation (Ad: Facebook / test / test)', phone: '5595550100', email: 'test@example.com' },
  ],
});
out('ingest-sales-agent.json', { records: [{ at: '2026-10-20T09:30:00-07:00', lead_name: 'Jane Adams', ghl_contact_id: 'c_jane', event_type: 'Appointment set', summary: 'Booked Robin for Friday 6 PM.', outcome: 'Booked' }, { at: '2026-10-21T08:30:00-07:00', lead_name: 'Dana Typo', event_type: 'Text sent', summary: 'Asked for the best email address.' }] });
out('ingest-other-ads.json', { records: [{ platform: 'tiktok', date: '2026-10-20', campaign: 'TikTok Spark', spend: 18.5, impressions: 5200, clicks: 61, leads: 1 }, { platform: 'tiktok', date: '2026-10-21', campaign: 'TikTok Spark', spend: 20, impressions: 5800, clicks: 70, leads: 2 }] });
out('ingest-social.json', { records: [{ id: 'ingest_post_1', platform: 'instagram', status: 'scheduled', scheduled_at: '2026-10-23 10:00', title: 'Fall savings reel', caption: 'Lock in your rate before the credit changes. <b>Ask us how.</b>', link: 'https://example.com/reel' }] });
console.log('fixtures written');
