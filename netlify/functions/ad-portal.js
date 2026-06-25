// ad-portal — reliable, self-serve billing portal access for gutter advertisers.
// Does NOT use Stripe's flaky no-code login link. Instead it mints a fresh Stripe
// Billing Portal *session* via the API (always valid) from a permanent per-advertiser token.
//
//   GET /ad-portal?t=<token>  -> look up the Gutter Sponsors row by Portal token,
//                                create a billing-portal session for its Stripe customer,
//                                302-redirect the advertiser straight into the portal.
//   GET /ad-portal            -> a small page: enter your email to get your link by email.
//   POST {email}              -> if that email is on a Sold row, flag it so the box mailer
//                                emails that advertiser their portal link (sent only to the
//                                on-file address, so it's secure). Always answers the same way.
//
// Netlify env: STRIPE_SECRET_KEY, AIRTABLE_TOKEN, optional AIRTABLE_BASE.

const BASE  = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
const TABLE = "tbl79C9hvGbM6fq5V"; // Gutter Sponsors
const SITE  = "https://malagalivepulse.com";

const AT = (path, opts) => fetch("https://api.airtable.com/v0/" + BASE + "/" + path, opts);

function page(title, bodyHtml) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>" + title + " · Málaga Live</title>" +
      "<style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#0B5E8A;color:#143A4E;" +
      "display:flex;min-height:100vh;align-items:center;justify-content:center;}" +
      ".card{background:#fff;max-width:440px;width:90%;border-radius:16px;padding:30px 28px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,.3);}h1{font-size:20px;color:#0B5E8A;margin:0 0 10px;}" +
      "p{font-size:14px;line-height:1.55;color:#42505c;}input{width:100%;box-sizing:border-box;" +
      "border:1px solid #d7dde2;border-radius:9px;padding:11px;font-size:15px;margin:8px 0 0;}" +
      "button{width:100%;margin-top:14px;background:#E8662A;color:#fff;border:0;border-radius:11px;" +
      "padding:13px;font-size:15px;font-weight:600;cursor:pointer;}a{color:#0B5E8A;}</style></head>" +
      "<body><div class=\"card\">" + bodyHtml + "</div></body></html>"
  };
}

async function rowByFormula(token, formula) {
  const r = await AT(TABLE + "?filterByFormula=" + encodeURIComponent(formula) + "&pageSize=1",
    { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.records && j.records[0]) || null;
}

exports.handler = async (event) => {
  const skey  = process.env.STRIPE_SECRET_KEY;
  const token = process.env.AIRTABLE_TOKEN;
  if (!skey || !token) return page("Unavailable", "<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>");

  // ---- POST: request the link by email ----
  if (event.httpMethod === "POST") {
    let email = "";
    try { email = (JSON.parse(event.body || "{}").email || "").trim(); }
    catch { email = ((event.body || "").match(/email=([^&]*)/) || [])[1] || ""; email = decodeURIComponent(email).trim(); }
    const same = "<h1>Check your inbox</h1><p>If that address has an active Málaga Live ad, " +
      "we've just emailed you a secure link to manage it. It can take a minute to arrive.</p>" +
      "<p><a href=\"" + SITE + "/advertise.html\">← Back to Málaga Live</a></p>";
    if (email) {
      const row = await rowByFormula(token, "AND({Contact email}='" + email.replace(/'/g, "\\'") + "',{Status}='Sold')");
      if (row) {
        await AT(TABLE + "/" + row.id, {
          method: "PATCH",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { "Portal resend": true } })
        });
      }
    }
    return page("Check your inbox", same);
  }

  const t = (event.queryStringParameters && event.queryStringParameters.t || "").trim();

  // ---- GET without token: ask for the email ----
  if (!t) {
    return page("Manage your ad",
      "<h1>Manage your Málaga Live ad</h1>" +
      "<p>Open the <b>Manage your ad</b> link in any Málaga Live email to go straight to your billing portal — " +
      "update your card, switch plan, or cancel anytime.</p>" +
      "<p>Lost the email? Enter your address and we'll send you a fresh secure link.</p>" +
      "<form method=\"POST\"><input type=\"email\" name=\"email\" placeholder=\"you@business.com\" required>" +
      "<button type=\"submit\">Email me my link</button></form>");
  }

  // ---- GET with token: redirect into the Stripe billing portal ----
  const row = await rowByFormula(token, "{Portal token}='" + t.replace(/'/g, "\\'") + "'");
  const cust = row && row.fields ? row.fields["Stripe customer ID"] : "";
  if (!cust) return page("Link expired", "<h1>This link isn't active</h1><p>Please use the Manage link from your most recent Málaga Live email, or request a new one from <a href=\"" + SITE + "/advertise.html\">the advertise page</a>.</p>");

  try {
    const body = new URLSearchParams();
    body.append("customer", cust);
    body.append("return_url", SITE + "/advertise.html");
    const sr = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + skey, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const j = await sr.json();
    if (!sr.ok || !j.url) { console.error("portal session error", sr.status, j); return page("Unavailable", "<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>"); }
    return { statusCode: 302, headers: { Location: j.url, "Cache-Control": "no-store" }, body: "" };
  } catch (e) {
    console.error("ad-portal error", e);
    return page("Unavailable", "<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>");
  }
};
