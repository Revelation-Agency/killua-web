# Killua dashboard: setup

What this is: a private, logged-in dashboard at **app.killuahome.com** (also `/dashboard/` on any deployment of this project). It shows Meta ads, GoHighLevel leads and appointments, Nexa calls, lead emails, the sales assistant, Google Ads, Search Console, a social calendar, Blaine's task list, and a Connections page that says what is and is not hooked up. A source with no credentials shows "Not connected" and a plain-English "who needs to do what". It never shows made-up numbers.

How it works in one paragraph: a function (`api/dash.js`) serves the pages and the data, but only to signed-in people. Twice a day it pulls Meta, GoHighLevel, Google Ads (through a Sheet) and Search Console and saves the results in a **private** Vercel Blob store. Agents (Nexa history, lead-email reader, sales assistant, social, other ads) push their data in with a key. An admin can press **Refresh now** at any time.

**Why "twice a day" is set up two ways:** the Vercel project is on the Hobby plan, which only allows one scheduled job a day. `vercel.json` therefore has one job, 7:00 AM Pacific in summer (14:00 UTC; 6:00 AM in winter). The second run, 1:00 PM Pacific, is a call from Revelation's own n8n (a Schedule trigger plus an HTTP Request node): `GET https://app.killuahome.com/api/dash/cron` with header `Authorization: Bearer <CRON_SECRET>`. If the project moves to Pro, change the cron in `vercel.json` to `0 14,20 * * *` and drop the n8n call.

## 1. Environment variables

Set these in the Vercel project "killua-web" (Settings, Environment Variables). Use Production and Preview. Never put values in git. `.env.example` lists the names.

| Variable | Needed for | Where it comes from |
|---|---|---|
| `DASH_USERS` | Login | JSON array. Make each entry with `node scripts/dash-user.mjs` (section 2). |
| `DASH_SESSION_SECRET` | Login | Any random 32+ characters, e.g. `openssl rand -hex 32`. Changing it signs everyone out. |
| `DASH_INGEST_KEY` | Agents posting data | Any random 24+ characters, e.g. `openssl rand -hex 24`. Give it only to the agents. |
| `CRON_SECRET` | The twice-a-day refresh | Any random string. Vercel sends it to the scheduled job automatically. |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | Storage | Added by Vercel when the private Blob store `killua-dashboard-data` is connected to the project. Already done. |
| `GHL_TOKEN`, `GHL_LOCATION_ID` | GoHighLevel | Section 3. Location id is `Ygk0sop4wB42XtqIEr1Q`. |
| `META_ADS_TOKEN`, `META_AD_ACCOUNT_ID` | Meta ads | Section 4. Account `act_400793053430148` (VIP-Taj). |
| `META_PAGE_ID` | Facebook Page posts (optional) | Section 4. |
| `META_GRAPH_VERSION` | optional | Defaults to `v23.0`. |
| `GOOGLE_SA_JSON` | Search Console, Google Ads sheet | Section 5. |
| `GSC_SITE_URL` | Search Console | The property exactly as Search Console shows it. |
| `GOOGLE_ADS_SHEET_ID` | Google Ads | Section 6. |
| `GOOGLE_ADS_SHEET_TAB` | optional | Defaults to `Daily`. |
| `GHL_ROBIN_CALENDAR_ID`, `GHL_EXCLUDE_CALENDAR_IDS` | optional | Defaults: Robin's calendar `NZdC26OLQtOAc8iLipZG`; Blaine's personal calendar `2tn3NQUMCfrluZO4jABH` is never read. The "General Sales" calendar `P4WrbsVZwNtQ4c14NcKk` is counted. |
| `GHL_TOUCH_DAYS`, `GHL_TOUCH_MAX` | optional | How far back (default 45 days) and for how many leads (default 250) call and text history is read for speed-to-lead. |

After adding or changing variables, the next deployment picks them up. Then press **Refresh now** on the dashboard.

