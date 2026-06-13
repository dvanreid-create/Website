// Serves the Talent Square feed (/talent.json) live from Airtable.
// Returns the act SCHEDULED FOR TODAY: Status="Featured", Consent feature="Yes", and Featured date = today (Europe/Madrid).
// Output shape matches what the site already expects: { "talent": [ { yt, name, where } ] }
// Uses the same AIRTABLE_TOKEN env var (must now also have the data.records:read scope).

function json(obj, maxAge) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=" + maxAge + ", s-maxage=" + maxAge
    },
    body: JSON.stringify(obj)
  };
}

// Pull the 11-char YouTube video id out of any common YouTube URL form.
function ytId(u) {
  if (!u) return "";
  const m = String(u).match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

exports.handler = async () => {
  const EMPTY = json({ talent: [] }, 60);
  try {
    const token = process.env.AIRTABLE_TOKEN;
    if (!token) { console.error("AIRTABLE_TOKEN not set"); return EMPTY; }
    const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
    const TABLE = process.env.AIRTABLE_TABLE || "Talent";

    const formula = encodeURIComponent('AND({Status}="Featured",{Consent feature}="Yes")');
    const url = "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) +
                "?filterByFormula=" + formula + "&pageSize=50";

    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) { console.error("Airtable read failed:", res.status, await res.text()); return EMPTY; }

    const data = await res.json();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }); // YYYY-MM-DD in Malaga time
    const talent = (data.records || []).map((r) => {
      const f = r.fields || {};
      const yt = ytId(f["YouTube"]);
      const day = f["Featured date"] || "";
      if (!yt || day !== today) return null;
      return { yt: yt, name: f["Preferred name"] || "", where: f["Based in"] || f["Country"] || "" };
    }).filter(Boolean);

    return json({ talent: talent }, 120);
  } catch (e) {
    console.error("talent-feed error:", e);
    return EMPTY;
  }
};
