import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, imageInfo, parseSrcset, sizesMax, runCli, RULES } from '../src/index.js';

const ids = (r) => [...new Set(r.findings.map((f) => f.rule))].sort();
const io = () => { const o = { s: '', e: '' }; return { o, io: { stdout: { write: (x) => { o.s += x; } }, stderr: { write: (x) => { o.e += x; } } } }; };
const cfg = (d) => JSON.parse(readFileSync(join(d, '.image-pulse.json'), 'utf8'));
const site = (html, files = {}) => { const d = mkdtempSync(join(tmpdir(), 'ip-')); mkdirSync(join(d, 'img')); writeFileSync(join(d, 'index.html'), `<!doctype html><html><head><title>t</title></head><body>${html}</body></html>`); for (const [k, v] of Object.entries(files)) copyFileSync(v, join(d, k)); return d; };
const B = 'test/fixtures/bad/img/'; const G = 'test/fixtures/good/img/';

test('imageInfo reads PNG, JPEG, GIF, WebP, SVG headers', () => {
  assert.deepEqual(imageInfo(readFileSync(G + 'logo.png')), { format: 'png', width: 64, height: 64, alpha: false, animated: false });
  assert.deepEqual(imageInfo(readFileSync(G + 'hero-960.jpg')), { format: 'jpeg', width: 960, height: 540, progressive: true });
  assert.equal(imageInfo(readFileSync(B + 'anim.gif')).animated, true);
  assert.deepEqual(imageInfo(readFileSync(G + 'hero-480.webp')), { format: 'webp', width: 480, height: 270 });
  assert.deepEqual(imageInfo(Buffer.from('<svg xmlns="x" viewBox="0 0 48 32">')), { format: 'svg', width: 48, height: 32 });
  assert.equal(imageInfo(Buffer.from('not an image at all')), null);
});
test('imageInfo reads VP8X WebP and AVIF ispe', () => {
  const w = Buffer.alloc(30); w.write('RIFF', 0); w.write('WEBP', 8); w.write('VP8X', 12); w[20] = 0x12; w.writeUIntLE(799, 24, 3); w.writeUIntLE(599, 27, 3);
  assert.deepEqual(imageInfo(w), { format: 'webp', width: 800, height: 600, alpha: true, animated: true });
  const a = Buffer.alloc(64); a.writeUInt32BE(24, 0); a.write('ftypavif', 4); a.write('ispe', 40); a.writeUInt32BE(1200, 48); a.writeUInt32BE(800, 52);
  assert.deepEqual(imageInfo(a), { format: 'avif', width: 1200, height: 800 });
});
test('parseSrcset and sizesMax', () => {
  assert.deepEqual(parseSrcset('a.jpg 480w, b.jpg 960w'), [{ url: 'a.jpg', w: 480, x: null }, { url: 'b.jpg', w: 960, x: null }]);
  assert.deepEqual(parseSrcset('a.jpg, b.jpg 2x').map((c) => c.x), [1, 2]);
  assert.equal(sizesMax('(max-width: 600px) 100vw, 400px'), 1440); assert.equal(sizesMax('300px'), 300); assert.equal(sizesMax('calc(100vw - 2rem)'), null);
});
test('good fixture is clean', () => assert.deepEqual(ids(check('test/fixtures/good')), []));
test('bad fixture', () => {
  const r = check('test/fixtures/bad', {}, cfg('test/fixtures/bad'));
  assert.deepEqual(ids(r), ['image-animated-gif', 'image-aspect-mismatch', 'image-baseline-jpeg', 'image-heavy', 'image-legacy-format', 'image-missing-dimensions', 'image-no-srcset', 'image-oversized-dimensions', 'image-png-photo', 'image-sizes-missing', 'image-svg-bloat']);
  assert.equal(r.findings.filter((f) => f.rule === 'image-legacy-format' && f.subject === 'img/banner.jpg').length, 1);
});
test('heavy image above 1 MB is high', () => { const d = site(''); writeFileSync(join(d, 'img', 'x.jpg'), Buffer.concat([readFileSync(B + 'photo.jpg'), Buffer.alloc(1100000)])); const f = check(d).findings.find((x) => x.rule === 'image-heavy'); assert.equal(f.severity, 'high'); });
test('sizes attribute sets display width; srcset suppresses oversize', () => {
  assert.ok(ids(check(site('<img src="/img/b.jpg" width="1200" height="600" sizes="300px" alt="">', { 'img/b.jpg': B + 'banner.jpg' }))).includes('image-oversized-dimensions'));
  assert.ok(!ids(check(site('<img src="/img/b.jpg" width="1200" height="600" alt="">', { 'img/b.jpg': B + 'banner.jpg' }))).includes('image-oversized-dimensions'));
});
test('aspect-ratio style with one dimension is accepted', () => assert.deepEqual(ids(check(site('<img src="/img/l.png" width="64" style="aspect-ratio:1" alt="">', { 'img/l.png': G + 'logo.png' }))), []));
test('external images only get markup checks', () => assert.deepEqual(ids(check(site('<img src="https://cdn.other.net/x.jpg" alt="">'))), ['image-missing-dimensions']));
test('modern format in srcset counts as alternative', () => assert.ok(!ids(check(site('<img src="/img/p.jpg" srcset="/img/p.webp 1x" width="400" height="300" alt="">', { 'img/p.jpg': B + 'photo.jpg' }))).includes('image-legacy-format')));
test('CLI exit codes, max-kb and SARIF', async () => {
  const cli = { name: 'image-pulse', version: '1.0.0', configKey: 'imagePulse', rules: RULES, tagline: 't', usage: 'u', help: '', options: {}, run: async ({ dir, config }) => check(dir, {}, config) };
  let t = io(); assert.equal(await runCli(cli, ['test/fixtures/good', '--fail-on', 'low'], t.io), 0);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'sarif', '--fail-on', 'medium'], t.io), 1); assert.equal(JSON.parse(t.o.s).version, '2.1.0');
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/none'], t.io), 2);
});
