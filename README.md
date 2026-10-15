# image-pulse

[![npm version](https://img.shields.io/npm/v/image-pulse.svg)](https://www.npmjs.com/package/image-pulse) [![CI](https://github.com/MrLouisWright/image-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/image-pulse/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/image-pulse.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Find oversized, unoptimised and wrongly formatted images in your built site, before they slow down your Largest Contentful Paint.

Images are usually the heaviest part of a page and the most common LCP element. `image-pulse` scans the HTML and image files in your static build output (Astro, Hugo, Eleventy, Jekyll, Next.js export, Docusaurus, plain HTML), reads each image's real dimensions from its file header, and compares them with how the page uses it: a 2400px photo shown at 600px, a 400 kB JPEG with no AVIF or WebP alternative, a hero without width and height, a 2 MB animated GIF.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Bytes:** per-image budget (`--max-kb`, default 250 kB; above 1 MB is high severity).
- **Dimensions:** intrinsic width vs displayed width (from `width` or `sizes`), allowing 2.5× for high-DPI screens; aspect-ratio mismatches between attributes and the file.
- **Formats:** JPEG/PNG without an AVIF or WebP alternative (`<picture><source type>` or srcset), opaque PNG photos, animated GIFs, baseline JPEGs, SVGs carrying editor metadata.
- **Responsive markup:** large images without `srcset`, `w`-descriptor srcsets without `sizes`, `<img>` without `width`/`height` (layout shift).
- **Local and fast:** dimension parsing for PNG, JPEG, GIF, WebP (VP8/VP8L/VP8X), AVIF/HEIF and SVG with no native modules; external images get markup checks only.

### Scope

image-pulse does not re-encode images or fetch remote ones, and it does not check broken image links (use static-link-sentinel) or loading="lazy" placement (see lazy-pulse).

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `image-heavy` | medium | Image file is larger than the byte budget (high above 1 MB) |
| `image-oversized-dimensions` | medium | Image is far wider than the size it is displayed at |
| `image-legacy-format` | medium | JPEG/PNG served without an AVIF or WebP alternative |
| `image-missing-dimensions` | medium | <img> has no width and height (layout shift) |
| `image-animated-gif` | medium | Large animated GIF (use a muted looping video or animated WebP/AVIF) |
| `image-no-srcset` | low | Large raster image has no srcset for smaller screens |
| `image-aspect-mismatch` | low | Declared width/height ratio does not match the image (distortion or layout shift) |
| `image-png-photo` | low | Large opaque PNG (probably a photo; JPEG/WebP/AVIF would be far smaller) |
| `image-svg-bloat` | low | SVG contains editor metadata or comments (run an SVG optimiser) |
| `image-sizes-missing` | low | srcset with width descriptors but no sizes attribute (browser assumes 100vw) |
| `image-baseline-jpeg` | info | Large baseline (non-progressive) JPEG |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx image-pulse dist
npx image-pulse public --max-kb 150 --fail-on medium
npx image-pulse _site --format sarif > images.sarif
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
image-pulse — https://example.com
1 page(s), 5 image(s), 475 KB

MEDIUM   img/anim.gif img/anim.gif is an animated GIF of 98 KB [image-animated-gif]
MEDIUM   img/photo.jpg img/photo.jpg is 140 KB (400×300 jpeg), over the 100 KB budget [image-heavy]
MEDIUM   img/shot.png img/shot.png is 169 KB (240×240 png), over the 100 KB budget [image-heavy]
MEDIUM   index.html:3 <img src="/img/photo.jpg"> has no width/height [image-missing-dimensions]
MEDIUM   index.html:3 img/photo.jpg (JPEG, 140 KB) has no AVIF/WebP alternative [image-legacy-format]
MEDIUM   index.html:4 /img/banner.jpg is 2400px wide but displayed at 600px (4.0×, 49 KB) [image-oversized-dimensions]
```

## Options

```text
image-pulse 1.0.0 — find oversized and unoptimised images in your built site

Usage: image-pulse [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Images
      --max-kb <n>             Byte budget per image file in KB (default 250)
      --max-scale <n>          Allowed intrinsic/display width ratio (default 2.5)

Common
  -c, --config <file>     JSON config (default: .image-pulse.json or "imagePulse" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.image-pulse.json` (or a `"imagePulse"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "image-heavy": "low"
  },
  "allowlist": [
    {
      "rule": "image-heavy",
      "subject": "img/annual-report-cover.jpg",
      "reason": "Print-quality download, linked not embedded",
      "expires": "2027-03-31"
    }
  ],
  "maxBytes": 204800,
  "maxScale": 2,
  "srcsetMinWidth": 1000,
  "exclude": [
    "/admin/**"
  ]
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.image-pulse.json` can live at your repository root. Other keys: `maxBytes`, `maxScale`, `srcsetMinWidth` (default 800), `legacyMinBytes` (default 30 kB), `gifBytes` (default 100 kB), plus `baseUrl`, `include`, `exclude` and `cleanUrls`.

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  image-pulse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/image-pulse@v1
        with:
          path: dist
          fail-on: high
          sarif: image-pulse.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: image-pulse.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, imageInfo } from "image-pulse";
imageInfo(readFileSync("hero.jpg")); // { format: "jpeg", width: 1600, height: 900, progressive: true }
const report = check("dist", { maxBytes: 200 * 1024 });
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Credit (optional)

Free to use under MIT, no attribution required. If image-pulse helps you, a link back is appreciated:

```html
<a href="https://louiswright.co.uk">Built with image-pulse by Louis Wright</a>
```

```markdown
[![Built with image-pulse by Louis Wright](https://img.shields.io/badge/built%20with-image--pulse-blue)](https://louiswright.co.uk)
```

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
