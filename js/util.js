// Small shared helpers: base64url encoding, key parsing, media detection, formatting.

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'svg', 'tif', 'tiff', 'ico']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp', 'ogv', 'mpg', 'mpeg']);

/** URL-safe base64 (no padding) from a UTF-8 string. */
export function b64urlFromString(str) {
  const bytes = new TextEncoder().encode(str);
  return b64urlFromBytes(bytes);
}

/** URL-safe base64 (no padding) from an ArrayBuffer / typed array. */
export function b64urlFromBuffer(buf) {
  return b64urlFromBytes(new Uint8Array(buf));
}

function b64urlFromBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Convert a PEM-encoded PKCS#8 private key to an ArrayBuffer of DER bytes. */
export function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** 'image' | 'video' | null for a GCS object. */
export function mediaKind(item) {
  const ct = (item.contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  const ext = extensionOf(item.name);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return null;
}

export function isMediaItem(item) {
  // Skip "directory placeholder" objects (zero-byte keys ending in "/").
  if (item.name.endsWith('/')) return false;
  return mediaKind(item) !== null;
}

/** Local calendar-day key, e.g. "2026-08-31". */
export function dayKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Human date label given the day key and today/yesterday reference keys. */
export function dayLabel(date, todayKey, yesterdayKey) {
  const key = dayKeyOf(date);
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function fmtBytes(n) {
  const num = Number(n);
  if (!num) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = num;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function displayName(name) {
  const slash = name.lastIndexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}
