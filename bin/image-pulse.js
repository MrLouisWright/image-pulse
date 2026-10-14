#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'image-pulse', version: pkg.version, configKey: 'imagePulse', rules: RULES,
  tagline: 'find oversized and unoptimised images in your built site',
  usage: 'Usage: image-pulse [site-dir] [options]',
  help: `${SITE_HELP}Images
      --max-kb <n>             Byte budget per image file in KB (default 250)
      --max-scale <n>          Allowed intrinsic/display width ratio (default 2.5)
`,
  options: { ...SITE_OPTIONS, 'max-kb': { type: 'string' }, 'max-scale': { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { cli: o, maxBytes: o['max-kb'] != null ? Number(o['max-kb']) * 1024 : undefined, maxScale: o['max-scale'] != null ? Number(o['max-scale']) : undefined, toolVersion: pkg.version }, config, configFile),
});
