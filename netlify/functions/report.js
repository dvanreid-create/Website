// report  —  renders a client's branded "Demand Read" as an HTML page.
// The MLES worker writes a small JSON into the row's "Report data" field via the Airtable MCP.
// This function reads that JSON and renders the report. Owner reviews via the row's "Report link";
// the Approved-email sends the same link to the client.
//
// GET ?id=<recordId>[&k=<WORKER_SECRET>]
// Required Netlify env: AIRTABLE_TOKEN   (Optional: AIRTABLE_BASE, AIRTABLE_TABLE, WORKER_SECRET)

const BASE  = process.env.AIRTABLE_BASE  || "appRFxS65uKsCxc03";
const TABLE = process.env.AIRTABLE_TABLE || "Demand Pre-Checks";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const bandColor = (b) => ({ Strong: "#1F9E63", Solid: "#EF9F27", Risky: "#E8662A" }[b] || "#EF9F27");
const bandLong  = (b) => ({ Strong: "STRONG DRAW", Solid: "SOLID DRAW", Risky: "RISKY" }[b] || String(b || "").toUpperCase());

function page(d) {
  const score = Math.round(Number(d.score) || 0);
  const bc = bandColor(d.band);
  const pillars = (d.pillars || []).map(([name, val]) => `
      <div class="prow">
        <div class="pl"><span>${esc(name)}</span><b>${Math.round(val)}</b></div>
        <div class="bar"><i style="width:${Math.max(0, Math.min(100, val))}%"></i></div>
      </div>`).join("");
  const levers = (d.levers || []).map((l) => `<li>${esc(l)}</li>`).join("");
  const dates = (d.dates || []).map((r) => `
      <div class="drow">
        <span class="dl">${esc(r.label)}</span>
        <span class="ds">${Math.round(r.score)}</span>
        <span class="pill" style="background:${bandColor(r.band)}">${esc((r.band || "").toUpperCase())}</span>
        ${r.note ? `<span class="dn">${esc(r.note)}</span>` : ""}
      </div>`).join("");

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>MLE Score · ${esc(d.act_label || "Málaga Live")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap">
<style>
  :root{--sea:#0B5E8A;--coral:#E8662A;--navy:#143A4E;--amber:#EF9F27;--ink:#36434f;--mute:#6b7783;--line:#e2e6ea;--track:#e7ecf0;--panel:#f7f9fb}
  *{box-sizing:border-box}
  body{margin:0;background:#eef1f4;color:var(--navy);font-family:Inter,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:820px;margin:24px auto;background:#fff;border:1px solid var(--line);border-radius:16px;padding:38px 40px 30px;box-shadow:0 12px 40px rgba(20,40,60,.08)}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .top img{height:62px}
  .top .rt{text-align:right}
  .top h1{font-family:Anton,sans-serif;font-weight:400;letter-spacing:.5px;font-size:30px;color:var(--navy);margin:0}
  .top .sub{color:var(--mute);font-size:13px;margin-top:3px}
  .top .ref{margin-top:5px;font-size:12px;font-weight:700;letter-spacing:.6px;color:var(--sea);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  hr{border:0;border-top:1px solid var(--line);margin:22px 0}
  .lbl{font-size:12.5px;font-weight:600;letter-spacing:.4px;color:var(--sea);text-transform:uppercase}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;margin-top:14px}
  .grid .f .k{font-size:12px;color:var(--mute)}
  .grid .f .v{font-size:17px;font-weight:700;color:var(--navy);margin-top:2px}
  .mid{display:flex;gap:30px;align-items:center;margin-top:6px}
  .gauge{flex:0 0 auto;width:170px;text-align:center}
  .ring{width:170px;height:170px;border-radius:50%;background:conic-gradient(var(--sea) calc(${score}*1%),var(--track) 0);display:flex;align-items:center;justify-content:center}
  .ring .hole{width:128px;height:128px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .ring .n{font-family:Anton,sans-serif;font-size:50px;line-height:1;color:var(--navy)}
  .ring .of{font-size:12px;color:var(--mute);font-weight:600;margin-top:2px}
  .bandpill{display:inline-block;margin-top:14px;padding:7px 18px;border-radius:18px;color:#fff;font-weight:700;font-size:14px;background:${bc}}
  .pillars{flex:1}
  .pillars h3,.sec h3{font-size:12.5px;font-weight:600;letter-spacing:.4px;color:var(--sea);text-transform:uppercase;margin:0 0 14px}
  .prow{margin-bottom:14px}
  .pl{display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:var(--navy);margin-bottom:6px}
  .bar{height:11px;background:var(--track);border-radius:6px;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--sea);border-radius:6px}
  .modnote{color:var(--mute);font-size:13.5px;margin-top:4px}
  .sec{margin-top:26px}
  .sec ul{margin:0;padding:0;list-style:none}
  .sec li{position:relative;padding-left:20px;margin-bottom:11px;font-size:14.5px;line-height:1.5;color:var(--ink)}
  .sec li:before{content:"";position:absolute;left:0;top:7px;width:9px;height:9px;border-radius:50%;background:var(--coral)}
  .drow{display:flex;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid var(--line)}
  .drow .dl{font-weight:700;color:var(--navy);min-width:140px}
  .drow .ds{font-weight:700;color:var(--navy);width:38px;text-align:right}
  .pill{color:#fff;font-weight:700;font-size:12px;padding:3px 12px;border-radius:13px}
  .dn{color:var(--mute);font-size:13px}
  .tags{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}
  .tag{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:7px 14px;font-size:13.5px;font-weight:600;color:var(--navy)}
  .rec{margin-top:8px;background:var(--panel);border-left:5px solid var(--coral);border-radius:12px;padding:16px 20px;font-size:15px;line-height:1.6;color:var(--ink)}
  .foot{margin-top:24px;color:var(--mute);font-size:12px;line-height:1.5}
  .foot b{color:var(--sea)}
  .printbtn{position:fixed;right:18px;bottom:18px;background:var(--sea);color:#fff;border:0;border-radius:10px;padding:12px 18px;font:600 14px Inter,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(11,94,138,.35)}
  @media print{body{background:#fff}.sheet{box-shadow:none;border:0;margin:0;max-width:none}.printbtn{display:none}}
  @media(max-width:680px){.sheet{padding:24px 20px}.grid{grid-template-columns:1fr}.mid{flex-direction:column;gap:18px}.top h1{font-size:24px}}
</style></head><body>
<div class="sheet">
  <div class="top">
    <img src="https://malagalivepulse.com/assets/malaga-live-logo.png" alt="Málaga Live">
    <div class="rt"><h1>MLE SCORE</h1><div class="sub">Málaga Live Event Score${d.issued ? " · " + esc(d.issued) : ""}</div><div class="ref">Ref ${esc(d.ref)}</div></div>
  </div>
  <hr>
  <div class="lbl">Event under consideration</div>
  <div class="grid">
    <div class="f"><div class="k">VENUE</div><div class="v">${esc(d.venue_label)}</div></div>
    <div class="f"><div class="k">DATE</div><div class="v">${esc(d.headline_date)}</div></div>
    <div class="f"><div class="k">ACT</div><div class="v">${esc(d.act_label)}</div></div>
    <div class="f"><div class="k">TICKET</div><div class="v">${esc(d.ticket_label)}</div></div>
  </div>
  <hr>
  <div class="mid">
    <div class="gauge">
      <div class="ring"><div class="hole"><div class="n">${score}</div><div class="of">/ 100</div></div></div>
      <div class="bandpill">${bandLong(d.band)}</div>
    </div>
    <div class="pillars">
      <h3>Why — the three pillars</h3>
      ${pillars}
      ${d.modifier_note ? `<div class="modnote">${esc(d.modifier_note)}</div>` : ""}
    </div>
  </div>
  <div class="sec"><h3>Biggest levers</h3><ul>${levers}</ul></div>
  <div class="sec"><h3>Date comparison</h3>${dates}</div>
  <div class="tags">
    ${d.revenue_note ? `<span class="tag">Revenue: ${esc(d.revenue_note)}</span>` : ""}
    ${d.confidence ? `<span class="tag">Confidence: ${esc(d.confidence)}</span>` : ""}
  </div>
  <div class="sec"><h3>Recommendation</h3><div class="rec">${esc(d.recommendation)}</div></div>
  <div class="foot">
    Directional demand estimate, not a guaranteed attendance or revenue forecast. Scores are rankings until calibrated against logged outcomes.<br>
    <b>Málaga Live · malagalivepulse.com</b>
  </div>
</div>
<button class="printbtn" onclick="window.print()">Save as PDF / Print</button>
</body></html>`;
}

exports.handler = async (event) => {
  const token = (process.env.AIRTABLE_TOKEN || "").trim();
  if (!token) return { statusCode: 500, body: "not configured" };

  const q = event.queryStringParameters || {};
  const id = (q.id || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return { statusCode: 400, body: "bad id" };

  const want = (process.env.WORKER_SECRET || "").trim();
  if (want && (q.k || "").trim() !== want) return { statusCode: 401, body: "unauthorized" };

  let rec;
  try {
    const r = await fetch(
      "https://api.airtable.com/v0/" + BASE + "/" + encodeURIComponent(TABLE) + "/" + id,
      { headers: { Authorization: "Bearer " + token } }
    );
    if (!r.ok) return { statusCode: 404, body: "not found" };
    rec = await r.json();
  } catch (e) { console.error("report fetch failed", e); return { statusCode: 502, body: "error" }; }

  const raw = (rec && rec.fields && rec.fields["Report data"]) || "";
  if (!raw) return { statusCode: 404, headers: { "Content-Type": "text/html" }, body: "<p>Report not ready yet.</p>" };
  let d;
  try { d = JSON.parse(raw); } catch { return { statusCode: 500, body: "bad report data" }; }
  // Unique, traceable reference derived deterministically from the Airtable record id.
  d.ref = "MLE-" + id.replace(/^rec/, "").slice(-8).toUpperCase();

  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, body: page(d) };
};
