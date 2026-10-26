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
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
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
  emailVerified?: boolean;
  /** Las reglas permiten a esta cuenta ver el panel de administración. */
  isAdmin?: boolean;
  /** El administrador suspendió la cuenta: no se pueden subir cambios. */
  blocked?: boolean;
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
let unsubMember: (() => void) | undefined;
let dirtyWatch: Subscription | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing = false;
let status: SyncStatus = { state: 'sin-sesion', pending: 0 };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<Omit<SyncStatus, 'state'>>) {
  status = { ...status, ...patch };
  status.state = !user ? 'sin-sesion' : status.error || status.blocked ? 'error' : !navigator.onLine ? 'sin-conexion' : status.pending > 0 || pushing ? 'sincronizando' : 'sincronizado';
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
    if (items.length) scheduleMember();
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
    setStatus({ email: u.email ?? undefined, emailVerified: u.emailVerified, error: undefined });
    let first = true;
    unsubMember = onSnapshot(
      doc(fs, 'members', u.uid),
      (snap) => {
        const blocked = snap.data()?.blocked === true;
        setStatus({ blocked, error: blocked ? 'El administrador suspendió esta cuenta: los cambios no se suben.' : status.blocked ? undefined : status.error });
      },
      () => undefined,
    );
    unsubSnapshot = onSnapshot(
      records(),
      async (snapshot) => {
        for (const change of snapshot.docChanges()) if (change.type !== 'removed') await applyRemote(change.doc);
        setStatus({ lastSyncedAt: Date.now(), pending: await countPending(), error: status.blocked ? status.error : undefined });
        // Tras la primera descarga: resumen de la cuenta (cuenta una apertura) y permiso de administrador.
        if (first) {
          first = false;
          void writeMember(true);
          void checkAdmin();
        }
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
  unsubMember?.();
  unsubMember = undefined;
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
    await deleteDoc(doc(fs, 'members', current.uid)).catch(() => undefined);
    stopSync();
    await deleteUser(current);
  } catch (e) {
    throw friendly(e);
  }
}

// ---------- Resumen de la cuenta y administración ----------

const MEMBER_THROTTLE_MS = 5 * 60_000;
let lastMember = 0;
let memberTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleMember() {
  if (memberTimer) clearTimeout(memberTimer);
  memberTimer = setTimeout(() => void writeMember(false), Math.max(0, lastMember + MEMBER_THROTTLE_MS - Date.now()));
}

/** Cuántas recetas, lotes, etc. tiene la cuenta (sin su contenido) y cuándo entró por última vez. */
async function writeMember(opening: boolean) {
  if (!user) return;
  lastMember = Date.now();
  try {
    await setDoc(
      doc(fs, 'members', user.uid),
      {
        email: user.email ?? '',
        createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
        lastSeenAt: serverTimestamp(),
        recipes: await db.recipes.filter((r) => !r.archived).count(),
        versions: await db.recipeVersions.count(),
        batches: await db.batches.count(),
        inventory: await db.inventory.count(),
        ...(opening ? { opens: increment(1) } : {}),
      },
      { merge: true },
    );
  } catch {
    // Sin permiso o sin conexión: no afecta la sincronización de los datos.
  }
}

/** Solo las reglas de Firestore saben quién administra: se intenta leer la lista de cuentas. */
async function checkAdmin() {
  if (!user?.emailVerified) return setStatus({ isAdmin: false });
  try {
    await getDocs(query(collection(fs, 'members'), limit(1)));
    setStatus({ isAdmin: true });
  } catch {
    setStatus({ isAdmin: false });
  }
}

export interface Member {
  uid: string;
  email: string;
  createdAt?: string;
  lastSeenAt?: number;
  opens: number;
  recipes: number;
  versions: number;
  batches: number;
  inventory: number;
  blocked: boolean;
}

export async function listMembers(): Promise<Member[]> {
  initFirebase();
  try {
    const snap = await getDocs(collection(fs, 'members'));
    return snap.docs.map((d) => {
      const m = d.data();
      return {
        uid: d.id,
        email: String(m.email ?? ''),
        createdAt: m.createdAt ?? undefined,
        lastSeenAt: m.lastSeenAt instanceof Timestamp ? m.lastSeenAt.toMillis() : undefined,
        opens: Number(m.opens ?? 0),
        recipes: Number(m.recipes ?? 0),
        versions: Number(m.versions ?? 0),
        batches: Number(m.batches ?? 0),
        inventory: Number(m.inventory ?? 0),
        blocked: m.blocked === true,
      };
    });
  } catch (e) {
    throw new Error((e as { code?: string })?.code === 'permission-denied' ? 'Sin permiso para ver las cuentas.' : 'No se pudo cargar la lista de cuentas.');
  }
}

/** Suspende o reactiva una cuenta (solo el administrador, según las reglas). */
export async function setBlocked(uid: string, blocked: boolean) {
  initFirebase();
  try {
    await updateDoc(doc(fs, 'members', uid), { blocked, blockedAt: blocked ? serverTimestamp() : null });
  } catch (e) {
    throw friendly(e);
  }
}

export interface UsageDay {
  day: string;
  opens: number;
  cuenta: number;
  local: number;
  sinRegistro: number;
  devices?: number;
}

/** Aperturas por día y equipos distintos (estos solo en los últimos `deviceDays` días, para leer poco). */
export async function usageStats(deviceDays = 14): Promise<UsageDay[]> {
  initFirebase();
  const snap = await getDocs(collection(fs, 'usage'));
  const days: UsageDay[] = snap.docs
    .map((d) => ({ day: d.id, opens: Number(d.data().opens ?? 0), cuenta: Number(d.data().cuenta ?? 0), local: Number(d.data().local ?? 0), sinRegistro: Number(d.data().sinRegistro ?? 0) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  for (const d of days.slice(-deviceDays)) {
    try {
      d.devices = (await getCountFromServer(collection(fs, 'usage', d.day, 'devices'))).data().count;
    } catch {
      /* sin permiso o sin conexión */
    }
  }
  return days;
}

/** Envía el correo para verificar la cuenta (necesario para administrar). */
export async function sendVerification() {
  initFirebase();
  if (!auth.currentUser) throw new Error('No hay una sesión iniciada.');
  try {
    await sendEmailVerification(auth.currentUser);
  } catch (e) {
    throw friendly(e);
  }
}

/** Vuelve a consultar si el correo ya se verificó (tras abrir el enlace del correo). */
export async function refreshVerification(): Promise<boolean> {
  initFirebase();
  const current = auth.currentUser;
  if (!current) return false;
  await current.reload();
  await current.getIdToken(true);
  setStatus({ emailVerified: current.emailVerified });
  await checkAdmin();
  return current.emailVerified;
}
