// stats-feed — serves /stats.json: the live rolling-30-day average visit duration from Plausible.
// Reads PLAUSIBLE_API_KEY (Netlify env). If the key is missing or Plausible is unreachable it
// returns a sensible fallback, and the CDN caches the last good value for a day, so a transient
// failure (or an expired trial) never blanks the number on the site.
//
// Netlify env: PLAUSIBLE_API_KEY (required for live data), optional PLAUSIBLE_SITE_ID.

const SITE_ID = process.env.PLAUSIBLE_SITE_ID || "malagalivepulse.com";
const FALLBACK_MIN = 14;   // last verified ~13m56s; shown if the API is unavailable

exports.handler = async () => {
  const key = process.env.PLAUSIBLE_API_KEY;
  const asOf = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  let minutes = FALLBACK_MIN, live = false;

  if (key) {
    try {
      const url = "https://plausible.io/api/v1/stats/aggregate?site_id=" + encodeURIComponent(SITE_ID) +
                  "&period=30d&metrics=visit_duration";
      const r = await fetch(url, { headers: { Authorization: "Bearer " + key } });
      if (r.ok) {
        const j = await r.json();
        const secs = j && j.results && j.results.visit_duration && j.results.visit_duration.value;
        if (secs && secs > 0) { minutes = Math.max(1, Math.round(secs / 60)); live = true; }
      } else {
        console.error("plausible stats", r.status, await r.text());
      }
    } catch (e) { console.error("stats-feed error", e && e.message); }
  }

  return {
    statusCode: 200,
    // browser caches 6h; Netlify CDN caches the last good value 24h (masks transient failures)
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=21600, s-maxage=86400" },
    body: JSON.stringify({ minutes: minutes, as_of: asOf, live: live })
  };
};
