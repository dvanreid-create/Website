// Serves the Talent Square feed (/talent.json) live from Airtable — with a resilient
// baked-in fallback so the Talent Square NEVER goes blank if Airtable / the token hiccups.
// Shows the act scheduled for TODAY (Europe/Madrid); if today's slot is empty it falls
// back to the most recent past scheduled act, so there is always a featured act.
// Output shape (unchanged): { "talent": [ { yt, name, where, country } ] }
// Uses AIRTABLE_TOKEN (needs the data.records:read scope).

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

// Locale-safe "today" in Malaga (YYYY-MM-DD), independent of the runtime's ICU/locale build.
function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const g = (t) => (parts.find((x) => x.type === t) || {}).value;
  return g("year") + "-" + g("month") + "-" + g("day");
}

// Baked fallback schedule — mirrors Airtable (Status=Featured, Consent feature=Yes) so the
// rail still shows the right act even if the live read fails. Refresh periodically.
const FALLBACK = [
  { day: "2026-06-30", yt: "us5xN06GhKU", name: "Imad Fares", where: "Krakow" },
  { day: "2026-07-01", yt: "LiRwNT8t07E", name: "El Chipirón de Granada", where: "Granada" },
  { day: "2026-07-03", yt: "SIK2Apn7yFg", name: "Tinalei", where: "U.S.A" },
  { day: "2026-07-06", yt: "mCt689NXuVo", name: "Tinalei", where: "Miami" },
  { day: "2026-07-07", yt: "7X4-phwxg4A", name: "Alicia", where: "U.S.A" },
  { day: "2026-07-08", yt: "0SimFl6vpc8", name: "Julien Cohen", where: "Paris" }
];

function clean(a) { return { yt: a.yt, name: a.name || "", where: a.where || "", country: a.where || "" }; }

// Pick today's act; else the most recent past act; else the soonest upcoming — never blank.
function pick(list, today) {
  const valid = list.filter((a) => a.yt && a.day);
  if (!valid.length) return [];
  const exact = valid.filter((a) => a.day === today);
  if (exact.length) return [clean(exact[exact.length - 1])];
  const past = valid.filter((a) => a.day < today).sort((a, b) => (a.day < b.day ? 1 : -1));
  if (past.length) return [clean(past[0])];
  const future = valid.filter((a) => a.day > today).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (future.length) return [clean(future[0])];
  return [];
}

exports.handler = async () => {
  const today = madridToday();
  let live = null;
  try {
    const token = process.env.AIRTABLE_TOKEN;
    if (!token) {
      console.error("talent-feed: AIRTABLE_TOKEN not set — using baked fallback");
    } else {
      const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
      const TABLE = process.env.AIRTABLE_TABLE || "Talent";
      const formula = encodeURIComponent('AND({Status}="Featured",{Consent feature}="Yes")');
      const baseUrl = "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) +
                  "?filterByFormula=" + formula + "&pageSize=100";
      let records = [], offset = "", ok = true;
      do {
        const res = await fetch(baseUrl + (offset ? "&offset=" + encodeURIComponent(offset) : ""),
                                { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) {
          console.error("talent-feed Airtable read failed:", res.status, await res.text());
          ok = false; break;
        }
        const page = await res.json();
        records = records.concat(page.records || []);
        offset = page.offset || "";
      } while (offset);
      if (ok) {
        live = records.map((r) => {
          const f = r.fields || {};
          return { day: f["Featured date"] || "", yt: ytId(f["YouTube"]),
                   name: f["Preferred name"] || "", where: f["Based in"] || f["Country"] || "" };
        });
      }
    }
  } catch (e) {
    console.error("talent-feed error (using baked fallback):", e);
  }
  const source = (live && live.length) ? live : FALLBACK;
  return json({ talent: pick(source, today) }, 120);
};
