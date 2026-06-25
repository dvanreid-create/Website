// ad-portal — reliable, self-serve billing portal access for gutter advertisers.
// Does NOT use Stripe's flaky no-code login link. Instead it mints a fresh Stripe
// Billing Portal *session* via the API (always valid) from a permanent per-advertiser token.
//
//   GET /ad-portal?t=<token>  -> look up the Gutter Sponsors row by Portal token,
//                                create a billing-portal session, 302 into the portal.
//   GET /ad-portal[?lang=xx]  -> a small page (in the visitor's language): enter your
//                                email to get your link by email.
//   POST {email}              -> if that email is on a Sold row, flag it so the box mailer
//                                emails that advertiser their portal link (sent only to the
//                                on-file address, so it's secure).
//
// Page text is localised to the 8 site languages. Language = ?lang if valid, else the
// browser's Accept-Language, else English.
//
// Netlify env: STRIPE_SECRET_KEY, AIRTABLE_TOKEN, optional AIRTABLE_BASE.

const BASE  = process.env.AIRTABLE_BASE || "appRFxS65uKsCxc03";
const TABLE = "tbl79C9hvGbM6fq5V"; // Gutter Sponsors
const SITE  = "https://malagalivepulse.com";

const AT = (path, opts) => fetch("https://api.airtable.com/v0/" + BASE + "/" + path, opts);

