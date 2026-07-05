// stripe-webhook — Stripe calls this after payment events.
// Three flows share this one endpoint:
//   A) MLE Score  (mode=payment)       -> MLE Score Orders table
//   B) Gutter ad  (mode=subscription)  -> Gutter Sponsors table
//   C) Newsletter (mode=payment)       -> Newsletter Sponsors table (Pending -> Sold)
// Verifies the Stripe signature manually (no SDK) using Node crypto.
//
// Netlify env: STRIPE_WEBHOOK_SECRET, AIRTABLE_TOKEN, STRIPE_SECRET_KEY
// Optional: AIRTABLE_BASE, AIRTABLE_TABLE (MLE table)

const crypto = require("crypto");
const BASE     = process.env.AIRTABLE_BASE  || "appRFxS65uKsCxc03";
const MLE_TABLE = process.env.AIRTABLE_TABLE || "tblDbA3hnC8AtHeCw";   // MLE Score Orders
const GUT_TABLE = "tbl79C9hvGbM6fq5V";                                 // Gutter Sponsors

const AT = (path, opts) => fetch("https://api.airtable.com/v0/" + BASE + "/" + path, opts);

async function gutPatch(token, recId, fields) {
  const r = await AT(GUT_TABLE + "/" + recId, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true })
  });
  if (!r.ok) { console.error("gutter patch failed", r.status, await r.text()); return false; }
  return true;
}

