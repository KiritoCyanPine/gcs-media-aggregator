# 📷 GCS Photos

A **static, zero-build web app** that turns a Google Cloud Storage bucket into a
Google-Photos-style gallery — images and videos from every folder, sorted newest
first, grouped by date, with a fullscreen viewer (arrow keys / swipe).

Everything runs in the browser. There is no backend. It's deployable to GitHub
Pages as-is.

---

## ⚠️ Security — read this first

This app authenticates by having **you paste a service-account private key into the
browser**. That key then lives in the page (and, if you tick "keep me signed in",
in `sessionStorage`, which is cleared when the tab closes). Treat it accordingly:

- **Use a dedicated, read-only service account.** Grant it only
  `roles/storage.objectViewer` on the one bucket you want to browse — nothing else.
- **Only use buckets you own / control.** Anyone who obtains the key gets whatever
  access the service account has.
- The key is **never** written to `localStorage` and never sent anywhere except
  Google's own token + storage endpoints.
- This is a personal-tool pattern. It is **not** appropriate for a shared or public
  deployment where untrusted people would enter real credentials.

---

## One-time setup

### 1. Create a read-only service account

```bash
# Create the account
gcloud iam service-accounts create gcs-photos-viewer \
  --display-name="GCS Photos (read-only)"

# Grant read-only access to just your bucket
gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET \
  --member="serviceAccount:gcs-photos-viewer@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

# Download the JSON key (this is what you paste into the app)
gcloud iam service-accounts keys create key.json \
  --iam-account=gcs-photos-viewer@YOUR_PROJECT.iam.gserviceaccount.com
```

### 2. Configure bucket CORS (required)

The browser calls the GCS list API cross-origin, so the bucket must allow your
site's origin. Edit [`cors.json`](./cors.json) — replace
`YOUR_GITHUB_USERNAME` with yours (and keep the localhost entries for local dev) —
then apply it:

```bash
gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json
# (older gsutil equivalent: gsutil cors set cors.json gs://YOUR_BUCKET)
```

> If images list but the whole thing fails with a network/"Failed to fetch" error,
> it's almost always this step.

---

## Run it

### Locally

ES modules and the Web Crypto API need a real origin (not `file://`), so serve the
folder over HTTP:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

### GitHub Pages

1. Push this folder to a repo.
2. **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   pick your branch and `/ (root)`.
3. Make sure your Pages URL (`https://USERNAME.github.io/REPO`) — or more precisely
   its **origin** `https://USERNAME.github.io` — is listed in `cors.json`.

(The included `.nojekyll` file stops GitHub from running Jekyll over the assets.)

---

## Using it

1. Open the app, paste the **service account JSON**, type the **bucket name**, click
   **Connect**.
2. It indexes the bucket (fetches metadata for every object) and shows a running
   count, then renders the gallery newest-first, grouped by day.
3. Scroll — day-sections load as you go and offscreen thumbnails are removed from
   the DOM to stay smooth.
4. Click any item for fullscreen. Navigate with **← / →**, on-screen arrows, or
   **swipe**; **Esc** or a backdrop click closes it.

---

## How it works

| Concern | Approach |
| --- | --- |
| Auth | Signs a service-account JWT locally with **Web Crypto (RS256)**, exchanges it at `oauth2.googleapis.com/token` for an access token. No libraries. |
| Listing | GCS JSON API `objects.list`, paged 1000 at a time, no `delimiter` so it recurses across all folders; keeps only `image/*` and `video/*`. |
| Sorting by date | GCS lists **alphabetically**, so the app pulls all object metadata once and sorts by `timeCreated` (upload time) client-side. |
| Display | Uses each object's `mediaLink` + `access_token` query param directly in `<img>`/`<video>` — no per-image CORS needed. |
| Performance | Day-sections are paginated on scroll; each thumbnail is hydrated near the viewport and detached from the DOM once far away (IntersectionObserver). |

---

## Limitations / notes

- **No thumbnails.** GCS doesn't resize images, so the grid downloads full images and
  the browser scales them down. Virtualization keeps memory in check, but a bucket of
  huge originals will use bandwidth. (Add a resize backend / CDN if you need true
  thumbnails.)
- **"Date" = upload time** (`timeCreated`), not EXIF capture date.
- **Large buckets** (100k+ objects) take a while to index up front, since the whole
  object list must be fetched before sorting by date.
- **Format support** is the browser's. `HEIC/HEIF` and some video codecs won't preview
  in most browsers and fall back to a placeholder tile.
- The access token is embedded in media URLs. It's short-lived and this is a personal
  tool, but be aware it can appear in browser history.

---

## Files

```
index.html        start page + gallery + viewer markup
css/styles.css    dark, Google-Photos-like styling
js/util.js        base64url, key parsing, media detection, formatting
js/auth.js        service-account JWT signing + token management
js/gcs.js         bucket listing + media URL building
js/gallery.js     date-grouped virtualized grid + infinite scroll
js/viewer.js      fullscreen lightbox (keys / swipe)
js/app.js         wiring, start page, session restore
cors.json         bucket CORS policy template
```