// ---- localisation ----
const L = {
  en: { t_manage:"Manage your ad", t_inbox:"Check your inbox", t_unavail:"Unavailable", t_expired:"Link expired",
        h_manage:"Manage your Málaga Live ad",
        p1:"Open the <b>Manage your ad</b> link in any Málaga Live email to go straight to your billing portal — update your card, switch plan, or cancel anytime.",
        p2:"Lost the email? Enter your address and we'll send you a fresh secure link.",
        ph:"you@business.com", btn:"Email me my link",
        h_inbox:"Check your inbox",
        p_inbox:"If that address has an active Málaga Live ad, we've just emailed you a secure link to manage it. It can take a minute to arrive.",
        back:"← Back to Málaga Live",
        h_unavail:"Temporarily unavailable", p_unavail:"Please try again shortly.",
        h_expired:"This link isn't active", p_expired:"Please use the Manage link from your most recent Málaga Live email, or request a new one from the advertise page." },
  es: { t_manage:"Gestiona tu anuncio", t_inbox:"Revisa tu correo", t_unavail:"No disponible", t_expired:"Enlace caducado",
        h_manage:"Gestiona tu anuncio de Málaga Live",
        p1:"Abre el enlace <b>Gestiona tu anuncio</b> de cualquier correo de Málaga Live para ir directo a tu portal de facturación — actualiza tu tarjeta, cambia de plan o cancela cuando quieras.",
        p2:"¿Perdiste el correo? Introduce tu dirección y te enviaremos un nuevo enlace seguro.",
        ph:"tu@negocio.com", btn:"Envíame mi enlace",
        h_inbox:"Revisa tu correo",
        p_inbox:"Si esa dirección tiene un anuncio activo en Málaga Live, acabamos de enviarte un enlace seguro para gestionarlo. Puede tardar un minuto en llegar.",
        back:"← Volver a Málaga Live",
        h_unavail:"No disponible temporalmente", p_unavail:"Inténtalo de nuevo en un momento.",
        h_expired:"Este enlace no está activo", p_expired:"Usa el enlace Gestiona tu anuncio de tu correo más reciente de Málaga Live, o solicita uno nuevo desde la página de publicidad." },
  de: { t_manage:"Anzeige verwalten", t_inbox:"Postfach prüfen", t_unavail:"Nicht verfügbar", t_expired:"Link abgelaufen",
        h_manage:"Verwalte deine Málaga-Live-Anzeige",
        p1:"Öffne den Link <b>Anzeige verwalten</b> in einer beliebigen Málaga-Live-E-Mail, um direkt zu deinem Abrechnungsportal zu gelangen — Karte aktualisieren, Tarif wechseln oder jederzeit kündigen.",
        p2:"E-Mail verloren? Gib deine Adresse ein und wir senden dir einen neuen sicheren Link.",
        ph:"du@unternehmen.com", btn:"Sende mir meinen Link",
        h_inbox:"Postfach prüfen",
        p_inbox:"Falls diese Adresse eine aktive Málaga-Live-Anzeige hat, haben wir dir gerade einen sicheren Verwaltungslink gesendet. Es kann eine Minute dauern.",
        back:"← Zurück zu Málaga Live",
        h_unavail:"Vorübergehend nicht verfügbar", p_unavail:"Bitte versuche es gleich noch einmal.",
        h_expired:"Dieser Link ist nicht aktiv", p_expired:"Bitte nutze den Verwalten-Link aus deiner letzten Málaga-Live-E-Mail oder fordere einen neuen über die Werbeseite an." },
  fr: { t_manage:"Gérer ta publicité", t_inbox:"Vérifie ta boîte mail", t_unavail:"Indisponible", t_expired:"Lien expiré",
        h_manage:"Gère ta publicité Málaga Live",
        p1:"Ouvre le lien <b>Gérer ta publicité</b> dans n'importe quel e-mail Málaga Live pour aller droit à ton portail de facturation — mets à jour ta carte, change de formule ou annule à tout moment.",
        p2:"E-mail perdu ? Saisis ton adresse et nous t'enverrons un nouveau lien sécurisé.",
        ph:"toi@entreprise.com", btn:"Envoie-moi mon lien",
        h_inbox:"Vérifie ta boîte mail",
        p_inbox:"Si cette adresse a une publicité Málaga Live active, nous venons de t'envoyer un lien sécurisé pour la gérer. Cela peut prendre une minute.",
        back:"← Retour à Málaga Live",
        h_unavail:"Temporairement indisponible", p_unavail:"Merci de réessayer dans un instant.",
        h_expired:"Ce lien n'est pas actif", p_expired:"Utilise le lien Gérer ta publicité de ton dernier e-mail Málaga Live, ou demandes-en un nouveau depuis la page publicité." },
  sv: { t_manage:"Hantera din annons", t_inbox:"Kolla din inkorg", t_unavail:"Ej tillgänglig", t_expired:"Länken har gått ut",
        h_manage:"Hantera din Málaga Live-annons",
        p1:"Öppna länken <b>Hantera din annons</b> i valfritt Málaga Live-mejl för att gå direkt till din betalningsportal — uppdatera kortet, byt plan eller avsluta när du vill.",
        p2:"Tappat mejlet? Ange din adress så skickar vi en ny säker länk.",
        ph:"du@foretag.com", btn:"Mejla mig min länk",
        h_inbox:"Kolla din inkorg",
        p_inbox:"Om den adressen har en aktiv Málaga Live-annons har vi precis mejlat dig en säker länk för att hantera den. Det kan ta en minut.",
        back:"← Tillbaka till Málaga Live",
        h_unavail:"Tillfälligt otillgänglig", p_unavail:"Försök igen om en stund.",
        h_expired:"Den här länken är inte aktiv", p_expired:"Använd Hantera-länken från ditt senaste Málaga Live-mejl, eller begär en ny från annonssidan." },
  no: { t_manage:"Administrer annonsen", t_inbox:"Sjekk innboksen", t_unavail:"Utilgjengelig", t_expired:"Lenken er utløpt",
        h_manage:"Administrer din Málaga Live-annonse",
        p1:"Åpne lenken <b>Administrer annonsen</b> i en hvilken som helst Málaga Live-e-post for å gå rett til betalingsportalen din — oppdater kortet, bytt plan eller avslutt når som helst.",
        p2:"Mistet e-posten? Skriv inn adressen din, så sender vi en ny sikker lenke.",
        ph:"du@bedrift.com", btn:"Send meg lenken min",
        h_inbox:"Sjekk innboksen",
        p_inbox:"Hvis den adressen har en aktiv Málaga Live-annonse, har vi nettopp sendt deg en sikker lenke for å administrere den. Det kan ta et minutt.",
        back:"← Tilbake til Málaga Live",
        h_unavail:"Midlertidig utilgjengelig", p_unavail:"Prøv igjen om litt.",
        h_expired:"Denne lenken er ikke aktiv", p_expired:"Bruk Administrer-lenken fra din siste Málaga Live-e-post, eller be om en ny fra annonsesiden." },
  da: { t_manage:"Administrer din annonce", t_inbox:"Tjek din indbakke", t_unavail:"Ikke tilgængelig", t_expired:"Linket er udløbet",
        h_manage:"Administrer din Málaga Live-annonce",
        p1:"Åbn linket <b>Administrer din annonce</b> i en hvilken som helst Málaga Live-e-mail for at gå direkte til din betalingsportal — opdater kortet, skift plan eller annullér når som helst.",
        p2:"Mistet e-mailen? Indtast din adresse, så sender vi et nyt sikkert link.",
        ph:"dig@virksomhed.com", btn:"Send mig mit link",
        h_inbox:"Tjek din indbakke",
        p_inbox:"Hvis den adresse har en aktiv Málaga Live-annonce, har vi netop sendt dig et sikkert link til at administrere den. Det kan tage et minut.",
        back:"← Tilbage til Málaga Live",
        h_unavail:"Midlertidigt utilgængelig", p_unavail:"Prøv venligst igen om lidt.",
        h_expired:"Dette link er ikke aktivt", p_expired:"Brug Administrer-linket fra din seneste Málaga Live-e-mail, eller anmod om et nyt fra annoncesiden." },
  fi: { t_manage:"Hallinnoi mainostasi", t_inbox:"Tarkista sähköpostisi", t_unavail:"Ei käytettävissä", t_expired:"Linkki vanhentunut",
        h_manage:"Hallinnoi Málaga Live -mainostasi",
        p1:"Avaa <b>Hallinnoi mainostasi</b> -linkki mistä tahansa Málaga Live -sähköpostista päästäksesi suoraan laskutusportaaliisi — päivitä kortti, vaihda tasoa tai peru milloin tahansa.",
        p2:"Hukkasitko sähköpostin? Anna osoitteesi, niin lähetämme uuden turvallisen linkin.",
        ph:"sina@yritys.com", btn:"Lähetä linkkini",
        h_inbox:"Tarkista sähköpostisi",
        p_inbox:"Jos kyseisellä osoitteella on aktiivinen Málaga Live -mainos, lähetimme juuri sinulle turvallisen linkin sen hallintaan. Saapuminen voi kestää hetken.",
        back:"← Takaisin Málaga Liveen",
        h_unavail:"Tilapäisesti ei käytettävissä", p_unavail:"Yritä hetken kuluttua uudelleen.",
        h_expired:"Tämä linkki ei ole aktiivinen", p_expired:"Käytä Hallinnoi-linkkiä viimeisimmästä Málaga Live -sähköpostistasi tai pyydä uusi mainossivulta." }
};

