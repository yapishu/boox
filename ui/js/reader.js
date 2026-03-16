// Book reader module - handles rendering for all supported formats

window.Reader = {
  container: null,
  currentBook: null,
  rendition: null,
  positionSaveTimer: null,
  fontSettings: null,
  notationsVisible: JSON.parse(localStorage.getItem('boox-notations-visible') || 'true'),
  _notations: [],

  loadFontSettings() {
    const defaults = { fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: 100, lineHeight: 1.6 };
    try {
      const saved = localStorage.getItem('boox-font-settings');
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch (e) {}
    return defaults;
  },

  saveFontSettings() {
    localStorage.setItem('boox-font-settings', JSON.stringify(this.fontSettings));
  },

  async open(book) {
    if (book['s3-url'] && !/^https?:\/\//.test(book['s3-url'])) {
      book['s3-url'] = 'https://' + book['s3-url'];
    }
    this.currentBook = book;
    this.container = document.getElementById('reader-container');
    this.container.innerHTML = '';
    this._notations = book.notations || [];

    const format = book.format;
    switch (format) {
      case 'epub': return this.openEpub(book);
      case 'pdf': {
        const ctrl = await this.openPdf(book);
        this._pdfControls = ctrl;
        return ctrl;
      }
      case 'txt':  return this.openText(book);
      case 'md':   return this.openMarkdown(book);
      case 'html': return this.openHtml(book);
      case 'mobi': return this.openMobi(book);
      default:
        this.container.innerHTML = `<div class="reader-error">Unsupported format: ${format}</div>`;
    }
  },

  close() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.rendition) {
      this.rendition.destroy();
      this.rendition = null;
    }
    if (this.positionSaveTimer) {
      clearInterval(this.positionSaveTimer);
      this.positionSaveTimer = null;
    }
    this.currentBook = null;
    this._epubBook = null;
    this._pdfControls = null;
    this._notations = [];
    this._dismissPopups();
    const existing = document.getElementById('reader-font-settings');
    if (existing) existing.remove();
    const chList = document.getElementById('reader-chapter-list');
    if (chList) chList.remove();
    const nList = document.getElementById('reader-notation-list');
    if (nList) nList.remove();
    const container = document.getElementById('reader-container');
    if (container) container.innerHTML = '';
  },

  _dismissPopups() {
    document.querySelectorAll('.notation-popup, .notation-detail').forEach(el => el.remove());
  },

  getThemeColors() {
    const s = getComputedStyle(document.documentElement);
    const r = (n, fb) => s.getPropertyValue(n).trim() || fb;
    return {
      bg: r('--bg', '#0F0F0F'),
      fg: r('--text-primary', '#E8E8E6'),
      muted: r('--text-secondary', '#8A8A87'),
      accent: r('--accent', '#E8E8E6'),
      link: r('--badge-reading', '#3b82f6'),
    };
  },

  applyTheme() {
    if (!this.rendition) return;
    const fs = this.fontSettings;
    const c = this.getThemeColors();
    this.rendition.themes.default({
      'body': {
        'font-family': `${fs.fontFamily} !important`,
        'font-size': `${fs.fontSize}% !important`,
        'line-height': `${fs.lineHeight} !important`,
        'color': `${c.fg} !important`,
        'background': `${c.bg} !important`,
        'padding': '1.25rem 1rem 2rem !important',
        'max-width': '80ch',
        'margin': '0 auto !important',
      },
      'a': { 'color': `${c.link} !important` },
      'p': { 'margin-bottom': '0.8em !important' },
      'h1,h2,h3,h4,h5,h6': { 'color': `${c.fg} !important` },
      '.boox-highlight': {
        'background': 'rgba(251,191,36,0.3) !important',
        'cursor': 'pointer !important',
        'border-radius': '2px !important',
      }
    });
  },

  toggleSettingsPanel() {
    const existing = document.getElementById('reader-font-settings');
    if (existing) { existing.remove(); return; }
    this.renderSettingsPanel();
  },

  renderSettingsPanel() {
    const existing = document.getElementById('reader-font-settings');
    if (existing) existing.remove();

    const fs = this.fontSettings;
    const fonts = [
      { label: 'Serif', value: "'IBM Plex Serif', Georgia, serif" },
      { label: 'Sans', value: "'Hanken Grotesk', -apple-system, sans-serif" },
      { label: 'Mono', value: "'IBM Plex Mono', monospace" },
    ];
    const spacings = [
      { label: 'Tight', value: 1.4 },
      { label: 'Normal', value: 1.7 },
      { label: 'Relaxed', value: 2.0 },
    ];

    const panel = document.createElement('div');
    panel.id = 'reader-font-settings';
    panel.className = 'font-settings-panel';
    panel.innerHTML = `
      <div class="font-setting">
        <label>Font</label>
        <div class="font-opts">
          ${fonts.map(f => `
            <button class="font-opt ${fs.fontFamily === f.value ? 'active' : ''}"
                    onclick="Reader.setFontFamily('${f.value}')"
                    style="font-family:${f.value}">${f.label}</button>
          `).join('')}
        </div>
      </div>
      <div class="font-setting">
        <label>Size</label>
        <div class="font-size-controls">
          <button class="btn btn-sm" onclick="Reader.changeFontSize(-10)">A&#8722;</button>
          <span id="font-size-value">${fs.fontSize}%</span>
          <button class="btn btn-sm" onclick="Reader.changeFontSize(10)">A+</button>
        </div>
      </div>
      <div class="font-setting">
        <label>Spacing</label>
        <div class="font-opts">
          ${spacings.map(s => `
            <button class="font-opt ${fs.lineHeight === s.value ? 'active' : ''}"
                    onclick="Reader.setLineHeight(${s.value})">${s.label}</button>
          `).join('')}
        </div>
      </div>
    `;
    document.getElementById('reader-toolbar').appendChild(panel);
  },

  setFontFamily(family) {
    this.fontSettings.fontFamily = family;
    this.saveFontSettings();
    this.applyTheme();
    this.renderSettingsPanel();
  },

  changeFontSize(delta) {
    this.fontSettings.fontSize = Math.max(60, Math.min(200, this.fontSettings.fontSize + delta));
    this.saveFontSettings();
    this.applyTheme();
    const el = document.getElementById('font-size-value');
    if (el) el.textContent = this.fontSettings.fontSize + '%';
  },

  setLineHeight(value) {
    this.fontSettings.lineHeight = value;
    this.saveFontSettings();
    this.applyTheme();
    this.renderSettingsPanel();
  },

  toggleChapterList() {
    const existing = document.getElementById('reader-chapter-list');
    if (existing) { existing.remove(); return; }
    if (!this._epubBook) return;

    const panel = document.createElement('div');
    panel.id = 'reader-chapter-list';
    panel.className = 'chapter-list-panel';

    const nav = this._epubBook.navigation;
    if (!nav || !nav.toc || nav.toc.length === 0) {
      panel.innerHTML = '<div style="padding:0.5rem;color:var(--text-muted);font-size:0.8rem">No chapters found</div>';
    } else {
      const renderItems = (items, depth) => {
        return items.map(item => {
          const cls = depth > 0 ? 'chapter-item indent' : 'chapter-item';
          let html = `<button class="${cls}" onclick="Reader.goToChapter('${item.href.replace(/'/g, "\\'")}')">${item.label.trim()}</button>`;
          if (item.subitems && item.subitems.length > 0) {
            html += renderItems(item.subitems, depth + 1);
          }
          return html;
        }).join('');
      };
      panel.innerHTML = renderItems(nav.toc, 0);
    }

    document.getElementById('reader-toolbar').appendChild(panel);
  },

  goToChapter(href) {
    if (this.rendition) {
      this.rendition.display(href);
    }
    const panel = document.getElementById('reader-chapter-list');
    if (panel) panel.remove();
  },

  // -- Notations --

  toggleNotations() {
    this.notationsVisible = !this.notationsVisible;
    localStorage.setItem('boox-notations-visible', JSON.stringify(this.notationsVisible));
    if (this.rendition) {
      // EPUB
      if (this.notationsVisible) {
        this._applyNotationHighlights();
      } else {
        this._clearNotationHighlights();
      }
    }
    // PDF: just toggle highlight visibility via CSS
    document.querySelectorAll('.boox-pdf-highlight').forEach(s => {
      s.style.background = this.notationsVisible ? '' : 'transparent';
    });
  },

  toggleNotationList() {
    const existing = document.getElementById('reader-notation-list');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'reader-notation-list';
    panel.className = 'notation-sidebar';

    if (this._notations.length === 0) {
      panel.innerHTML = '<div class="notation-sidebar-empty">No notations yet. Select text to add one.</div>';
    } else {
      panel.innerHTML = this._notations.map(n => `
        <div class="notation-sidebar-item" onclick="Reader.goToNotation('${this.escapeHtml(n.anchor)}')">
          <div class="notation-sidebar-quote">"${this.escapeHtml((n.selected || '').slice(0, 80))}"</div>
          ${n.note ? `<div class="notation-sidebar-note">${this.escapeHtml(n.note)}</div>` : ''}
        </div>
      `).join('');
    }

    document.getElementById('reader-toolbar').appendChild(panel);
  },

  goToNotation(anchor) {
    if (anchor && anchor.startsWith('pdf:')) {
      // Navigate to PDF page
      const pageNum = parseInt(anchor.split(':')[1]);
      if (this._pdfControls && pageNum) this._pdfControls.goTo(pageNum);
    } else if (this.rendition && anchor) {
      this.rendition.display(anchor);
    }
    const panel = document.getElementById('reader-notation-list');
    if (panel) panel.remove();
  },

  _generateNid() {
    const uvChars = '0123456789abcdefghijklmnopqrstuv';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    let raw = '';
    for (const b of bytes) raw += uvChars[b & 31];
    const groups = [];
    for (let i = raw.length; i > 0; i -= 5) {
      groups.unshift(raw.slice(Math.max(0, i - 5), i));
    }
    groups[0] = groups[0].replace(/^0+/, '') || '0';
    return '0v' + groups.join('.');
  },

  _applyNotationHighlights() {
    if (!this.rendition || !this.notationsVisible) return;
    for (const n of this._notations) {
      try {
        this.rendition.annotations.highlight(
          n.anchor, { id: n.id },
          (e) => { this._showNotationDetail(n, e); },
          'boox-highlight'
        );
      } catch (e) {}
    }
  },

  _clearNotationHighlights() {
    if (!this.rendition) return;
    for (const n of this._notations) {
      try { this.rendition.annotations.remove(n.anchor, 'highlight'); } catch (e) {}
    }
  },

  _showNotationPopup(cfiRange, text) {
    this._dismissPopups();
    const popup = document.createElement('div');
    popup.className = 'notation-popup';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.innerHTML = `
      <div class="notation-popup-quote">"${this.escapeHtml(text.slice(0, 200))}"</div>
      <textarea id="notation-note-input" rows="3" placeholder="Add a note (optional)..."></textarea>
      <div class="notation-popup-actions">
        <button class="btn btn-sm" onclick="Reader._dismissPopups()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="Reader._saveNotation()">Save</button>
      </div>
    `;
    this._pendingNotation = { cfiRange, text };
    document.body.appendChild(popup);
    popup.querySelector('textarea').focus();
  },

  async _saveNotation() {
    const pn = this._pendingNotation;
    if (!pn || !this.currentBook) return;
    const noteInput = document.getElementById('notation-note-input');
    const note = noteInput ? noteInput.value.trim() : '';
    const nid = this._generateNid();

    const notation = {
      id: nid,
      anchor: pn.cfiRange,
      selected: pn.text,
      note,
    };

    this._notations.push(notation);
    this._dismissPopups();
    this._pendingNotation = null;

    // Apply highlight based on format
    if (notation.anchor.startsWith('pdf:')) {
      // Re-highlight the current PDF text layer
      const tl = document.querySelector('.pdf-text-layer');
      if (tl && this.notationsVisible) {
        const pageNum = parseInt(notation.anchor.split(':')[1]);
        this._applyPdfHighlights(tl, pageNum);
      }
    } else if (this.rendition && this.notationsVisible) {
      try {
        this.rendition.annotations.highlight(
          notation.anchor, { id: nid },
          (e) => { this._showNotationDetail(notation, e); },
          'boox-highlight'
        );
      } catch (e) {}
    }

    // Save to backend
    try {
      await BooxAPI.addNotation(this.currentBook.id, nid, pn.cfiRange, pn.text, note);
    } catch (e) {
      console.error('Failed to save notation:', e);
    }
  },

  _showNotationDetail(notation, event) {
    this._dismissPopups();
    const detail = document.createElement('div');
    detail.className = 'notation-detail';
    detail.style.top = '50%';
    detail.style.left = '50%';
    detail.style.transform = 'translate(-50%, -50%)';

    const isOwn = !!this.currentBook;
    detail.innerHTML = `
      <div class="notation-detail-quote">"${this.escapeHtml((notation.selected || '').slice(0, 300))}"</div>
      ${notation.note ? `<div class="notation-detail-note">${this.escapeHtml(notation.note)}</div>` : ''}
      ${notation.from ? `<div class="notation-detail-meta">From ${this.escapeHtml(notation.from)}</div>` : ''}
      <div class="notation-popup-actions" style="margin-top:0.5rem">
        <button class="btn btn-sm" onclick="Reader._dismissPopups()">Close</button>
        ${isOwn ? `<button class="btn btn-sm" style="color:var(--danger)" onclick="Reader._deleteNotation('${this.escapeHtml(notation.id)}')">Delete</button>` : ''}
      </div>
    `;
    document.body.appendChild(detail);
  },

  async _deleteNotation(nid) {
    if (!this.currentBook) return;
    const idx = this._notations.findIndex(n => n.id === nid);
    if (idx === -1) return;
    const notation = this._notations[idx];

    // Remove highlight
    if (notation.anchor && notation.anchor.startsWith('pdf:')) {
      document.querySelectorAll(`.boox-pdf-highlight[data-notation-id="${nid}"]`).forEach(s => {
        s.classList.remove('boox-pdf-highlight');
        delete s.dataset.notationId;
      });
    } else if (this.rendition) {
      try { this.rendition.annotations.remove(notation.anchor, 'highlight'); } catch (e) {}
    }

    this._notations.splice(idx, 1);
    this._dismissPopups();

    try {
      await BooxAPI.removeNotation(this.currentBook.id, nid);
    } catch (e) {
      console.error('Failed to delete notation:', e);
    }
  },

  // EPUB - using epub.js
  async openEpub(book) {
    this.fontSettings = this.loadFontSettings();
    const epubBook = ePub(book['s3-url']);
    this._epubBook = epubBook;
    this.rendition = epubBook.renderTo(this.container, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated',
      allowScriptedContent: true
    });

    // Restore position
    const pos = book.position;
    if (pos && pos.value) {
      this.rendition.display(pos.value);
    } else {
      this.rendition.display();
    }

    this.applyTheme();

    // Apply notation highlights after rendering
    this.rendition.on('started', () => {
      this._applyNotationHighlights();
    });

    // Track position & update progress meter
    let locationsReady = false;
    this.rendition.on('relocated', (location) => {
      if (!location || !location.start) return;
      const cfi = location.start.cfi;

      if (locationsReady) {
        const pct = epubBook.locations.percentageFromCfi(cfi);
        const progress = Math.round((pct || 0) * 100);
        this.savePosition(cfi, progress);
        if (typeof App !== 'undefined') App.updateProgressMeter(progress);
      } else if (location.start.displayed) {
        this.savePosition(cfi, 0);
      }
    });

    // Generate locations for progress tracking
    epubBook.ready.then(() =>
      epubBook.locations.generate(1600).then(() => { locationsReady = true; })
    );

    // Text selection for notations
    this.rendition.on('selected', (cfiRange, contents) => {
      if (!this.notationsVisible) return;
      const range = this.rendition.getRange(cfiRange);
      if (!range) return;
      const text = range.toString().trim();
      if (text.length < 3) return;
      this._showNotationPopup(cfiRange, text);
    });

    // Keyboard nav (iframe + outer document)
    this.rendition.on('keyup', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') this.rendition.next();
      if (e.key === 'ArrowLeft') this.rendition.prev();
    });
    this._keyHandler = (e) => {
      if (!this.rendition) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.rendition.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.rendition.prev(); }
    };
    document.addEventListener('keydown', this._keyHandler);

    // Tap zones: left 25% = prev, right 25% = next
    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.font-settings-panel, .chapter-list-panel, .notation-popup, .notation-detail, .notation-sidebar')) return;
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      if (x < w * 0.25) this.rendition.prev();
      else if (x > w * 0.75) this.rendition.next();
    });

    return { prev: () => this.rendition.prev(), next: () => this.rendition.next() };
  },

  // PDF - using pdf.js (with zoom controls + text layer for annotations)
  async openPdf(book) {
    let pdfScale = parseFloat(localStorage.getItem('boox-pdf-scale') || '0');
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-viewer';
    this.container.appendChild(wrapper);

    const pageWrap = document.createElement('div');
    pageWrap.className = 'pdf-page-wrap';
    wrapper.appendChild(pageWrap);

    const loadingTask = pdfjsLib.getDocument(book['s3-url']);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    let currentPage = 1;
    const pos = book.position;
    if (pos && pos.value) {
      currentPage = parseInt(pos.value) || 1;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    pageWrap.appendChild(canvas);

    // Text layer for selection + annotations
    let textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'pdf-text-layer';
    pageWrap.appendChild(textLayerDiv);

    const self = this;

    const renderPage = async (num) => {
      const page = await pdf.getPage(num);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const fitScale = (wrapper.clientWidth || window.innerWidth - 32) / unscaledViewport.width;
      const scale = pdfScale > 0 ? pdfScale : fitScale;

      const viewport = page.getViewport({ scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      pageWrap.style.width = viewport.width + 'px';
      pageWrap.style.height = viewport.height + 'px';

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Render text layer
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.height = viewport.height + 'px';
      const textContent = await page.getTextContent();
      // pdf.js 3.x uses pdfjsLib.renderTextLayer
      const renderTask = pdfjsLib.renderTextLayer({
        textContent,
        container: textLayerDiv,
        viewport,
        textDivs: []
      });
      await renderTask.promise;

      // Apply notation highlights for this page
      self._applyPdfHighlights(textLayerDiv, num);

      currentPage = num;
      const progress = Math.round((num / totalPages) * 100);
      this.savePosition(String(num), progress);
      if (typeof App !== 'undefined') App.updateProgressMeter(progress);
    };

    // Handle text selection for annotations
    textLayerDiv.addEventListener('mouseup', () => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text.length < 3) return;
      self._showNotationPopup('pdf:' + currentPage, text);
      sel.removeAllRanges();
    });

    // Keyboard nav for PDF
    this._keyHandler = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); if (currentPage < totalPages) renderPage(currentPage + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (currentPage > 1) renderPage(currentPage - 1); }
    };
    document.addEventListener('keydown', this._keyHandler);

    await renderPage(currentPage);

    const zoomIn = () => {
      pdf.getPage(currentPage).then(page => {
        const uv = page.getViewport({ scale: 1 });
        const fitScale = (wrapper.clientWidth || window.innerWidth - 32) / uv.width;
        const cur = pdfScale > 0 ? pdfScale : fitScale;
        pdfScale = Math.min(cur * 1.25, 5);
        localStorage.setItem('boox-pdf-scale', String(pdfScale));
        renderPage(currentPage);
      });
    };
    const zoomOut = () => {
      pdf.getPage(currentPage).then(page => {
        const uv = page.getViewport({ scale: 1 });
        const fitScale = (wrapper.clientWidth || window.innerWidth - 32) / uv.width;
        const cur = pdfScale > 0 ? pdfScale : fitScale;
        pdfScale = Math.max(cur * 0.8, 0.25);
        localStorage.setItem('boox-pdf-scale', String(pdfScale));
        renderPage(currentPage);
      });
    };
    const zoomFit = () => {
      pdfScale = 0;
      localStorage.setItem('boox-pdf-scale', '0');
      renderPage(currentPage);
    };

    return {
      prev: () => { if (currentPage > 1) renderPage(currentPage - 1); },
      next: () => { if (currentPage < totalPages) renderPage(currentPage + 1); },
      goTo: (n) => { if (n >= 1 && n <= totalPages) renderPage(n); },
      zoomIn, zoomOut, zoomFit,
      totalPages
    };
  },

  // Highlight matching notation text in the PDF text layer
  _applyPdfHighlights(textLayerDiv, pageNum) {
    if (!this.notationsVisible) return;
    const pageNotations = this._notations.filter(n =>
      n.anchor && n.anchor.startsWith('pdf:') && parseInt(n.anchor.split(':')[1]) === pageNum
    );
    if (!pageNotations.length) return;

    const spans = textLayerDiv.querySelectorAll('span');
    for (const n of pageNotations) {
      const needle = n.selected.toLowerCase();
      // Try to find spans containing parts of the selected text
      let found = false;
      for (const span of spans) {
        const spanText = span.textContent.toLowerCase();
        if (spanText.includes(needle) || needle.includes(spanText)) {
          if (spanText.trim().length > 0 && needle.includes(spanText.trim())) {
            span.classList.add('boox-pdf-highlight');
            span.dataset.notationId = n.id;
            span.addEventListener('click', (e) => {
              e.stopPropagation();
              this._showNotationDetail(n, e);
            });
            found = true;
          }
        }
      }
      // Fallback: try matching first few words
      if (!found) {
        const words = needle.split(/\s+/).slice(0, 4).join(' ');
        if (words.length > 3) {
          for (const span of spans) {
            if (span.textContent.toLowerCase().includes(words)) {
              span.classList.add('boox-pdf-highlight');
              span.dataset.notationId = n.id;
              span.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showNotationDetail(n, e);
              });
            }
          }
        }
      }
    }
  },

  // Plain text
  async openText(book) {
    const res = await fetch(book['s3-url']);
    const text = await res.text();

    const pre = document.createElement('pre');
    pre.className = 'text-reader';
    pre.textContent = text;
    this.container.appendChild(pre);

    const pos = book.position;
    if (pos && pos.value) {
      this.container.scrollTop = parseInt(pos.value) || 0;
    }

    let scrollTimer;
    this.container.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const scrollTop = this.container.scrollTop;
        const scrollHeight = this.container.scrollHeight - this.container.clientHeight;
        const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
        this.savePosition(String(Math.round(scrollTop)), progress);
      }, 500);
    });

    return {};
  },

  // Markdown
  async openMarkdown(book) {
    const res = await fetch(book['s3-url']);
    const text = await res.text();

    const div = document.createElement('div');
    div.className = 'md-reader';
    div.innerHTML = this.renderMarkdown(text);
    this.container.appendChild(div);

    const pos = book.position;
    if (pos && pos.value) {
      this.container.scrollTop = parseInt(pos.value) || 0;
    }

    let scrollTimer;
    this.container.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const scrollTop = this.container.scrollTop;
        const scrollHeight = this.container.scrollHeight - this.container.clientHeight;
        const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
        this.savePosition(String(Math.round(scrollTop)), progress);
      }, 500);
    });

    return {};
  },

  // HTML
  async openHtml(book) {
    const res = await fetch(book['s3-url']);
    const html = await res.text();

    const frame = document.createElement('iframe');
    frame.className = 'html-reader';
    frame.sandbox = 'allow-same-origin';
    this.container.appendChild(frame);

    frame.srcdoc = html;

    frame.onload = () => {
      const c = this.getThemeColors();
      const style = frame.contentDocument.createElement('style');
      style.textContent = `
        body { background: ${c.bg} !important; color: ${c.fg} !important;
               font-family: 'IBM Plex Serif', Georgia, serif; line-height: 1.7;
               max-width: 48rem; margin: 0 auto; padding: 2rem; }
        a { color: ${c.link} !important; }
        img { max-width: 100%; }
      `;
      frame.contentDocument.head.appendChild(style);

      const pos = book.position;
      if (pos && pos.value) {
        frame.contentWindow.scrollTo(0, parseInt(pos.value) || 0);
      }
    };

    return {};
  },

  // MOBI
  async openMobi(book) {
    const div = document.createElement('div');
    div.className = 'mobi-reader';
    div.innerHTML = '<p class="reader-loading">Loading MOBI file... This format has limited support. Consider converting to EPUB for best results.</p>';
    this.container.appendChild(div);

    try {
      const res = await fetch(book['s3-url']);
      const buffer = await res.arrayBuffer();
      if (window.MOBI) {
        const mobiBook = await MOBI.parse(buffer);
        div.innerHTML = mobiBook.html || mobiBook.text || '<p>Could not parse MOBI file</p>';
      } else {
        const bytes = new Uint8Array(buffer);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        const cleaned = text.replace(/[\x00-\x08\x0e-\x1f]/g, '')
                           .replace(/<[^>]*>/g, '\n')
                           .replace(/\n{3,}/g, '\n\n');
        div.innerHTML = `<pre class="text-reader">${this.escapeHtml(cleaned)}</pre>`;
      }
    } catch (e) {
      div.innerHTML = `<div class="reader-error">Failed to load MOBI: ${e.message}. Consider converting to EPUB.</div>`;
    }

    return {};
  },

  renderMarkdown(md) {
    let html = this.escapeHtml(md);
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/^- (.+)/gm, '<li>$1</li>');
    html = html.replace(/```[\s\S]*?```/g, (m) => {
      return '<pre><code>' + m.slice(3, -3) + '</code></pre>';
    });
    return '<p>' + html + '</p>';
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  savePosition(value, progress) {
    if (!this.currentBook) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      BooxAPI.setPosition(this.currentBook.id, value, progress).catch(() => {});
    }, 1000);
  }
};
