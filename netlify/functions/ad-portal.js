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

// ---- self-edit (tile) constants + localisation ----
const LOGO_FIELD = "fldTRln8zSON7nc5o";  // "Logo file" attachment field
const OK_TYPES = { "image/png":1, "image/jpeg":1, "image/jpg":1, "image/svg+xml":1 };
const jsonResp = (code, obj) => ({ statusCode: code, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }, body: JSON.stringify(obj) });
const LE = {
  en:{ dh:"Your Málaga Live tile", di:"Update your image, subtext and link anytime — changes go live within a minute.", eh:"Edit your tile", e_img:"Tile image — square PNG or JPG (max 5 MB)", e_sub:"Subtext (max 60)", e_link:"Link — where your tile clicks to", e_save:"Save changes", e_saved:"Saved — your tile updates on the site within a minute.", e_bill:"Manage billing or cancel →", e_keep:"Leave empty to keep your current image.", e_badlink:"Enter a valid link starting with http:// or https://.", e_badimg:"Image must be PNG, JPG or SVG, under 5 MB.", e_proc:"Saving…", e_note:"Your tile is yours to manage — a wrong image or link is yours to fix here.", e_err:"Something went wrong — please try again." },
  es:{ dh:"Tu tile de Málaga Live", di:"Actualiza tu imagen, subtítulo y enlace cuando quieras — los cambios salen en directo en un minuto.", eh:"Edita tu tile", e_img:"Imagen del tile — PNG o JPG cuadrado (máx. 5 MB)", e_sub:"Subtítulo (máx. 60)", e_link:"Enlace — adónde lleva tu tile", e_save:"Guardar cambios", e_saved:"Guardado — tu tile se actualiza en el sitio en un minuto.", e_bill:"Gestionar facturación o cancelar →", e_keep:"Déjalo vacío para mantener tu imagen actual.", e_badlink:"Introduce un enlace válido que empiece por http:// o https://.", e_badimg:"La imagen debe ser PNG, JPG o SVG, menos de 5 MB.", e_proc:"Guardando…", e_note:"Tu tile es tuyo para gestionar — una imagen o enlace erróneo es tuyo para corregir aquí.", e_err:"Algo salió mal — inténtalo de nuevo." },
  de:{ dh:"Dein Málaga-Live-Tile", di:"Aktualisiere Bild, Untertext und Link jederzeit — Änderungen sind in einer Minute live.", eh:"Tile bearbeiten", e_img:"Tile-Bild — quadratisches PNG oder JPG (max. 5 MB)", e_sub:"Untertext (max. 60)", e_link:"Link — wohin dein Tile führt", e_save:"Änderungen speichern", e_saved:"Gespeichert — dein Tile wird in einer Minute aktualisiert.", e_bill:"Abrechnung verwalten oder kündigen →", e_keep:"Leer lassen, um dein aktuelles Bild zu behalten.", e_badlink:"Gib einen gültigen Link ein, der mit http:// oder https:// beginnt.", e_badimg:"Bild muss PNG, JPG oder SVG sein, unter 5 MB.", e_proc:"Speichern…", e_note:"Dein Tile verwaltest du selbst — ein falsches Bild oder ein falscher Link ist hier von dir zu korrigieren.", e_err:"Etwas ist schiefgelaufen — bitte versuche es erneut." },
  fr:{ dh:"Ton tile Málaga Live", di:"Mets à jour ton image, ton sous-texte et ton lien à tout moment — les changements sont en ligne en une minute.", eh:"Modifier ton tile", e_img:"Image du tile — PNG ou JPG carré (max 5 Mo)", e_sub:"Sous-texte (max 60)", e_link:"Lien — vers où mène ton tile", e_save:"Enregistrer", e_saved:"Enregistré — ton tile est mis à jour en une minute.", e_bill:"Gérer la facturation ou annuler →", e_keep:"Laisse vide pour garder ton image actuelle.", e_badlink:"Saisis un lien valide commençant par http:// ou https://.", e_badimg:"L'image doit être PNG, JPG ou SVG, moins de 5 Mo.", e_proc:"Enregistrement…", e_note:"Ton tile, c'est toi qui le gères — une image ou un lien erroné est à corriger ici.", e_err:"Une erreur s'est produite — réessaie." },
  sv:{ dh:"Din Málaga Live-tile", di:"Uppdatera bild, undertext och länk när du vill — ändringar går live inom en minut.", eh:"Redigera din tile", e_img:"Tile-bild — kvadratisk PNG eller JPG (max 5 MB)", e_sub:"Undertext (max 60)", e_link:"Länk — dit din tile leder", e_save:"Spara ändringar", e_saved:"Sparat — din tile uppdateras på sajten inom en minut.", e_bill:"Hantera betalning eller avsluta →", e_keep:"Lämna tomt för att behålla din nuvarande bild.", e_badlink:"Ange en giltig länk som börjar med http:// eller https://.", e_badimg:"Bilden måste vara PNG, JPG eller SVG, under 5 MB.", e_proc:"Sparar…", e_note:"Din tile sköter du själv — en felaktig bild eller länk är din att rätta här.", e_err:"Något gick fel — försök igen." },
  no:{ dh:"Din Málaga Live-tile", di:"Oppdater bilde, undertekst og lenke når som helst — endringer går live innen ett minutt.", eh:"Rediger tilen din", e_img:"Tile-bilde — kvadratisk PNG eller JPG (maks 5 MB)", e_sub:"Undertekst (maks 60)", e_link:"Lenke — hvor tilen fører", e_save:"Lagre endringer", e_saved:"Lagret — tilen din oppdateres på nettstedet innen ett minutt.", e_bill:"Administrer betaling eller avslutt →", e_keep:"La stå tomt for å beholde nåværende bilde.", e_badlink:"Skriv inn en gyldig lenke som starter med http:// eller https://.", e_badimg:"Bildet må være PNG, JPG eller SVG, under 5 MB.", e_proc:"Lagrer…", e_note:"Tilen din styrer du selv — feil bilde eller lenke er ditt å rette her.", e_err:"Noe gikk galt — prøv igjen." },
  da:{ dh:"Din Málaga Live-tile", di:"Opdater billede, undertekst og link når som helst — ændringer går live inden for et minut.", eh:"Rediger din tile", e_img:"Tile-billede — kvadratisk PNG eller JPG (maks. 5 MB)", e_sub:"Undertekst (maks. 60)", e_link:"Link — hvor din tile fører hen", e_save:"Gem ændringer", e_saved:"Gemt — din tile opdateres på sitet inden for et minut.", e_bill:"Administrer betaling eller annullér →", e_keep:"Lad stå tomt for at beholde dit nuværende billede.", e_badlink:"Indtast et gyldigt link, der starter med http:// eller https://.", e_badimg:"Billedet skal være PNG, JPG eller SVG, under 5 MB.", e_proc:"Gemmer…", e_note:"Din tile styrer du selv — et forkert billede eller link er dit at rette her.", e_err:"Noget gik galt — prøv igen." },
  fi:{ dh:"Málaga Live -tilesi", di:"Päivitä kuva, alateksti ja linkki milloin tahansa — muutokset näkyvät minuutissa.", eh:"Muokkaa tileäsi", e_img:"Tile-kuva — neliön muotoinen PNG tai JPG (enint. 5 MB)", e_sub:"Alateksti (enint. 60)", e_link:"Linkki — minne tile vie", e_save:"Tallenna muutokset", e_saved:"Tallennettu — tilesi päivittyy sivustolle minuutissa.", e_bill:"Hallinnoi laskutusta tai peru →", e_keep:"Jätä tyhjäksi säilyttääksesi nykyisen kuvan.", e_badlink:"Anna kelvollinen linkki, joka alkaa http:// tai https://.", e_badimg:"Kuvan on oltava PNG, JPG tai SVG, alle 5 MB.", e_proc:"Tallennetaan…", e_note:"Tilesi on sinun hallinnoitavanasi — väärä kuva tai linkki on sinun korjattavissasi täällä.", e_err:"Jokin meni pieleen — yritä uudelleen." }
};

