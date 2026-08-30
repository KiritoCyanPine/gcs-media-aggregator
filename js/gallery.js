// Google-Photos-style grid: items grouped by day (newest first), day-sections
// appended on scroll (pagination), and each thumbnail lazily hydrated when it
// nears the viewport and torn out of the DOM again once it scrolls far away.

import { dayKeyOf, dayLabel, mediaKind, displayName } from './util.js';

const BATCH_ITEMS = 120;          // ~how many thumbnails to add per scroll page
const HYDRATE_MARGIN = '800px';   // load/unload buffer above & below viewport

export class Gallery {
  /**
   * @param {HTMLElement} container  where day-sections are appended
   * @param {HTMLElement} sentinel   element observed to trigger the next page
   * @param {import('./gcs.js').GcsClient} client
   * @param {(index:number)=>void} onOpen  called with a global item index on click
   */
  constructor(container, sentinel, client, onOpen) {
    this.container = container;
    this.sentinel = sentinel;
    this.client = client;
    this.onOpen = onOpen;

    this.items = [];       // full sorted list; index === "global index" used by viewer
    this.groups = [];      // [{ label, items: [{item, index}] }]
    this.groupCursor = 0;

    // Loads/unloads the <img>/<video> inside a cell as it enters/leaves the buffer zone.
    this.cellObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this._hydrate(e.target);
          else this._dehydrate(e.target);
        }
      },
      { rootMargin: HYDRATE_MARGIN },
    );

    // Appends the next page of day-sections as the sentinel approaches.
    this.pageObserver = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) this._renderNextPage(); },
      { rootMargin: '1200px' },
    );
    this.pageObserver.observe(this.sentinel);
  }

  getItems() {
    return this.items;
  }

  setItems(items) {
    this.items = items;
    this.container.replaceChildren();
    this.groupCursor = 0;
    this.groups = this._group(items);
    this.pageObserver.observe(this.sentinel);
    this._renderNextPage();
  }

  _group(items) {
    const now = new Date();
    const todayKey = dayKeyOf(now);
    const yesterdayKey = dayKeyOf(new Date(now.getTime() - 86400000));

    const groups = [];
    let currentKey = null;
    items.forEach((item, index) => {
      const date = new Date(item.timeCreated);
      const key = dayKeyOf(date);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({ label: dayLabel(date, todayKey, yesterdayKey), items: [] });
      }
      groups[groups.length - 1].items.push({ item, index });
    });
    return groups;
  }

  _renderNextPage() {
    let rendered = 0;
    while (this.groupCursor < this.groups.length && rendered < BATCH_ITEMS) {
      const group = this.groups[this.groupCursor++];
      this._renderGroup(group);
      rendered += group.items.length;
    }
    if (this.groupCursor >= this.groups.length) {
      this.pageObserver.unobserve(this.sentinel); // all sections rendered
    }
  }

  _renderGroup(group) {
    const section = document.createElement('section');
    section.className = 'day';

    const header = document.createElement('h2');
    header.className = 'day__label';
    header.textContent = group.label;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const { item, index } of group.items) {
      grid.appendChild(this._makeCell(item, index));
    }
    section.appendChild(grid);
    this.container.appendChild(section);
  }

  _makeCell(item, index) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell._item = item;
    cell._index = index;
    cell.addEventListener('click', () => this.onOpen(index));
    this.cellObserver.observe(cell);
    return cell;
  }

  _hydrate(cell) {
    if (cell._hydrated) return;
    cell._hydrated = true;
    const item = cell._item;
    const kind = mediaKind(item);
    const url = this.client.mediaUrl(item);

    let media;
    if (kind === 'video') {
      media = document.createElement('video');
      media.muted = true;
      media.playsInline = true;
      media.preload = 'metadata';
      // "#t=0.1" nudges browsers to render the first frame as a poster.
      media.src = `${url}#t=0.1`;
      media.addEventListener('loadeddata', () => media.classList.add('loaded'), { once: true });
      cell.appendChild(media);
      cell.appendChild(this._badge('▶'));
    } else {
      media = document.createElement('img');
      media.loading = 'lazy';
      media.decoding = 'async';
      media.alt = displayName(item.name);
      media.src = url;
      media.addEventListener('load', () => media.classList.add('loaded'), { once: true });
      cell.appendChild(media);
    }
    media.addEventListener('error', () => this._showFallback(cell, item), { once: true });
  }

  _dehydrate(cell) {
    if (!cell._hydrated) return;
    cell._hydrated = false;
    cell.replaceChildren(); // remove the heavy <img>/<video> from the DOM
  }

  _badge(text) {
    const b = document.createElement('span');
    b.className = 'cell__badge';
    b.textContent = text;
    return b;
  }

  _showFallback(cell, item) {
    const ext = (item.name.split('.').pop() || '?').toUpperCase();
    cell.replaceChildren();
    const fb = document.createElement('div');
    fb.className = 'cell__fallback';
    fb.innerHTML = `<span class="ext">🗎</span><span>${ext}</span><span>can't preview</span>`;
    cell.appendChild(fb);
  }

  destroy() {
    this.cellObserver.disconnect();
    this.pageObserver.disconnect();
    this.container.replaceChildren();
  }
}
