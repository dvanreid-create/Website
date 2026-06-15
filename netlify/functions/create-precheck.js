// create-precheck  —  called directly (POST JSON) by the MLES Request form.
// 1) writes the submission to the Airtable "Demand Pre-Checks" table (Status: Awaiting payment)
// 2) creates a Stripe Checkout Session for €49
// 3) returns { url } so the browser redirects the buyer to Stripe Checkout.
//
// Required Netlify environment variables:
//   AIRTABLE_TOKEN      — Airtable PAT with data.records:write on base appRFxS65uKsCxc03
//   STRIPE_SECRET_KEY   — your Stripe secret key (test key in sandbox, live key in production)
// Optional overrides: AIRTABLE_BASE, AIRTABLE_TABLE, SITE_URL, PRICE_CENTS, CURRENCY

const BASE      = process.env.AIRTABLE_BASE  || "appRFxS65uKsCxc03";
const TABLE     = process.env.AIRTABLE_TABLE || "Demand Pre-Checks";
const SITE      = process.env.SITE_URL       || "https://malagalivepulse.com";
const PRICE     = parseInt(process.env.PRICE_CENTS || "4900", 10);   // €49.00
const CURRENCY  = (process.env.CURRENCY || "eur").toLowerCase();

const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });

  const token  = process.env.AIRTABLE_TOKEN;
  const stripe = process.env.STRIPE_SECRET_KEY;
  if (!token || !stripe) {
    console.error("Missing env var(s):", { AIRTABLE_TOKEN: !!token, STRIPE_SECRET_KEY: !!stripe });
    return json(500, { error: "not configured" });
  }

  let d = {};
  try { d = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad json" }); }

  const t = (v) => (v == null ? "" : String(v).trim());
  const name = t(d.name), venue = t(d.venue), act = t(d.act), email = t(d.email);
  if (!venue || !act || !email) return json(400, { error: "missing required fields" });

  // ---- 1) create the Airtable record ----
  const fields = {
    "Request": (venue + " — " + act).slice(0, 250),
    "Name": name,
    "Venue": venue,
    "Act": act,
    "Ticket price": t(d.price),
    "Notes": t(d.notes),
    "Contact email": email,
    "Payment": "Awaiting payment",
    "Status": "Awaiting payment",
    "Submitted": new Date().toISOString()
  };
  const cap = parseInt(t(d.capacity).replace(/[^0-9]/g, ""), 10);
  if (!isNaN(cap)) fields["Capacity"] = cap;
  ["date1", "date2", "date3"].forEach((k, i) => { if (t(d[k])) fields["Date " + (i + 1)] = t(d[k]); });

  let recordId;
  try {
    const ar = await fetch("https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE), {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    const aj = await ar.json();
    if (!ar.ok) { console.error("Airtable error", aj); return json(502, { error: "airtable" }); }
    recordId = aj.records[0].id;
  } catch (e) {
    console.error("Airtable request failed", e);
    return json(502, { error: "airtable" });
  }

  // ---- 2) create the Stripe Checkout Session (form-encoded, no SDK) ----
  const p = new URLSearchParams();
  p.append("mode", "payment");
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", CURRENCY);
  p.append("line_items[0][price_data][unit_amount]", String(PRICE));
  p.append("line_items[0][price_data][product_data][name]", "MLES Demand Pre-Check");
  p.append("line_items[0][price_data][product_data][description]", (venue + " · " + act).slice(0, 250));
  p.append("customer_email", email);
  p.append("success_url", SITE + "/mles-request/thanks/?paid=1");
  p.append("cancel_url", SITE + "/mles-request/");
  p.append("client_reference_id", recordId);
  p.append("metadata[airtable_id]", recordId);
  p.append("metadata[venue]", venue.slice(0, 200));
  p.append("metadata[act]", act.slice(0, 200));

  let session;
  try {
    const sr = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + stripe, "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    session = await sr.json();
    if (!sr.ok) { console.error("Stripe error", session); return json(502, { error: "stripe" }); }
  } catch (e) {
    console.error("Stripe request failed", e);
    return json(502, { error: "stripe" });
  }

  // ---- 3) save the session id back to Airtable (best-effort) ----
  try {
    await fetch("https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) + "/" + recordId, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { "Stripe session": session.id } })
    });
  } catch (e) { console.warn("could not save session id", e); }

  return json(200, { url: session.url });
};
