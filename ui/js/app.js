// Boox - main application (Alex-inspired design)

window.toast = function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Convert hex MD5 string to @uv book ID, with random fallback
function hexToUv(hex) {
  if (!hex) return randomUv();
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (!clean) return randomUv();
  const n = BigInt('0x' + clean);
  const uvChars = '0123456789abcdefghijklmnopqrstuv';
  let result = '';
  let val = n;
  if (val === 0n) return '0v0';
  while (val > 0n) {
    result = uvChars[Number(val & 31n)] + result;
    val >>= 5n;
  }
  // Group from the RIGHT in chunks of 5, so the short group is at the left
  const groups = [];
  for (let i = result.length; i > 0; i -= 5) {
    groups.unshift(result.slice(Math.max(0, i - 5), i));
  }
  groups[0] = groups[0].replace(/^0+/, '') || '0';
  return '0v' + groups.join('.');
}

function randomUv() {
  const uvChars = '0123456789abcdefghijklmnopqrstuv';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let raw = '';
  for (const b of bytes) raw += uvChars[b & 31];
  // Group from the RIGHT in chunks of 5, so the short group is at the left
  const groups = [];
  for (let i = raw.length; i > 0; i -= 5) {
    groups.unshift(raw.slice(Math.max(0, i - 5), i));
  }
  groups[0] = groups[0].replace(/^0+/, '') || '0';
  return '0v' + groups.join('.');
}