function pickLang(event) {
  const q = ((event.queryStringParameters && event.queryStringParameters.lang) || "").toLowerCase();
  if (L[q]) return q;
  const h = event.headers || {};
  const al = ((h["accept-language"] || h["Accept-Language"] || "").slice(0, 2)).toLowerCase();
  return L[al] ? al : "en";
}

function page(lang, title, bodyHtml) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: "<!doctype html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\">" +
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
  const lang  = pickLang(event);
  const tr    = L[lang];
  if (!skey || !token) return page(lang, tr.t_unavail, "<h1>" + tr.h_unavail + "</h1><p>" + tr.p_unavail + "</p>");

  // ---- POST: request the link by email ----
  if (event.httpMethod === "POST") {
    let email = "";
    try { email = (JSON.parse(event.body || "{}").email || "").trim(); }
    catch { email = ((event.body || "").match(/email=([^&]*)/) || [])[1] || ""; email = decodeURIComponent(email).trim(); }
    const same = "<h1>" + tr.h_inbox + "</h1><p>" + tr.p_inbox + "</p>" +
      "<p><a href=\"" + SITE + "/advertise.html?lang=" + lang + "\">" + tr.back + "</a></p>";
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
    return page(lang, tr.t_inbox, same);
  }

  const t = (event.queryStringParameters && event.queryStringParameters.t || "").trim();

  // ---- GET without token: ask for the email ----
  if (!t) {
    return page(lang, tr.t_manage,
      "<h1>" + tr.h_manage + "</h1>" +
      "<p>" + tr.p1 + "</p>" +
      "<p>" + tr.p2 + "</p>" +
      "<form method=\"POST\"><input type=\"email\" name=\"email\" placeholder=\"" + tr.ph + "\" required>" +
      "<button type=\"submit\">" + tr.btn + "</button></form>");
  }

  // ---- GET with token: redirect into the Stripe billing portal ----
  const row = await rowByFormula(token, "{Portal token}='" + t.replace(/'/g, "\\'") + "'");
  const cust = row && row.fields ? row.fields["Stripe customer ID"] : "";
  if (!cust) return page(lang, tr.t_expired, "<h1>" + tr.h_expired + "</h1><p>" + tr.p_expired + " <a href=\"" + SITE + "/advertise.html?lang=" + lang + "\">malagalivepulse.com</a></p>");

  try {
    const body = new URLSearchParams();
    body.append("customer", cust);
    body.append("return_url", SITE + "/advertise.html?lang=" + lang);
    const sr = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + skey, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const j = await sr.json();
    if (!sr.ok || !j.url) { console.error("portal session error", sr.status, j); return page(lang, tr.t_unavail, "<h1>" + tr.h_unavail + "</h1><p>" + tr.p_unavail + "</p>"); }
    return { statusCode: 302, headers: { Location: j.url, "Cache-Control": "no-store" }, body: "" };
  } catch (e) {
    console.error("ad-portal error", e);
    return page(lang, tr.t_unavail, "<h1>" + tr.h_unavail + "</h1><p>" + tr.p_unavail + "</p>");
  }
};