// Cloudflare Turnstile bot protection on the email-request form (same widget/key as the buy form).
const TS_SITEKEY = "0x4AAAAAADp1Y1TESrBWaogl";
const CAP = { en:"Please complete the verification.", es:"Completa la verificación.", de:"Bitte schließe die Verifizierung ab.", fr:"Merci de compléter la vérification.", sv:"Slutför verifieringen.", no:"Fullfør verifiseringen.", da:"Fuldfør verifikationen.", fi:"Suorita vahvistus loppuun." };
async function verifyTurnstile(tokenVal) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;          // fail-open if not configured (matches the buy form)
  if (!tokenVal) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "secret=" + encodeURIComponent(secret) + "&response=" + encodeURIComponent(tokenVal)
    });
    const j = await r.json();
    return !!(j && j.success);
  } catch { return false; }
}

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

function emailForm(lang, err) {
  const tr = L[lang];
  return page(lang, tr.t_manage,
    "<h1>" + tr.h_manage + "</h1>" +
    "<p>" + tr.p1 + "</p>" +
    "<p>" + tr.p2 + "</p>" +
    (err ? "<p style=\"color:#a3271f;font-size:13px;margin-top:4px\">" + err + "</p>" : "") +
    "<form method=\"POST\"><input type=\"email\" name=\"email\" placeholder=\"" + tr.ph + "\" required>" +
    "<div class=\"cf-turnstile\" data-sitekey=\"" + TS_SITEKEY + "\" style=\"margin:12px 0 0\"></div>" +
    "<button type=\"submit\">" + tr.btn + "</button></form>" +
    "<script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\" async defer></script>");
}

