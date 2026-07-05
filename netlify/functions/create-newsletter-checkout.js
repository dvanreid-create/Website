// create-newsletter-checkout — exclusive weekly-newsletter sponsorship purchase.
//
// ONE sponsor per calendar month. The buyer picks consecutive full calendar months
// (within the next 12), uploads TWO creatives (top + bottom newsletter ad slots),
// and pays €400 × months as a ONE-TIME payment (not a subscription).
//
// Flow:
//   1) validate months: all within next 12, consecutive, and still FREE (re-checked
//      server-side against Airtable — never trust the client).
//   2) if any requested month is taken -> return 409 {taken:[...]} so the picker refreshes.
//   3) create a Pending "Newsletter Sponsors" row (Months = "YYYY-MM,YYYY-MM"),
//      upload both creatives, open a Stripe Checkout (mode=payment) and return {url}.
//   The stripe-webhook flips the row Pending -> Sold on payment (marks the months booked).
//
// Netlify env: AIRTABLE_TOKEN, STRIPE_SECRET_KEY
// Optional: AIRTABLE_BASE, SITE_URL, AD_NEWSLETTER_CENTS, CURRENCY, TURNSTILE_SECRET

const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
const TABLE = "Newsletter Sponsors";
const SITE = process.env.SITE_URL || "https://malagalivepulse.com";
const NL_CENTS = parseInt(process.env.AD_NEWSLETTER_CENTS || "40000", 10); // €400.00 per month
const CURRENCY = (process.env.CURRENCY || "eur").toLowerCase();
const RESERVE_MIN = 20;
const MONTHS_AHEAD = 12;
const OK_TYPES = { "image/png":1, "image/jpeg":1, "image/jpg":1, "image/svg+xml":1 };