// Find a Gutter Sponsors row by its Stripe subscription id (for invoice/subscription events).
async function gutFindBySub(token, subId) {
  const formula = encodeURIComponent("{Stripe subscription ID}='" + subId.replace(/'/g, "\\'") + "'");
  const r = await AT(GUT_TABLE + "?filterByFormula=" + formula + "&pageSize=1", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) { console.error("gutter lookup failed", r.status, await r.text()); return null; }
  const j = await r.json();
  return (j.records && j.records[0]) ? j.records[0].id : null;
}

exports.handler = async (event) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const token  = process.env.AIRTABLE_TOKEN;
  if (!secret || !token) { console.error("webhook not configured"); return { statusCode: 500, body: "not configured" }; }

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"] || "";
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");

  // ---- verify Stripe signature ----
  try {
    const parts = {};
    sig.split(",").forEach((kv) => { const [k, v] = kv.split("="); parts[k] = v; });
    if (!parts.t || !parts.v1) return { statusCode: 400, body: "no sig" };
    const expected = crypto.createHmac("sha256", secret).update(parts.t + "." + raw, "utf8").digest("hex");
    const a = Buffer.from(expected), b = Buffer.from(parts.v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { console.error("bad signature"); return { statusCode: 400, body: "bad sig" }; }
  } catch (e) { console.error("sig verify error", e); return { statusCode: 400, body: "sig" }; }

  let evt;
  try { evt = JSON.parse(raw); } catch { return { statusCode: 400, body: "json" }; }

  // =========================================================================
  // B) GUTTER AD — subscription lifecycle
  // =========================================================================
  if (evt.type === "checkout.session.completed" &&
      (((evt.data.object || {}).metadata || {}).flow === "gutter_ad" || (evt.data.object || {}).mode === "subscription")) {
    const s = evt.data.object || {};
    const recId = (s.metadata && s.metadata.airtable_id) || s.client_reference_id;
    if (!recId) { console.warn("gutter: no airtable_id on session", s.id); return { statusCode: 200, body: "ok (no rec)" }; }
    const fields = { "Status": "Sold", "Start date": new Date().toISOString().slice(0, 10) };
    if (s.subscription) fields["Stripe subscription ID"] = s.subscription;
    if (s.customer) fields["Stripe customer ID"] = s.customer;
    const ok = await gutPatch(token, recId, fields);
    return ok ? { statusCode: 200, body: "gutter active" } : { statusCode: 502, body: "airtable" };
  }

  if (evt.type === "invoice.paid" || evt.type === "invoice.payment_succeeded") {
    const inv = evt.data.object || {};
    const subId = inv.subscription;
    if (subId) {
      const recId = await gutFindBySub(token, subId);
      if (recId) {
        const fields = { "Status": "Sold" };
        // period end of the line item (unix secs) -> Paid through date
        let end = 0;
        try { end = (((inv.lines || {}).data || [])[0] || {}).period ? inv.lines.data[0].period.end : 0; } catch {}
        if (!end && inv.period_end) end = inv.period_end;
        if (end) fields["Paid through"] = new Date(end * 1000).toISOString().slice(0, 10);
        const ok = await gutPatch(token, recId, fields);
        return ok ? { statusCode: 200, body: "gutter renewed" } : { statusCode: 502, body: "airtable" };
      }
    }
    return { statusCode: 200, body: "ok (no gutter sub)" };
  }

  if (evt.type === "invoice.payment_failed") {
    const inv = evt.data.object || {};
    if (inv.subscription) {
      const recId = await gutFindBySub(token, inv.subscription);
      if (recId) { await gutPatch(token, recId, { "Status": "Past due" }); return { statusCode: 200, body: "gutter past due" }; }
    }
    return { statusCode: 200, body: "ok" };
  }

  if (evt.type === "customer.subscription.deleted") {
    const sub = evt.data.object || {};
    let recId = (sub.metadata && sub.metadata.airtable_id) || null;
    if (!recId && sub.id) recId = await gutFindBySub(token, sub.id);
    if (recId) { await gutPatch(token, recId, { "Status": "Cancelled" }); return { statusCode: 200, body: "gutter cancelled" }; }
    return { statusCode: 200, body: "ok" };
  }

  // Customer Portal plan switch (Standard <-> Premium) -> resync tile airtime/fee by price amount.
  if (evt.type === "customer.subscription.updated") {
    const sub = evt.data.object || {};
    let recId = (sub.metadata && sub.metadata.airtable_id) || null;
    if (!recId && sub.id) recId = await gutFindBySub(token, sub.id);
    if (recId) {
      let amt = 0;
      try { amt = ((((sub.items || {}).data || [])[0] || {}).price || {}).unit_amount || 0; } catch {}
      const isPrem = amt >= 15000;           // >= €150 -> Premium (€225); else Standard (€75)
      const fields = {
        "Tier": isPrem ? "Premium 30s" : "Standard 5s",
        "Monthly fee": isPrem ? 225 : 75,
        "Duration secs": isPrem ? 30 : 5
      };
      if (sub.status === "active" || sub.status === "trialing") fields["Status"] = "Sold";
      else if (sub.status === "past_due" || sub.status === "unpaid") fields["Status"] = "Past due";
      if (amt) await gutPatch(token, recId, fields);
      return { statusCode: 200, body: "gutter synced" };
    }
    return { statusCode: 200, body: "ok" };
  }

  // =========================================================================
  // C) NEWSLETTER SPONSOR — one-time payment; flip the booking Pending -> Sold
  //    (this is what marks its months booked). MUST run before the MLE branch,
  //    which also fires on checkout.session.completed.
  // =========================================================================
  if (evt.type === "checkout.session.completed" &&
      (((evt.data.object || {}).metadata || {}).flow === "newsletter_sponsor")) {
    const s = evt.data.object || {};
    const recId = (s.metadata && s.metadata.airtable_id) || s.client_reference_id;
    if (!recId) { console.warn("newsletter: no airtable_id on session", s.id); return { statusCode: 200, body: "ok (no rec)" }; }
    const r = await AT(encodeURIComponent("Newsletter Sponsors") + "/" + recId, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { "Status": "Sold" }, typecast: true })
    });
    if (!r.ok) { console.error("newsletter patch failed", r.status, await r.text()); return { statusCode: 502, body: "airtable" }; }
    return { statusCode: 200, body: "newsletter sold" };
  }

  // =========================================================================
  // A) MLE SCORE — one-time payment (unchanged)
  // =========================================================================
  if (evt.type === "checkout.session.completed") {
    const s = evt.data.object || {};
    const recId = (s.metadata && s.metadata.airtable_id) || s.client_reference_id;

    let promoCode = "";
    try {
      const skey = process.env.STRIPE_SECRET_KEY;
      if (skey && s.id) {
        const sr = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(s.id) + "?expand[]=discounts.promotion_code", {
          headers: { Authorization: "Bearer " + skey }
        });
        if (sr.ok) {
          const full = await sr.json();
          const dd = (full.discounts && full.discounts[0]) || null;
          if (dd) promoCode = (dd.promotion_code && dd.promotion_code.code) || (dd.coupon && (dd.coupon.name || dd.coupon.id)) || "";
        }
      }
    } catch (e) { console.warn("promo capture skipped", e && e.message); }

    if (recId) {
      try {
        const fields = { "Payment": "Paid", "Status": "Awaiting MLES" };
        if (promoCode) fields["Promo code"] = promoCode;
        const ar = await AT(encodeURIComponent(MLE_TABLE) + "/" + recId, {
          method: "PATCH",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: fields })
        });
        if (!ar.ok) { console.error("airtable update failed", ar.status, await ar.text()); return { statusCode: 502, body: "airtable update failed" }; }
      } catch (e) { console.error("airtable update error", e); return { statusCode: 502, body: "airtable error" }; }
    } else {
      console.warn("no airtable_id on session", s.id);
    }
  }
  return { statusCode: 200, body: "ok" };
};
