// Fullscreen lightbox: shows the current item, navigates with arrow keys,
// on-screen arrows, and touch swipe. Preloads the two neighbours.

import { mediaKind, displayName, fmtBytes } from './util.js';

export class Viewer {
  /**
   * @param {HTMLElement} root  the #viewer element
   * @param {() => Array} getItems  returns the current full item list
   * @param {import('./gcs.js').GcsClient} client
   */
  constructor(root, getItems, client) {
    this.root = root;
    this.getItems = getItems;
    this.client = client;
    this.index = -1;

    this.stage = root.querySelector('#viewer-stage');
    this.caption = root.querySelector('#viewer-caption');

    root.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') this.close();
      else if (action === 'next') this.next();
      else if (action === 'prev') this.prev();
      else if (e.target === this.stage || e.target === this.root) this.close(); // click backdrop
    });

    this._onKey = (e) => {
      if (this.index < 0) return;
      if (e.key === 'ArrowRight') this.next();
      else if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === 'Escape') this.close();
    };

    // Touch swipe.
    let startX = 0, startY = 0;
    this.stage.addEventListener('touchstart', (e) => {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
    }, { passive: true });
    this.stage.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        dx < 0 ? this.next() : this.prev();
      }
    }, { passive: true });
  }

  open(index) {
    this.root.hidden = false;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this._onKey);
    this.show(index);
  }

  close() {
    this.index = -1;
    this.root.hidden = true;
    this.stage.replaceChildren();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this._onKey);
  }

  next() { this.show(this.index + 1); }
  prev() { this.show(this.index - 1); }

  show(index) {
    const items = this.getItems();
    if (index < 0 || index >= items.length) return; // clamp at ends
    this.index = index;
    const item = items[index];
    const url = this.client.mediaUrl(item);

    this.stage.replaceChildren();
    if (mediaKind(item) === 'video') {
      const v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      this.stage.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = displayName(item.name);
      this.stage.appendChild(img);
      this._preloadNeighbours(items, index);
    }

    const date = new Date(item.timeCreated).toLocaleString();
    const size = fmtBytes(item.size);
    this.caption.innerHTML =
      `<span class="name">${displayName(item.name)}</span>` +
      `<span>${date}${size ? ' · ' + size : ''} · ${index + 1} / ${items.length}</span>`;
  }

  _preloadNeighbours(items, index) {
    for (const i of [index + 1, index - 1]) {
      if (i >= 0 && i < items.length && mediaKind(items[i]) === 'image') {
        new Image().src = this.client.mediaUrl(items[i]);
      }
    }
  }
}
