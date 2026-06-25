// sponsors-feed — serves PAID gutter tiles live from Airtable (/sponsors-live.json).
// Returns Status=Sold rows in the SAME tile shape build_site.py uses, so the gutter
// JS can merge them with the editorial tiles in sponsors.json. Logo comes from the
// "Logo file" attachment (fresh URL on each read) or falls back to Logo URL.
// Uses AIRTABLE_TOKEN (needs data.records:read). Short cache so new tiles appear fast.

function json(obj, maxAge) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + maxAge + ", s-maxage=" + maxAge },
    body: JSON.stringify(obj)
  };
}
function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }); } // YYYY-MM-DD

exports.handler = async () => {
  const EMPTY = json({ ads: [] }, 60);
  try {
    const token = process.env.AIRTABLE_TOKEN;
    if (!token) { console.error("AIRTABLE_TOKEN not set"); return EMPTY; }
    const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
    const TABLE = "tbl79C9hvGbM6fq5V"; // Gutter Sponsors

    const formula = encodeURIComponent("{Status}='Sold'");
    const baseUrl = "https://api.airtable.com/v0/" + BASE + "/" + TABLE + "?filterByFormula=" + formula + "&pageSize=100";
    let records = [], offset = "";
    do {
      const r = await fetch(baseUrl + (offset ? "&offset=" + encodeURIComponent(offset) : ""), { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) { console.error("airtable read", r.status, await r.text()); return EMPTY; }
      const p = await r.json();
      records = records.concat(p.records || []);
      offset = p.offset || "";
    } while (offset);

    const td = today();
    const ads = [];
    for (const rec of records) {
      const f = rec.fields || {};
      const start = (f["Start date"] || "").slice(0, 10);
      const exp   = (f["Expires"] || "").slice(0, 10);
      if (start && td < start) continue;
      if (exp && exp < td) continue;

      const tier = String(f["Tier"] || "");
      const dur = f["Duration secs"] || (tier.indexOf("Premium") >= 0 ? 30 : 5);
      const perHour = f["Shows per hour"] || 2;
      const att = Array.isArray(f["Logo file"]) && f["Logo file"][0] ? f["Logo file"][0].url : "";
      const logo = att || f["Logo URL"] || "";

      let ad;
      if (f["Photo URL"]) ad = { photo: f["Photo URL"], tint: "rgba(8,11,16,.42)", pos: "center" };
      else if (logo) ad = { logo: logo, bg: "linear-gradient(160deg,#faf3e9,#ecdcc6)", light: true };
      else ad = { bg: "linear-gradient(160deg,#0B5E8A,#0a4f74)" };

      if (f["Link URL"]) ad.url = f["Link URL"];
      if (f["Sponsor name"]) ad.name = f["Sponsor name"];
      if (f["Ribbon label"]) ad.ribbon = f["Ribbon label"];
      if (f["Headline"]) ad.head = f["Headline"];
      // Logo tiles render the sub-line (not head), so fall back Headline -> sub.
      const subline = f["Subtext"] || f["Headline"] || "";
      if (subline) ad.sub = subline;
      // Give logo tiles a clickable CTA like the editorial ones.
      if (ad.logo && f["Link URL"]) ad.cta = "Visit \u2192";
      ad.dur = parseInt(dur, 10) || 5;
      ad.perHour = parseInt(perHour, 10) || 2;
      if (exp) ad.expires = exp;
      if (f["Languages"]) ad.langs = String(f["Languages"]).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      ads.push(ad);
    }
    return json({ ads: ads }, 60);
  } catch (e) {
    console.error("sponsors-feed error", e);
    return EMPTY;
  }
};
