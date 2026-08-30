// App entry point: handles the start page (credentials → connect), session
// restore, indexing progress, and swapping to the gallery + viewer.

import { TokenManager } from './auth.js';
import { GcsClient } from './gcs.js';
import { Gallery } from './gallery.js';
import { Viewer } from './viewer.js';

const SESSION_KEY = 'gcs-photos-session';

const el = (id) => document.getElementById(id);
const authView = el('auth-view');
const galleryView = el('gallery-view');
const topbar = el('topbar');

let gallery = null;
let tokens = null;

// ── Start page ─────────────────────────────────────────────────────────
el('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = el('sa-json').value.trim();
  const bucket = el('bucket').value.trim().replace(/^gs:\/\//, '').replace(/\/.*$/, '');
  const remember = el('remember').checked;

  hide(el('auth-error'));
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    return showAuthError('Service account JSON is not valid JSON. Paste the entire file contents.');
  }
  if (!bucket) return showAuthError('Please enter a bucket name.');

  const btn = el('connect');
  btn.disabled = true;
  setStatus('Authenticating…');
  try {
    await connect(sa, bucket);
    if (remember) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ sa, bucket }));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch (err) {
    showAuthError(err.message || String(err));
    hide(el('auth-status'));
  } finally {
    btn.disabled = false;
  }
});

el('signout').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  tokens?.destroy();
  gallery?.destroy();
  location.reload();
});

// ── Connect + load ─────────────────────────────────────────────────────
async function connect(sa, bucket) {
  tokens = new TokenManager(sa);
  await tokens.getToken(); // validates the key + reachability of token endpoint

  const client = new GcsClient(bucket, tokens);
  enterGallery(bucket);

  setIndexing(true, 'Indexing bucket…');
  let items;
  try {
    items = await client.listAllMedia((count) => setIndexing(true, `Indexing… ${count} items found`));
  } catch (err) {
    setIndexing(false);
    // Bounce back to the start page with the error.
    galleryView.hidden = true;
    topbar.hidden = true;
    authView.hidden = false;
    throw err;
  }

  // Newest first (GCS returns lexicographic order, so we sort by upload time).
  items.sort((a, b) => new Date(b.timeCreated) - new Date(a.timeCreated));
  setIndexing(false);

  el('count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  el('empty').hidden = items.length > 0;

  const viewer = new Viewer(el('viewer'), () => gallery.getItems(), client);
  gallery = new Gallery(el('gallery'), el('sentinel'), client, (i) => viewer.open(i));
  gallery.setItems(items);
}

// ── View switching / small UI helpers ──────────────────────────────────
function enterGallery(bucket) {
  hide(el('auth-error'));
  hide(el('auth-status'));
  authView.hidden = true;
  galleryView.hidden = false;
  topbar.hidden = false;
  el('bucket-name').textContent = bucket;
  el('count').textContent = '';
}

function setIndexing(on, text) {
  const box = el('indexing');
  box.hidden = !on;
  if (text) el('indexing-text').textContent = text;
}

function setStatus(text) {
  const s = el('auth-status');
  s.textContent = text;
  s.hidden = false;
}

function showAuthError(msg) {
  const box = el('auth-error');
  box.textContent = msg;
  box.hidden = false;
}

function hide(node) { node.hidden = true; }

// ── Session restore ─────────────────────────────────────────────────────
(async function restore() {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return;
  try {
    const { sa, bucket } = JSON.parse(saved);
    el('bucket').value = bucket;
    await connect(sa, bucket);
  } catch (err) {
    sessionStorage.removeItem(SESSION_KEY);
    authView.hidden = false;
    galleryView.hidden = true;
    topbar.hidden = true;
    showAuthError(`Saved session could not be restored: ${err.message}`);
  }
})();
