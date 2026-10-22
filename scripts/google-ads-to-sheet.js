/**
 * Killua dashboard: Google Ads -> Google Sheet.
 *
 * HOW TO INSTALL (about 5 minutes, done inside the Google Ads account):
 *  1. Make a new Google Sheet (any name). Copy its ID from the address bar:
 *     docs.google.com/spreadsheets/d/THIS_PART/edit
 *  2. Share that Sheet with the dashboard's Google service account email
 *     (the client_email in the service account key). "Viewer" is enough.
 *  3. In Google Ads: Tools > Bulk actions > Scripts > + New script. Paste this
 *     whole file, put the Sheet ID below, and click Authorize.
 *  4. Click Preview once. If the Sheet fills with rows, click Run.
 *  5. Set the frequency to Daily (any hour; 5 AM is fine).
 *
 * It rewrites the last 35 days of campaign numbers every run, one row per
 * campaign per day: date, campaign, type (Search, Performance Max, Video...),
 * status, cost, impressions, clicks, conversions and conversion value. Older
 * rows are kept. Nothing in the Google Ads account is changed.
 */
var SHEET_ID = 'PASTE_THE_GOOGLE_SHEET_ID_HERE';
var TAB_NAME = 'Daily';
var DAYS_BACK = 35;

var HEADERS = ['date', 'campaign', 'type', 'status', 'cost', 'impressions', 'clicks', 'conversions', 'conv_value'];

function main() {
  if (SHEET_ID.indexOf('PASTE_') === 0) throw new Error('Put the Google Sheet ID at the top of this script first.');
  var tz = AdsApp.currentAccount().getTimeZone();
  var end = new Date();
  var start = new Date(end.getTime() - DAYS_BACK * 24 * 3600 * 1000);
  var fmt = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };

  var query =
    'SELECT segments.date, campaign.name, campaign.advertising_channel_type, campaign.status, ' +
    'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value ' +
    'FROM campaign ' +
    "WHERE segments.date BETWEEN '" + fmt(start) + "' AND '" + fmt(end) + "' " +
    "AND campaign.status != 'REMOVED' " +
    'ORDER BY segments.date';

  var fresh = [];
  var rows = AdsApp.search(query);
  while (rows.hasNext()) {
    var r = rows.next();
    fresh.push([
      r.segments.date,
      r.campaign.name,
      r.campaign.advertisingChannelType,
      r.campaign.status,
      Number(r.metrics.costMicros) / 1000000,
      Number(r.metrics.impressions),
      Number(r.metrics.clicks),
      Number(r.metrics.conversions),
      Number(r.metrics.conversionsValue)
    ]);
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_NAME) || ss.insertSheet(TAB_NAME);
  var keepFrom = fmt(start);

  // keep rows older than the window, replace everything newer
  var old = [];
  if (sheet.getLastRow() > 1) {
    var existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
    for (var i = 0; i < existing.length; i++) {
      var d = existing[i][0] instanceof Date ? fmt(existing[i][0]) : String(existing[i][0]).substring(0, 10);
      if (d && d < keepFrom) { existing[i][0] = d; old.push(existing[i]); }
    }
  }
  var all = old.concat(fresh);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (all.length) {
    // dates are written as text (yyyy-MM-dd) so the dashboard reads them the same way every time
    sheet.getRange(2, 1, all.length, 1).setNumberFormat('@');
    sheet.getRange(2, 1, all.length, HEADERS.length).setValues(all);
  }
  Logger.log('Wrote ' + fresh.length + ' fresh rows and kept ' + old.length + ' older rows.');
}
