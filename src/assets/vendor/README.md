# Vendor

Served from the site itself (same origin as the page) instead of a CDN: on a phone on 4G a
second origin costs a DNS lookup + TLS handshake, often more than the file itself.

| File | Version | Source | License |
|---|---|---|---|
| gsap.min.js, ScrollTrigger.min.js, SplitText.min.js | 3.15.0 | npm `gsap` | GSAP Standard "no charge" license, header kept in each file (https://gsap.com/standard-license) |
| lenis.min.js, lenis.css | 1.3.26 | npm `lenis` | MIT, `LICENSE-lenis.txt` |

To update: download the new versions from `https://cdn.jsdelivr.net/npm/<pkg>@<version>/dist/…`
and keep the license headers.
