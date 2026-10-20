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

_ES_RESIDUE = re.compile(r"\b(todos|todas|obtuvo|despuntó|según|además|también|aunque|porque|durante|fueron|desde|hasta)\b"
                         r"|\b[a-záéíóúñ]{3,}(?:ó|ción|ciones|ieron)\b", re.I)
def lang_ok(lang, fact):
    """Translated rows (de/fr/sv/no/da/fi) must not contain untranslated Spanish (e.g. 'Todos ovat imeneet...', 20 Oct 2026).
    'Any'/es rows are the Spanish source text and are not checked."""
    if lang in ("de", "fr", "sv", "no", "da", "fi", "en"):
        return not _ES_RESIDUE.search(str(fact or ""))
    return True


# ---------------------------------------------------------------------------------------------------------
# SELF-HEALING SUPPORT (DLR 2026-10-20: "the program shouldn't be hiding any [cards]; if a fact is wrong it must
# be REPLACED by the program sourcing a new one"). The render path no longer gates anything; instead
# Tools/agent/fetch_artist_facts.py uses the helpers below to (a) accept only article matches that really are the
# act, and (b) detect facts whose source article is plainly NOT a music act, supersede them and re-source.
# ---------------------------------------------------------------------------------------------------------
_MUSICISH = re.compile(
    r"\b(singer|band|musician|musicians|rapper|rap|group|duo|trio|quartet|quintet|sextet|guitarist|pianist|violinist|"
    r"cellist|songwriter|composer|dj|orchestra|symphony|symphonic|choir|chorus|ensemble|vocalist|drummer|bassist|opera|"
    r"flamenco|jazz|reggae|reggaeton|hip hop|hip-hop|rock|pop|punk|metal|soul|funk|indie|folk|blues|tango|techno|trap|"
    r"electronic|cantante|cantaor|cantaora|cantautor|cantautora|banda|grupo|músico|musico|rapero|rapera|dúo|cuarteto|"
    r"guitarrista|orquesta|compositor|compositora|coro|bailaor|bailaora|ópera|zarzuela|reguetón|sänger|sångare|"
    r"musique|chanteur|chanteuse|groupe|laulaja|yhtye|musiker)\b", re.I)
_WRONG_SUBJECT = re.compile(
    r"\b(is|was|are|es|fue)\s+(a|an|the|un|una|el|la)\s+(?:[\w'’-]+\s+){0,4}?"
    r"(album|álbum|compilation album|song|single|canción|film|movie|película|video game|videojuego|novel|novela|municipality|"
    r"municipio|state|estado|dam|presa|genus|género|species|disorder|trastorno|painter|pintor|footballer|futbolista|"
    r"village|town|city|animal|adverb|phrase|rocket launcher)\b", re.I)

def first_sentence(extract):
    ex = re.sub(r"\s+", " ", str(extract or "").strip())
    m = re.match(r"(.+?[.!?])(\s|$)", ex)
    return (m.group(1) if m else ex)[:300]

def is_music_article(d):
    """d = a Wikipedia REST /page/summary dict. True when the article is plausibly about a music act or music work
    performed live (artist, band, orchestra, opera...). Deliberately lenient: it must never reject a real artist."""
    if not d or d.get("type") not in (None, "standard"):
        return False
    desc = str(d.get("description") or "")
    first = first_sentence(d.get("extract"))
    if _MUSICISH.search(desc):
        return True
    if _WRONG_SUBJECT.search(first) and not _MUSICISH.search(first.split(" is ")[0] if " is " in first else ""):
        return False
    return bool(_MUSICISH.search(desc + " " + first))

def article_is_plainly_wrong(d):
    """Conservative: True only when the article is clearly NOT a music act (state, album, film, phrase, disorder...).
    Used to supersede an existing fact; a music article whose title merely differs from the act name is NOT flagged
    here (that needs a human: see artist_facts_deny.json 'bad_src')."""
    if not d:
        return False                       # unknown (network miss) -> never supersede on missing data
    desc = str(d.get("description") or "")
    first = first_sentence(d.get("extract"))
    if _MUSICISH.search(desc):
        return False
    if _WRONG_SUBJECT.search(first):
        return True
    return not _MUSICISH.search(desc + " " + first)

def title_equals_act(q, title):
    """Strict match used when SOURCING a new fact: article title (minus any '(...)' qualifier, minus a leading
    'The'/'El'/'La'/'Los'/'Las') must equal the act name, accents/punctuation/case ignored."""
    def n(s):
        s = re.sub(r"\s*\([^)]*\)\s*$", "", str(s or ""))
        s = _fold(s)
        return re.sub(r"^(the|el|la|los|las)\s+", "", s)
    a, b = n(q), n(title)
    return bool(a) and a == b

def page_key(url):
    """(title) of a Wikipedia URL, lower-case, for comparing editions of the same page by name only."""
    m = re.match(r"https?://[a-z]{2,3}\.(?:m\.)?wikipedia\.org/wiki/(.+)$", url or "", re.I)
    if not m:
        return ""
    t = urllib.parse.unquote(m.group(1)).split("#")[0].replace("_", " ")
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t)           # '(band)' / '(banda)' qualifiers differ between editions
    return t.strip().lower()


