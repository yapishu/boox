// Boox API client
// Communicates with the %boox agent via JSON HTTP API

window.BooxAPI = {
  base: '/apps/boox/api',

  async get(path) {
    const res = await fetch(`${this.base}/${path}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async poke(action) {
    const res = await fetch(this.base, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action)
    });
    if (!res.ok) throw new Error(`Poke error: ${res.status}`);
    const data = await res.json();
    window.dispatchEvent(new CustomEvent('boox-state-changed'));
    return data;
  },

  getBooks()      { return this.get('books'); },
  getBook(id)     { return this.get(`book/${id}`); },
  getS3Config()   { return this.get('s3-config'); },
  getCollections() { return this.get('collections'); },
  getPals()       { return this.get('pals'); },

  addBook(bookId, metadata) {
    return this.poke({
      action: 'add-book',
      'book-id': bookId,
      ...metadata
    });
  },

  removeBook(bookId) {
    return this.poke({ action: 'remove-book', 'book-id': bookId });
  },

  updateMetadata(bookId, title, author, description, coverUrl) {
    return this.poke({
      action: 'update-metadata',
      'book-id': bookId,
      title, author, description,
      'cover-url': coverUrl || ''
    });
  },

  setPosition(bookId, value, progress) {
    return this.poke({
      action: 'set-position',
      'book-id': bookId,
      value: String(value),
      progress: Math.floor(progress)
    });
  },

  addTag(bookId, tag) {
    return this.poke({ action: 'add-tag', 'book-id': bookId, tag });
  },

  removeTag(bookId, tag) {
    return this.poke({ action: 'remove-tag', 'book-id': bookId, tag });
  },

  reorderBooks(order) {
    return this.poke({ action: 'reorder-books', order });
  },

  addToCollection(name, bookId) {
    return this.poke({ action: 'add-to-collection', name, 'book-id': bookId });
  },

  removeFromCollection(name, bookId) {
    return this.poke({ action: 'remove-from-collection', name, 'book-id': bookId });
  },

  deleteCollection(name) {
    return this.poke({ action: 'delete-collection', name });
  },

  createCollection(name, description) {
    return this.poke({ action: 'create-collection', name, description: description || '' });
  },

  shareCollection(name) {
    return this.poke({ action: 'share-collection', name });
  },

  unshareCollection(name) {
    return this.poke({ action: 'unshare-collection', name });
  },

  publishCollection(name) {
    return this.poke({ action: 'publish-collection', name });
  },

  unpublishCollection(name) {
    return this.poke({ action: 'unpublish-collection', name });
  },

  toggleReadable(name) {
    return this.poke({ action: 'toggle-readable', name });
  },

  // Browse a friend's shared collections by @p
  // Pokes the remote ship, then polls /remote/<ship> for cached results
  browseShip(ship) {
    return this.poke({ action: 'browse-ship', ship });
  },

  // Get cached remote data for a ship (after browse-ship poke)
  getRemoteData(ship) {
    return this.get(`remote/${encodeURIComponent(ship)}`);
  },

  // Send a book to a friend
  sendBook(bookId, to) {
    return this.poke({ action: 'send-book', 'book-id': bookId, to });
  },

  // Get pending book imports from friends
  getPending() {
    return this.get('pending');
  },

  // Get settings (opds-enabled, etc)
  getSettings() { return this.get('settings'); },

  // Toggle OPDS on/off
  toggleOpds() {
    return this.poke({ action: 'toggle-opds' });
  },

  // Set OPDS password
  setOpdsPassword(password) {
    return this.poke({ action: 'set-opds-password', password });
  },

  // Dismiss (reject) a pending book
  dismissPending(pid) {
    return this.poke({ action: 'dismiss-pending', pid });
  },

  // Fetch a remote ship's public collections (cross-origin, for public links)
  async getRemotePublicCollections(shipUrl) {
    const url = shipUrl.replace(/\/$/, '') + '/apps/boox/api/public/collections';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Remote error: ${res.status}`);
    return res.json();
  },

  // Fetch a remote ship's public collection by token (cross-origin)
  async getRemotePublicCollection(shipUrl, token) {
    const url = shipUrl.replace(/\/$/, '') + '/apps/boox/api/public/' + encodeURIComponent(token);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Remote error: ${res.status}`);
    return res.json();
  }
};
