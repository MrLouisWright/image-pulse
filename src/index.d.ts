import type { Report, Rule } from './core.js';
export * from './core.js';
export interface ImageInfo { format: 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'heif' | 'svg'; width?: number; height?: number; alpha?: boolean; animated?: boolean; progressive?: boolean }
export interface ImageOptions { baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean; maxBytes?: number; maxScale?: number; toolVersion?: string; now?: Date }
export declare const RULES: Record<string, Rule>;
export declare function imageInfo(buf: Buffer, name?: string): ImageInfo | null;
export declare function parseSrcset(s: string): Array<{ url: string; w: number | null; x: number | null }>;
export declare function sizesMax(sizes: string, viewport?: number): number | null;
export declare function check(dir: string, opts?: ImageOptions, config?: Record<string, unknown>, configFile?: string): Report;
