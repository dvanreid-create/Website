// create-ad-checkout — self-serve gutter ad purchase for malagalivepulse.com.
//
// 1) Enforces the inventory caps so we NEVER exceed the 110-slot promise:
//      Premium 30s  -> max 50    (AD_CAP_PREMIUM)
//      Standard 5s  -> max 60    (AD_CAP_STANDARD)
//    Counts paid rows (Sold/Active) PLUS any Pending rows created in the last
//    PENDING_RESERVE_MIN minutes (so two buyers can't grab the same last slot).
// 2) If the tier is FULL -> no payment. Saves a Waitlist row (name/email/tier)
//    and returns { waitlisted:true } so the form can say "we'll alert you".
// 3) Otherwise -> creates a Pending row, uploads the logo (base64) to the
//    "Logo file" attachment, and creates a Stripe Checkout Session in
//    SUBSCRIPTION mode (€225 or €75 / month). Returns { url } to redirect.
//
// Netlify env: AIRTABLE_TOKEN, STRIPE_SECRET_KEY
// Optional: AIRTABLE_BASE, SITE_URL, AD_PREMIUM_CENTS, AD_STANDARD_CENTS,
//           CURRENCY, AD_CAP_PREMIUM, AD_CAP_STANDARD

const BASE   = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
const TABLE  = "tbl79C9hvGbM6fq5V";          // Gutter Sponsors
const LOGO_FIELD = "fldTRln8zSON7nc5o";      // "Logo file" attachment field
const SITE   = process.env.SITE_URL || "https://malagalivepulse.com";
const PREMIUM_CENTS  = parseInt(process.env.AD_PREMIUM_CENTS  || "22500", 10); // €225.00
const STANDARD_CENTS = parseInt(process.env.AD_STANDARD_CENTS || "7500", 10);  // €75.00
const CURRENCY = (process.env.CURRENCY || "eur").toLowerCase();
const CAP_PREMIUM  = parseInt(process.env.AD_CAP_PREMIUM  || "50", 10);
const CAP_STANDARD = parseInt(process.env.AD_CAP_STANDARD || "60", 10);
const PENDING_RESERVE_MIN = 20;

const TIER_LABEL = { premium: "Premium 30s", standard: "Standard 5s" };
const OK_TYPES = { "image/png":1, "image/jpeg":1, "image/jpg":1, "image/svg+xml":1 };

const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
const t = (v) => (v == null ? "" : String(v).trim());