// ---- self-serve dashboard: edit the tile (image + subtext + link) or go to billing ----
function dashboard(lang, t, row) {
  const tr = L[lang], e = LE[lang] || LE.en;
  const f = row.fields || {};
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const att = Array.isArray(f["Logo file"]) && f["Logo file"][0] ? f["Logo file"][0].url : "";
  const img = att || f["Logo URL"] || f["Photo URL"] || "";
  const sub = f["Subtext"] || "";
  const link = f["Link URL"] || "";
  const name = f["Sponsor name"] || "";
  const preview = img
    ? ("<div style=\"width:200px;height:200px;margin:6px auto 0;border-radius:12px;overflow:hidden;position:relative;background:#0B5E8A url('" + esc(img) + "') center/cover;box-shadow:0 6px 20px rgba(0,0,0,.25)\">" +
       "<div id=\"pvsub\" style=\"position:absolute;left:0;right:0;bottom:0;padding:10px 12px;background:linear-gradient(transparent,rgba(0,0,0,.78));color:#fff;font-size:13px;font-weight:600\">" + esc(sub) + "</div></div>")
    : "";
  const body =
    "<h1>" + e.dh + (name ? (" · " + esc(name)) : "") + "</h1>" +
    "<p>" + e.di + "</p>" + preview +
    "<form id=\"edt\" style=\"margin-top:14px\">" +
      "<label style=\"display:block;font-size:12px;font-weight:600;margin:10px 0 4px\">" + e.e_img + "</label>" +
      "<input type=\"file\" id=\"ei\" accept=\"image/png,image/jpeg,image/svg+xml\">" +
      "<div style=\"font-size:11px;color:#9aa7b0;margin-top:3px\">" + e.e_keep + "</div>" +
      "<label style=\"display:block;font-size:12px;font-weight:600;margin:10px 0 4px\">" + e.e_sub + " <span id=\"ec\" style=\"float:right;color:#9aa7b0\">" + sub.length + "/60</span></label>" +
      "<input type=\"text\" id=\"es\" maxlength=\"60\" value=\"" + esc(sub) + "\">" +
      "<label style=\"display:block;font-size:12px;font-weight:600;margin:10px 0 4px\">" + e.e_link + "</label>" +
      "<input type=\"url\" id=\"el\" value=\"" + esc(link) + "\" placeholder=\"https://\">" +
      "<div class=\"cf-turnstile\" data-sitekey=\"" + TS_SITEKEY + "\" style=\"margin:12px 0 0\"></div>" +
      "<button type=\"submit\">" + e.e_save + "</button>" +
      "<div id=\"em\" style=\"display:none;margin-top:10px;font-size:13px;border-radius:9px;padding:10px\"></div>" +
      "<p style=\"font-size:11px;color:#9aa7b0;margin-top:8px\">" + e.e_note + "</p>" +
    "</form>" +
    "<p style=\"margin-top:8px;text-align:center\"><a href=\"" + SITE + "/ad-portal?t=" + encodeURIComponent(t) + "&billing=1&lang=" + lang + "\">" + e.e_bill + "</a></p>" +
    "<p style=\"text-align:center\"><a href=\"" + SITE + "/advertise.html?lang=" + lang + "\">" + tr.back + "</a></p>" +
    "<script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\" async defer></script>" +
    "<script>(function(){" +
      "var f=document.getElementById('edt'),s=document.getElementById('es'),c=document.getElementById('ec'),m=document.getElementById('em');" +
      "function msg(ok,txt){m.style.display='block';m.style.background=ok?'#eef5fa':'#fdecec';m.style.color=ok?'#0B5E8A':'#a3271f';m.textContent=txt;}" +
      "s.addEventListener('input',function(){c.textContent=s.value.length+'/60';});" +
      "f.addEventListener('submit',function(ev){ev.preventDefault();" +
        "var link=document.getElementById('el').value.trim(),sub=s.value.trim(),file=document.getElementById('ei').files[0];" +
        "var tk=(document.querySelector('[name=cf-turnstile-response]')||{}).value||'';" +
        "if(link&&!/^https?:\\/\\/\\S+\\.\\S+/i.test(link)){msg(false," + JSON.stringify(e.e_badlink) + ");return;}" +
        "if(file){var ok={'image/png':1,'image/jpeg':1,'image/svg+xml':1};if(!ok[file.type]||file.size>5*1024*1024){msg(false," + JSON.stringify(e.e_badimg) + ");return;}}" +
        "var btn=f.querySelector('button');btn.disabled=true;btn.textContent=" + JSON.stringify(e.e_proc) + ";" +
        "function send(b64,ct,nm){fetch('/ad-portal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'edit',t:" + JSON.stringify(t) + ",subtext:sub,link:link,logoBase64:b64,logoType:ct,logoName:nm,turnstile:tk})})" +
          ".then(function(r){return r.json();}).then(function(d){btn.disabled=false;btn.textContent=" + JSON.stringify(e.e_save) + ";" +
          "if(d&&d.ok){msg(true," + JSON.stringify(e.e_saved) + ");var pv=document.getElementById('pvsub');if(pv)pv.textContent=sub;}" +
          "else if(d&&d.error==='badlink'){msg(false," + JSON.stringify(e.e_badlink) + ");}" +
          "else if(d&&d.error==='captcha'){msg(false," + JSON.stringify(CAP[lang]) + ");}" +
          "else{msg(false," + JSON.stringify(e.e_err) + ");}})" +
          ".catch(function(){btn.disabled=false;btn.textContent=" + JSON.stringify(e.e_save) + ";msg(false," + JSON.stringify(e.e_err) + ");});}" +
        "if(file){var rd=new FileReader();rd.onload=function(){send((rd.result||'').toString().split(',')[1]||'',file.type,file.name);};rd.onerror=function(){msg(false," + JSON.stringify(e.e_badimg) + ");};rd.readAsDataURL(file);}else{send('','','');}" +
      "});" +
    "})();</script>";
  return page(lang, tr.t_manage, body);
}

