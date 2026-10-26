// Cuentas con correo y clave (Firebase Auth) y sincronización del perfil con Firestore.
// Se carga solo cuando hace falta (perfil con cuenta o al iniciar sesión), para que la app
// siga siendo liviana y funcione sin internet.
//
// Documento en Firestore: users/{uid}/records/{tabla}__{id} con el registro serializado en JSON.
// Gana siempre la versión más reciente (_v); los borrados viajan como marcas.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, onSnapshot, serverTimestamp, writeBatch, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { liveQuery, type Subscription } from 'dexie';
import { db } from '../db';
import { firebaseConfig } from '../firebaseConfig';
import { REMOTE, SYNCED_TABLES, decideRemote, markRemoteDelete, stripSyncFields, type SyncedTable } from './middleware';

export type SyncState = 'sin-sesion' | 'sincronizando' | 'sincronizado' | 'sin-conexion' | 'error';

export interface SyncStatus {
  state: SyncState;
  email?: string;
  /** Cambios locales pendientes de subir. */
  pending: number;
  lastSyncedAt?: number;
  error?: string;
}

interface RemoteRecord {
  table: SyncedTable;
  id: string;
  json: string;
  v: number;
  deleted: boolean;
}

const BATCH_SIZE = 400;

let app: FirebaseApp | undefined;
let auth: Auth;
let fs: Firestore;
let user: User | null = null;
let unsubSnapshot: (() => void) | undefined;
let dirtyWatch: Subscription | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing = false;
let status: SyncStatus = { state: 'sin-sesion', pending: 0 };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<Omit<SyncStatus, 'state'>>) {
  status = { ...status, ...patch };
  status.state = !user ? 'sin-sesion' : status.error ? 'error' : !navigator.onLine ? 'sin-conexion' : status.pending > 0 || pushing ? 'sincronizando' : 'sincronizado';
  for (const l of listeners) l(status);
}

export function subscribeStatus(listener: (s: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

/** Inicia Firebase (una sola vez). */
export function initFirebase() {
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  fs = getFirestore(app);
  window.addEventListener('online', () => {
    setStatus({});
    schedulePush();
  });
  window.addEventListener('offline', () => setStatus({}));
}

/** Usuario con sesión iniciada en este navegador (espera a que Firebase la recupere). */
export function currentUser(): Promise<User | null> {
  initFirebase();
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => {
      stop();
      resolve(u);
    });
  });
}

const records = () => collection(fs, 'users', user!.uid, 'records');
const recordRef = (table: string, id: string) => doc(fs, 'users', user!.uid, 'records', `${table}__${id}`);

async function countPending(): Promise<number> {
  let n = await db.tombstones.count();
  for (const t of SYNCED_TABLES) n += await db.table(t).where('_dirty').equals(1).count();
  return n;
}

/** Sube los registros pendientes y las marcas de borrado. */
async function push() {
  if (!user || pushing) return;
  pushing = true;
  setStatus({});
  try {
    type Item = { ref: ReturnType<typeof recordRef>; data: RemoteRecord; done: () => Promise<void> };
    const items: Item[] = [];
    for (const t of SYNCED_TABLES) {
      const dirty = (await db.table(t).where('_dirty').equals(1).toArray()) as Record<string, unknown>[];
      for (const v of dirty) {
        const id = String(v.id);
        const version = Number(v._v ?? 1);
        items.push({
          ref: recordRef(t, id),
          data: { table: t, id, json: JSON.stringify(stripSyncFields(v)), v: version, deleted: false },
          // Se marca como subido solo si nadie lo cambió mientras tanto.
          done: async () => {
            const current = (await db.table(t).get(id)) as Record<string, unknown> | undefined;
            if (current && current._v === version) await db.table(t).put({ ...current, _dirty: 0, [REMOTE]: true });
          },
        });
      }
    }
    for (const tomb of await db.tombstones.toArray()) {
      items.push({
        ref: recordRef(tomb.table, tomb.id),
        data: { table: tomb.table, id: tomb.id, json: '', v: tomb._v, deleted: true },
        done: async () => {
          const current = await db.tombstones.get(tomb.key);
          if (current && current._v === tomb._v) await db.tombstones.delete(tomb.key);
        },
      });
    }
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(fs);
      for (const it of chunk) batch.set(it.ref, { ...it.data, updatedAt: serverTimestamp() });
      await batch.commit();
      for (const it of chunk) await it.done();
    }
    setStatus({ lastSyncedAt: Date.now(), error: undefined });
  } catch (e) {
    setStatus({ error: friendly(e).message });
  } finally {
    pushing = false;
    setStatus({ pending: await countPending() });
  }
}

