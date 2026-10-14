# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Reads PNG, JPEG, GIF, WebP, AVIF/HEIF and SVG headers locally (no network, no native modules).
- Checks heavy files, intrinsic vs displayed width (width or sizes), missing AVIF/WebP alternatives, missing width/height, srcset and sizes, aspect-ratio mismatches, animated GIFs, opaque PNG photos, baseline JPEGs and SVG editor bloat.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
