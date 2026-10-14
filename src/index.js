// image-pulse: find oversized, unoptimised or wrongly formatted images in a built static site.
// Zero dependencies. Louis Wright, MIT.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runBeacon, finder, ancestor } from './site.js';
import { buildReport, UsageError } from './core.js';
import { imageInfo } from './imagesize.js';

export * from './core.js';
export { loadSite, parseHtml, SITE_OPTIONS, SITE_HELP } from './site.js';
export { imageInfo };

export const RULES = {
  'image-heavy': { severity: 'medium', title: 'Image file is larger than the byte budget (high above 1 MB)' },
  'image-oversized-dimensions': { severity: 'medium', title: 'Image is far wider than the size it is displayed at' },
  'image-legacy-format': { severity: 'medium', title: 'JPEG/PNG served without an AVIF or WebP alternative' },
  'image-missing-dimensions': { severity: 'medium', title: '<img> has no width and height (layout shift)' },
  'image-animated-gif': { severity: 'medium', title: 'Large animated GIF (use a muted looping video or animated WebP/AVIF)' },
  'image-no-srcset': { severity: 'low', title: 'Large raster image has no srcset for smaller screens' },
  'image-aspect-mismatch': { severity: 'low', title: 'Declared width/height ratio does not match the image (distortion or layout shift)' },
  'image-png-photo': { severity: 'low', title: 'Large opaque PNG (probably a photo; JPEG/WebP/AVIF would be far smaller)' },
  'image-svg-bloat': { severity: 'low', title: 'SVG contains editor metadata or comments (run an SVG optimiser)' },
  'image-sizes-missing': { severity: 'low', title: 'srcset with width descriptors but no sizes attribute (browser assumes 100vw)' },
  'image-baseline-jpeg': { severity: 'info', title: 'Large baseline (non-progressive) JPEG' },
};
const RASTER = new Set(['jpeg', 'png', 'gif', 'webp', 'avif', 'heif']);
const MODERN = /image\/(avif|webp)|\.(avif|webp)(\?|$)/i;
const kb = (n) => `${Math.round(n / 1024)} KB`;
const num = (v) => { const m = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(String(v ?? '')); return m ? +m[1] : null; };
export function parseSrcset(s) { return String(s || '').split(/,\s+(?=[^\s,])|,(?=\S+\s+\d)/).map((c) => c.trim()).filter(Boolean).map((c) => { const [url, d = '1x'] = c.split(/\s+/); return { url, w: /w$/.test(d) ? parseFloat(d) : null, x: /x$/.test(d) ? parseFloat(d) : null }; }); }
/** Largest px width in a sizes attribute (vw against a 1440px viewport), or null. */
export function sizesMax(sizes, viewport = 1440) { if (!sizes) return null; let max = 0; for (const part of String(sizes).split(',')) { const v = part.trim().split(/\s+/).pop(); const px = /^(\d+(?:\.\d+)?)px$/.exec(v); const vw = /^(\d+(?:\.\d+)?)vw$/.exec(v); if (px) max = Math.max(max, +px[1]); else if (vw) max = Math.max(max, (+vw[1] / 100) * viewport); else return null; } return max || null; }
const styleDims = (st = '') => ({ w: num(/(?:^|;)\s*width\s*:\s*([\d.]+px)/i.exec(st)?.[1]), h: num(/(?:^|;)\s*height\s*:\s*([\d.]+px)/i.exec(st)?.[1]), aspect: /aspect-ratio/i.test(st) });

