const STORAGE_KEY = 'markdown-keep-notes';
const THEME_KEY = 'markdown-keep-theme';

const elements = {
  title: document.getElementById('note-title'),
  body: document.getElementById('note-body'),
  tags: document.getElementById('note-tags'),
  save: document.getElementById('save-note'),
  clear: document.getElementById('clear-editor'),
  preview: document.getElementById('preview'),
  copyPreview: document.getElementById('copy-preview'),
  search: document.getElementById('search-input'),
  filterButtons: document.querySelectorAll('.filters .chip'),
  viewButtons: document.querySelectorAll('.view-toggle .icon-button'),
  notesContainer: document.getElementById('notes-container'),
  export: document.getElementById('export-notes'),
  toggleTheme: document.getElementById('toggle-theme'),
};

let notes = [];
let activeFilter = 'all';
let activeView = 'grid';
let editingId = null;

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      updatedAt: item.updatedAt ?? Date.now(),
    }));
  } catch (error) {
    console.error('Failed to parse notes', error);
    return [];
  }
}

function persistNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  }
  updateThemeButton();
}

function updateThemeButton() {
  const isDark = document.documentElement.classList.contains('dark');
  elements.toggleTheme.querySelector('.material-symbols-outlined').textContent =
    isDark ? 'dark_mode' : 'light_mode';
}

function toggleTheme() {
  const root = document.documentElement;
  root.classList.toggle('dark');
  const theme = root.classList.contains('dark') ? 'dark' : 'light';
  saveTheme(theme);
  updateThemeButton();
}

function toHtml(markdown) {
  if (!markdown) return '<p class="placeholder">Start writing to see preview</p>';
  return marked.parse(markdown, { breaks: true });
}

function updatePreview() {
  const markdown = elements.body.value;
  elements.preview.innerHTML = toHtml(markdown);
}

function clearEditor() {
  elements.title.value = '';
  elements.body.value = '';
  elements.tags.value = '';
  editingId = null;
  elements.save.textContent = 'Save Note';
  updatePreview();
}

function createNotePayload() {
  const title = elements.title.value.trim();
  const body = elements.body.value.trim();
  const tags = elements.tags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!title && !body) {
    alert('Add a title or body to save the note.');
    return null;
  }

  return {
    id: editingId ?? crypto.randomUUID(),
    title: title || 'Untitled note',
    body,
    tags,
    pinned: editingId ? getNote(editingId)?.pinned ?? false : false,
    archived: editingId ? getNote(editingId)?.archived ?? false : false,
    updatedAt: Date.now(),
  };
}

function getNote(id) {
  return notes.find((note) => note.id === id);
}

function upsertNote(payload) {
  const index = notes.findIndex((note) => note.id === payload.id);
  if (index >= 0) {
    notes[index] = { ...notes[index], ...payload };
  } else {
    notes.unshift(payload);
  }
  persistNotes();
  renderNotes();
  clearEditor();
}

function deleteNote(id) {
  notes = notes.filter((note) => note.id !== id);
  persistNotes();
  renderNotes();
}

function togglePin(id) {
  const note = getNote(id);
  if (!note) return;
  note.pinned = !note.pinned;
  note.updatedAt = Date.now();
  sortNotes();
  persistNotes();
  renderNotes();
}

function toggleArchive(id) {
  const note = getNote(id);
  if (!note) return;
  note.archived = !note.archived;
  note.updatedAt = Date.now();
  sortNotes();
  persistNotes();
  renderNotes();
}

function sortNotes() {
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function filterNotes() {
  const query = elements.search.value.trim().toLowerCase();
  return notes.filter((note) => {
    if (activeFilter === 'pinned' && !note.pinned) return false;
    if (activeFilter === 'archived' && !note.archived) return false;

    if (!query) return true;
    const inTitle = note.title.toLowerCase().includes(query);
    const inBody = note.body.toLowerCase().includes(query);
    const inTags = note.tags.some((tag) => tag.toLowerCase().includes(query));
    return inTitle || inBody || inTags;
  });
}

function renderNotes() {
  elements.notesContainer.innerHTML = '';
  const filtered = filterNotes();
  if (!filtered.length) {
    elements.notesContainer.innerHTML = '<p class="empty-state">No notes yet. Create your first one!</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((note) => {
    const card = createNoteCard(note);
    fragment.appendChild(card);
  });
  elements.notesContainer.appendChild(fragment);
}