const json = (c, o) => ({ statusCode: c, headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
const t = (v) => (v == null ? "" : String(v).trim());

function validMonths() {
  const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth();
  const out = [];
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(y, m + i, 1));
    out.push(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
  }
  return out;
}

async function bookedSet(token) {
  const booked = new Set();
  const formula =
    "OR({Status}='Sold'," +
    "AND({Status}='Pending',DATETIME_DIFF(NOW(),CREATED_TIME(),'minutes')<" + RESERVE_MIN + "))";
  let offset = "";
  do {
    const url = "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) +
      "?filterByFormula=" + encodeURIComponent(formula) + "&pageSize=100&fields%5B%5D=Months" +
      (offset ? "&offset=" + encodeURIComponent(offset) : "");
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("airtable " + r.status + " " + (await r.text()));
    const j = await r.json();
    (j.records || []).forEach(rec => {
      String((rec.fields && rec.fields.Months) || "").split(/[,\s]+/).forEach(x => {
        x = x.trim(); if (x) booked.add(x);
      });
    });
    offset = j.offset || "";
  } while (offset);
  return booked;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const token = t(process.env.AIRTABLE_TOKEN), stripe = t(process.env.STRIPE_SECRET_KEY);
  if (!token || !stripe) { console.error("not configured"); return json(500, { error: "not configured" }); }

  let d = {};
  try { d = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad json" }); }

  const name = t(d.name), email = t(d.email), link = t(d.link), subtext = t(d.subtext).slice(0, 80);
  const LANGS = ["en","es","de","fr","sv","no","da","fi"];
  const lang = LANGS.indexOf(t(d.lang).toLowerCase()) >= 0 ? t(d.lang).toLowerCase() : "en";
  if (!name || !email) return json(400, { error: "missing required fields" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "bad email" });
  if (!link || !/^https?:\/\/\S+\.\S+/i.test(link)) return json(400, { error: "bad link" });

  // ---- Cloudflare Turnstile (anti-bot) — fail-open if not configured ----
  const tsSecret = t(process.env.TURNSTILE_SECRET);
  if (tsSecret) {
    let ok = false;
    try {
      const params = new URLSearchParams({ secret: tsSecret, response: t(d.turnstile) });
      const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"])) || "";
      if (ip) params.append("remoteip", ip);
      const vr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: params });
      const vj = await vr.json(); ok = !!(vj && vj.success);
    } catch (e) { console.error("turnstile verify error", e); ok = false; }
    if (!ok) return json(400, { error: "captcha" });
  }

  // ---- months: valid, unique, sorted, consecutive ----
  let months = Array.isArray(d.months) ? d.months.map(t).filter(Boolean) : [];
  months = [...new Set(months)].sort();
  const valid = validMonths();
  if (!months.length || months.some(m => valid.indexOf(m) < 0)) return json(400, { error: "bad months" });
  for (let i = 1; i < months.length; i++) {
    if (valid.indexOf(months[i]) !== valid.indexOf(months[i - 1]) + 1) return json(400, { error: "not consecutive" });
  }

  // ---- both creatives required ----
  if (!(d.topBase64 && d.topName) || !(d.bottomBase64 && d.bottomName)) return json(400, { error: "missing creatives" });

  // ---- availability re-check (authoritative) ----
  let booked;
  try { booked = await bookedSet(token); }
  catch (e) { console.error(e); return json(502, { error: "airtable" }); }
  const taken = months.filter(m => booked.has(m));
  if (taken.length) return json(409, { error: "taken", taken });

  // ---- create Pending row ----
  const euros = Math.round((NL_CENTS * months.length) / 100);
  const fields = {
    "Sponsor name": name, "Contact email": email, "Link URL": link,
    "Months": months.join(","), "Status": "Pending", "Language": lang, "Amount": euros
  };
  if (subtext) fields["Subtext"] = subtext;
  let recordId;
  try {
    const r = await fetch("https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE), {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    const j = await r.json();
    if (!r.ok) { console.error("airtable create", j); return json(502, { error: "airtable" }); }
    recordId = j.records[0].id;
  } catch (e) { console.error(e); return json(502, { error: "airtable" }); }

  // ---- upload both creatives (best-effort) ----
  async function up(field, b64, nm, ty) {
    const ct = t(ty).toLowerCase() || "image/png";
    if (!OK_TYPES[ct]) return;
    try {
      await fetch("https://content.airtable.com/v0/" + BASE + "/" + recordId + "/" + encodeURIComponent(field) + "/uploadAttachment", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: ct, file: b64, filename: t(nm).slice(0, 120) })
      });
    } catch (e) { console.warn("nl creative upload failed", field, e && e.message); }
  }
  await up("Top creative", d.topBase64, d.topName, d.topType);
  await up("Bottom creative", d.bottomBase64, d.bottomName, d.bottomType);

  // ---- Stripe Checkout in PAYMENT mode (one-time, €400 × months) ----
  const p = new URLSearchParams();
  p.append("mode", "payment");
  p.append("payment_method_types[0]", "card");
  p.append("billing_address_collection", "required");
  p.append("tax_id_collection[enabled]", "true");
  p.append("allow_promotion_codes", "true");
  p.append("line_items[0][quantity]", String(months.length));
  p.append("line_items[0][price_data][currency]", CURRENCY);
  p.append("line_items[0][price_data][unit_amount]", String(NL_CENTS));
  p.append("line_items[0][price_data][product_data][name]", "Málaga Live — Exclusive Newsletter Sponsor");
  p.append("line_items[0][price_data][product_data][description]", (name + " — " + months.length + " month(s): " + months.join(", ")).slice(0, 250));
  p.append("customer_email", email);
  p.append("success_url", SITE + "/advertise.html?paid=1");
  p.append("cancel_url", SITE + "/advertise.html?canceled=1");
  p.append("client_reference_id", recordId);
  p.append("metadata[airtable_id]", recordId);
  p.append("metadata[flow]", "newsletter_sponsor");
  p.append("metadata[months]", months.join(","));

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
    await fetch("https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) + "/" + recordId, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { "Notes": "Stripe session " + session.id } })
    });
  } catch (e) { /* non-fatal */ }

  return json(200, { url: session.url });
};
