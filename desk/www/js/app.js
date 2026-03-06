// Boox - main application (Alex-inspired design)

function toast(msg, type = 'info') {
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

const App = {
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

  async loadBooks() {
    try {
      const data = await BooxAPI.getBooks();
      this.state.books = data.books || [];
    } catch (e) {
      console.error('Failed to load books:', e);
    }
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
              <button class="btn btn-ghost btn-sm" onclick="Reader.toggleSettingsPanel()" title="Font settings">Aa</button>
            </div>
          </div>
          <div id="reader-container" class="reader-container"></div>
        </div>
      </div>

      <nav class="floating-nav" id="floating-nav">
        <button class="nav-item active" onclick="App.showLibrary()" data-view="library">
          <span class="nav-icon">\u{1F4DA}</span> Library
        </button>
        <button class="nav-item" onclick="App.showCollections()" data-view="collections">
          <span class="nav-icon">\u{1F517}</span> Collections
        </button>
        <button class="nav-item" onclick="App.showUpload()" data-view="upload">
          <span class="nav-icon">\u2191</span> Upload
        </button>
        <button class="nav-item" onclick="App.showSettings()" data-view="settings">
          <span class="nav-icon">\u2699</span> Settings
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

    // Main grid
    if (books.length === 0) {
      html += `
        <div class="empty-state">
          <p>No books match your filters.</p>
        </div>
      `;
    } else {
      html += `
        <div class="section-label">${books.length} book${books.length !== 1 ? 's' : ''}</div>
        <div class="book-grid">
          ${books.map(book => this.renderBookCard(book)).join('')}
        </div>
      `;
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
    menu.innerHTML = `
      <button onclick="App.editBook('${bookId}')">Edit metadata</button>
      <button onclick="App.showAddToCollection('${bookId}')">Add to collection</button>
      <button onclick="App.showSendToFriend('${bookId}')">Send to pal</button>
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
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('library-view').classList.remove('hidden');
    this.setActiveNav('library');
    this.renderLibrary();
  },

  // -- Reader --

  async openBook(bookId) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;

    this.state.currentBook = book;
    this.state.view = 'reader';
    history.pushState({ view: 'reader' }, '');

    this.hideDashboard();
    this.hideAllViews();
    document.getElementById('reader-view').classList.remove('hidden');
    document.getElementById('reader-title').textContent = book.title;

    // Reset progress meter
    this.updateProgressMeter(book.position ? book.position.progress : 0);

    try {
      this.state.readerControls = await Reader.open(book);
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
        <h2>Upload a Book</h2>
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone-content">
            <div class="drop-icon">\u{1F4C4}</div>
            <p>Drag and drop a file here, or click to browse</p>
            <p class="drop-hint">EPUB, PDF, MOBI, TXT, MD, HTML</p>
            <input type="file" id="file-input"
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
      if (e.dataTransfer.files.length > 0) this.prepareUpload(e.dataTransfer.files[0]);
    };
  },

  handleFileSelect(event) {
    if (event.target.files.length > 0) {
      this.prepareUpload(event.target.files[0]);
    }
  },

  prepareUpload(file) {
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

      const uvChars = '0123456789abcdefghijklmnopqrstuv';
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      let raw = '';
      for (const b of bytes) raw += uvChars[b & 31];
      const groups = raw.match(/.{1,5}/g);
      groups[0] = groups[0].replace(/^0+/, '') || '0';
      const bookId = '0v' + groups.join('.');

      await BooxAPI.addBook(bookId, {
        title, author, format,
        's3-url': result.url,
        'cover-url': coverUrl,
        'file-size': file.size,
        tags, description
      });

      await this.loadBooks();

      document.getElementById('upload-form-area').innerHTML = `
        <div class="upload-success">
          <p>\u2713 "${this.escapeHtml(title)}" uploaded!</p>
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

  // -- Collections --

  async showCollections() {
    this.state.view = 'collections';
    this.showDashboard();
    this.hideAllViews();
    document.getElementById('collections-view').classList.remove('hidden');
    document.getElementById('filters-bar').classList.add('hidden');
    this.setActiveNav('collections');
    await this.loadCollections();
    this.loadPals();
    this.renderCollections();
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
            <p class="settings-hint">Browse shared collections from your %pals mutuals.</p>
            ${this.state.pals.length > 0 ? `
              <div style="display:flex;flex-wrap:wrap;gap:0.375rem;margin-bottom:1rem">
                ${this.state.pals.map(p => `
                  <button class="btn btn-sm" onclick="document.getElementById('friend-ship').value='${this.escapeHtml(p)}'; App.browseFriend();">${this.escapeHtml(p)}</button>
                `).join('')}
              </div>
            ` : `
              <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:0.75rem">No %pals mutuals found. Install %pals to discover friends.</p>
            `}
            <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
              <input type="text" id="friend-ship" class="search-input" style="max-width:none;flex:1;padding-left:0.75rem"
                     placeholder="~sampel-palnet" value="${this.escapeHtml(localStorage.getItem('boox-last-friend-ship') || '')}">
              <button class="btn btn-primary btn-sm" onclick="App.browseFriend()">Browse</button>
            </div>
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

  renderFriendResults(ship, data) {
    const results = document.getElementById('friend-results');
    if (!results) return;

    const collections = data.collections || [];
    if (collections.length === 0) {
      results.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No shared collections found on ' + this.escapeHtml(ship) + '.</div>';
      return;
    }
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
              ${c.books.map(b => `
                <div class="coll-book-item">
                  <div class="coll-book-cover" ${b['cover-url'] ? `style="background-image:url('${this.escapeHtml(b['cover-url'])}')"` : ''}>
                    ${!b['cover-url'] ? `<span style="font-size:0.5rem;color:var(--text-muted)">${this.escapeHtml(b.format || '').toUpperCase()}</span>` : ''}
                  </div>
                  <div class="coll-book-info">
                    <div class="coll-book-title">${this.escapeHtml(b.title)}</div>
                    <div class="coll-book-author">${this.escapeHtml(b.author || 'Unknown')}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        `).join('')}
      </div>
    `;
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

      // Generate book ID
      const uvChars = '0123456789abcdefghijklmnopqrstuv';
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      let raw = '';
      for (const b of bytes) raw += uvChars[b & 31];
      const groups = raw.match(/.{1,5}/g);
      groups[0] = groups[0].replace(/^0+/, '') || '0';
      const bookId = '0v' + groups.join('.');

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
        ${this.state.pals.length > 0 ? `
          <div class="form-group">
            <label>Your Pals</label>
            <div style="display:flex;flex-wrap:wrap;gap:0.375rem">
              ${this.state.pals.map(p => `
                <button class="btn btn-sm" onclick="document.getElementById('send-to-ship').value='${this.escapeHtml(p)}';">${this.escapeHtml(p)}</button>
              `).join('')}
            </div>
          </div>
        ` : `
          <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:0.75rem">No %pals mutuals found. You can still enter a @p manually.</p>
        `}
        <div class="form-group">
          <label>Ship (@p)</label>
          <input type="text" id="send-to-ship" placeholder="~sampel-palnet" value="${this.escapeHtml(localStorage.getItem('boox-last-send-ship') || '')}">
        </div>
        <div class="modal-actions">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="App.doSendToFriend('${bookId}')">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.getElementById('send-to-ship').focus();
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

  // -- Settings --

  showSettings() {
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
          <h3>Theme</h3>
          <p class="settings-hint">Current: ${this.state.theme === 'dark' ? 'Dark' : 'Light'}</p>
          <button class="btn" onclick="App.toggleTheme()">Toggle Theme</button>
        </div>
      </div>
    `;
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