function createNoteCard(note) {
  const template = document.getElementById('note-template');
  const clone = template.content.firstElementChild.cloneNode(true);

  clone.dataset.id = note.id;
  clone.querySelector('.note-card__title').textContent = note.title;
  clone.querySelector('.note-card__content').innerHTML = toHtml(note.body);
  const tagsContainer = clone.querySelector('.note-card__tags');
  tagsContainer.innerHTML = '';
  note.tags.forEach((tag) => {
    const li = document.createElement('li');
    li.textContent = tag;
    tagsContainer.appendChild(li);
  });
  clone.querySelector('time').textContent = formatDate(note.updatedAt);

  const pinIcon = clone.querySelector('.pin .material-symbols-outlined');
  pinIcon.textContent = note.pinned ? 'push_pin' : 'push_pin';
  clone.querySelector('.pin').classList.toggle('active', note.pinned);
  clone.querySelector('.archive').classList.toggle('active', note.archived);

  clone.querySelector('.pin').addEventListener('click', () => togglePin(note.id));
  clone.querySelector('.archive').addEventListener('click', () => toggleArchive(note.id));
  clone.querySelector('.delete').addEventListener('click', () => deleteNote(note.id));
  clone.querySelector('.edit').addEventListener('click', () => loadNoteIntoEditor(note.id));

  enableDrag(clone);

  return clone;
}

function loadNoteIntoEditor(id) {
  const note = getNote(id);
  if (!note) return;
  elements.title.value = note.title;
  elements.body.value = note.body;
  elements.tags.value = note.tags.join(', ');
  editingId = id;
  elements.save.textContent = 'Update Note';
  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exportNotes() {
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'markdown-keep-notes.json';
  a.click();
  URL.revokeObjectURL(url);
}

function copyPreview() {
  const selection = elements.preview.innerText;
  navigator.clipboard
    .writeText(selection)
    .then(() => {
      toast('Preview copied to clipboard');
    })
    .catch(() => {
      alert('Unable to copy preview.');
    });
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  requestAnimationFrame(() => {
    node.classList.add('visible');
  });
  setTimeout(() => {
    node.classList.remove('visible');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
  }, 2200);
}

function enableDrag(card) {
  card.addEventListener('dragstart', () => {
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    persistOrder();
  });
}

elements.notesContainer.addEventListener('dragover', (event) => {
  event.preventDefault();
  const dragging = document.querySelector('.note-card.dragging');
  if (!dragging) return;
  const afterElement = getDragAfterElement(event.clientY);
  if (afterElement == null) {
    elements.notesContainer.appendChild(dragging);
  } else {
    elements.notesContainer.insertBefore(dragging, afterElement);
  }
});

function getDragAfterElement(y) {
  const draggableElements = [...elements.notesContainer.querySelectorAll('.note-card:not(.dragging)')];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function persistOrder() {
  const orderedIds = [...elements.notesContainer.querySelectorAll('.note-card')].map((card) => card.dataset.id);
  notes = orderedIds
    .map((id) => getNote(id))
    .filter(Boolean);
  persistNotes();
}

function handleFilterClick(button) {
  activeFilter = button.dataset.filter;
  elements.filterButtons.forEach((b) => b.classList.toggle('active', b === button));
  renderNotes();
}

function handleViewClick(button) {
  activeView = button.dataset.view;
  elements.viewButtons.forEach((b) => b.classList.toggle('active', b === button));
  elements.notesContainer.classList.toggle('notes--grid', activeView === 'grid');
  elements.notesContainer.classList.toggle('notes--list', activeView === 'list');
}

function bindEvents() {
  elements.body.addEventListener('input', updatePreview);
  elements.save.addEventListener('click', () => {
    const payload = createNotePayload();
    if (payload) {
      upsertNote(payload);
      toast(editingId ? 'Note updated' : 'Note saved');
    }
  });
  elements.clear.addEventListener('click', clearEditor);
  elements.copyPreview.addEventListener('click', copyPreview);
  elements.search.addEventListener('input', renderNotes);
  elements.export.addEventListener('click', exportNotes);
  elements.toggleTheme.addEventListener('click', toggleTheme);

  elements.filterButtons.forEach((button) => {
    button.addEventListener('click', () => handleFilterClick(button));
  });

  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => handleViewClick(button));
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      notes = loadNotes();
      sortNotes();
      renderNotes();
    }
  });
}

function initialize() {
  notes = loadNotes();
  sortNotes();
  loadTheme();
  updatePreview();
  bindEvents();
  renderNotes();
}

initialize();