async function countTier(token, tierLabel) {
  const esc = tierLabel.replace(/'/g, "\\'");
  const formula =
    "AND({Tier}='" + esc + "'," +
    "OR({Status}='Sold',{Status}='Active'," +
       "AND({Status}='Pending',DATETIME_DIFF(NOW(),CREATED_TIME(),'minutes')<" + PENDING_RESERVE_MIN + ")))";
  let count = 0, offset = "";
  do {
    const url = "https://api.airtable.com/v0/" + BASE + "/" + TABLE +
      "?filterByFormula=" + encodeURIComponent(formula) + "&pageSize=100&fields%5B%5D=Tier" +
      (offset ? "&offset=" + encodeURIComponent(offset) : "");
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("airtable count " + r.status + " " + (await r.text()));
    const j = await r.json();
    count += (j.records || []).length;
    offset = j.offset || "";
  } while (offset);
  return count;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const token  = t(process.env.AIRTABLE_TOKEN);
  const stripe = t(process.env.STRIPE_SECRET_KEY);
  if (!token || !stripe) { console.error("not configured"); return json(500, { error: "not configured" }); }

  let d = {};
  try { d = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad json" }); }

  const name = t(d.name), email = t(d.email), link = t(d.link), headline = t(d.headline);
  const LANGS = ["en","es","de","fr","sv","no","da","fi"];
  const lang = LANGS.indexOf(t(d.lang).toLowerCase()) >= 0 ? t(d.lang).toLowerCase() : "en";
  const tierKey = t(d.tier).toLowerCase();
  const tier = (tierKey === "premium") ? "premium" : (tierKey === "standard" ? "standard" : "");
  if (!name || !email || !tier) return json(400, { error: "missing required fields" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "bad email" });
  if (!link) return json(400, { error: "missing link" });

  // ---- Cloudflare Turnstile (anti-bot) — fail-open if not configured ----
  const tsSecret = t(process.env.TURNSTILE_SECRET);
  if (tsSecret) {
    let okTs = false;
    try {
      const params = new URLSearchParams({ secret: tsSecret, response: t(d.turnstile) });
      const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"])) || "";
      if (ip) params.append("remoteip", ip);
      const vr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: params });
      const vj = await vr.json(); okTs = !!(vj && vj.success);
    } catch (e) { console.error("turnstile verify error", e); okTs = false; }
    if (!okTs) return json(400, { error: "captcha" });
  }

  const tierLabel = TIER_LABEL[tier];
  const cap = (tier === "premium") ? CAP_PREMIUM : CAP_STANDARD;

  // ---- 1) cap check ----
  let used;
  try { used = await countTier(token, tierLabel); }
  catch (e) { console.error(e); return json(502, { error: "airtable" }); }

  // ---- 2) FULL -> waitlist, no payment ----
  if (used >= cap) {
    try {
      await fetch("https://api.airtable.com/v0/" + BASE + "/" + TABLE, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ records: [{ fields: {
          "Sponsor name": name, "Contact email": email, "Tier": tierLabel,
          "Status": "Waitlist", "Link URL": link || undefined,
          "Notes": "Auto: waitlist — " + tierLabel + " full at checkout " + new Date().toISOString()
        } }], typecast: true })
      });
    } catch (e) { console.error("waitlist write failed", e); }
    return json(200, { waitlisted: true, tier: tier });
  }

  // ---- 3) create Pending row ----
  let recordId;
  const fields = {
    "Sponsor name": name, "Contact email": email, "Tier": tierLabel, "Status": "Pending",
    "Link URL": link, "Monthly fee": (tier === "premium" ? 225 : 75),
    "Shows per hour": 2, "Duration secs": (tier === "premium" ? 30 : 5), "Language": lang
  };
  // The buy-form "Tagline" is the sub-line shown under the logo on the tile.
  // Logo tiles render the Subtext field (not Headline), so write it there.
  if (headline) fields["Subtext"] = headline;
  try {
    const r = await fetch("https://api.airtable.com/v0/" + BASE + "/" + TABLE, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    const j = await r.json();
    if (!r.ok) { console.error("airtable create", j); return json(502, { error: "airtable" }); }
    recordId = j.records[0].id;
  } catch (e) { console.error(e); return json(502, { error: "airtable" }); }

  // ---- 3b) upload logo (base64) to the Logo file attachment (best-effort) ----
  if (d.logoBase64 && d.logoName) {
    const ct = t(d.logoType).toLowerCase() || "image/png";
    if (OK_TYPES[ct]) {
      try {
        await fetch("https://content.airtable.com/v0/" + BASE + "/" + recordId + "/" + LOGO_FIELD + "/uploadAttachment", {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: ct, file: d.logoBase64, filename: t(d.logoName).slice(0, 120) })
        });
      } catch (e) { console.warn("logo upload failed (non-fatal)", e && e.message); }
    }
  }

  // ---- 3c) Stripe Checkout in SUBSCRIPTION mode ----
  const amount = (tier === "premium") ? PREMIUM_CENTS : STANDARD_CENTS;
  const prod = (tier === "premium")
    ? "Málaga Live — Premium gutter ad (30s)"
    : "Málaga Live — Standard gutter ad (5s)";
  const p = new URLSearchParams();
  p.append("mode", "subscription");
  p.append("payment_method_types[0]", "card");
  p.append("billing_address_collection", "required");
  p.append("tax_id_collection[enabled]", "true");
  p.append("allow_promotion_codes", "true");
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", CURRENCY);
  p.append("line_items[0][price_data][unit_amount]", String(amount));
  p.append("line_items[0][price_data][recurring][interval]", "month");
  p.append("line_items[0][price_data][product_data][name]", prod);
  p.append("line_items[0][price_data][product_data][description]", (name + " — " + tierLabel).slice(0, 250));
  p.append("customer_email", email);
  p.append("success_url", SITE + "/advertise.html?paid=1");
  p.append("cancel_url", SITE + "/advertise.html?canceled=1");
  p.append("client_reference_id", recordId);
  p.append("metadata[airtable_id]", recordId);
  p.append("metadata[flow]", "gutter_ad");
  p.append("subscription_data[metadata][airtable_id]", recordId);
  p.append("subscription_data[metadata][flow]", "gutter_ad");

  let session;
  try {
    const sr = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + stripe, "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    const txt = await sr.text();
    try { session = JSON.parse(txt); } catch { session = null; }
    if (!sr.ok || !session || !session.url) { console.error("stripe error", sr.status, txt); return json(502, { error: "stripe" }); }
  } catch (e) { console.error("stripe request failed", e); return json(502, { error: "stripe" }); }

  try {
    await fetch("https://api.airtable.com/v0/" + BASE + "/" + TABLE + "/" + recordId, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { "Notes": "Stripe session " + session.id } })
    });
  } catch (e) { /* non-fatal */ }

  return json(200, { url: session.url });
};
