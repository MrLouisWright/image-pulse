// Read image dimensions and basic properties from file headers. PNG, JPEG, GIF, WebP, AVIF/HEIF, SVG.
const u16be = (b, o) => b.readUInt16BE(o); const u32be = (b, o) => b.readUInt32BE(o);
export function imageInfo(buf, name = '') {
  if (!buf || buf.length < 12) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) { const ct = buf[25]; return { format: 'png', width: u32be(buf, 16), height: u32be(buf, 20), alpha: ct === 4 || ct === 6 || hasChunk(buf, 'tRNS'), animated: hasChunk(buf, 'acTL') }; }
  if (buf[0] === 0xff && buf[1] === 0xd8) return { format: 'jpeg', ...jpeg(buf) };
  if (buf.toString('ascii', 0, 3) === 'GIF') { let frames = 0; for (let i = 13; i < buf.length - 1 && frames < 2; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xf9) frames++; return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), animated: frames > 1 }; }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { format: 'webp', ...webp(buf) };
  if (buf.toString('ascii', 4, 8) === 'ftyp') { const brand = buf.toString('ascii', 8, 12); const i = buf.indexOf('ispe'); const fmt = /avi[fs]/.test(brand) || buf.indexOf('avif') > 0 && buf.indexOf('avif') < 40 ? 'avif' : 'heif'; return i > 0 ? { format: fmt, width: u32be(buf, i + 8), height: u32be(buf, i + 12) } : { format: fmt }; }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  if (/<svg[\s>]/i.test(head) || /\.svg$/i.test(name)) { const t = head.match(/<svg\b[^>]*>/i)?.[0] || ''; const px = (a) => { const m = new RegExp(`\\b${a}\\s*=\\s*["']?\\s*([\\d.]+)(px)?\\s*["'\\s>/]`, 'i').exec(t); return m ? Math.round(+m[1]) : undefined; }; const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t); return { format: 'svg', width: px('width') ?? (vb ? Math.round(+vb[1]) : undefined), height: px('height') ?? (vb ? Math.round(+vb[2]) : undefined) }; }
  return null;
}
function hasChunk(b, type) { let o = 8; while (o + 8 <= b.length) { const len = u32be(b, o); const t = b.toString('ascii', o + 4, o + 8); if (t === type) return true; if (t === 'IDAT' && type !== 'IDAT') return false; o += 12 + len; } return false; }
function jpeg(b) {
  let o = 2; let progressive = false;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) { o++; continue; } const m = b[o + 1]; if (m === 0xff) { o++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
    const len = u16be(b, o + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { progressive = m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce; return { width: u16be(b, o + 7), height: u16be(b, o + 5), progressive }; }
    o += 2 + len;
  }
  return {};
}
function webp(b) {
  const c = b.toString('ascii', 12, 16);
  if (c === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (c === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, alpha: !!((bits >> 28) & 1) }; }
  if (c === 'VP8X') { const f = b[20]; return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), alpha: !!(f & 0x10), animated: !!(f & 0x02) }; }
  return {};
}
