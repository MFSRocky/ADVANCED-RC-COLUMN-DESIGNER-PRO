/** Project storage: IndexedDB primary, LocalStorage/memory fallback so the UI never fails to boot. */
import { newId, clone } from '../core/id.js';

const DB_NAME = 'rc-column-designer-pro';
const DB_VERSION = 1;
const STORE = 'projects';
const PREF_KEY = 'rcdp.preferences';
const BACKUP_KEY = 'rcdp.backup';
const FALLBACK_KEY = 'rcdp.projects.fallback';

let storageMode = 'indexeddb';
let storageWarning = null;
const memoryProjects = new Map();

function setFallbackMode(reason) {
  storageMode = 'local';
  storageWarning = reason ?? 'IndexedDB unavailable; using local backup storage.';
  try { window.dispatchEvent(new CustomEvent('rcdp-storage-warning', { detail: storageWarning })); } catch { }
}
export function getStorageStatus() { return { mode: storageMode, warning: storageWarning }; }

function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function lsRemove(key) { try { localStorage.removeItem(key); } catch { } }

function readFallback() {
  try {
    const raw = lsGet(FALLBACK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return [...memoryProjects.values()];
}
function writeFallback(list) {
  memoryProjects.clear();
  for (const p of list) memoryProjects.set(p.id, p);
  lsSet(FALLBACK_KEY, JSON.stringify(list));
}

export function openDB() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg); } };
    const timer = setTimeout(() => finish(reject, new Error('IndexedDB open timed out.')), 2500);
    try {
      if (typeof indexedDB === 'undefined') return finish(reject, new Error('IndexedDB is not available in this environment.'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => finish(resolve, req.result);
      req.onerror = () => finish(reject, req.error ?? new Error('IndexedDB open failed.'));
      req.onblocked = () => finish(reject, new Error('IndexedDB open blocked by another tab.'));
    } catch (e) { finish(reject, e); }
  });
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => { resolve(result?.result ?? result); db.close(); };
      t.onerror = () => { reject(t.error ?? new Error('IndexedDB transaction failed.')); db.close(); };
      t.onabort = () => { reject(t.error ?? new Error('IndexedDB transaction aborted.')); db.close(); };
    } catch (e) { try { db.close(); } catch { } reject(e); }
  });
}

export async function listProjects() {
  try {
    const db = await openDB();
    const list = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => { resolve(req.result ?? []); db.close(); };
      req.onerror = () => { reject(req.error); db.close(); };
    });
    storageMode = 'indexeddb';
    return list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } catch (e) {
    setFallbackMode(e?.message);
    return readFallback().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }
}

export async function getProject(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { reject(req.error); db.close(); };
    });
  } catch (e) {
    setFallbackMode(e?.message);
    return readFallback().find(p => p.id === id) ?? null;
  }
}

export async function saveProject(project) {
  const p = { ...project, updatedAt: new Date().toISOString() };
  try {
    await tx('readwrite', store => store.put(p));
    storageMode = 'indexeddb';
  } catch (e) {
    setFallbackMode(e?.message);
    const list = readFallback().filter(x => x.id !== p.id);
    list.push(p);
    writeFallback(list);
  }
  lsSet(BACKUP_KEY, JSON.stringify({ savedAt: p.updatedAt, project: p }));
  return p;
}

export async function deleteProject(id) {
  try { await tx('readwrite', store => store.delete(id)); }
  catch (e) { setFallbackMode(e?.message); writeFallback(readFallback().filter(p => p.id !== id)); }
  const backup = getBackup();
  if (backup?.project?.id === id) lsRemove(BACKUP_KEY);
}

export async function renameProject(id, name) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  p.name = name;
  return saveProject(p);
}

export async function duplicateProject(id) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  const copy = clone(p);
  copy.id = newId();
  copy.name = `${p.name} (copy)`;
  copy.createdAt = new Date().toISOString();
  return saveProject(copy);
}

export function getPreferences() {
  try { return JSON.parse(lsGet(PREF_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
export function setPreferences(prefs) {
  lsSet(PREF_KEY, JSON.stringify({ ...getPreferences(), ...prefs }));
}
export function getBackup() {
  try { return JSON.parse(lsGet(BACKUP_KEY) ?? 'null'); } catch { return null; }
}
export function clearBackup() { lsRemove(BACKUP_KEY); }

let autosaveTimer = null;
export function scheduleAutosave(project, delay = 1200) {
  clearTimeout(autosaveTimer);
  if (!project) return;
  autosaveTimer = setTimeout(() => { saveProject(project).catch(() => { }); }, delay);
}
