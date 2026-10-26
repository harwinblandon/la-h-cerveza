// Perfiles locales: varios cerveceros en el mismo navegador, cada uno con su base
// de datos (recetas, lotes, inventario, agua, ajustes). Sin servidor ni correo.
//
// Seguridad, dicho con honestidad: la clave impide que otra persona entre a tu
// perfil desde la app, pero los datos quedan en el navegador sin cifrar. Quien
// tenga acceso al equipo con herramientas de desarrollador podría leerlos.

import Dexie, { type EntityTable } from 'dexie';

export interface Profile {
  id: string;
  /** Identificador para entrar (minúsculas, sin espacios). */
  username: string;
  displayName: string;
  /** Base de datos de este perfil. */
  dbName: string;
  /** Huella PBKDF2 de la clave (base64); sin clave si no existe. */
  passHash?: string;
  salt?: string;
  createdAt: number;
  lastLoginAt?: number;
  /** Espacio de uso sin registro: sin nombre ni clave. */
  guest?: boolean;
  /** Cuenta con correo (Firebase) a la que se sincroniza este perfil. */
  uid?: string;
  email?: string;
}

class RegistryDb extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  constructor() {
    super('la-h-perfiles');
    this.version(1).stores({ profiles: 'id, &username, lastLoginAt' });
  }
}

export const registry = new RegistryDb();

/** Base que existía antes de los perfiles: pasa intacta al primer perfil que se cree. */
export const LEGACY_DB = 'la-h-cerveceria';
const SESSION_KEY = 'la-h-sesion';

interface Session {
  profileId: string;
  dbName: string;
}

function readSession(): Session | undefined {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const raw = store().getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      /* almacenamiento no disponible */
    }
  }
  return undefined;
}

/** Perfil activo al cargar la página (se lee de forma síncrona para abrir su base). */
export const SESSION = readSession();

export function startSession(p: Profile, remember: boolean) {
  const value = JSON.stringify({ profileId: p.id, dbName: p.dbName } satisfies Session);
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, value);
  } catch {
    /* sin almacenamiento: la sesión dura lo que dure la pestaña */
  }
}

export function endSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nada que limpiar */
  }
}

/** Recarga la app para abrir la base del perfil elegido. */
export function reloadApp(path = '#/') {
  window.location.hash = path;
  window.location.reload();
}

// ---------- Claves ----------

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256);
  return b64(bits);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), passHash: await derive(password, salt) };
}

export async function checkPassword(p: Profile, password: string): Promise<boolean> {
  if (!p.passHash || !p.salt) return true;
  return (await derive(password, unb64(p.salt))) === p.passHash;
}

// ---------- Perfiles ----------

export const normalizeUsername = (u: string) =>
  u
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '');

export async function legacyDataExists(): Promise<boolean> {
  if (!(await Dexie.exists(LEGACY_DB))) return false;
  const used = await registry.profiles.where('username').notEqual('').filter((p) => p.dbName === LEGACY_DB).count();
  return used === 0;
}

export async function createProfile(opts: { username: string; displayName: string; password?: string; useLegacyData?: boolean }): Promise<Profile> {
  const username = normalizeUsername(opts.username);
  if (username.length < 2) throw new Error('El usuario necesita al menos 2 letras o números.');
  if (await registry.profiles.where('username').equals(username).count()) throw new Error(`Ya existe un perfil "${username}" en este navegador.`);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const profile: Profile = {
    id,
    username,
    displayName: opts.displayName.trim() || username,
    dbName: opts.useLegacyData ? LEGACY_DB : `la-h-cerveceria-${id}`,
    createdAt: Date.now(),
    ...(opts.password ? await hashPassword(opts.password) : {}),
  };
  await registry.profiles.add(profile);
  return profile;
}

/** Perfil de una cuenta con correo: se reutiliza si ya existe en este navegador, o se crea (sus datos bajan de la nube). */
export async function accountProfile(account: { uid: string; email: string | null }, displayName?: string): Promise<{ profile: Profile; created: boolean }> {
  const existing = (await registry.profiles.toArray()).find((p) => p.uid === account.uid);
  if (existing) return { profile: existing, created: false };
  const email = (account.email ?? '').toLowerCase();
  let username = email || `cuenta-${account.uid.slice(0, 8)}`;
  while (await registry.profiles.where('username').equals(username).count()) username = `${username}-2`;
  const profile: Profile = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    username,
    displayName: displayName?.trim() || email.split('@')[0] || 'Cuenta',
    dbName: `la-h-cuenta-${account.uid}`,
    createdAt: Date.now(),
    uid: account.uid,
    email,
  };
  await registry.profiles.add(profile);
  return { profile, created: true };
}

/** Vincula un perfil local a una cuenta: sus datos se suben y desde ahí se sincronizan. */
export async function linkProfile(profileId: string, account: { uid: string; email: string | null }) {
  const other = (await registry.profiles.toArray()).find((p) => p.uid === account.uid && p.id !== profileId);
  if (other) throw new Error(`Esa cuenta ya está en este navegador como el perfil «${other.displayName}». Entra con ese perfil.`);
  await registry.profiles.update(profileId, { uid: account.uid, email: (account.email ?? '').toLowerCase(), guest: false, passHash: undefined, salt: undefined });
}

export const GUEST_USERNAME = 'sin-registro';

/** Espacio para usar la app sin registrarse. Se crea la primera vez y se reutiliza. */
export async function guestProfile(): Promise<{ profile: Profile; created: boolean }> {
  const existing = await registry.profiles.where('username').equals(GUEST_USERNAME).first();
  if (existing) return { profile: existing, created: false };
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const profile: Profile = { id, username: GUEST_USERNAME, displayName: 'Sin registro', dbName: `la-h-cerveceria-${id}`, createdAt: Date.now(), guest: true };
  await registry.profiles.add(profile);
  return { profile, created: true };
}

export async function setPassword(profileId: string, password?: string) {
  if (!password) {
    await registry.profiles.update(profileId, { passHash: undefined, salt: undefined });
    return;
  }
  await registry.profiles.update(profileId, await hashPassword(password));
}

export async function touchLogin(profileId: string) {
  await registry.profiles.update(profileId, { lastLoginAt: Date.now() });
}

/** Borra el perfil y todos sus datos. No se puede deshacer. */
export async function deleteProfile(p: Profile) {
  await Dexie.delete(p.dbName);
  await registry.profiles.delete(p.id);
}