## 2. Logins

Roles: **admin** (Blaine: everything, Refresh now, task status, activity log), **owner** (Taj: read everything, ask for tasks, add and edit social posts), **team** (Robin: read everything, ask for tasks).

```
node scripts/dash-user.mjs blaine@revelationagency.com "Blaine McKenzie" admin
node scripts/dash-user.mjs taj@example.com "Taj Pamma" owner
node scripts/dash-user.mjs robin@example.com "Robin Martinez" team
```

Each command asks for a password (12+ characters; it is not shown) and prints one JSON object. Put the three objects in one array in `DASH_USERS`:

```
[{"email":"...","name":"...","role":"admin","salt":"...","hash":"..."}, {...}, {...}]
```

Only a salted scrypt hash is stored, never the password. To remove someone, delete their object; they are signed out on their next click. To change a password, make a new object for that email and replace the old one. Sessions last 30 days, in a secure cookie that scripts on the page cannot read. Wrong passwords are slowed down and, after 8 tries in 15 minutes, locked for a while.

## 3. GoHighLevel

1. In GoHighLevel, open the Killua sub-account: Settings, Private Integrations, Create new integration. Name it "Dashboard (read only)".
2. Give it read access to: **Contacts**, **Opportunities** (includes pipelines), **Calendars** and **Calendar events**, **Conversations** and **Conversation messages**, and **Users** (so names show for who called; optional).
3. Copy the token once (shown once) into `GHL_TOKEN`. Put the location id (`Ygk0sop4wB42XtqIEr1Q`) in `GHL_LOCATION_ID`.

The dashboard reads every opportunity and contact (all pages, not just the first 100), all calendars except Blaine's personal one, and the call and text history of recent leads. "Speed to lead" is the time from when a lead first arrived (GoHighLevel record or lead email, whichever is earlier) to the first real contact: an outbound call, a text sent by a person, or a Nexa attempt. Automatic workflow texts do not count.

## 4. Meta ads (and the Facebook Page)

1. Business Settings for "Killua Home Services" (393582507484536): Users, System users, Add. Name it "Dashboard". Role: Employee.
2. Assign assets: Ad accounts, add VIP-Taj (`act_400793053430148`) with **View performance**. For the Page calendar also assign the Facebook Page with **View Page insights / read content**.
3. Generate new token for that system user: choose your app, expiry **Never**, permissions **ads_read** (add **pages_show_list** and **pages_read_engagement** if using the Page). Copy it into `META_ADS_TOKEN`.
4. `META_AD_ACCOUNT_ID` = `400793053430148` (with or without `act_`). Optional `META_PAGE_ID` = the Page id (Page, About, Page transparency).

Leads are counted from Meta's own `lead` total. Meta's `onsite_conversion.lead_grouped` is already part of it, so the two are never added together (that would double count). If a token expires the dashboard says so on Connections and keeps the last good numbers.

## 5. Google service account (Search Console and the Google Ads sheet)

1. In Google Cloud (any project): IAM and Admin, Service accounts, Create. Name it "killua-dashboard". No roles needed.
2. Enable two APIs on that project: **Google Search Console API** and **Google Sheets API**.
3. On the service account: Keys, Add key, Create new key, JSON. Open the file and paste its **whole contents** into `GOOGLE_SA_JSON` (or its base64). Note the `client_email`.
4. Search Console: open the property, Settings, Users and permissions, Add user, paste the `client_email`, permission **Restricted**. Put the property in `GSC_SITE_URL` exactly as listed (`https://killuahome.com/` for a URL-prefix property, `sc-domain:killuahome.com` for a domain property).

Search Console data runs about two days behind; the page says so.

## 6. Google Ads (no developer token needed)

