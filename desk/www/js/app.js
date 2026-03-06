// Boox - main application

const App = {
  state: {
    books: [],
    view: 'library',    // library | reader | settings | upload
    currentBook: null,
    readerControls: null,
    s3Config: null,
    searchQuery: '',
    filterFormat: '',
    collections: {},
    activeCollection: null
  },

  async init() {
    await this.loadBooks();
    await this.loadS3Config();
    this.render();
    this.bindEvents();
    window.addEventListener('boox-state-changed', () => this.loadBooks().then(() => {
      if (this.state.view === 'library') this.renderLibrary();
    }));
    // Handle back button
    window.addEventListener('popstate', () => {
      if (this.state.view === 'reader') this.showLibrary();
    });
  },

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
      if (e.key === 'Escape') {
        this.showLibrary();
      }
    });
  },

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <header class="app-header" id="app-header">
        <div class="header-left">
          <h1 class="logo" onclick="App.showLibrary()">boox</h1>
        </div>
        <div class="header-center">
          <div class="search-bar">
            <input type="text" id="search-input" placeholder="Search library..."
                   value="${this.state.searchQuery}"
                   oninput="App.onSearch(this.value)">
          </div>
        </div>
        <div class="header-right">
          <select id="format-filter" onchange="App.onFilterFormat(this.value)">
            <option value="">All formats</option>
            <option value="epub">EPUB</option>
            <option value="pdf">PDF</option>
            <option value="mobi">MOBI</option>
            <option value="txt">TXT</option>
            <option value="md">MD</option>
            <option value="html">HTML</option>
          </select>
          <button class="btn btn-primary" onclick="App.showUpload()">Upload</button>
          <button class="btn" onclick="App.showSettings()">Settings</button>
        </div>
      </header>
      <main id="main-content">
        <div id="library-view" class="library-view"></div>
        <div id="reader-view" class="reader-view hidden">
          <div class="reader-toolbar" id="reader-toolbar">
            <button class="btn btn-sm" onclick="App.showLibrary()">Back</button>
            <button class="btn btn-sm" onclick="Reader.toggleChapterList()" title="Chapters">&#9776;</button>
            <span id="reader-title"></span>
            <span id="page-indicator"></span>
            <div class="reader-nav">
              <button class="btn btn-sm" onclick="Reader.toggleSettingsPanel()" title="Font settings">Aa</button>
              <button class="btn btn-sm" onclick="App.readerPrev()">Prev</button>
              <button class="btn btn-sm" onclick="App.readerNext()">Next</button>
            </div>
          </div>
          <div id="reader-container" class="reader-container"></div>
        </div>
        <div id="settings-view" class="settings-view hidden"></div>
        <div id="upload-view" class="upload-view hidden"></div>
      </main>
    `;
    this.renderLibrary();
  },

  renderLibrary() {
    const container = document.getElementById('library-view');
    if (!container) return;

    let books = this.state.books;

    // Apply search filter
    if (this.state.searchQuery) {
      const q = this.state.searchQuery.toLowerCase();
      books = books.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Apply format filter
    if (this.state.filterFormat) {
      books = books.filter(b => b.format === this.state.filterFormat);
    }

    if (books.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128218;</div>
          <h2>Your library is empty</h2>
          <p>${this.state.books.length === 0
            ? 'Upload some books to get started.'
            : 'No books match your search.'}</p>
          ${this.state.books.length === 0
            ? '<button class="btn btn-primary btn-lg" onclick="App.showUpload()">Upload your first book</button>'
            : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="book-grid">
        ${books.map(book => this.renderBookCard(book)).join('')}
      </div>
    `;
  },

  renderBookCard(book) {
    const progress = book.position ? book.position.progress : 0;
    const coverStyle = book['cover-url']
      ? `background-image: url('${book['cover-url']}')`
      : '';
    const formatColors = {
      epub: '#4a9eff', pdf: '#ff4a4a', mobi: '#ff9f43',
      txt: '#7bed9f', md: '#a29bfe', html: '#fd79a8'
    };
    const color = formatColors[book.format] || '#ddd';

    return `
      <div class="book-card" onclick="App.openBook('${book.id}')">
        <div class="book-cover" style="${coverStyle}">
          ${!book['cover-url'] ? `
            <div class="book-cover-placeholder">
              <span class="cover-title">${this.escapeHtml(book.title)}</span>
              <span class="cover-author">${this.escapeHtml(book.author)}</span>
            </div>
          ` : ''}
          <span class="format-badge" style="background:${color}">${book.format.toUpperCase()}</span>
        </div>
        <div class="book-info">
          <h3 class="book-title">${this.escapeHtml(book.title)}</h3>
          <p class="book-author">${this.escapeHtml(book.author || 'Unknown')}</p>
          ${progress > 0 ? `
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
            <span class="progress-text">${progress}%</span>
          ` : ''}
        </div>
        <button class="book-menu-btn" onclick="event.stopPropagation(); App.showBookMenu('${book.id}', event)">&#8942;</button>
      </div>
    `;
  },

  showBookMenu(bookId, event) {
    // Remove existing menu
    document.querySelectorAll('.book-context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'book-context-menu';
    menu.innerHTML = `
      <button onclick="App.editBook('${bookId}')">Edit metadata</button>
      <button onclick="App.confirmDeleteBook('${bookId}')">Delete book</button>
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

  async openBook(bookId) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;

    this.state.currentBook = book;
    this.state.view = 'reader';
    history.pushState({ view: 'reader' }, '');

    this.hideAllViews();
    document.getElementById('reader-view').classList.remove('hidden');
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('reader-title').textContent = book.title;

    try {
      this.state.readerControls = await Reader.open(book);
    } catch (e) {
      console.error('Failed to open book:', e);
      document.getElementById('reader-container').innerHTML =
        `<div class="reader-error">Failed to open: ${e.message}</div>`;
    }
  },

  hideAllViews() {
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('reader-view').classList.add('hidden');
    document.getElementById('settings-view').classList.add('hidden');
    document.getElementById('upload-view').classList.add('hidden');
  },

  showLibrary() {
    this.state.view = 'library';
    Reader.close();
    this.hideAllViews();
    document.getElementById('library-view').classList.remove('hidden');
    document.getElementById('app-header').classList.remove('hidden');
    this.renderLibrary();
  },

  readerPrev() {
    if (this.state.readerControls?.prev) this.state.readerControls.prev();
  },

  readerNext() {
    if (this.state.readerControls?.next) this.state.readerControls.next();
  },

  showUpload() {
    this.state.view = 'upload';
    this._pendingFile = null;
    this._pendingCoverFile = null;
    this.hideAllViews();
    document.getElementById('upload-view').classList.remove('hidden');
    this.renderUploadView();
  },

  renderUploadView() {
    const view = document.getElementById('upload-view');
    view.innerHTML = `
      <div class="upload-panel">
        <button class="btn back-btn" onclick="App.showLibrary()">Back to Library</button>
        <h2>Upload a Book</h2>
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone-content">
            <div class="drop-icon">&#128228;</div>
            <p>Drag and drop a file here, or click to browse</p>
            <p class="drop-hint">Supports: PDF, EPUB, MOBI, TXT, MD, HTML</p>
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
        `<div class="upload-item error">Unsupported format: ${this.escapeHtml(file.name)}</div>`;
      return;
    }
    this._pendingFile = file;
    this._pendingFormat = format;
    this._pendingCoverFile = null;

    const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const sizeStr = file.size > 1048576
      ? (file.size / 1048576).toFixed(1) + ' MB'
      : (file.size / 1024).toFixed(0) + ' KB';
    const formatColors = {
      epub: '#4a9eff', pdf: '#ff4a4a', mobi: '#ff9f43',
      txt: '#7bed9f', md: '#a29bfe', html: '#fd79a8'
    };
    const color = formatColors[format] || '#ddd';

    document.getElementById('upload-form-area').innerHTML = `
      <div class="upload-form-card">
        <div class="upload-form-file">
          <span class="format-badge" style="background:${color}">${format.toUpperCase()}</span>
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
        <div class="upload-file-name">Uploading book...</div>
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
        if (statusEl) statusEl.textContent = 'Uploading cover...';
        const coverResult = await S3Upload.upload(this._pendingCoverFile);
        coverUrl = coverResult.url;
      } else {
        coverUrl = coverUrlInput;
      }

      const statusEl = document.getElementById('upload-status');
      if (statusEl) statusEl.textContent = 'Registering...';

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
          <p>&#10003; "${this.escapeHtml(title)}" uploaded successfully!</p>
          <button class="btn btn-primary" onclick="App.renderUploadView()">Upload Another</button>
        </div>
      `;
    } catch (e) {
      progressArea.innerHTML = `<div class="upload-item error">
        <span class="upload-status error">Failed: ${this.escapeHtml(e.message)}</span>
      </div>`;
      btn.disabled = false;
      btn.textContent = 'Retry Upload';
    }
  },

  showSettings() {
    this.state.view = 'settings';
    this.hideAllViews();
    document.getElementById('settings-view').classList.remove('hidden');

    const s3 = this.state.s3Config || {};
    const s3Status = s3.accessKeyId
      ? `Connected: ${s3.bucket || 'no bucket'} (${s3.region || 'no region'})`
      : 'Not configured';
    const view = document.getElementById('settings-view');
    view.innerHTML = `
      <div class="settings-panel">
        <button class="btn back-btn" onclick="App.showLibrary()">Back to Library</button>
        <h2>Settings</h2>

        <div class="settings-section">
          <h3>S3 Storage</h3>
          <p class="settings-hint">
            Boox uses your ship's S3 storage configuration from Landscape.
            Configure it in <strong>Landscape &rarr; System Preferences &rarr; Storage</strong>.
          </p>
          <p>Status: <strong>${s3Status}</strong></p>
          ${!s3.accessKeyId ? `
            <p class="settings-hint" style="color:var(--danger)">
              You need to configure S3 storage in Landscape before you can upload books.
            </p>
          ` : ''}
        </div>

        <div class="settings-section">
          <h3>Library</h3>
          <p>${this.state.books.length} book${this.state.books.length !== 1 ? 's' : ''} in library</p>
        </div>
      </div>
    `;
  },

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

      // Handle tags
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
      alert('Failed to save: ' + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  },

  async confirmDeleteBook(bookId) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
    try {
      // Delete file from S3
      if (book['s3-url']) await S3Upload.deleteObject(book['s3-url']).catch(() => {});
      if (book['cover-url']) await S3Upload.deleteObject(book['cover-url']).catch(() => {});
      // Remove from agent
      await BooxAPI.removeBook(bookId);
      await this.loadBooks();
      this.renderLibrary();
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    }
  },

  onSearch(query) {
    this.state.searchQuery = query;
    this.renderLibrary();
  },

  onFilterFormat(format) {
    this.state.filterFormat = format;
    this.renderLibrary();
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
