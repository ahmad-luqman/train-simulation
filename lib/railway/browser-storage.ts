import { SaveStore, type StorageLike } from './save-store';
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('steam-atlas-saves', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('slots');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        database = undefined;
        reject(
          new Error(
            'Save storage is unavailable. Export your railway to keep a copy.',
          ),
        );
      };
      request.onblocked = () => {
        database = undefined;
        reject(new Error('Close other Steam Atlas tabs and try again.'));
      };
    });
  return database;
}
let queue: Promise<unknown> = Promise.resolve();
const storage: StorageLike = {
  async getItem(key) {
    if (key.startsWith('steam-atlas-save-v')) return localStorage.getItem(key);
    const db = await openDatabase();
    return new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction('slots', 'readonly');
      const request = transaction.objectStore('slots').get(key);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onerror = transaction.onabort = () =>
        reject(
          new Error(
            'Could not read save storage. Try again or import an exported file.',
          ),
        );
    });
  },
  async setItem(key, value) {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('slots', 'readwrite');
      transaction.objectStore('slots').put(value, key);
      // Only report success after commit, never merely after the put request.
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(
          new Error(
            'Could not commit the save. Your previous copy is safe. Export a file to keep current progress.',
          ),
        );
    });
  },
  exclusive(run) {
    const next = queue.then(async () => {
      if (navigator.locks)
        await navigator.locks.request('steam-atlas-save-write', run);
      else await run();
    });
    queue = next.catch(() => undefined);
    return next;
  },
};
export function browserSaveStore() {
  return new SaveStore(storage);
}
