// Boox API client
// Communicates with the %boox agent via JSON HTTP API

const BooxAPI = {
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
  }
};