window.App = {
  state: {
    books: [],
    view: 'library',
    currentBook: null,
    readerControls: null,
    s3Config: null,
    searchQuery: '',
    filterFormat: '',
    filterStatus: '',
    sortBy: 'recent',
    page: 1,
    perPage: parseInt(localStorage.getItem('boox-per-page') || '20'),
    collections: {},
    pendingItems: [],
    pals: [],
    theme: localStorage.getItem('boox-theme') || 'dark',
  },

  async init() {
    this.applyTheme();
    await this.loadBooks();
    await this.loadS3Config();
    this.render();
    this.bindEvents();
    window.addEventListener('boox-state-changed', () => this.loadBooks().then(() => {
      if (this.state.view === 'library') this.renderLibrary();
    }));
    window.addEventListener('popstate', () => {
      if (this.state.view === 'reader') this.showLibrary();
    });
    // Load annas domain for links
    try {
      const settings = await BooxAPI.getSettings();
      this._annasDomain = settings['annas-domain'] || 'annas-archive.gl';
    } catch (e) {}
    // Deep link: open book from URL hash (#read=<bookId>)
    this.checkHashOpen();
    // Backfill content hashes for existing books (once)
    this.backfillHashes();
  },

  checkHashOpen() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const bookId = params.get('read');
    if (bookId) this.openBook(bookId);
  },

  // -- Theme --

  applyTheme() {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(this.state.theme);
  },

  toggleTheme() {
    this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('boox-theme', this.state.theme);
    this.applyTheme();
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = this.state.theme === 'dark' ? '\u263E' : '\u2600';
  },

  // -- Data --

  _fixUrl(u) {
    return u && !/^https?:\/\//.test(u) ? 'https://' + u : u;
  },

  async loadBooks() {
    try {
      const data = await BooxAPI.getBooks();
      this.state.books = (data.books || []).map(b => {
        if (b['s3-url']) b['s3-url'] = this._fixUrl(b['s3-url']);
        if (b['cover-url']) b['cover-url'] = this._fixUrl(b['cover-url']);
        return b;
      });
    } catch (e) {
      console.error('Failed to load books:', e);
    }
  },

  async backfillHashes() {
    if (localStorage.getItem('boox-hashes-backfilled')) return;
    const needHash = this.state.books.filter(b => b['s3-url'] && !b['content-hash']);
    if (needHash.length === 0) {
      localStorage.setItem('boox-hashes-backfilled', '1');
      return;
    }
    console.log(`Backfilling content hashes for ${needHash.length} books...`);
    let filled = 0;
    for (const book of needHash) {
      try {
        // Use GET with range header to get ETag without downloading full file
        // HEAD often hides ETag behind CORS, but GET exposes it
        const resp = await fetch(book['s3-url'], {
          method: 'GET',
          headers: { 'Range': 'bytes=0-0' }
        });
        const etag = (resp.headers.get('ETag') || '').replace(/"/g, '');
        if (etag) {
          await BooxAPI.setBookHash(book.id, etag);
          filled++;
        }
      } catch (e) { /* skip */ }
    }
    if (filled > 0) await this.loadBooks();
    // Only mark done if we actually got some, otherwise CORS may be blocking
    if (filled > 0 || needHash.length === 0) {
      localStorage.setItem('boox-hashes-backfilled', '1');
    }
    console.log(`Backfilled ${filled}/${needHash.length} content hashes`);
  },

  async loadS3Config() {
    try {
      this.state.s3Config = await BooxAPI.getS3Config();
    } catch (e) {
      console.error('Failed to load S3 config:', e);
    }
  },

  async loadCollections() {
    try {
      const data = await BooxAPI.getCollections();
      this.state.collections = data.collections || {};
    } catch (e) {
      console.error('Failed to load collections:', e);
    }
  },

  // -- Events --

  bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (this.state.view !== 'reader') return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (this.state.readerControls?.next) this.state.readerControls.next();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.state.readerControls?.prev) this.state.readerControls.prev();
      }
      if (e.key === 'Escape') this.showLibrary();
    });
  },

  // -- Main render --

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="dashboard" id="dashboard">
        <div class="topbar" id="topbar">
          <div class="topbar-left">
            <span class="logo" onclick="App.showLibrary()">boox</span>
          </div>
          <div class="topbar-right">
            <div class="search-wrap">
              <span class="search-icon">\u2315</span>
              <input type="text" class="search-input" id="search-input"
                     placeholder="Search library..."
                     value="${this.escapeHtml(this.state.searchQuery)}"
                     oninput="App.onSearch(this.value)">
            </div>
            <button class="theme-toggle" id="theme-toggle"
                    onclick="App.toggleTheme()"
                    title="Toggle theme">${this.state.theme === 'dark' ? '\u263E' : '\u2600'}</button>
          </div>
        </div>

        <div id="filters-bar"></div>

        <div class="content" id="main-content">
          <div id="library-view"></div>
          <div id="collections-view" class="hidden"></div>
          <div id="upload-view" class="hidden"></div>
          <div id="settings-view" class="hidden"></div>
          <div id="feed-view" class="hidden"></div>
        </div>

        <div id="reader-view" class="reader-view hidden">
          <div class="reader-toolbar" id="reader-toolbar">
            <div class="reader-toolbar-left">
              <button class="btn btn-ghost btn-sm" onclick="App.showLibrary()">\u2190 Back</button>
              <button class="btn btn-ghost btn-sm" onclick="Reader.toggleChapterList()" title="Chapters">\u2630</button>
              <span id="reader-title"></span>
            </div>
            <div class="reader-toolbar-center">
              <div class="progress-meter" id="progress-meter">
                <div class="progress-meter-bar">
                  <div class="progress-meter-fill" id="progress-meter-fill" style="width:0%"></div>
                </div>
                <span class="progress-meter-text" id="progress-meter-text">0%</span>
              </div>
            </div>
            <div class="reader-toolbar-right">
              <button class="btn btn-ghost btn-sm" onclick="App.readerPrev()" title="Previous">\u2190</button>
              <button class="btn btn-ghost btn-sm" onclick="App.readerNext()" title="Next">\u2192</button>
              <button class="btn btn-ghost btn-sm" id="zoom-in-btn" onclick="App.readerZoomIn()" title="Zoom in" style="display:none">+</button>
              <button class="btn btn-ghost btn-sm" id="zoom-out-btn" onclick="App.readerZoomOut()" title="Zoom out" style="display:none">\u2212</button>
              <button class="btn btn-ghost btn-sm" id="zoom-fit-btn" onclick="App.readerZoomFit()" title="Fit width" style="display:none">\u{1F5D6}</button>
              <button class="btn btn-ghost btn-sm" onclick="Reader.toggleNotationList()" title="Notations">\u{1F4DD}</button>
              <button class="btn btn-ghost btn-sm" onclick="Reader.toggleNotations()" id="notations-toggle-btn" title="Toggle highlights">\u{1F58D}</button>
              <button class="btn btn-ghost btn-sm" onclick="Reader.toggleSettingsPanel()" title="Font settings">Aa</button>
            </div>
          </div>
          <div id="reader-container" class="reader-container"></div>
        </div>
      </div>

      <nav class="floating-nav" id="floating-nav">
        <button class="nav-item active" onclick="App.showLibrary()" data-view="library">
          <span class="nav-icon">\u{1F4DA}</span><span class="nav-label">Library</span>
        </button>
        <button class="nav-item" onclick="App.showCollections()" data-view="collections">
          <span class="nav-icon">\u{1F517}</span><span class="nav-label">Collections</span>
        </button>
        <button class="nav-item" onclick="App.showUpload()" data-view="upload">
          <span class="nav-icon">\u2191</span><span class="nav-label">Upload</span>
        </button>
        <button class="nav-item" onclick="App.showFeed()" data-view="feed">
          <span class="nav-icon">\u{1F4E1}</span><span class="nav-label">Feed</span>
        </button>
        <button class="nav-item" onclick="App.showSettings()" data-view="settings">
          <span class="nav-icon">\u2699</span><span class="nav-label">Settings</span>
        </button>
      </nav>
    `;
    this.renderFilters();
    this.renderLibrary();
  },

  setActiveNav(view) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });
  },

  // -- Filters --

  renderFilters() {
    const bar = document.getElementById('filters-bar');
    if (!bar) return;
    bar.innerHTML = `
      <div class="filters">
        <div class="filter-group">
          ${['', 'epub', 'pdf', 'mobi', 'txt'].map(f =>
            `<button class="filter-pill ${this.state.filterFormat === f ? 'active' : ''}"
                    onclick="App.setFilter('format','${f}')">${f ? f.toUpperCase() : 'All'}</button>`
          ).join('')}
        </div>
        <div class="filter-group">
          ${[['', 'All'], ['reading', 'Reading'], ['completed', 'Done'], ['not_started', 'New']].map(([v, l]) =>
            `<button class="filter-pill ${this.state.filterStatus === v ? 'active' : ''}"
                    onclick="App.setFilter('status','${v}')">${l}</button>`
          ).join('')}
        </div>
        <div class="filters-right">
          <select class="sort-select" onchange="App.setFilter('sort', this.value)">
            <option value="recent" ${this.state.sortBy === 'recent' ? 'selected' : ''}>Recent</option>
            <option value="title" ${this.state.sortBy === 'title' ? 'selected' : ''}>Title</option>
            <option value="author" ${this.state.sortBy === 'author' ? 'selected' : ''}>Author</option>
          </select>
        </div>
      </div>
    `;
  },

  setFilter(type, value) {
    if (type === 'format') this.state.filterFormat = value;
    else if (type === 'status') this.state.filterStatus = value;
    else if (type === 'sort') this.state.sortBy = value;
    this.state.page = 1;
    this.renderFilters();
    this.renderLibrary();
  },

  // -- Library --

  getBookStatus(book) {
    const p = book.position ? book.position.progress : 0;
    if (p >= 100) return 'completed';
    if (p > 0) return 'reading';
    return 'not_started';
  },

  getFilteredBooks() {
    let books = [...this.state.books];

    if (this.state.searchQuery) {
      const q = this.state.searchQuery.toLowerCase();
      books = books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (this.state.filterFormat) {
      books = books.filter(b => b.format === this.state.filterFormat);
    }

    if (this.state.filterStatus) {
      books = books.filter(b => this.getBookStatus(b) === this.state.filterStatus);
    }

    if (this.state.sortBy === 'title') {
      books.sort((a, b) => a.title.localeCompare(b.title));
    } else if (this.state.sortBy === 'author') {
      books.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
    } else if (this.state.sortBy === 'recent') {
      books.reverse();
    }

    return books;
  },

  renderLibrary() {
    const container = document.getElementById('library-view');
    if (!container) return;

    const books = this.getFilteredBooks();
    const readingBooks = this.state.books.filter(b => this.getBookStatus(b) === 'reading');

    if (this.state.books.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">\u{1F4DA}</div>
          <h2>Your library is empty</h2>
          <p>Upload some books to get started.</p>
          <button class="btn btn-primary" onclick="App.showUpload()">Upload your first book</button>
        </div>
      `;
      return;
    }

    let html = '';

    // Now Reading shelf
    if (readingBooks.length > 0 && !this.state.searchQuery && !this.state.filterFormat && !this.state.filterStatus) {
      html += `
        <div style="margin-bottom: 0.5rem;">
          <div class="section-label">Now Reading</div>
          <div class="now-reading-shelf">
            ${readingBooks.map(book => this.renderNowReadingCard(book)).join('')}
          </div>
        </div>
      `;
    }

    // Pagination
    const perPage = this.state.perPage;
    const page = this.state.page;
    const totalPages = Math.ceil(books.length / perPage);
    const pageBooks = books.slice((page - 1) * perPage, page * perPage);

    // Main grid
    if (books.length === 0) {
      html += `
        <div class="empty-state">
          <p>No books match your filters.</p>
        </div>
      `;
    } else {
      html += `
        <div class="library-header">
          <div class="section-label">${books.length} book${books.length !== 1 ? 's' : ''}</div>
          <div class="per-page-select">
            <select onchange="App.setPerPage(+this.value)">
              ${[10, 20, 50].map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <span>per page</span>
          </div>
        </div>
        <div class="book-grid">
          ${pageBooks.map(book => this.renderBookCard(book)).join('')}
        </div>
      `;
      if (totalPages > 1) {
        html += `<div class="pagination">`;
        html += `<button class="btn btn-sm" onclick="App.goPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>&lsaquo; Prev</button>`;
        html += `<span class="page-info">Page ${page} of ${totalPages}</span>`;
        html += `<button class="btn btn-sm" onclick="App.goPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next &rsaquo;</button>`;
        html += `</div>`;
      }
    }

    container.innerHTML = html;
  },

  renderNowReadingCard(book) {
    const progress = book.position ? book.position.progress : 0;
    const coverStyle = book['cover-url']
      ? `background-image: url('${this.escapeHtml(book['cover-url'])}')`
      : '';

    return `
      <div class="now-reading-card" onclick="App.openBook('${book.id}')">
        <button class="now-reading-dismiss" onclick="event.stopPropagation();App.dismissNowReading('${book.id}')" title="Dismiss">&times;</button>
        <div class="now-reading-cover" style="${coverStyle}">
          ${!book['cover-url'] ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.6rem;color:var(--text-muted);padding:0.25rem;text-align:center">${this.escapeHtml(book.title).slice(0, 20)}</div>` : ''}
        </div>
        <div class="now-reading-info">
          <div class="now-reading-title">${this.escapeHtml(book.title)}</div>
          <div class="now-reading-author">${this.escapeHtml(book.author || 'Unknown')}</div>
          <div class="now-reading-progress">
            <div class="progress-bar" style="flex:1">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
            <span class="progress-text">${progress}%</span>
          </div>
        </div>
      </div>
    `;
  },

  renderBookCard(book) {
    const status = this.getBookStatus(book);
    const progress = book.position ? book.position.progress : 0;
    const hasCover = !!book['cover-url'];

    let statusBadge = '';
    if (status === 'reading') {
      statusBadge = '<span class="card-badge badge-reading">Reading</span>';
    } else if (status === 'completed') {
      statusBadge = '<span class="card-badge badge-completed">Done</span>';
    }

    return `
      <div class="book-card" onclick="App.openBook('${book.id}')">
        <div class="book-cover" ${hasCover ? `style="background:none"` : ''}>
          ${hasCover
            ? `<img class="cover-img" src="${this.escapeHtml(book['cover-url'])}" alt="" loading="lazy">`
            : `<div class="book-cover-placeholder">
                <span class="cover-title">${this.escapeHtml(book.title)}</span>
                <span class="cover-author">${this.escapeHtml(book.author || '')}</span>
              </div>`
          }
          ${statusBadge}
          <span class="card-badge badge-format fmt-${book.format}">${book.format.toUpperCase()}</span>
          ${status === 'reading' ? `
            <div class="card-progress">
              <div class="card-progress-fill" style="width:${progress}%"></div>
            </div>
          ` : ''}
        </div>
        <div class="card-meta">
          <div class="card-title">${this.escapeHtml(book.title)}</div>
          <div class="card-author">${this.escapeHtml(book.author || 'Unknown')}</div>
        </div>
        <button class="card-menu-btn" onclick="event.stopPropagation(); App.showBookMenu('${book.id}', event)">&#8942;</button>
      </div>
    `;
  },

  showBookMenu(bookId, event) {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    const book = this.state.books.find(b => b.id === bookId);
    const hash = book?.['content-hash'] || '';
    const dom = this._annasDomain || 'annas-archive.gl';
    const annasLink = hash
      ? `https://${dom}/md5/${hash}`
      : (book ? `https://${dom}/search?q=${encodeURIComponent(book.title)}` : '');
    const annasAuthorLink = book?.author
      ? `https://${dom}/search?q=${encodeURIComponent(book.author)}`
      : '';
    menu.innerHTML = `
      <button onclick="App.editBook('${bookId}')">Edit metadata</button>
      <button onclick="App.showAddToCollection('${bookId}')">Add to collection</button>
      <button onclick="App.showSendToFriend('${bookId}')">Send to pal</button>
      <button onclick="App.scrobbleToLast('${bookId}')">Scrobble to %last</button>
      ${annasLink ? `<button onclick="window.open('${annasLink}', '_blank')">Anna's${hash ? '' : ' (search)'}</button>` : ''}
      ${annasAuthorLink ? `<button onclick="window.open('${annasAuthorLink}', '_blank')">Author on Anna's</button>` : ''}
      <button onclick="App.confirmDeleteBook('${bookId}')" style="color:var(--danger)">Delete</button>
    `;
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function handler() {
        menu.remove();
        document.removeEventListener('click', handler);
      });
    }, 10);
  },

  async showAddToCollection(bookId) {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    await this.loadCollections();
    const names = Object.keys(this.state.collections);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h2>Add to Collection</h2>
        ${names.length > 0 ? `
          <div class="coll-pick-list">
            ${names.map(n => `
              <button class="coll-pick-item" onclick="App.doAddToCollection('${this.escapeHtml(n)}', '${bookId}'); this.closest('.modal-overlay').remove()">
                ${this.escapeHtml(n)}
                <span class="coll-pick-count">${this.state.collections[n].books.length} books</span>
              </button>
            `).join('')}
          </div>
        ` : '<p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">No collections yet.</p>'}
        <div class="form-group" style="margin-top:1rem">
          <label>Or create new collection</label>
          <div style="display:flex;gap:0.5rem">
            <input type="text" id="new-coll-name" placeholder="Collection name" style="flex:1">
            <button class="btn btn-primary btn-sm" onclick="App.doCreateAndAdd('${bookId}')">Create & Add</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  },

  async doAddToCollection(name, bookId) {
    try {
      await BooxAPI.addToCollection(name, bookId);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  async doCreateAndAdd(bookId) {
    const name = document.getElementById('new-coll-name')?.value?.trim();
    if (!name) return;
    try {
      await BooxAPI.createCollection(name, '');
      await BooxAPI.addToCollection(name, bookId);
      document.querySelector('.modal-overlay')?.remove();
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  // -- Views --

  hideAllViews() {
    document.getElementById('library-view')?.classList.add('hidden');
    document.getElementById('reader-view')?.classList.add('hidden');
    document.getElementById('settings-view')?.classList.add('hidden');
    document.getElementById('upload-view')?.classList.add('hidden');
    document.getElementById('collections-view')?.classList.add('hidden');
    document.getElementById('feed-view')?.classList.add('hidden');
  },

  showDashboard() {
    document.getElementById('dashboard')?.classList.remove('hidden');
    document.getElementById('floating-nav')?.classList.remove('hidden');
    document.getElementById('topbar')?.classList.remove('hidden');
    document.getElementById('filters-bar')?.classList.remove('hidden');
  },

  hideDashboard() {
    document.getElementById('topbar')?.classList.add('hidden');
    document.getElementById('floating-nav')?.classList.add('hidden');
    document.getElementById('filters-bar')?.classList.add('hidden');
  },

  showLibrary() {
    this.state.view = 'library';
    Reader.close();
    history.replaceState(null, '', location.pathname);
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('library-view').classList.remove('hidden');
    this.setActiveNav('library');
    this.renderLibrary();
  },

  async dismissNowReading(bookId) {
    try {
      await BooxAPI.setPosition(bookId, '', 0);
      const book = this.state.books.find(b => b.id === bookId);
      if (book && book.position) book.position.progress = 0;
      this.renderLibrary();
    } catch (e) {
      console.error('Failed to dismiss:', e);
    }
  },

  setPerPage(n) {
    this.state.perPage = n;
    this.state.page = 1;
    localStorage.setItem('boox-per-page', n);
    this.renderLibrary();
  },

  goPage(n) {
    this.state.page = Math.max(1, n);
    this.renderLibrary();
    document.getElementById('library-container')?.scrollIntoView({ behavior: 'smooth' });
  },

  // -- Reader --

  async openBook(bookId) {
    let book = this.state.books.find(b => b.id === bookId);
    if (!book) return;

    // Fetch full book detail (includes notations)
    try {
      const detail = await BooxAPI.getBook(bookId);
      book = { ...book, notations: detail.notations || [] };
    } catch (e) {}

    this.state.currentBook = book;
    this.state.view = 'reader';
    history.pushState({ view: 'reader' }, '');

    // Set URL hash for deep linking
    location.hash = 'read=' + bookId;

    this.hideDashboard();
    this.hideAllViews();
    document.getElementById('reader-view').classList.remove('hidden');
    document.getElementById('reader-title').textContent = book.title;

    // Reset progress meter
    this.updateProgressMeter(book.position ? book.position.progress : 0);

    try {
      this.state.readerControls = await Reader.open(book);
      // Show zoom buttons for PDF
      const isPdf = book.format === 'pdf';
      ['zoom-in-btn', 'zoom-out-btn', 'zoom-fit-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isPdf ? '' : 'none';
      });
    } catch (e) {
      console.error('Failed to open book:', e);
      document.getElementById('reader-container').innerHTML =
        `<div class="reader-error">Failed to open: ${e.message}</div>`;
    }
  },

  updateProgressMeter(pct) {
    const fill = document.getElementById('progress-meter-fill');
    const text = document.getElementById('progress-meter-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
  },

  readerPrev() {
    if (this.state.readerControls?.prev) this.state.readerControls.prev();
  },
  readerNext() {
    if (this.state.readerControls?.next) this.state.readerControls.next();
  },
  readerZoomIn() {
    if (this.state.readerControls?.zoomIn) this.state.readerControls.zoomIn();
  },
  readerZoomOut() {
    if (this.state.readerControls?.zoomOut) this.state.readerControls.zoomOut();
  },
  readerZoomFit() {
    if (this.state.readerControls?.zoomFit) this.state.readerControls.zoomFit();
  },

  // -- Upload --

  showUpload() {
    this.state.view = 'upload';
    this._pendingFile = null;
    this._pendingCoverFile = null;
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('upload-view').classList.remove('hidden');
    document.getElementById('filters-bar').classList.add('hidden');
    this.setActiveNav('upload');
    this.renderUploadView();
  },

  renderUploadView() {
    const view = document.getElementById('upload-view');
    view.innerHTML = `
      <div class="upload-panel">
        <h2>Upload Books</h2>
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone-content">
            <div class="drop-icon">\u{1F4C4}</div>
            <p>Drag and drop files here, or click to browse</p>
            <p class="drop-hint">EPUB, PDF, MOBI, TXT, MD, HTML &mdash; select multiple files for bulk upload</p>
            <input type="file" id="file-input" multiple
                   accept=".pdf,.epub,.mobi,.txt,.md,.html,.htm"
                   onchange="App.handleFileSelect(event)" hidden>
          </div>
        </div>
        <div id="upload-form-area"></div>
      </div>
    `;
    const dropZone = document.getElementById('drop-zone');
    dropZone.onclick = () => document.getElementById('file-input').click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
    dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 1) this.prepareUpload(files[0]);
      else if (files.length > 1) this.prepareBulkUpload(files);
    };
  },

  handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 1) this.prepareUpload(files[0]);
    else if (files.length > 1) this.prepareBulkUpload(files);
  },

  async prepareUpload(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const formats = { pdf: 'pdf', epub: 'epub', mobi: 'mobi', txt: 'txt', md: 'md', html: 'html', htm: 'html' };
    const format = formats[ext];
    if (!format) {
      document.getElementById('upload-form-area').innerHTML =
        `<div class="upload-item error"><span class="upload-status" style="color:var(--danger)">Unsupported: ${this.escapeHtml(file.name)}</span></div>`;
      return;
    }
    this._pendingFile = file;
    this._pendingFormat = format;
    this._pendingCoverFile = null;

    await this.loadCollections();
    const collNames = Object.keys(this.state.collections);

    const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const sizeStr = file.size > 1048576
      ? (file.size / 1048576).toFixed(1) + ' MB'
      : (file.size / 1024).toFixed(0) + ' KB';

    document.getElementById('upload-form-area').innerHTML = `
      <div class="upload-form-card">
        <div class="upload-form-file">
          <span class="card-badge fmt-${format}" style="position:static">${format.toUpperCase()}</span>
          ${this.escapeHtml(file.name)}
          <span class="upload-form-size">${sizeStr}</span>
        </div>
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="upload-title" value="${this.escapeHtml(title)}">
        </div>
        <div class="form-group">
          <label>Author</label>
          <input type="text" id="upload-author" placeholder="Author name">
        </div>
        <div class="form-group">
          <label>Tags (comma separated)</label>
          <input type="text" id="upload-tags" placeholder="fiction, sci-fi, ...">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="upload-description" rows="2" placeholder="Optional"></textarea>
        </div>
        <div class="form-group">
          <label>Cover Image</label>
          <div class="cover-input-row">
            <input type="text" id="upload-cover-url" placeholder="Paste image URL..."
                   oninput="App.previewCover(this.value)">
            <label class="btn btn-sm cover-file-btn">
              Upload
              <input type="file" id="cover-file-input" accept="image/*"
                     onchange="App.handleCoverFile(event)" hidden>
            </label>
          </div>
          <div id="cover-preview"></div>
        </div>
        ${collNames.length > 0 ? `
        <div class="form-group">
          <label>Add to Collections</label>
          <div class="upload-coll-picks">
            ${collNames.map(n => `
              <label class="upload-coll-pick">
                <input type="checkbox" value="${this.escapeHtml(n)}" class="upload-coll-check">
                ${this.escapeHtml(n)}
              </label>
            `).join('')}
          </div>
        </div>
        ` : ''}
        <div id="upload-progress-area"></div>
        <div class="upload-form-actions">
          <button class="btn" onclick="App.renderUploadView()">Cancel</button>
          <button class="btn btn-primary" id="upload-submit-btn" onclick="App.submitUpload()">Upload Book</button>
        </div>
      </div>
    `;
  },

  previewCover(url) {
    const preview = document.getElementById('cover-preview');
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      preview.innerHTML = `<img src="${this.escapeHtml(url)}" class="cover-preview-img"
        onerror="this.parentElement.innerHTML=''">`;
    } else {
      preview.innerHTML = '';
    }
  },

  handleCoverFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    this._pendingCoverFile = file;
    const url = URL.createObjectURL(file);
    document.getElementById('cover-preview').innerHTML =
      `<img src="${url}" class="cover-preview-img">`;
    document.getElementById('upload-cover-url').value = file.name;
    document.getElementById('upload-cover-url').disabled = true;
  },

  async submitUpload() {
    const file = this._pendingFile;
    const format = this._pendingFormat;
    if (!file) return;

    const title = document.getElementById('upload-title').value || file.name;
    const author = document.getElementById('upload-author').value || '';
    const tags = document.getElementById('upload-tags').value
      .split(',').map(t => t.trim()).filter(Boolean);
    const description = document.getElementById('upload-description').value || '';
    const coverUrlInput = document.getElementById('upload-cover-url').value || '';

    const btn = document.getElementById('upload-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    const progressArea = document.getElementById('upload-progress-area');
    progressArea.innerHTML = `
      <div class="upload-item">
        <div class="upload-file-name">Uploading...</div>
        <div class="upload-progress"><div class="upload-progress-bar" id="upload-bar"></div></div>
        <span class="upload-status" id="upload-status">0%</span>
      </div>
    `;

    try {
      const result = await S3Upload.upload(file, (pct) => {
        const bar = document.getElementById('upload-bar');
        if (bar) bar.style.width = pct + '%';
        const status = document.getElementById('upload-status');
        if (status) status.textContent = pct + '%';
      });

      let coverUrl = '';
      if (this._pendingCoverFile) {
        const statusEl = document.getElementById('upload-status');
        if (statusEl) statusEl.textContent = 'Cover...';
        const coverResult = await S3Upload.upload(this._pendingCoverFile);
        coverUrl = coverResult.url;
      } else {
        coverUrl = coverUrlInput;
      }

      const statusEl = document.getElementById('upload-status');
      if (statusEl) statusEl.textContent = 'Saving...';

      const bookId = hexToUv(result.etag);

      await BooxAPI.addBook(bookId, {
        title, author, format,
        's3-url': result.url,
        'cover-url': coverUrl,
        'file-size': file.size,
        tags, description
      });

      // Store content hash from S3 ETag
      if (result.etag) {
        try { await BooxAPI.setBookHash(bookId, result.etag); } catch (e) { console.warn('hash:', e); }
      }

      // Add to selected collections
      const selectedColls = [...document.querySelectorAll('.upload-coll-check:checked')]
        .map(cb => cb.value);
      for (const name of selectedColls) {
        try { await BooxAPI.addToCollection(name, bookId); } catch (e) { console.warn(e); }
      }

      await this.loadBooks();

      document.getElementById('upload-form-area').innerHTML = `
        <div class="upload-success">
          <p>\u2713 "${this.escapeHtml(title)}" uploaded!${selectedColls.length > 0 ? ` Added to: ${selectedColls.join(', ')}` : ''}</p>
          <button class="btn btn-primary" onclick="App.renderUploadView()">Upload Another</button>
        </div>
      `;
    } catch (e) {
      progressArea.innerHTML = `<div class="upload-item error">
        <span class="upload-status" style="color:var(--danger)">Failed: ${this.escapeHtml(e.message)}</span>
      </div>`;
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  },

  // -- Bulk Upload --

  prepareBulkUpload(files) {
    const formats = { pdf: 'pdf', epub: 'epub', mobi: 'mobi', txt: 'txt', md: 'md', html: 'html', htm: 'html' };
    const items = [];
    const rejected = [];
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      const format = formats[ext];
      if (format) {
        items.push({ file, format, title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') });
      } else {
        rejected.push(file.name);
      }
    }
    this._bulkItems = items;

    const sizeTotal = items.reduce((s, i) => s + i.file.size, 0);
    const sizeStr = sizeTotal > 1048576
      ? (sizeTotal / 1048576).toFixed(1) + ' MB'
      : (sizeTotal / 1024).toFixed(0) + ' KB';

    const area = document.getElementById('upload-form-area');
    area.innerHTML = `
      <div class="upload-form-card">
        <div class="bulk-summary">
          <strong>${items.length} file${items.length !== 1 ? 's' : ''}</strong> ready (${sizeStr} total)
          ${rejected.length ? `<div class="bulk-rejected">${rejected.length} unsupported: ${rejected.map(n => this.escapeHtml(n)).join(', ')}</div>` : ''}
        </div>
        <div class="bulk-file-list" id="bulk-file-list">
          ${items.map((item, i) => `
            <div class="bulk-file-row" id="bulk-row-${i}">
              <span class="card-badge fmt-${item.format}" style="position:static">${item.format.toUpperCase()}</span>
              <span class="bulk-file-name">${this.escapeHtml(item.file.name)}</span>
              <span class="bulk-file-status" id="bulk-status-${i}">Pending</span>
            </div>
          `).join('')}
        </div>
        <div class="upload-form-actions">
          <button class="btn" onclick="App.renderUploadView()">Cancel</button>
          <button class="btn btn-primary" id="bulk-upload-btn" onclick="App.submitBulkUpload()">Upload All</button>
        </div>
      </div>
    `;
  },

  async submitBulkUpload() {
    const items = this._bulkItems;
    if (!items || !items.length) return;

    const btn = document.getElementById('bulk-upload-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const statusEl = document.getElementById(`bulk-status-${i}`);
      const rowEl = document.getElementById(`bulk-row-${i}`);

      try {
        if (statusEl) statusEl.textContent = 'Uploading...';
        if (rowEl) rowEl.classList.add('bulk-active');

        const result = await S3Upload.upload(item.file, (pct) => {
          if (statusEl) statusEl.textContent = pct + '%';
        });

        if (statusEl) statusEl.textContent = 'Saving...';

        const bookId = randomUv();

        await BooxAPI.addBook(bookId, {
          title: item.title,
          author: '',
          format: item.format,
          's3-url': result.url,
          'cover-url': '',
          'file-size': item.file.size,
          tags: [],
          description: ''
        });

        if (statusEl) { statusEl.textContent = '\u2713'; statusEl.classList.add('bulk-done'); }
        if (rowEl) { rowEl.classList.remove('bulk-active'); rowEl.classList.add('bulk-done'); }
        succeeded++;
      } catch (e) {
        if (statusEl) { statusEl.textContent = 'Failed'; statusEl.classList.add('bulk-error'); }
        if (rowEl) { rowEl.classList.remove('bulk-active'); rowEl.classList.add('bulk-error'); }
        failed++;
      }
    }

    await this.loadBooks();

    btn.textContent = `Done (${succeeded} uploaded${failed ? ', ' + failed + ' failed' : ''})`;
    btn.onclick = () => this.showLibrary();
    btn.disabled = false;
    btn.classList.remove('btn-primary');
    if (!failed) btn.classList.add('btn-primary');
  },

  // -- Collections --

  async showCollections() {
    this.state.view = 'collections';
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('collections-view').classList.remove('hidden');
    document.getElementById('filters-bar').classList.add('hidden');
    this.setActiveNav('collections');
    await this.loadCollections();
    await this.loadPals();
    this.renderCollections();
    this.filterPals();
    this.loadPending();
  },

  async loadPals() {
    try {
      const data = await BooxAPI.getPals();
      this.state.pals = data.pals || [];
    } catch (e) {
      this.state.pals = [];
    }
  },

  filterPals() {
    const el = document.getElementById('pals-list');
    if (!el) return;
    const pals = this.state.pals;
    if (pals.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No pals or contacts found.</p>';
      return;
    }
    const input = document.getElementById('friend-ship');
    const filter = (input ? input.value : '').replace(/^~?/, '~').toLowerCase();
    const filtered = filter.length > 1
      ? pals.filter(s => s.includes(filter))
      : pals;
    const shown = filtered.slice(0, 10);
    const remaining = filtered.length - shown.length;
    let html = '<div style="display:flex;flex-wrap:wrap;gap:0.375rem;margin-bottom:0.5rem">';
    html += shown.map(p =>
      `<button class="btn btn-sm" onclick="document.getElementById('friend-ship').value='${this.escapeHtml(p)}'; App.browseFriend();">${this.escapeHtml(p)}</button>`
    ).join('');
    html += '</div>';
    if (remaining > 0) {
      html += `<p style="color:var(--text-muted);font-size:0.75rem">${remaining} more — type to filter</p>`;
    }
    if (filter.length > 1 && filtered.length === 0) {
      html = '<p style="color:var(--text-muted);font-size:0.8rem">No matching peers</p>';
    }
    el.innerHTML = html;
  },

  renderCollections() {
    const view = document.getElementById('collections-view');
    if (!view) return;
    const colls = this.state.collections;
    const names = Object.keys(colls);

    view.innerHTML = `
      <div class="collections-panel">
        <div class="collections-header">
          <h2>Collections</h2>
          <button class="btn btn-sm" onclick="App.showCreateCollection()">+ New Collection</button>
        </div>

        ${names.length === 0 ? `
          <div class="empty-state" style="padding:2rem">
            <p style="color:var(--text-secondary)">No collections yet. Create one to organize and share your books.</p>
          </div>
        ` : `
          <div class="coll-list">
            ${names.map(name => {
              const c = colls[name];
              const bookCount = c.books ? c.books.length : 0;
              return `
                <div class="coll-item" onclick="App.showCollectionDetail('${this.escapeHtml(name)}')">
                  <div class="coll-item-info">
                    <div class="coll-item-name">${this.escapeHtml(name)}</div>
                    <div class="coll-item-meta">
                      ${bookCount} book${bookCount !== 1 ? 's' : ''}
                      ${c.description ? ' \u2014 ' + this.escapeHtml(c.description) : ''}
                    </div>
                  </div>
                  <div class="coll-item-badges">
                    ${c.shared ? '<span class="coll-badge coll-badge-shared">Shared</span>' : ''}
                    ${c.public ? '<span class="coll-badge coll-badge-public">Public</span>' : ''}
                  </div>
                  <span class="coll-item-arrow">\u203A</span>
                </div>
              `;
            }).join('')}
          </div>
        `}

        <div class="collections-section" style="margin-top:2rem">
          <div class="section-label">Pending Imports</div>
          <div id="pending-imports"></div>
        </div>

        <div class="collections-section" style="margin-top:2rem">
          <div class="section-label">Browse Pals</div>
          <div class="browse-friends">
            <p class="settings-hint">Browse shared collections from your pals and contacts.</p>
            <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem">
              <input type="text" id="friend-ship" class="search-input" style="max-width:none;flex:1;padding-left:0.75rem"
                     placeholder="~sampel-palnet" value="${this.escapeHtml(localStorage.getItem('boox-last-friend-ship') || '')}"
                     oninput="App.filterPals()">
              <button class="btn btn-primary btn-sm" onclick="App.browseFriend()">Browse</button>
            </div>
            <div id="pals-list"></div>
            <div id="friend-results"></div>
          </div>
        </div>
      </div>
    `;
  },

  showCreateCollection() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h2>New Collection</h2>
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="new-coll-name-modal" placeholder="e.g. Sci-Fi Favorites">
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="new-coll-desc" rows="2" placeholder="What's this collection about?"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="App.doCreateCollection()">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.getElementById('new-coll-name-modal').focus();
  },

  async doCreateCollection() {
    const name = document.getElementById('new-coll-name-modal')?.value?.trim();
    const desc = document.getElementById('new-coll-desc')?.value?.trim() || '';
    if (!name) return;
    try {
      await BooxAPI.createCollection(name, desc);
      document.querySelector('.modal-overlay')?.remove();
      await this.loadCollections();
      this.renderCollections();
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  async showCollectionDetail(name) {
    await this.loadCollections();
    const coll = this.state.collections[name];
    if (!coll) return;

    const bookIds = coll.books || [];
    const collBooks = bookIds.map(id => this.state.books.find(b => b.id === id)).filter(Boolean);
    const publicUrl = coll.public && coll['share-token']
      ? `${window.location.origin}/apps/boox/api/public/${coll['share-token']}/page`
      : null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
          <h2 style="margin:0">${this.escapeHtml(name)}</h2>
          <button class="btn btn-sm" style="color:var(--danger)" onclick="App.confirmDeleteCollection('${this.escapeHtml(name)}')">Delete</button>
        </div>
        ${coll.description ? `<p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">${this.escapeHtml(coll.description)}</p>` : ''}

        <div class="coll-detail-section">
          <div class="section-label">Sharing</div>
          <div class="coll-sharing-controls">
            <label class="toggle-row">
              <span>Discoverable (scry)</span>
              <button class="toggle-btn ${coll.shared ? 'active' : ''}" onclick="App.toggleShare('${this.escapeHtml(name)}', ${!coll.shared})">
                ${coll.shared ? 'On' : 'Off'}
              </button>
            </label>
            <label class="toggle-row">
              <span>Public link (HTTP)</span>
              <button class="toggle-btn ${coll.public ? 'active' : ''}" onclick="App.togglePublish('${this.escapeHtml(name)}', ${!coll.public})">
                ${coll.public ? 'On' : 'Off'}
              </button>
            </label>
            ${coll.public ? `
            <label class="toggle-row">
              <span>Allow reading</span>
              <button class="toggle-btn ${coll.readable ? 'active' : ''}" onclick="App.toggleReadable('${this.escapeHtml(name)}')">
                ${coll.readable ? 'On' : 'Off'}
              </button>
            </label>
            ` : ''}
            ${publicUrl ? `
              <div class="public-link-row">
                <input type="text" readonly value="${this.escapeHtml(publicUrl)}" class="public-link-input" id="public-link-input">
                <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('public-link-input').value); this.textContent='Copied!'; setTimeout(() => this.textContent='Copy', 1500)">Copy</button>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="coll-detail-section">
          <div class="section-label">${collBooks.length} Book${collBooks.length !== 1 ? 's' : ''}</div>
          ${collBooks.length === 0 ? `<p style="color:var(--text-muted);font-size:0.85rem">No books in this collection. Use the menu on any book card to add it.</p>` : `
            <div class="coll-book-list">
              ${collBooks.map(b => `
                <div class="coll-book-item">
                  <div class="coll-book-cover" ${b['cover-url'] ? `style="background-image:url('${this.escapeHtml(b['cover-url'])}')"` : ''}>
                    ${!b['cover-url'] ? `<span style="font-size:0.5rem;color:var(--text-muted)">${b.format.toUpperCase()}</span>` : ''}
                  </div>
                  <div class="coll-book-info">
                    <div class="coll-book-title">${this.escapeHtml(b.title)}</div>
                    <div class="coll-book-author">${this.escapeHtml(b.author || 'Unknown')}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" onclick="App.removeFromCollection('${this.escapeHtml(name)}', '${b.id}')" title="Remove">\u2715</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  },

  async toggleShare(name, enable) {
    try {
      if (enable) await BooxAPI.shareCollection(name);
      else await BooxAPI.unshareCollection(name);
      document.querySelector('.modal-overlay')?.remove();
      await this.showCollectionDetail(name);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  async togglePublish(name, enable) {
    try {
      if (enable) await BooxAPI.publishCollection(name);
      else await BooxAPI.unpublishCollection(name);
      document.querySelector('.modal-overlay')?.remove();
      await this.showCollectionDetail(name);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  async toggleReadable(name) {
    try {
      await BooxAPI.toggleReadable(name);
      document.querySelector('.modal-overlay')?.remove();
      await this.showCollectionDetail(name);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  async removeFromCollection(name, bookId) {
    try {
      await BooxAPI.removeFromCollection(name, bookId);
      document.querySelector('.modal-overlay')?.remove();
      await this.showCollectionDetail(name);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  async confirmDeleteCollection(name) {
    if (!confirm(`Delete collection "${name}"?`)) return;
    try {
      await BooxAPI.deleteCollection(name);
      document.querySelector('.modal-overlay')?.remove();
      await this.loadCollections();
      this.renderCollections();
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  // -- Browse Pals --

  async browseFriend() {
    const shipInput = document.getElementById('friend-ship');
    const ship = shipInput?.value?.trim();
    if (!ship || !ship.startsWith('~')) return;
    localStorage.setItem('boox-last-friend-ship', ship);

    const results = document.getElementById('friend-results');
    results.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem">Requesting shared data from ' + this.escapeHtml(ship) + '...</div>';

    try {
      // Poke our agent to request shared data from the remote ship
      await BooxAPI.browseShip(ship);
      // Poll for results (the remote ship pokes us back)
      let attempts = 0;
      const poll = async () => {
        attempts++;
        try {
          const data = await BooxAPI.getRemoteData(ship);
          if (data.status === 'waiting' && attempts < 15) {
            setTimeout(poll, 1000);
            return;
          }
          if (data.status === 'error') {
            results.innerHTML = `<div style="color:var(--danger);font-size:0.85rem">${this.escapeHtml(data.error || 'Remote ship did not respond')}</div>`;
            return;
          }
          this.renderFriendResults(ship, data);
        } catch (e) {
          if (attempts < 15) {
            setTimeout(poll, 1000);
          } else {
            results.innerHTML = `<div style="color:var(--danger);font-size:0.85rem">Timed out waiting for response from ${this.escapeHtml(ship)}</div>`;
          }
        }
      };
      setTimeout(poll, 1500);
    } catch (e) {
      results.innerHTML = `<div style="color:var(--danger);font-size:0.85rem">Failed: ${this.escapeHtml(e.message)}</div>`;
    }
  },

  _bookKey(title, author) {
    return (title || '').toLowerCase().trim() + '|' + (author || '').toLowerCase().trim();
  },

  _findLocalMatch(remoteBook) {
    const rk = this._bookKey(remoteBook.title, remoteBook.author);
    return this.state.books.find(b => this._bookKey(b.title, b.author) === rk);
  },

  renderFriendResults(ship, data) {
    const results = document.getElementById('friend-results');
    if (!results) return;

    const collections = data.collections || [];
    if (collections.length === 0) {
      results.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No shared collections found on ' + this.escapeHtml(ship) + '.</div>';
      return;
    }

    // Cache friend notations for openBookWithFriendNotes
    this._friendNotesCache = {};
    for (const c of collections) {
      for (const b of (c.books || [])) {
        if (b.notations && b.notations.length > 0) {
          const local = this._findLocalMatch(b);
          if (local) {
            if (!this._friendNotesCache[local.id]) this._friendNotesCache[local.id] = [];
            for (const n of b.notations) {
              this._friendNotesCache[local.id].push({ ...n, from: ship });
            }
          }
        }
      }
    }

    this._remoteBooks = [];
    results.innerHTML = `
      <div class="section-label">${this.escapeHtml(ship)} \u2014 ${collections.length} shared collection${collections.length !== 1 ? 's' : ''}</div>
      <div class="coll-list">
        ${collections.map(c => `
          <div class="coll-item" style="cursor:default">
            <div class="coll-item-info">
              <div class="coll-item-name">${this.escapeHtml(c.name)}</div>
              <div class="coll-item-meta">${(c.books || []).length} book${(c.books || []).length !== 1 ? 's' : ''}${c.description ? ' \u2014 ' + this.escapeHtml(c.description) : ''}</div>
            </div>
          </div>
          ${(c.books || []).length > 0 ? `
            <div class="coll-book-list" style="margin-left:1rem;margin-bottom:1rem">
              ${c.books.map(b => {
                const local = this._findLocalMatch(b);
                const noteCount = (b.notations || []).length;
                const hasMatch = local && noteCount > 0;
                return `
                <div class="coll-book-item">
                  <div class="coll-book-cover" ${b['cover-url'] ? `style="background-image:url('${this.escapeHtml(b['cover-url'])}')"` : ''}>
                    ${!b['cover-url'] ? `<span style="font-size:0.5rem;color:var(--text-muted)">${this.escapeHtml(b.format || '').toUpperCase()}</span>` : ''}
                  </div>
                  <div class="coll-book-info">
                    <div class="coll-book-title">${this.escapeHtml(b.title)}</div>
                    <div class="coll-book-author">${this.escapeHtml(b.author || 'Unknown')}</div>
                  </div>
                  ${hasMatch ? `<button class="btn btn-sm" onclick="App.openBookWithFriendNotes('${local.id}', '${this.escapeHtml(ship)}')" title="You have this book — view their notes">\u{1F4DD} ${noteCount}</button>` : ''}
                  ${local && !hasMatch ? `<span style="font-size:0.65rem;color:var(--text-muted)">In library</span>` : ''}
                  ${!local && b['s3-url'] ? `<button class="btn btn-sm btn-primary" data-grab-idx="${this._remoteBooks.length}" onclick="App.grabBook(this)">Grab</button>${(this._remoteBooks.push(b), '')[0] || ''}` : ''}
                </div>`;
              }).join('')}
            </div>
          ` : ''}
        `).join('')}
      </div>
    `;
  },

  async openBookWithFriendNotes(bookId, ship) {
    let book = this.state.books.find(b => b.id === bookId);
    if (!book) return;

    // Fetch own notations
    try {
      const detail = await BooxAPI.getBook(bookId);
      book = { ...book, notations: detail.notations || [] };
    } catch (e) {
      book = { ...book, notations: [] };
    }

    // Merge friend notations
    const friendNotes = (this._friendNotesCache || {})[bookId] || [];
    book.notations = [...book.notations, ...friendNotes];

    this.state.currentBook = book;
    this.state.view = 'reader';
    history.pushState({ view: 'reader' }, '');
    location.hash = 'read=' + bookId;

    this.hideDashboard();
    this.hideAllViews();
    document.getElementById('reader-view').classList.remove('hidden');
    document.getElementById('reader-title').textContent = book.title + ' (+ ' + ship + ' notes)';

    this.updateProgressMeter(book.position ? book.position.progress : 0);

    try {
      this.state.readerControls = await Reader.open(book);
      const isPdf = book.format === 'pdf';
      ['zoom-in-btn', 'zoom-out-btn', 'zoom-fit-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isPdf ? '' : 'none';
      });
    } catch (e) {
      console.error('Failed to open book:', e);
      document.getElementById('reader-container').innerHTML =
        `<div class="reader-error">Failed to open: ${e.message}</div>`;
    }
  },

  // -- Pending Imports --

  async loadPending() {
    const container = document.getElementById('pending-imports');
    if (!container) return;
    try {
      const data = await BooxAPI.getPending();
      this.state.pendingItems = data.pending || [];
      if (this.state.pendingItems.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No pending imports.</div>';
        return;
      }
      container.innerHTML = `
        <div class="coll-book-list">
          ${this.state.pendingItems.map(p => `
            <div class="coll-book-item">
              <div class="coll-book-cover" ${p['cover-url'] ? `style="background-image:url('${this.escapeHtml(p['cover-url'])}')"` : ''}>
                ${!p['cover-url'] ? `<span style="font-size:0.5rem;color:var(--text-muted)">${this.escapeHtml(p.format || '').toUpperCase()}</span>` : ''}
              </div>
              <div class="coll-book-info">
                <div class="coll-book-title">${this.escapeHtml(p.title)}</div>
                <div class="coll-book-author">${this.escapeHtml(p.author || 'Unknown')}</div>
                <div style="font-size:0.7rem;color:var(--text-muted)">From ${this.escapeHtml(p.from)}</div>
              </div>
              <div style="display:flex;gap:0.25rem">
                <button class="btn btn-primary btn-sm" data-accept-pid="${this.escapeHtml(p.pid)}" onclick="App.acceptPending('${this.escapeHtml(p.pid)}')">Accept</button>
                <button class="btn btn-sm" onclick="App.rejectPending('${this.escapeHtml(p.pid)}')">Reject</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">Could not load pending imports.</div>';
    }
  },

  async acceptPending(pid) {
    const book = this.state.pendingItems.find(p => p.pid === pid);
    if (!book || !book['s3-url']) {
      toast('No file URL to import', 'error');
      return;
    }

    // Disable the row and show loading state
    const btn = document.querySelector(`[data-accept-pid="${pid}"]`);
    const row = btn?.closest('.coll-book-item');
    if (row) { row.style.opacity = '0.5'; row.style.pointerEvents = 'none'; }
    if (btn) { btn.textContent = 'Importing\u2026'; btn.disabled = true; }

    try {
      // Transload: download from sender's S3, re-upload to ours
      const response = await fetch(book['s3-url']);
      if (!response.ok) throw new Error('Failed to download file');
      const blob = await response.blob();
      const file = new File([blob], `${book.title}.${book.format}`, { type: blob.type });

      const result = await S3Upload.upload(file);

      // Transload cover if exists
      let coverUrl = '';
      if (book['cover-url']) {
        try {
          const coverResp = await fetch(book['cover-url']);
          if (coverResp.ok) {
            const coverBlob = await coverResp.blob();
            const coverFile = new File([coverBlob], 'cover.jpg', { type: coverBlob.type });
            const coverResult = await S3Upload.upload(coverFile);
            coverUrl = coverResult.url;
          }
        } catch (e) {
          console.warn('Could not transload cover:', e);
          coverUrl = book['cover-url'];
        }
      }

      const bookId = hexToUv(result.etag);

      await BooxAPI.addBook(bookId, {
        title: book.title,
        author: book.author || '',
        format: book.format,
        's3-url': result.url,
        'cover-url': coverUrl,
        'file-size': book['file-size'] || file.size,
        tags: book.tags || [],
        description: book.description || ''
      });

      // Store content hash from re-upload ETag
      if (result.etag) {
        try { await BooxAPI.setBookHash(bookId, result.etag); } catch (e) { console.warn('hash:', e); }
      }

      // Dismiss the pending entry
      await BooxAPI.dismissPending(pid);

      await this.loadBooks();
      await this.loadPending();
      toast(`"${book.title}" imported successfully!`, 'success');
    } catch (e) {
      toast('Import failed: ' + e.message, 'error');
      if (row) { row.style.opacity = '1'; row.style.pointerEvents = ''; }
      if (btn) { btn.textContent = 'Accept'; btn.disabled = false; }
    }
  },

  async rejectPending(pid) {
    try {
      await BooxAPI.dismissPending(pid);
      await this.loadPending();
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  // -- Grab from friend --

  async grabBook(btnEl) {
    const idx = parseInt(btnEl.dataset.grabIdx, 10);
    const book = this._remoteBooks?.[idx];
    if (!book || !book['s3-url']) {
      toast('No file URL to grab', 'error');
      return;
    }

    const row = btnEl.closest('.coll-book-item');
    if (row) { row.style.opacity = '0.5'; row.style.pointerEvents = 'none'; }
    btnEl.textContent = 'Grabbing\u2026';
    btnEl.disabled = true;

    try {
      const response = await fetch(book['s3-url']);
      if (!response.ok) throw new Error('Failed to download file');
      const blob = await response.blob();
      const file = new File([blob], `${book.title}.${book.format}`, { type: blob.type });
      const result = await S3Upload.upload(file);

      let coverUrl = '';
      if (book['cover-url']) {
        try {
          const coverResp = await fetch(book['cover-url']);
          if (coverResp.ok) {
            const coverBlob = await coverResp.blob();
            const coverFile = new File([coverBlob], 'cover.jpg', { type: coverBlob.type });
            const coverResult = await S3Upload.upload(coverFile);
            coverUrl = coverResult.url;
          }
        } catch (e) {
          coverUrl = book['cover-url'];
        }
      }

      // Use source book's hash or new ETag as book ID
      const hash = book['content-hash'] || result.etag || '';
      const bookId = hexToUv(hash);

      await BooxAPI.addBook(bookId, {
        title: book.title,
        author: book.author || '',
        format: book.format,
        's3-url': result.url,
        'cover-url': coverUrl,
        'file-size': book['file-size'] || file.size,
        tags: book.tags || [],
        description: book.description || ''
      });

      if (hash) {
        try { await BooxAPI.setBookHash(bookId, hash); } catch (e) { console.warn('hash:', e); }
      }

      await this.loadBooks();
      btnEl.textContent = '\u2713 Grabbed';
      if (row) { row.style.opacity = '1'; row.style.pointerEvents = ''; }
      toast(`"${book.title}" added to library!`, 'success');
    } catch (e) {
      toast('Grab failed: ' + e.message, 'error');
      if (row) { row.style.opacity = '1'; row.style.pointerEvents = ''; }
      btnEl.textContent = 'Grab';
      btnEl.disabled = false;
    }
  },

  // -- Send to Pal --

  async showSendToFriend(bookId) {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;

    if (this.state.pals.length === 0) await this.loadPals();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h2>Send to Pal</h2>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">
          Send "${this.escapeHtml(book.title)}" to a %pals mutual. They'll need to accept the import.
        </p>
        <div class="form-group">
          <label>Ship (@p)</label>
          <input type="text" id="send-to-ship" placeholder="~sampel-palnet"
                 value="${this.escapeHtml(localStorage.getItem('boox-last-send-ship') || '')}"
                 oninput="App.filterSendPals()">
        </div>
        <div id="send-pals-list"></div>
        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="App.doSendToFriend('${bookId}')">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    this.filterSendPals();
    document.getElementById('send-to-ship').focus();
  },

  filterSendPals() {
    const el = document.getElementById('send-pals-list');
    if (!el) return;
    const pals = this.state.pals;
    if (pals.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:0.5rem">No pals or contacts found. Enter a @p manually.</p>';
      return;
    }
    const input = document.getElementById('send-to-ship');
    const filter = (input ? input.value : '').replace(/^~?/, '~').toLowerCase();
    const filtered = filter.length > 1
      ? pals.filter(s => s.includes(filter))
      : pals;
    const shown = filtered.slice(0, 10);
    const remaining = filtered.length - shown.length;
    let html = '<div style="display:flex;flex-wrap:wrap;gap:0.375rem;margin-bottom:0.5rem">';
    html += shown.map(p =>
      `<button class="btn btn-sm" onclick="document.getElementById('send-to-ship').value='${this.escapeHtml(p)}';">${this.escapeHtml(p)}</button>`
    ).join('');
    html += '</div>';
    if (remaining > 0) {
      html += `<p style="color:var(--text-muted);font-size:0.75rem">${remaining} more — type to filter</p>`;
    }
    if (filter.length > 1 && filtered.length === 0) {
      html = '';
    }
    el.innerHTML = html;
  },

  async doSendToFriend(bookId) {
    const ship = document.getElementById('send-to-ship')?.value?.trim();
    if (!ship || !ship.startsWith('~')) {
      toast('Please enter a valid @p (e.g. ~sampel-palnet)', 'error');
      return;
    }
    localStorage.setItem('boox-last-send-ship', ship);
    try {
      await BooxAPI.sendBook(bookId, ship);
      document.querySelector('.modal-overlay')?.remove();
      toast('Book sent! They\'ll see it in their pending imports.', 'success');
    } catch (e) {
      toast('Failed to send: ' + e.message, 'error');
    }
  },

  // -- Feed (from %last) --

  async showFeed() {
    this.state.view = 'feed';
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('feed-view').classList.remove('hidden');
    document.getElementById('filters-bar').classList.add('hidden');
    this.setActiveNav('feed');

    const view = document.getElementById('feed-view');
    view.innerHTML = '<div class="loading-spinner">Loading feed...</div>';

    try {
      const [feedData, peersData, settings] = await Promise.all([
        BooxAPI.getLastFeed(),
        BooxAPI.getLastPeers(),
        BooxAPI.getSettings().catch(() => ({})),
      ]);
      this._annasDomain = settings['annas-domain'] || 'annas-archive.gl';

      // own scrobbles from boox
      const own = (feedData.scrobbles || [])
        .filter(s => s.source === 'boox')
        .map(s => ({ ...s, ship: feedData.ship }));

      // friends' scrobbles from boox
      const peerEntries = Object.entries(peersData.peers || {});
      const friends = [];
      for (const [ship, items] of peerEntries) {
        for (const sc of items) {
          if (sc.source === 'boox') friends.push({ ...sc, ship });
        }
      }

      const all = [...own, ...friends].sort((a, b) => b.when - a.when);

      if (all.length === 0) {
        view.innerHTML = `
          <div class="empty-state">
            <p>No reading activity yet.</p>
            <p class="empty-hint">Books you upload or open will appear here, along with your friends' reading activity.</p>
          </div>
        `;
        return;
      }

      // Store own ship for feed card logic
      window._booxShip = feedData.ship || '';

      view.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem">
          <a href="/apps/last?tab=friends&source=boox" class="btn btn-sm" style="text-decoration:none">View in %last</a>
        </div>
        <div class="feed-list">
          ${all.map(sc => this.renderFeedCard(sc)).join('')}
        </div>
      `;

    } catch (e) {
      view.innerHTML = `
        <div class="empty-state">
          <p>Could not load feed.</p>
          <p class="empty-hint">Make sure %last is installed: <code>|install ~matwet %last</code></p>
        </div>
      `;
    }
  },

  renderFeedCard(sc) {
    const time = this.timeAgo(sc.when * 1000);
    const meta = sc.meta || {};
    const hash = meta['content-hash'] || '';
    const author = meta['author'] || '';
    const isOwn = sc.ship === (window._booxShip || '');
    const haveLocal = hash && this.state.books.some(b => b['content-hash'] === hash);
    const s3Url = meta['s3-url'] || sc['s3-url'] || '';
    const dom = this._annasDomain || 'annas-archive.gl';

    // Anna's link: md5 if hash, search by title otherwise
    const annasUrl = hash
      ? `https://${dom}/md5/${hash}`
      : `https://${dom}/search?q=${encodeURIComponent(sc.name)}`;
    const annasHtml = `<a href="${annasUrl}" target="_blank" rel="noopener" class="feed-card-muted-link">Anna's</a>`;

    const authorHtml = author
      ? `<a href="https://${dom}/search?q=${encodeURIComponent(author)}" target="_blank" rel="noopener" class="feed-card-muted-link">${this.escapeHtml(author)}</a>`
      : '';

    // Author + Anna's on same row
    const authorRow = (author || true)
      ? `<div class="feed-card-sub">${authorHtml}${author ? ' · ' : ''}${annasHtml}</div>`
      : '';

    let downloadLink = '';
    if (!isOwn && s3Url && !haveLocal) {
      downloadLink = `<div class="feed-card-links"><a href="${this.escapeHtml(s3Url)}" class="feed-card-muted-link" target="_blank" download>Download</a></div>`;
    }

    return `
      <div class="feed-card">
        ${sc.image ? `<div class="feed-card-img"><img src="${this.escapeHtml(sc.image)}" alt="" loading="lazy" /></div>` : ''}
        <div class="feed-card-body">
          <div class="feed-card-meta">
            <span class="feed-card-ship">${this.escapeHtml(sc.ship)}</span>
            <span class="feed-card-verb">${this.escapeHtml(sc.verb)}</span>
            <span class="feed-card-time">${time}</span>
          </div>
          <div class="feed-card-name">${this.escapeHtml(sc.name)}</div>
          ${authorRow}
          ${downloadLink}
        </div>
      </div>
    `;
  },

  timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  },

  // -- Settings --

  async showSettings() {
    this.state.view = 'settings';
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('settings-view').classList.remove('hidden');
    document.getElementById('filters-bar').classList.add('hidden');
    this.setActiveNav('settings');

    const s3 = this.state.s3Config || {};
    const s3Status = s3.accessKeyId
      ? `Connected \u2014 ${s3.bucket || 'no bucket'}`
      : 'Not configured';

    let opdsEnabled = false;
    let opdsPassword = '';
    let lastScrobble = false;
    let lastScrobbleUpload = true;
    let annasDomain = 'annas-archive.gl';
    try {
      const settings = await BooxAPI.getSettings();
      opdsEnabled = settings['opds-enabled'] || false;
      opdsPassword = settings['opds-password'] || '';
      lastScrobble = settings['last-scrobble'] || false;
      lastScrobbleUpload = settings['last-scrobble-upload'] ?? true;
      annasDomain = settings['annas-domain'] || 'annas-archive.gl';
    } catch (e) {}

    const opdsUrl = `${window.location.origin}/apps/boox/api/opds`;

    document.getElementById('settings-view').innerHTML = `
      <div class="settings-panel">
        <h2>Settings</h2>
        <div class="settings-section">
          <h3>S3 Storage</h3>
          <p class="settings-hint">
            Boox uses your ship's S3 storage from Landscape.
            Configure it in Landscape \u2192 System Preferences \u2192 Storage.
          </p>
          <p style="font-size:0.85rem">Status: <strong>${s3Status}</strong></p>
        </div>
        <div class="settings-section">
          <h3>Library</h3>
          <p style="font-size:0.85rem">${this.state.books.length} book${this.state.books.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="settings-section">
          <h3>OPDS Catalog</h3>
          <p class="settings-hint">
            Serve your library as an OPDS feed for e-reader apps (KOReader, Calibre, Moon+ Reader, etc).
            Uses HTTP Basic Auth.
          </p>
          <label class="toggle-row">
            <span>Enable OPDS</span>
            <button class="toggle-btn ${opdsEnabled ? 'active' : ''}" onclick="App.toggleOpds()">${opdsEnabled ? 'On' : 'Off'}</button>
          </label>
          ${opdsEnabled ? `
            <div style="margin-top:0.75rem">
              <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.25rem">Feed URL:</p>
              <div style="display:flex;gap:0.5rem">
                <input type="text" readonly value="${this.escapeHtml(opdsUrl)}" class="public-link-input" id="opds-url-input" style="flex:1">
                <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('opds-url-input').value); this.textContent='Copied!'; setTimeout(() => this.textContent='Copy', 1500)">Copy</button>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.75rem;margin-bottom:0.25rem">Password:</p>
              <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="text" id="opds-password-input" value="${this.escapeHtml(opdsPassword)}" placeholder="Leave blank to use +code" class="public-link-input" style="flex:1">
                <button class="btn btn-sm" onclick="App.saveOpdsPassword()">Save</button>
              </div>
              <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">Username: anything &bull; Password: ${opdsPassword ? 'custom password' : 'your +code (default)'}</p>
            </div>
          ` : ''}
        </div>
        <div class="settings-section">
          <h3>%last Scrobbling</h3>
          <p class="settings-hint">
            Scrobble reading activity to %last. See the Feed tab for your reading timeline.
            Install %last: <code style="font-size:0.8em">|install ~matwet %last</code>
          </p>
          <label class="toggle-row">
            <span>Scrobble on upload</span>
            <button class="toggle-btn ${lastScrobbleUpload ? 'active' : ''}" onclick="App.toggleLastScrobbleUpload()">${lastScrobbleUpload ? 'On' : 'Off'}</button>
          </label>
          <label class="toggle-row">
            <span>Scrobble on first open</span>
            <button class="toggle-btn ${lastScrobble ? 'active' : ''}" onclick="App.toggleLastScrobble()">${lastScrobble ? 'On' : 'Off'}</button>
          </label>
        </div>
        <div class="settings-section">
          <h3>Anna's Archive</h3>
          <p class="settings-hint">Domain used for book search/lookup links in the feed.</p>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <input type="text" id="annas-domain-input" value="${this.escapeHtml(annasDomain)}" placeholder="annas-archive.gl" class="public-link-input" style="flex:1">
            <button class="btn btn-sm" onclick="App.saveAnnasDomain()">Save</button>
          </div>
        </div>
        <div class="settings-section">
          <h3>Theme</h3>
          <p class="settings-hint">Current: ${this.state.theme === 'dark' ? 'Dark' : 'Light'}</p>
          <button class="btn" onclick="App.toggleTheme()">Toggle Theme</button>
        </div>
      </div>
    `;
  },

  async toggleOpds() {
    try {
      await BooxAPI.toggleOpds();
      await this.showSettings();
    } catch (e) {
      toast('Failed to toggle OPDS: ' + e.message, 'error');
    }
  },

  async toggleLastScrobble() {
    try {
      await BooxAPI.toggleLastScrobble();
      await this.showSettings();
    } catch (e) {
      toast('Failed to toggle %last scrobble: ' + e.message, 'error');
    }
  },

  async toggleLastScrobbleUpload() {
    try {
      await BooxAPI.toggleLastScrobbleUpload();
      await this.showSettings();
    } catch (e) {
      toast('Failed to toggle %last upload scrobble: ' + e.message, 'error');
    }
  },

  async scrobbleToLast(bookId) {
    try {
      await BooxAPI.scrobbleToLast(bookId);
      toast('Scrobbled to %last');
    } catch (e) {
      toast('Failed to scrobble: ' + e.message, 'error');
    }
  },

  async saveAnnasDomain() {
    const input = document.getElementById('annas-domain-input');
    const domain = input ? input.value.trim() : 'annas-archive.gl';
    try {
      await BooxAPI.setAnnasDomain(domain || 'annas-archive.gl');
      toast('Anna\'s Archive domain updated');
    } catch (e) {
      toast('Failed to save domain: ' + e.message, 'error');
    }
  },

  async saveOpdsPassword() {
    const input = document.getElementById('opds-password-input');
    const password = input ? input.value.trim() : '';
    try {
      await BooxAPI.setOpdsPassword(password);
      toast(password ? 'OPDS password updated' : 'OPDS password cleared (using +code)');
      await this.showSettings();
    } catch (e) {
      toast('Failed to save password: ' + e.message, 'error');
    }
  },

  // -- Edit book --

  editBook(bookId) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    this._editCoverFile = null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h2>Edit Book</h2>
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="edit-title" value="${this.escapeHtml(book.title)}">
        </div>
        <div class="form-group">
          <label>Author</label>
          <input type="text" id="edit-author" value="${this.escapeHtml(book.author)}">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edit-description" rows="3">${this.escapeHtml(book.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Tags (comma separated)</label>
          <input type="text" id="edit-tags" value="${(book.tags || []).join(', ')}">
        </div>
        <div class="form-group">
          <label>Cover Image</label>
          <div class="cover-input-row">
            <input type="text" id="edit-cover-url" value="${this.escapeHtml(book['cover-url'] || '')}"
                   placeholder="Paste image URL..."
                   oninput="App.previewEditCover(this.value)">
            <label class="btn btn-sm cover-file-btn">
              Upload
              <input type="file" accept="image/*" onchange="App.handleEditCoverFile(event)" hidden>
            </label>
          </div>
          <div id="edit-cover-preview">
            ${book['cover-url'] ? `<img src="${this.escapeHtml(book['cover-url'])}" class="cover-preview-img">` : ''}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" id="edit-save-btn" onclick="App.saveBookEdit('${bookId}')">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  },

  previewEditCover(url) {
    const preview = document.getElementById('edit-cover-preview');
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      preview.innerHTML = `<img src="${this.escapeHtml(url)}" class="cover-preview-img"
        onerror="this.parentElement.innerHTML=''">`;
    } else {
      preview.innerHTML = '';
    }
  },

  handleEditCoverFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    this._editCoverFile = file;
    const url = URL.createObjectURL(file);
    document.getElementById('edit-cover-preview').innerHTML =
      `<img src="${url}" class="cover-preview-img">`;
    document.getElementById('edit-cover-url').value = file.name;
    document.getElementById('edit-cover-url').disabled = true;
  },

  async saveBookEdit(bookId) {
    const title = document.getElementById('edit-title').value;
    const author = document.getElementById('edit-author').value;
    const description = document.getElementById('edit-description').value;
    const tagsStr = document.getElementById('edit-tags').value;
    const coverUrlInput = document.getElementById('edit-cover-url').value;

    const saveBtn = document.getElementById('edit-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      let coverUrl = coverUrlInput;
      if (this._editCoverFile) {
        const coverResult = await S3Upload.upload(this._editCoverFile);
        coverUrl = coverResult.url;
      }

      await BooxAPI.updateMetadata(bookId, title, author, description, coverUrl);

      const book = this.state.books.find(b => b.id === bookId);
      const oldTags = new Set(book?.tags || []);
      const newTags = new Set(tagsStr.split(',').map(t => t.trim()).filter(Boolean));

      for (const tag of newTags) {
        if (!oldTags.has(tag)) await BooxAPI.addTag(bookId, tag);
      }
      for (const tag of oldTags) {
        if (!newTags.has(tag)) await BooxAPI.removeTag(bookId, tag);
      }

      document.querySelector('.modal-overlay')?.remove();
      await this.loadBooks();
      this.renderLibrary();
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  },

  async confirmDeleteBook(bookId) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    if (!confirm(`Delete "${book.title}"?`)) return;
    try {
      if (book['s3-url']) await S3Upload.deleteObject(book['s3-url']).catch(() => {});
      if (book['cover-url']) await S3Upload.deleteObject(book['cover-url']).catch(() => {});
      await BooxAPI.removeBook(bookId);
      await this.loadBooks();
      this.renderLibrary();
    } catch (e) {
      toast('Failed to delete: ' + e.message, 'error');
    }
  },

  // -- Search --

  onSearch(query) {
    this.state.searchQuery = query;
    this.state.page = 1;
    this.renderLibrary();
  },

  // -- Utils --

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
