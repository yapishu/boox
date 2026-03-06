// Book reader module - handles rendering for all supported formats

const Reader = {
  container: null,
  currentBook: null,
  rendition: null,
  positionSaveTimer: null,
  fontSettings: null,

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
    this.currentBook = book;
    this.container = document.getElementById('reader-container');
    this.container.innerHTML = '';

    const format = book.format;
    switch (format) {
      case 'epub': return this.openEpub(book);
      case 'pdf':  return this.openPdf(book);
      case 'txt':  return this.openText(book);
      case 'md':   return this.openMarkdown(book);
      case 'html': return this.openHtml(book);
      case 'mobi': return this.openMobi(book);
      default:
        this.container.innerHTML = `<div class="reader-error">Unsupported format: ${format}</div>`;
    }
  },

  close() {
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
    const existing = document.getElementById('reader-font-settings');
    if (existing) existing.remove();
    const chList = document.getElementById('reader-chapter-list');
    if (chList) chList.remove();
    const container = document.getElementById('reader-container');
    if (container) container.innerHTML = '';
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
      'h1,h2,h3,h4,h5,h6': { 'color': `${c.fg} !important` }
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

  // EPUB - using epub.js
  async openEpub(book) {
    this.fontSettings = this.loadFontSettings();
    const epubBook = ePub(book['s3-url']);
    this._epubBook = epubBook;
    this.rendition = epubBook.renderTo(this.container, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated'
    });

    // Restore position
    const pos = book.position;
    if (pos && pos.value) {
      this.rendition.display(pos.value);
    } else {
      this.rendition.display();
    }

    this.applyTheme();

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

    // Keyboard nav
    this.rendition.on('keyup', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') this.rendition.next();
      if (e.key === 'ArrowLeft') this.rendition.prev();
    });

    // Tap zones: left 25% = prev, right 25% = next
    this.container.addEventListener('click', (e) => {
      // Ignore if clicking inside the settings/chapter panels
      if (e.target.closest('.font-settings-panel, .chapter-list-panel')) return;
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      if (x < w * 0.25) this.rendition.prev();
      else if (x > w * 0.75) this.rendition.next();
    });

    return { prev: () => this.rendition.prev(), next: () => this.rendition.next() };
  },

  // PDF - using pdf.js
  async openPdf(book) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-viewer';
    this.container.appendChild(wrapper);

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
    wrapper.appendChild(canvas);

    const renderPage = async (num) => {
      const page = await pdf.getPage(num);
      const containerWidth = wrapper.clientWidth;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: ctx, viewport }).promise;
      currentPage = num;
      const progress = Math.round((num / totalPages) * 100);
      this.savePosition(String(num), progress);
      if (typeof App !== 'undefined') App.updateProgressMeter(progress);
    };

    await renderPage(currentPage);

    return {
      prev: () => { if (currentPage > 1) renderPage(currentPage - 1); },
      next: () => { if (currentPage < totalPages) renderPage(currentPage + 1); },
      goTo: (n) => { if (n >= 1 && n <= totalPages) renderPage(n); },
      totalPages
    };
  },

  // Plain text
  async openText(book) {
    const res = await fetch(book['s3-url']);
    const text = await res.text();

    const pre = document.createElement('pre');
    pre.className = 'text-reader';
    pre.textContent = text;
    this.container.appendChild(pre);

    // Restore scroll position
    const pos = book.position;
    if (pos && pos.value) {
      this.container.scrollTop = parseInt(pos.value) || 0;
    }

    // Track scroll position
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
    // Simple markdown rendering
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
      // Inject dark theme
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

      // Restore position
      const pos = book.position;
      if (pos && pos.value) {
        frame.contentWindow.scrollTo(0, parseInt(pos.value) || 0);
      }
    };

    return {};
  },

  // MOBI - extract and render as HTML (basic extraction)
  async openMobi(book) {
    const div = document.createElement('div');
    div.className = 'mobi-reader';
    div.innerHTML = '<p class="reader-loading">Loading MOBI file... This format has limited support. Consider converting to EPUB for best results.</p>';
    this.container.appendChild(div);

    try {
      const res = await fetch(book['s3-url']);
      const buffer = await res.arrayBuffer();
      // Use mobi.js if available, otherwise show raw text extraction
      if (window.MOBI) {
        const mobiBook = await MOBI.parse(buffer);
        div.innerHTML = mobiBook.html || mobiBook.text || '<p>Could not parse MOBI file</p>';
      } else {
        // Fallback: try to extract text content
        const bytes = new Uint8Array(buffer);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        // Strip binary content, keep readable text
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

  // Simple markdown to HTML
  renderMarkdown(md) {
    let html = this.escapeHtml(md);
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold/italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Line breaks and paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    // Lists
    html = html.replace(/^- (.+)/gm, '<li>$1</li>');
    // Code blocks
    html = html.replace(/```[\s\S]*?```/g, (m) => {
      return '<pre><code>' + m.slice(3, -3) + '</code></pre>';
    });
    return '<p>' + html + '</p>';
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  savePosition(value, progress) {
    if (!this.currentBook) return;
    // Debounced save to avoid spamming the agent
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      BooxAPI.setPosition(this.currentBook.id, value, progress).catch(() => {});
    }, 1000);
  }
};
