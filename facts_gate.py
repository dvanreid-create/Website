"""facts_gate.py - default-HIDE gate for the "Did you know?" (Sabias que) artist card.
Sofia 2026-10-20: "the section should appear ONLY IF 100% certain the facts are correct and about the artist".

A fact is shown only if it is HUMAN-VERIFIED (Website/artist_facts_verified.json) or passes EVERY automatic
check below. Anything else is hidden (and listed by Tools/agent/audit_artist_facts.py for review).
artist_facts_deny.json always wins over both. Pure/offline: no network, safe at build time.
Wikidata/Wikipedia-type confirmation is done on the box by the audit script, which writes verified.json.
"""
import re, unicodedata, urllib.parse

def _fold(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def slugify_title(s):
    return _fold(s).replace(" ", "-")

_PRON = re.compile(r"^(it|he|she|they|his|her|their|its|this|these|those|that|el|ella|ellos|su|sus|esto|fue|was|were|who|which)\b", re.I)
_NEG = re.compile(r"\b(is|was|are)\s+(a|an|the)\b[^.]{0,70}\b(album|compilation album|song|single|film|movie|video game|novel|municipality|state|dam|genus|disorder|musical|painter|footballer|politician)\b"
                  r"|\b(es|fue)\s+(un|una|el|la)\b[^.]{0,70}\b(album|álbum|canción|sencillo|película|videojuego|novela|municipio|estado|presa|género|trastorno|pintor|futbolista)\b", re.I)
_CUE = re.compile(r"\b(band|singer|rapper|musician|group|duo|trio|quartet|orchestra|vocalist|guitarist|pianist|violinist|songwriter|composer|dj|producer|"
                  r"cantante|banda|grupo|cantautor|cantaor|guitarrista|pianista|compositor|compositora|dúo|orquesta|bailaor|raper|"
                  r"sångare|band|sanger|sangerinde|laulaja|yhtye|musiker|chanteur|groupe|sänger|gruppe)\b", re.I)

def wiki_title(url):
    m = re.match(r"https?://[a-z]{2,3}\.(?:m\.)?wikipedia\.org/wiki/(.+)$", url or "", re.I)
    if not m:
        return None, None
    t = urllib.parse.unquote(m.group(1)).split("#")[0].replace("_", " ")
    pm = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", t)
    return (pm.group(1), pm.group(2)) if pm else (t, "")

def title_matches_slug(title, slug):
    ts = slugify_title(title)
    return bool(ts) and (slug == ts or slug.startswith(ts + "-"))

def check(slug, base_key, fact, src, verified=None):
    """-> (ok, reason). slug = page slug, base_key = the key the facts are stored under."""
    v = (verified or {}).get(base_key) or (verified or {}).get(slug)
    if v is not None:
        pin = v.get("src") if isinstance(v, dict) else None
        if pin and pin != src:
            return False, "verified source differs from stored source (re-fetched?)"
        return True, "human-verified"
    f = str(fact or "").strip()
    title, qual = wiki_title(src)
    if title is None:
        return False, "non-Wikipedia source: needs human verification"
    if not (title_matches_slug(title, base_key) or title_matches_slug(title, slug)):
        return False, "Wikipedia page title %r does not match the act" % title
    if qual and not re.search(r"band|singer|musician|group|duo|rapper|guitarist|pianist|violinist|composer|dj|orchestra|cantante|banda|grupo|músico|musico|bailaor|producer|vocalist", qual, re.I):
        return False, "Wikipedia page type %r is not a music act" % qual
    if len(f) < 50 or not re.match(r"[A-ZÁÉÍÓÚÑÜ\"“'«¿¡0-9]", f) or not re.search(r"[.!?»”\"]$", f):
        return False, "fact is not a complete sentence"
    if _PRON.match(f):
        return False, "fact opens with a pronoun (no subject)"
    if _NEG.search(f):
        return False, "fact describes an album/song/film/place, not an artist"
    tt = [w for w in _fold(title).split() if len(w) >= 4]
    if tt and not any(w in _fold(f) for w in tt):
        return False, "fact never names the artist"
    if len(_fold(title).split()) <= 1 and not _CUE.search(f):
        return False, "single-word title with no music cue (could be any homonym)"
    return True, "auto"