# ---------------------------------------------------------------------------------------------------------
# LANGUAGE DETECTION (DLR 2026-10-20: /es/artist/iberia-sumergida/ showed a FRENCH fact on the Spanish page).
# A fact row is only used on a page when its text really is in that page's language (Any rows count as en or es).
# Stop-word voting; returns "" when unsure (never blocks an unsure row).
# ---------------------------------------------------------------------------------------------------------
_SW = {
 "en": "the of and is was in to with as by for his her he she that on at from an it which also after has had were their".split(),
 "es": "el la los las de del y es fue en un una con por que su sus para como al se lo sus también desde sobre entre".split(),
 "fr": "le les des du est dont une sont dans fut et pour avec par sur qui au aux sa ses il elle ont été cette plus".split(),
 "de": "der die das und ist war ein eine mit von zu den dem im auf für sich nicht auch wurde sein ihr sie er als bei".split(),
 "sv": "och att det som en är på med för av den har inte till han hon de var från ett sin sitt efter också".split(),
 "no": "og at det som en er på med for av den har ikke til han hun de var fra et sin sitt etter også ble blitt".split(),
 "da": "og at det som en er på med for af den har ikke til han hun de var fra et sin sit efter også blev".split(),
 "fi": "ja on oli ei että se hän kun mutta joka sekä myös hänen kanssa jälkeen tai vuonna osa sen".split(),
}
def _build_unique():
    allw = {}
    for l, ws in _SW.items():
        for w in set(ws):
            allw.setdefault(w, set()).add(l)
    # words shared with another language (la/de/en/un/...) do not vote: only language-UNIQUE markers count
    u = {l: {w for w in set(ws) if allw[w] == {l}} for l, ws in _SW.items()}
    u["fr"] |= {"l", "d", "qu", "n", "c", "j", "s", "m"}               # elided French (l'album, d'autres, qu'il)
    return u
_SWU = _build_unique()
def detect_lang(t, minv=2):
    w = re.findall(r"[a-zà-ÿåäöæø]+", str(t or "").lower())
    if len(w) < 5:
        return ""
    sc = {l: sum(1 for x in w if x in s) for l, s in _SWU.items()}
    best = max(sc, key=sc.get)
    runner = sorted(sc.values())[-2]
    return best if sc[best] >= minv and sc[best] >= runner + 2 else ""

def row_lang_ok(page_lang, row_lang, fact):
    """True when this row may be shown on a page of language page_lang."""
    d = detect_lang(fact)
    if not d:
        return True
    rl = (row_lang or "Any")
    if rl in ("Any", "", "en"):
        return d in ("en", "es")                    # Any/en rows are English or Spanish source text, never fr/de/...
    return d == rl or (rl == "no" and d in ("no", "da", "sv"))   # tagged rows must match their tag (Nordic langs are close)


def page_ok(page_lang, row_lang, fact):
    """STRICT language rule for the DYK card (DLR 2026-10-20, '/es/ shows French', '/es/ shows English'): a fact may only be
    shown on a page of ITS language. Tagged rows (es/de/fr/...) must match the page AND read as that language; Any rows are
    English or Spanish source text: English ones serve the en page only, Spanish ones the es page only."""
    rl = (row_lang or "Any")
    if rl in ("Any", ""):
        d = detect_lang(fact)
        return (d in ("en", "")) if page_lang == "en" else ((d in ("es", "")) if page_lang == "es" else False)
    if rl != page_lang:
        return False
    # tagged translations: names in another language (El, del, Sun Yat-sen...) must not reject a good row, so only a
    # STRONG signal (>= 4 unique stop-words, clear margin) that the text is really another language counts.
    fam = detect_family(fact, 4)
    if fam and fam != _fam_of_lang(page_lang):
        return False                                   # e.g. Danish text on an es row
    d = detect_lang(fact, 4)
    return (not d) or d == page_lang or (page_lang in ("no", "da", "sv") and d in ("no", "da", "sv"))


_FAM0 = {"en": set(_SW["en"]), "es": set(_SW["es"]), "fr": set(_SW["fr"]) | {"l", "d", "qu", "n", "c", "j", "s", "m"}, "de": set(_SW["de"]),
         "nordic": set(_SW["sv"]) | set(_SW["no"]) | set(_SW["da"]) | set("deres hører fra ikke blev efter også udgivet sin sit från för av jag hade ble vil kan eller sang sange album gruppe band hans hendes sitt ett från över under mellan".split()) - {"album", "band"},
         "fi": set(_SW["fi"])}
# only words that belong to ONE family vote (la/de/en/un are shared by es+fr+nordic and would swamp the count)
_FAM = {f: {w for w in ws if sum(1 for g in _FAM0.values() if w in g) == 1} for f, ws in _FAM0.items()}
def detect_family(t, minv=4):
    """Coarser than detect_lang: en / es / fr / de / nordic (sv+no+da share most stop-words) / fi. '' when unsure.
    Catches e.g. a DANISH sentence stored on a Spanish row (Bendecida, 20 Oct) that per-language voting cannot split."""
    w = re.findall(r"[a-zà-ÿåäöæø]+", str(t or "").lower())
    if len(w) < 5:
        return ""
    sc = {f: sum(1 for x in w if x in s) for f, s in _FAM.items()}
    best = max(sc, key=sc.get); runner = sorted(sc.values())[-2]
    return best if sc[best] >= minv and sc[best] >= runner + 2 else ""
def _fam_of_lang(l):
    return "nordic" if l in ("sv", "no", "da") else l

