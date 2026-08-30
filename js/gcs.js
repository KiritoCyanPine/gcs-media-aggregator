// Thin client over the GCS JSON API: recursively list every image/video in the
// bucket (across all folders), and build a directly-loadable media URL.

import { isMediaItem } from './util.js';

const API = 'https://storage.googleapis.com/storage/v1/b';
// Only the fields we need — keeps each list page small and fast.
const FIELDS = 'nextPageToken,items(name,contentType,timeCreated,updated,size,mediaLink)';

export class GcsClient {
  /** @param {string} bucket @param {import('./auth.js').TokenManager} tokens */
  constructor(bucket, tokens) {
    this.bucket = bucket;
    this.tokens = tokens;
  }

  /**
   * List every object in the bucket (no delimiter → recurses across folders),
   * keeping only images/videos. GCS returns objects lexicographically, so the
   * caller sorts by date afterwards.
   * @param {(count:number)=>void} [onProgress] called with running media count
   */
  async listAllMedia(onProgress) {
    const items = [];
    let pageToken = '';
    do {
      const token = await this.tokens.getToken();
      const url = new URL(`${API}/${encodeURIComponent(this.bucket)}/o`);
      url.searchParams.set('fields', FIELDS);
      url.searchParams.set('maxResults', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      let res;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      } catch (e) {
        throw new Error(
          `Failed to reach the bucket. This is almost always a missing CORS policy — ` +
          `see the README for the one-time \`gcloud storage buckets update … --cors-file\` step. (${e.message})`,
        );
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 403) throw new Error(`Access denied to bucket "${this.bucket}". Grant the service account roles/storage.objectViewer. ${text}`);
        if (res.status === 404) throw new Error(`Bucket "${this.bucket}" not found.`);
        throw new Error(`Listing failed (HTTP ${res.status}). ${text}`);
      }

      const data = await res.json();
      for (const it of data.items || []) {
        if (isMediaItem(it)) items.push(it);
      }
      pageToken = data.nextPageToken || '';
      if (onProgress) onProgress(items.length);
    } while (pageToken);

    return items;
  }

  /** A URL that can be dropped straight into <img src> / <video src>. */
  mediaUrl(item) {
    const token = this.tokens.current();
    // mediaLink already carries `?generation=…&alt=media`; just append auth.
    const base = item.mediaLink
      || `${API}/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(item.name)}?alt=media`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}access_token=${encodeURIComponent(token)}`;
  }
}
