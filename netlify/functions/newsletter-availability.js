// newsletter-availability — GET /.netlify/functions/newsletter-availability
// Returns the next 12 full calendar months, each flagged booked/free, from the
// "Newsletter Sponsors" Airtable table (Sold rows + Pending rows still inside the
// PENDING_RESERVE_MIN reserve window). The buy-panel month picker calls this.
// Fail-open: if the token/table is unavailable, every month returns free (never blocks
// the UI) — the checkout function re-checks availability server-side before charging.
//
// Netlify env: AIRTABLE_TOKEN; optional AIRTABLE_BASE.

const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
const TABLE = "Newsletter Sponsors";
const RESERVE_MIN = 20;
const MONTHS_AHEAD = 12;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const json = (c, o) => ({
  statusCode: c,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
  body: JSON.stringify(o)
});

function nextMonths() {
  const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth(); // m is 0-based
  const out = [];
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(y, m + i, 1));
    const yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1;
    out.push({ ym: yy + "-" + String(mm).padStart(2, "0"), label: MON[mm - 1] + " " + yy, booked: false });
  }
  return out;
}

exports.handler = async () => {
  const token = (process.env.AIRTABLE_TOKEN || "").trim();
  const months = nextMonths();
  if (!token) return json(200, { months }); // fail-open

  const booked = new Set();
  try {
    const formula =
      "OR({Status}='Sold'," +
      "AND({Status}='Pending',DATETIME_DIFF(NOW(),CREATED_TIME(),'minutes')<" + RESERVE_MIN + "))";
    let offset = "";
    do {
      const url = "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) +
        "?filterByFormula=" + encodeURIComponent(formula) + "&pageSize=100&fields%5B%5D=Months" +
        (offset ? "&offset=" + encodeURIComponent(offset) : "");
      const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) { console.error("nl-availability airtable", r.status, await r.text()); break; }
      const j = await r.json();
      (j.records || []).forEach(rec => {
        String((rec.fields && rec.fields.Months) || "").split(/[,\s]+/).forEach(x => {
          x = x.trim(); if (x) booked.add(x);
        });
      });
      offset = j.offset || "";
    } while (offset);
  } catch (e) { console.error("nl-availability error", e); }

  months.forEach(mo => { if (booked.has(mo.ym)) mo.booked = true; });
  return json(200, { months });
};
