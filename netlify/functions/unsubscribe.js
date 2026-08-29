// Newsletter unsubscribe endpoint for the WEB / home-screen-badge copy of the newsletter.
// MailerLite's {$unsubscribe} merge tag only resolves inside an email MailerLite itself sends; when
// the same newsletter HTML is opened on the site (the /weekly/ badge loads /assets/newsletter/
// latest-<lang>.html directly), that tag is literal and 404s. So the web copy links here instead.
// GET shows a small form; POST unsubscribes the address via the MailerLite API. (DLR 2026-08-29)
const API = "https://connect.mailerlite.com/api";

function page(inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe &middot; M&aacute;laga Live</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
       font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0B5E8A;color:#fff}
  .card{background:#fff;color:#143A4E;width:100%;max-width:430px;border-radius:16px;padding:30px 26px;
        box-shadow:0 12px 44px rgba(0,0,0,.22)}
  h1{font-family:Anton,sans-serif;font-weight:400;letter-spacing:.4px;font-size:22px;margin:0 0 8px}
  p{font-size:14px;line-height:1.55;color:#5f6b78;margin:0 0 18px}
  input{width:100%;padding:13px 14px;font-size:15px;border:1px solid #cdd7dd;border-radius:10px;margin:0 0 12px}
  button{width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;background:#E8662A;border:0;border-radius:10px;cursor:pointer}
  a{color:#0B5E8A}
</style></head><body><div class="card">${inner}</div></body></html>`;
}

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

exports.handler = async (event) => {
  const token = process.env.MAILERLITE_TOKEN;
  const html = (inner) => ({ statusCode: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: page(inner) });
  const help = `Please email <a href="mailto:hello@malagalivepulse.com?subject=Unsubscribe">hello@malagalivepulse.com</a> and we'll remove you right away.`;

  if (event.httpMethod === "POST") {
    let email = "";
    try { email = new URLSearchParams(event.body || "").get("email") || ""; } catch (e) {}
    email = email.trim().toLowerCase();
    if (!email || email.indexOf("@") < 1) {
      return html(`<h1>Enter a valid email</h1><p>Please go back and enter the email address you subscribed with.</p>`);
    }
    if (!token) {
      return html(`<h1>Almost there</h1><p>${help}</p>`);
    }
    try {
      const r = await fetch(API + "/subscribers", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: email, status: "unsubscribed" })
      });
      if (r.ok) {
        return html(`<h1>You're unsubscribed</h1><p><b>${esc(email)}</b> has been removed from the M&aacute;laga Live weekly newsletter. Sorry to see you go &mdash; you can resubscribe anytime from the site.</p>`);
      }
      return html(`<h1>Couldn't complete that</h1><p>${help}</p>`);
    } catch (e) {
      return html(`<h1>Couldn't complete that</h1><p>${help}</p>`);
    }
  }

  let pre = "";
  try { pre = (event.queryStringParameters && event.queryStringParameters.email) || ""; } catch (e) {}
  return html(`<h1>Unsubscribe</h1>
<p>Enter the email address you used to subscribe to the M&aacute;laga Live weekly newsletter, and we'll remove you.</p>
<form method="POST" action="/unsubscribe">
  <input type="email" name="email" placeholder="you@example.com" value="${esc(pre)}" autocomplete="email" required>
  <button type="submit">Unsubscribe</button>
</form>`);
};