function analyze(site, opts, config) {
  const { findings, add } = finder(RULES);
  const maxBytes = opts.maxBytes ?? config.maxBytes ?? 250 * 1024; const maxScale = opts.maxScale ?? config.maxScale ?? 2.5; const srcsetMin = config.srcsetMinWidth ?? 800;
  const cache = new Map(); const reported = new Set(); let images = 0; let bytes = 0;
  const info = (rel) => { if (cache.has(rel)) return cache.get(rel); let v = null; try { const p = join(site.dir, rel); const st = statSync(p); if (st.isFile()) { const fd = readFileSync(p); v = { ...(imageInfo(fd, rel) || {}), bytes: st.size, svgText: /\.svg$/i.test(rel) ? fd.toString('utf8') : undefined }; } } catch { /* not local */ } cache.set(rel, v); return v; };
  const local = (pg, src) => { const u = site.resolve(pg, src); if (!u || !site.isInternal(u)) return null; let p = u.pathname; if (site.basePath && p.startsWith(site.basePath)) p = p.slice(site.basePath.length); try { p = decodeURIComponent(p); } catch { /* keep */ } return p.replace(/^\/+/, ''); };
  const once = (rule, rel, ...a) => { const k = `${rule}|${rel}`; if (reported.has(k)) return; reported.add(k); add(rule, rel, ...a); };
  const seenFiles = new Set();
  for (const pg of site.pages) {
    for (const el of pg.doc.all) {
      if (el.tag !== 'img') continue; const a = el.attrs; const src = a.src || a['data-src']; if (!src || /^data:/i.test(src)) continue;
      const loc = { file: pg.file, line: el.line }; const rel = local(pg, src); const im = rel ? info(rel) : null;
      const picture = ancestor(el, (n) => n.tag === 'picture'); const sources = picture ? picture.children.filter((c) => c.tag === 'source') : [];
      const srcset = parseSrcset(a.srcset || a['data-srcset']); const st = styleDims(a.style);
      const W = num(a.width) ?? st.w; const H = num(a.height) ?? st.h;
      if ((W == null || H == null) && !(st.aspect && (W != null || H != null)) && !(im && im.format === 'svg' && W != null)) add('image-missing-dimensions', src, `<img src="${src}"> has no ${W == null && H == null ? 'width/height' : W == null ? 'width' : 'height'}`, `Add width="${im?.width ?? '…'}" height="${im?.height ?? '…'}" (intrinsic size) so the browser reserves space; CSS can still make it responsive.`, loc);
      if (srcset.some((c) => c.w) && !a.sizes && !sources.some((s) => s.attrs.sizes)) add('image-sizes-missing', src, `<img src="${src}"> has a w-descriptor srcset but no sizes`, 'Add sizes (e.g. sizes="(max-width: 768px) 100vw, 50vw") or the browser downloads the 100vw candidate.', loc);
      if (!im) continue; images += !seenFiles.has(rel); if (!seenFiles.has(rel)) { seenFiles.add(rel); bytes += im.bytes; }
      if (W && H && im.width && im.height && im.format !== 'svg') { const r1 = W / H; const r2 = im.width / im.height; if (Math.abs(r1 / r2 - 1) > 0.05) add('image-aspect-mismatch', src, `${src}: declared ${W}×${H} but the image is ${im.width}×${im.height}`, 'Use the intrinsic aspect ratio in width/height and crop with object-fit if needed.', loc); }
      if (!RASTER.has(im.format)) continue;
      const display = sizesMax(a.sizes) ?? W;
      if (display && im.width && !srcset.some((c) => c.w) && im.width > display * maxScale) add('image-oversized-dimensions', src, `${src} is ${im.width}px wide but displayed at ${Math.round(display)}px (${(im.width / display).toFixed(1)}×, ${kb(im.bytes)})`, `Resize to about ${Math.round(display * 2)}px (2× for high-DPI) or add a srcset.`, loc);
      if (im.width >= srcsetMin && !srcset.length && !sources.some((s) => s.attrs.srcset && /\s\d+w/.test(s.attrs.srcset))) add('image-no-srcset', src, `${src} (${im.width}px, ${kb(im.bytes)}) has no srcset`, 'Provide 2–4 widths with srcset and sizes so phones get a smaller file.', loc);
      const modernAlt = sources.some((s) => MODERN.test(s.attrs.type || '') || MODERN.test(s.attrs.srcset || '')) || srcset.some((c) => MODERN.test(c.url));
      if ((im.format === 'jpeg' || im.format === 'png') && im.bytes > (config.legacyMinBytes ?? 30 * 1024) && !modernAlt) once('image-legacy-format', rel, `${rel} (${im.format.toUpperCase()}, ${kb(im.bytes)}) has no AVIF/WebP alternative`, 'Serve AVIF or WebP via <picture><source type="image/avif" …> (typically 30–50% smaller).', loc);
    }
  }
  // file-level checks over every image in the build (referenced or not, e.g. from CSS)
  for (const f of site.files) {
    if (!/\.(jpe?g|png|gif|webp|avif|svg)$/i.test(f)) continue; const im = info(f); if (!im) continue; const loc = { file: f };
    if (!seenFiles.has(f)) { seenFiles.add(f); images++; bytes += im.bytes; }
    if (im.bytes > maxBytes) once('image-heavy', f, `${f} is ${kb(im.bytes)}${im.width ? ` (${im.width}×${im.height} ${im.format})` : ''}, over the ${kb(maxBytes)} budget`, 'Compress harder (quality 70–80 is usually invisible), resize, or convert to AVIF/WebP.', { ...loc, severity: im.bytes > 1048576 ? 'high' : undefined });
    if (im.format === 'gif' && im.animated && im.bytes > (config.gifBytes ?? 100 * 1024)) once('image-animated-gif', f, `${f} is an animated GIF of ${kb(im.bytes)}`, 'Use <video autoplay muted loop playsinline> (MP4/WebM) or animated WebP/AVIF; often 80–90% smaller.', loc);
    if (im.format === 'png' && !im.alpha && !im.animated && im.bytes > (config.gifBytes ?? 100 * 1024)) once('image-png-photo', f, `${f} is an opaque PNG of ${kb(im.bytes)}`, 'Photos compress far better as JPEG, WebP or AVIF; keep PNG for flat graphics with transparency.', loc);
    if (im.format === 'jpeg' && !im.progressive && im.bytes > 100 * 1024) once('image-baseline-jpeg', f, `${f} is a baseline JPEG of ${kb(im.bytes)}`, 'Encode as progressive JPEG (e.g. mozjpeg) for faster perceived loading.', loc);
    if (im.format === 'svg' && im.svgText && im.bytes > 10 * 1024 && /(inkscape:|sodipodi:|<metadata|Adobe Illustrator|<!--|xmlns:(sketch|figma)|data-name=)/i.test(im.svgText)) once('image-svg-bloat', f, `${f} (${kb(im.bytes)}) contains editor metadata or comments`, 'Run SVGO (or similar) to strip metadata, comments and redundant precision.', loc);
  }
  return { findings, info: { images, imageBytes: bytes }, summary: `${site.pages.length} page(s), ${images} image(s), ${kb(bytes)}` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'image-pulse', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🖼️', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}
