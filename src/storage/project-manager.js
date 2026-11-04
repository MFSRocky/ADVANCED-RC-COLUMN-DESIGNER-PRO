/** IndexedDB project storage + LocalStorage preferences. Browser-only; no network. */
const DB_NAME = 'rc-column-designer-pro';
const DB_VERSION = 1;
const STORE = 'projects';
const PREF_KEY = 'rcdp.preferences';
const BACKUP_KEY = 'rcdp.backup';

export function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available in this environment.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => { resolve(result?.result ?? result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

export async function listProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => { resolve(req.result.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}
export async function getProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}
export async function saveProject(project) {
  const p = { ...project, updatedAt: new Date().toISOString() };
  await tx('readwrite', store => store.put(p));
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: p.updatedAt, project: p })); } catch { }
  return p;
}
export async function deleteProject(id) { return tx('readwrite', store => store.delete(id)); }
export async function renameProject(id, name) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  p.name = name;
  return saveProject(p);
}
export async function duplicateProject(id) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  const copy = structuredClone(p);
  copy.id = crypto.randomUUID();
  copy.name = `${p.name} (copy)`;
  copy.createdAt = new Date().toISOString();
  return saveProject(copy);
}

export function getPreferences() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}'); } catch { return {}; }
}
export function setPreferences(prefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify({ ...getPreferences(), ...prefs }));
}
export function getBackup() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? 'null'); } catch { return null; }
}
export function clearBackup() { localStorage.removeItem(BACKUP_KEY); }

let autosaveTimer = null;
export function scheduleAutosave(project, delay = 1200) {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { saveProject(project).catch(console.error); }, delay);
}
