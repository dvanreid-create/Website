# Málaga Live — website

Static events-agenda site for **malagalivepulse.com** (hosted on Netlify).

- `index.html` — the public events agenda (served at the site root).
- `malaga-live-events.html` — same page, alternate filename.
- Brand: play badge + Anton wordmark, "Pulse / Pulso" tagline, colours
  `#0B5E8A` / `#E8662A` / `#143A4E` / `#EF9F27`. EN/ES toggle + filters built in.

## How it updates

The page is regenerated each week from the Málaga Live events calendar by
`build_site.py` (kept in the project folder, not deployed). To publish a refresh:
commit the updated `index.html` and push — Netlify auto-deploys on push.