function schedulePush() {
  if (!user) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), 3000);
}

/** Aplica un registro que llega de la nube si es más reciente que el local. */
async function applyRemote(snap: QueryDocumentSnapshot) {
  const r = snap.data() as RemoteRecord;
  if (!(SYNCED_TABLES as readonly string[]).includes(r.table)) return;
  const table = db.table(r.table);
  const local = (await table.get(r.id)) as Record<string, unknown> | undefined;
  const decision = decideRemote(local && { v: Number(local._v ?? 0), dirty: Number(local._dirty ?? 0) }, r);
  if (decision === 'apply') await table.put({ ...JSON.parse(r.json), _v: r.v, _dirty: 0, [REMOTE]: true });
  else if (decision === 'delete') {
    markRemoteDelete(r.table, r.id);
    await table.delete(r.id);
  } else if (decision === 'mark-clean' && local) await table.put({ ...local, _dirty: 0, [REMOTE]: true });
}

/**
 * Sincroniza la base abierta con la cuenta `uid`. Si en este navegador la sesión de Firebase es de
 * otra cuenta (o no hay), no sincroniza: el perfil sigue funcionando con sus datos locales.
 */
export function startSync(uid: string) {
  initFirebase();
  onAuthStateChanged(auth, (u) => {
    stopSync();
    if (!u || u.uid !== uid) {
      setStatus({ email: undefined, pending: 0, error: undefined });
      return;
    }
    user = u;
    setStatus({ email: u.email ?? undefined, error: undefined });
    unsubSnapshot = onSnapshot(
      records(),
      async (snapshot) => {
        for (const change of snapshot.docChanges()) if (change.type !== 'removed') await applyRemote(change.doc);
        setStatus({ lastSyncedAt: Date.now(), pending: await countPending(), error: undefined });
      },
      (e) => setStatus({ error: friendly(e).message }),
    );
    // Cada cambio local programa una subida.
    dirtyWatch = liveQuery(countPending).subscribe({
      next: (pending) => {
        setStatus({ pending });
        if (pending > 0) schedulePush();
      },
    });
  });
}

function stopSync() {
  unsubSnapshot?.();
  unsubSnapshot = undefined;
  dirtyWatch?.unsubscribe();
  dirtyWatch = undefined;
  if (pushTimer) clearTimeout(pushTimer);
  user = null;
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'El correo no es válido.',
  'auth/missing-password': 'Escribe la clave.',
  'auth/weak-password': 'La clave debe tener al menos 6 caracteres.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Usa «Entrar».',
  'auth/invalid-credential': 'Correo o clave incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'Correo o clave incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Inténtalo con internet.',
  'auth/requires-recent-login': 'Por seguridad, cierra sesión, vuelve a entrar y repite la operación.',
  'permission-denied': 'La cuenta no tiene permiso para esos datos.',
  unavailable: 'Sin conexión con la nube: los cambios se subirán al volver internet.',
};

function friendly(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? '';
  return new Error(AUTH_ERRORS[code] ?? 'No se pudo completar la operación. Inténtalo de nuevo.');
}

export async function signIn(email: string, password: string): Promise<User> {
  initFirebase();
  try {
    return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
  } catch (e) {
    throw friendly(e);
  }
}

export async function signUp(email: string, password: string): Promise<User> {
  initFirebase();
  try {
    return (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
  } catch (e) {
    throw friendly(e);
  }
}

export async function resetPassword(email: string) {
  initFirebase();
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    throw friendly(e);
  }
}

/** Cierra la sesión de la cuenta en este navegador. */
export async function signOutAccount() {
  initFirebase();
  stopSync();
  await signOut(auth);
  setStatus({ email: undefined, pending: 0, error: undefined });
}

/** Sube ya lo pendiente y espera a que termine. */
export async function syncNow() {
  await push();
}

export const pendingChanges = countPending;

/** Elimina la cuenta y todos sus datos en la nube (los datos locales los borra quien llama). */
export async function deleteAccountAndData() {
  initFirebase();
  const current = auth.currentUser;
  if (!current) throw new Error('No hay una sesión iniciada.');
  try {
    const snapshot = await getDocs(collection(fs, 'users', current.uid, 'records'));
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(fs);
      for (const d of snapshot.docs.slice(i, i + BATCH_SIZE)) batch.delete(d.ref);
      await batch.commit();
    }
    stopSync();
    await deleteUser(current);
  } catch (e) {
    throw friendly(e);
  }
}
