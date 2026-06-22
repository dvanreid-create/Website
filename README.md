# Málaga Live — website

Static events-agenda site for **malagalivepulse.com** (hosted on Netlify).

- `index.html` — the public events agenda (served at the site root).
- `malaga-live-events.html` — same page, alternate filename.
- Brand: play badge + Anton wordmark, "Pulse / Pulso" tagline, colours
  `#0B5E8A` / `#E8662A` / `#143A4E` / `#EF9F27`. **8 languages** (es · en · de · fr · sv · no · da · fi) + filters built in.

## How it updates

The site is regenerated each week from the Málaga Live events calendar by
`build_site.py` (kept in the project folder, not deployed) in **8 languages**. The
**build + push is automated weekly from the box** (Hetzner VPS): `generate.sh` runs
`site_deploy.sh`, which builds the site, commits, and pushes to GitHub over a **deploy key**
— Netlify auto-deploys on push. Manually committing the updated `index.html` and pushing is
only a **fallback**.
