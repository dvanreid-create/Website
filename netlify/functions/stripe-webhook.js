// stripe-webhook  —  Stripe calls this after a successful payment.
// On "checkout.session.completed" it marks the matching Airtable row Paid + Awaiting MLES.
// Verifies the Stripe signature manually (no SDK) using Node crypto.
//
// Required Netlify environment variables:
//   STRIPE_WEBHOOK_SECRET  — the signing secret from the Stripe webhook endpoint (whsec_…)
//   AIRTABLE_TOKEN         — Airtable PAT with data.records:write on the base
// Optional overrides: AIRTABLE_BASE, AIRTABLE_TABLE

const crypto = require("crypto");
const BASE  = process.env.AIRTABLE_BASE  || "appRFxS65uKsCxc03";
const TABLE = process.env.AIRTABLE_TABLE || "Demand Pre-Checks";

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

  if (evt.type === "checkout.session.completed") {
    const s = evt.data.object || {};
    const recId = (s.metadata && s.metadata.airtable_id) || s.client_reference_id;
    if (recId) {
      try {
        await fetch("https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) + "/" + recId, {
          method: "PATCH",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { "Payment": "Paid", "Status": "Awaiting MLES" } })
        });
      } catch (e) { console.error("airtable update failed", e); }
    } else {
      console.warn("no airtable_id on session", s.id);
    }
  }
  return { statusCode: 200, body: "ok" };
};
