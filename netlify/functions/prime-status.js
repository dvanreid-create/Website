// Live Málaga Live Prime membership status, looked up by the member's pass token.
// GET /.netlify/functions/prime-status?t=<token>
// Returns { ok, status, venue, number } — minimal, no email/PII.
// Partners (and members) load /prime/pass/?t=<token> which calls this for a real-time check.
exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  try {
    const t = (event.queryStringParameters && event.queryStringParameters.t || "").trim();
    if (!t) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: "no token" }) };

    const token = process.env.AIRTABLE_TOKEN;
    if (!token) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: "config" }) };
    const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
    const TABLE = "Prime Members";

    // exact-match the token; escape any quotes defensively
    const safe = t.replace(/"/g, '\\"');
    const formula = encodeURIComponent('{Pass token}="' + safe + '"');
    const url = "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) +
                "?maxRecords=1&filterByFormula=" + formula;

    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: "lookup" }) };
    const data = await res.json();
    const rec = (data.records || [])[0];
    if (!rec) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: "not found" }) };

    const f = rec.fields || {};
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        status: f["Status"] || "Unknown",
        venue: f["Venue"] || "",
        number: f["PRIME number"] || null
      })
    };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: "error" }) };
  }
};
