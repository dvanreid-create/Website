// Auto-runs whenever a Netlify Forms submission is created.
// Copies "talent-submission" submissions into the Airtable "Talent" table.
// Requires a Netlify environment variable: AIRTABLE_TOKEN
//   (an Airtable personal access token with data.records:write on base appRFxS65uKsCxc03)
// Optional overrides: AIRTABLE_BASE, AIRTABLE_TABLE

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};
    const d = payload.data || {};

    // Only handle the Talent Square form
    const formName = payload.form_name || d["form-name"];
    if (formName && formName !== "talent-submission") {
      return { statusCode: 200, body: "ignored: " + formName };
    }

    const token = process.env.AIRTABLE_TOKEN;
    if (!token) {
      console.error("AIRTABLE_TOKEN env var is not set — submission NOT written to Airtable.");
      return { statusCode: 200, body: "no token" };
    }
    const BASE = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
    const TABLE = process.env.AIRTABLE_TABLE || "Talent";

    // Netlify sends multi-checkbox values as arrays; flatten to comma strings.
    const s = (v) => (Array.isArray(v) ? v.join(", ") : (v == null ? "" : String(v)));

    const fields = {
      "Preferred name": s(d.preferred_name),
      "Country": s(d.country),
      "YouTube": s(d.youtube),
      "Status": "New",
      "Genre": s(d.genre),
      "Act type": s(d.act_type),
      "Based in": s(d.based_in),
      "Instagram": s(d.instagram),
      "TikTok": s(d.tiktok),
      "Looking for gigs": s(d.looking_for_gigs),
      "Available for": s(d.available_for),
      "Setup": s(d.setup),
      "Fee": s(d.fee).trim() || "Open to discuss",
      "Areas": s(d.areas),
      "Email": s(d.email),
      "Phone": s(d.phone),
      "Consent feature": s(d.consent_feature),
      "Consent share": s(d.consent_share),
      "Consent shout-out": s(d.consent_shoutout),
      "Consent 18+": s(d.consent_age)
    };

    const res = await fetch(
      "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields, typecast: true })
      }
    );

    if (!res.ok) {
      const t = await res.text();
      console.error("Airtable insert failed:", res.status, t);
      return { statusCode: 200, body: "airtable error (logged)" };
    }
    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error("submission-created error:", e);
    return { statusCode: 200, body: "error (logged)" };
  }
};
