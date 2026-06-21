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
const TABLE     = process.env.AIRTABLE_TABLE || "tblDbA3hnC8AtHeCw"   /* table ID = rename-proof (was "Demand Pre-Checks") */;
const SITE      = process.env.SITE_URL       || "https://malagalivepulse.com";
const PRICE     = parseInt(process.env.PRICE_CENTS || "4900", 10);   // €49.00
const CURRENCY  = (process.env.CURRENCY || "eur").toLowerCase();
// VAT/IVA master switch. Leave unset/false until Stripe Tax is fully configured
// (business origin address + default tax category) AND your EU OSS registration is
// added under Stripe Tax → Registrations. Set Netlify env STRIPE_TAX_ENABLED="true"
// to go live — no redeploy needed. Flipping it on before Stripe Tax is configured
// will cause Checkout Session creation to error and break the live checkout.
const TAX_ON    = (process.env.STRIPE_TAX_ENABLED || "").trim().toLowerCase() === "true";

const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });

  const token  = (process.env.AIRTABLE_TOKEN || "").trim();
  const stripe = (process.env.STRIPE_SECRET_KEY || "").trim();
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
    "Notes": [t(d.venuetype) && ("Venue: " + t(d.venuetype)), t(d.onsale) && ("On-sale: " + t(d.onsale)), t(d.notes)].filter(Boolean).join(" · "),
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
  p.append("payment_method_types[0]", "card");
  p.append("allow_promotion_codes", "true");   // shows "Add promotion code" on Checkout (enables coupons, incl. 100%-off comps)
  p.append("billing_address_collection", "required");   // capture buyer country on every order (VAT location evidence)
  p.append("tax_id_collection[enabled]", "true");       // optional VAT-ID field on Checkout → reverse charge for EU businesses
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", CURRENCY);
  p.append("line_items[0][price_data][unit_amount]", String(PRICE));
  p.append("line_items[0][price_data][product_data][name]", "MLE Score");
  p.append("line_items[0][price_data][product_data][description]", (venue + " · " + act).slice(0, 250));
  p.append("customer_email", email);
  p.append("success_url", SITE + "/mles-request/thanks/?paid=1");
  p.append("cancel_url", SITE + "/mles-request/");
  p.append("client_reference_id", recordId);
  p.append("metadata[airtable_id]", recordId);
  p.append("metadata[venue]", venue.slice(0, 200));
  p.append("metadata[act]", act.slice(0, 200));

  // VAT/IVA calculation — only when Stripe Tax + OSS registration are live (see TAX_ON note above).
  if (TAX_ON) {
    p.append("automatic_tax[enabled]", "true");                          // Stripe computes/collects the right VAT per buyer location
    p.append("line_items[0][price_data][tax_behavior]", "exclusive");    // VAT added on top of the €49 (customer pays €49 + IVA)
  }

  let session;
  try {
    const sr = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + stripe, "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString()
    });
    const txt = await sr.text();
    try { session = JSON.parse(txt); } catch { session = null; }
    if (!sr.ok || !session || !session.url) {
      // Log full detail server-side only; return a generic error to the browser (no Stripe/internal diagnostics leaked).
      console.error("Stripe error", sr.status, txt);
      return json(502, { error: "stripe" });
    }
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