1. Create a Google Sheet. Share it with the service account `client_email` (Viewer).
2. Copy the Sheet id from its address into `GOOGLE_ADS_SHEET_ID`.
3. In the Google Ads account (RYNO's): Tools, Bulk actions, Scripts, New script. Paste `scripts/google-ads-to-sheet.js`, set `SHEET_ID` at the top, Authorize, Preview, Run, then schedule it **Daily**.

The script writes one row per campaign per day (date, campaign, type, status, cost, impressions, clicks, conversions, conv_value). Performance Max and Video (YouTube) campaigns are recognised by type and get their own card on the Ads page. Nothing in the ads account is changed.

## 7. Ingest: agents push data in

One address, one key. `POST https://app.killuahome.com/api/dash/ingest/<source>` with header `Authorization: Bearer <DASH_INGEST_KEY>` and a JSON body `{"mode": "append", "records": [ ... ]}`.

- `mode: "append"` (default): each record is added, or updated if one with the same key already exists. Sending the same thing twice is safe. `mode: "replace"`: the stored list for that source becomes exactly the records sent (for `social` only agent-sent posts are replaced; posts typed in on the dashboard are never touched). Replace with zero records is refused.
- Up to 2000 records per call. Bad records are rejected one by one with a reason and their position; good ones in the same call are still stored. The answer looks like `{"ok":true,"accepted":3,"rejected":[{"index":1,"errors":["received_at is not a date..."]}]}`.
- Times: use ISO 8601 with an offset (`2026-10-21T08:15:00-07:00`). A time with no zone (`2026-10-21 08:15`) is read as Pacific. A bare date (`2026-10-25`) means that day.
- Anything with "TEST" in a lead-email subject, or a test name/email/number, is left out of every count.

Sources and fields (unlisted fields are dropped; `*` = required):

| Source | Fields | Key (what makes a record "the same") |
|---|---|---|
| `nexa` | `received_at`*, `kind` (`lead_outcome` \| `followup_dispatch` \| `other`), `message_id`, `lead_name`, `phone`, `email`, `outcome`, `details`, `status`, `attempts[] {at, result}`, `ghl_contact_id`, `flags[]`. At least one of message_id, phone, email, lead_name. | `message_id` + kind + time |
| `email_leads` | `received_at`*, `subject`, `source`, `campaign`, `ad`, `name`, `phone`, `email`, `address`, `service`, `ghl_contact_id`, `forwarded_to_nexa`. At least one of name, phone, email. Name, service, source, campaign and ad are read from a subject like `New Killua lead: <name> - <service> (Ad: <source> / <campaign> / <ad>)`. | `id`, else time + phone + email + subject |
| `sales_agent` | `at`*, `event_type`*, `summary`*, `lead_name`, `phone`, `ghl_contact_id`, `outcome` | `id`, else time + type + lead |
| `social` | `platform`* (`facebook`, `instagram`, `tiktok`, `youtube`, `google_business`, `linkedin`, `x`, `other`), `status`* (`planned`, `waiting_approval`, `scheduled`, `published`, `failed`), `scheduled_at`*, `id`, `title`, `caption`, `link`, `media_url`, `error`, `notes` | `id` |
| `other_ads` | `platform`* (e.g. `tiktok`, `youtube`), `date`*, `campaign`, `spend`, `impressions`, `clicks`, `leads` | platform + date + campaign |

Examples:

```
curl -X POST https://app.killuahome.com/api/dash/ingest/nexa \
  -H "Authorization: Bearer $DASH_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{"records":[{"message_id":"0000338989","received_at":"2026-10-20 09:04","kind":"lead_outcome","lead_name":"Jane Adams","phone":"5595552111","outcome":"QUALIFIED APPOINTMENT SET","status":"FOLLOW UP NOT REQUIRED","details":"Roof is 12 years old."}]}'

curl -X POST https://app.killuahome.com/api/dash/ingest/email_leads \
  -H "Authorization: Bearer $DASH_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{"records":[{"received_at":"2026-10-20T08:59:30-07:00","subject":"New Killua lead: Jane Adams - Solar installation (Ad: Facebook / VIP-Taj Solar Leads / Video 1)","phone":"5595552111","email":"jane@example.com"}]}'

curl -X POST https://app.killuahome.com/api/dash/ingest/sales_agent \
  -H "Authorization: Bearer $DASH_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{"records":[{"at":"2026-10-20T09:30:00-07:00","lead_name":"Jane Adams","event_type":"Appointment set","summary":"Booked Robin for Friday 6 PM.","outcome":"Booked"}]}'

curl -X POST https://app.killuahome.com/api/dash/ingest/social \
  -H "Authorization: Bearer $DASH_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{"records":[{"id":"ig-2026-10-23-reel","platform":"instagram","status":"scheduled","scheduled_at":"2026-10-23T10:00:00-07:00","caption":"Lock in your rate...","link":"https://example.com/reel"}]}'

curl -X POST https://app.killuahome.com/api/dash/ingest/other_ads \
  -H "Authorization: Bearer $DASH_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{"records":[{"platform":"tiktok","date":"2026-10-20","campaign":"TikTok Spark","spend":18.5,"impressions":5200,"clicks":61,"leads":1}]}'
```

The Nexa agent should run a couple of times a day, send the full recent history (append mode makes repeats harmless), and include `ghl_contact_id` when it knows it. The dashboard matches people across GoHighLevel, lead emails and Nexa by `ghl_contact_id`, then phone number, then email.

## 8. Blaine's task list

One list. Everyone signed in sees it and each task's change history. Owner and team add requests (title, details, category, priority, due date). Only admin sets status (Not started, In progress, Waiting on Killua, Waiting on someone else, Done (live)), progress, notes and the link. **Done (live) requires a link** someone can open to check. Everyone can add comments.

The first time the list is read, items from `scripts/seed-tasks.json` are added (once each; deleting is not possible, so nothing reappears). Format, a JSON array of objects:

```
{ "title": "Booked appointment to Housecall Pro",   // required, also what makes an item unique
  "details": "Built and on, never used.",
  "category": "Automation",                          // Automation, Ads, Website, Social, CRM, Sales agent, Other
  "priority": "High",                                // Low, Medium (or Normal), High, Urgent
  "status": "Waiting on Killua",                     // Not started, In progress, Waiting on Killua, Waiting on someone else, Done
  "progress": 80,                                    // 0 to 100
  "source": "Taj meeting list, Oct 19",              // where the item came from
  "link": "https://...", "notes": "..." }            // optional; Done needs a link
```

To add items later, add objects with new titles and deploy; existing tasks are not touched.

## 9. Checking it

- `npm run verify:dashboard` runs everything against recorded fixtures (no accounts needed): connectors, "not connected" behaviour, pagination past 100, ingest rules, the lead reconciliation, login, roles, and that nothing is served without a login.
- `node scripts/verify-dashboard-browser.mjs` does the same in a real phone-sized browser (needs Playwright installed globally).
- Local try-out with fake data: set `DASH_STORE_DIR=/some/folder`, `DASH_SESSION_SECRET`, `DASH_USERS`, `DASH_INSECURE_COOKIES=1`, then `node scripts/dash-local.mjs` and open http://127.0.0.1:4340/dashboard/ (no data until sources are connected or ingested).
- On the deployed site, **Connections** shows each source: Connected, Needs a look, Problem, or Not connected, with who needs to do what.

## 10. Security notes

- Every dashboard page, script and data route requires a login; the login page and the ingest and refresh-schedule routes (which have their own keys) are the only exceptions. Nothing is indexed (noindex, robots.txt).
- Data lives only in the private Blob store, read and written by the server with its token; no storage address is ever sent to a browser. Pathnames inside the store are also hashed.
- No secrets in git or in browser code. Text from data is escaped before it is shown; links must start with http(s).
- Admin and owner actions are checked on the server by role, not only hidden in the page.