async function handleEdit(d, token, lang) {
  if (!(await verifyTurnstile(d.turnstile))) return jsonResp(400, { error: "captcha" });
  const tok = (d.t || "").trim();
  if (!tok) return jsonResp(403, { error: "auth" });
  const row = await rowByFormula(token, "{Portal token}='" + tok.replace(/'/g, "\\'") + "'");
  if (!row || !row.fields) return jsonResp(403, { error: "auth" });
  const st = row.fields.Status;
  if (st !== "Sold" && st !== "Active") return jsonResp(403, { error: "inactive" });
  const subtext = String(d.subtext == null ? "" : d.subtext).trim().slice(0, 60);
  const link = String(d.link == null ? "" : d.link).trim();
  if (link && !/^https?:\/\/\S+\.\S+/i.test(link)) return jsonResp(400, { error: "badlink" });
  const prev = row.fields["Subtext"] || "";
  const fields = { "Subtext": subtext };
  if (link) fields["Link URL"] = link;
  const stamp = "Edited " + new Date().toISOString() + (prev ? (" · prev subtext: \"" + String(prev).slice(0, 80) + "\"") : "");
  fields["Notes"] = (stamp + (row.fields["Notes"] ? (" | " + String(row.fields["Notes"]).slice(0, 400)) : "")).slice(0, 99000);
  if (d.logoBase64 && d.logoType && OK_TYPES[String(d.logoType).toLowerCase()]) {
    try {
      await fetch("https://content.airtable.com/v0/" + BASE + "/" + row.id + "/" + LOGO_FIELD + "/uploadAttachment", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: String(d.logoType).toLowerCase(), file: d.logoBase64, filename: String(d.logoName || "tile.png").slice(0, 120) })
      });
    } catch (err) { console.warn("tile image upload failed (non-fatal)", err && err.message); }
  }
  const pr = await AT(TABLE + "/" + row.id, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!pr.ok) { console.error("tile edit patch", pr.status, await pr.text()); return jsonResp(502, { error: "save" }); }
  return jsonResp(200, { ok: true });
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
    const raw = event.body || "";
    let _jb = null; try { _jb = JSON.parse(raw); } catch {}
    if (_jb && _jb.action === "edit") return await handleEdit(_jb, token, lang);
    const fld = (name) => { const m = raw.match(new RegExp("(?:^|&)" + name + "=([^&]*)")); return m ? decodeURIComponent(m[1].replace(/\+/g, "%20")) : ""; };
    let email = fld("email").trim();
    let tsTok = fld("cf-turnstile-response");
    if (!email && raw) { try { const jb = JSON.parse(raw); email = (jb.email || "").trim(); tsTok = tsTok || jb.turnstile || ""; } catch {} }
    if (!(await verifyTurnstile(tsTok))) return emailForm(lang, CAP[lang]);
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

  const qs = event.queryStringParameters || {};
  const t = (qs.t || "").trim();

  // ---- GET without token: ask for the email ----
  if (!t) {
    return emailForm(lang, "");
  }

  // ---- GET with token: look up the advertiser's row ----
  const row = await rowByFormula(token, "{Portal token}='" + t.replace(/'/g, "\\'") + "'");
  if (!row || !row.fields) return page(lang, tr.t_expired, "<h1>" + tr.h_expired + "</h1><p>" + tr.p_expired + " <a href=\"" + SITE + "/advertise.html?lang=" + lang + "\">malagalivepulse.com</a></p>");

  // Default = the self-serve dashboard (edit tile + billing). ?billing=1 = Stripe portal.
  if ((qs.billing || "") !== "1") {
    const st0 = row.fields.Status;
    if (st0 === "Sold" || st0 === "Active") return dashboard(lang, t, row);
    return page(lang, tr.t_expired, "<h1>" + tr.h_expired + "</h1><p>" + tr.p_expired + " <a href=\"" + SITE + "/advertise.html?lang=" + lang + "\">malagalivepulse.com</a></p>");
  }

  // ---- ?billing=1: redirect into the Stripe billing portal ----
  const cust = row.fields["Stripe customer ID"];
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
