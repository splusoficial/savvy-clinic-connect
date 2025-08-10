// src/lib/auth-persist.ts

// Tipo local em vez de importar do supabase-js
type SessionLike = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  provider_token?: string | null;
  user?: unknown;
};

/**
 * Backup de sessão do Supabase em IndexedDB (mais estável no iOS).
 * Mantém LS/Cookie só como fallback.
 */

type AuthBackup = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  provider_token?: string | null;
  user?: unknown;
};

// ---------- IndexedDB ----------
const IDB_DB_NAME = 'sp-auth-db';
const IDB_STORE = 'kv';
const IDB_KEY = 'auth_backup';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open error'));
    } catch (e) {
      reject(e);
    }
  });
}

async function idbSet<T = unknown>(key: string, value: T): Promise<void> {
  const db = await openIDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(value as any, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IDB put error'));
  });
  db.close();
}

async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openIDB();
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error || new Error('IDB get error'));
  });
  db.close();
  return result;
}

async function idbDel(key: string): Promise<void> {
  const db = await openIDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IDB delete error'));
  });
  db.close();
}

// ---------- Fallbacks (LS / Cookie) ----------
const LS_KEY = 'sp_auth_backup';
const COOKIE_KEY = 'sp_auth_backup';

function setCookie(name: string, value: string, days = 7) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`;
  } catch {}
}
function getCookie(name: string): string | null {
  try {
    const parts = (document.cookie || '').split('; ');
    const part = parts.find(p => p.startsWith(name + '='));
    return part ? decodeURIComponent(part.split('=').slice(1).join('=')) : null;
  } catch {
    return null;
  }
}
function deleteCookie(name: string) {
  try {
    document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
  } catch {}
}

// ---------- API ----------
export async function persistAuthBackup(session: SessionLike) {
  const payload: AuthBackup = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    provider_token: (session as any)?.provider_token ?? null,
    user: session.user ?? null,
  };

  try { await idbSet<AuthBackup>(IDB_KEY, payload); } catch {}

  // Fallbacks (não confie neles no iOS)
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch {}
  try { setCookie(COOKIE_KEY, JSON.stringify(payload), 7); } catch {}
}

export async function readAuthBackup(): Promise<AuthBackup | null> {
  try {
    const fromIDB = await idbGet<AuthBackup>(IDB_KEY);
    if (fromIDB?.access_token && fromIDB?.refresh_token) return fromIDB;
  } catch {}

  try {
    const fromLS = localStorage.getItem(LS_KEY);
    if (fromLS) {
      const parsed = JSON.parse(fromLS) as AuthBackup;
      if (parsed?.access_token && parsed?.refresh_token) return parsed;
    }
  } catch {}

  try {
    const fromCookie = getCookie(COOKIE_KEY);
    if (fromCookie) {
      const parsed = JSON.parse(fromCookie) as AuthBackup;
      if (parsed?.access_token && parsed?.refresh_token) return parsed;
    }
  } catch {}

  return null;
}

export async function clearAuthBackup() {
  try { await idbDel(IDB_KEY); } catch {}
  try { localStorage.removeItem(LS_KEY); } catch {}
  try { deleteCookie(COOKIE_KEY); } catch {}
}

export async function tryPersistStorage() {
  try {
    // @ts-ignore
    if (navigator?.storage?.persist) {
      // @ts-ignore
      await navigator.storage.persist();
    }
  } catch {}
}