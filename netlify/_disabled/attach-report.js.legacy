// attach-report  —  called by the MLES worker (POST JSON) after it scores a paid request.
// 1) uploads the generated Demand Read PDF to the row's "Report PDF" attachment field
// 2) sets MLES score + Band + Status = "Pending review"
// Reuses the existing AIRTABLE_TOKEN (the token never leaves Netlify).
//
// POST body: { recordId, score, band, filename, pdf_base64, key? }
//   recordId    — Airtable record id (rec…) of the Demand Pre-Checks row
//   score       — number 0–100
//   band        — "Strong" | "Solid" | "Risky"
//   filename    — e.g. "Demand-Read_Florida-Beach-Club.pdf"
//   pdf_base64  — the PDF, base64-encoded (no data: prefix)
//   key         — optional; required only if WORKER_SECRET env is set
//
// Required Netlify env: AIRTABLE_TOKEN   (Optional: AIRTABLE_BASE, AIRTABLE_TABLE, WORKER_SECRET)

const BASE     = process.env.AIRTABLE_BASE  || "appRFxS65uKsCxc03";
const TABLE    = process.env.AIRTABLE_TABLE || "Demand Pre-Checks";
const PDF_FIELD = "flddjQOI8eK3gQjXq";   // "Report PDF" (multipleAttachments)

const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });

  const token = (process.env.AIRTABLE_TOKEN || "").trim();
  if (!token) { console.error("attach-report: missing AIRTABLE_TOKEN"); return json(500, { error: "not configured" }); }

  let d = {};
  try { d = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad json" }); }

  // optional shared-secret gate
  const want = (process.env.WORKER_SECRET || "").trim();
  if (want && (d.key || "").trim() !== want) return json(401, { error: "unauthorized" });

  const recordId = (d.recordId || "").trim();
  const pdf = (d.pdf_base64 || "").trim();
  const filename = (d.filename || "Demand-Read.pdf").trim();
  if (!recordId || !pdf) return json(400, { error: "missing recordId or pdf_base64" });

  // ---- 1) upload the PDF to the attachment field (Airtable content API) ----
  try {
    const ur = await fetch(
      "https://content.airtable.com/v0/" + BASE + "/" + recordId + "/" + PDF_FIELD + "/uploadAttachment",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "application/pdf", filename: filename, file: pdf })
      }
    );
    const ut = await ur.text();
    if (!ur.ok) { console.error("uploadAttachment error", ur.status, ut); return json(502, { error: "attach", status: ur.status, detail: ut.slice(0, 300) }); }
  } catch (e) {
    console.error("uploadAttachment failed", e);
    return json(502, { error: "attach", detail: "exc: " + String((e && e.message) || e) });
  }

  // ---- 2) set MLES score + Band + Status ----
  const fields = { "Status": "Pending review" };
  if (d.score !== undefined && d.score !== null && d.score !== "") fields["MLES score"] = Number(d.score);
  if (d.band) fields["Band"] = String(d.band);
  try {
    const pr = await fetch(
      "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) + "/" + recordId,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fields, typecast: true })
      }
    );
    const pt = await pr.text();
    if (!pr.ok) { console.error("patch fields error", pr.status, pt); return json(502, { error: "patch", status: pr.status, detail: pt.slice(0, 300) }); }
  } catch (e) {
    console.error("patch fields failed", e);
    return json(502, { error: "patch", detail: "exc: " + String((e && e.message) || e) });
  }

  return json(200, { ok: true, recordId: recordId });
};
