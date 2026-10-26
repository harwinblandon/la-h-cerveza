// Conteo anónimo de uso de la app: una apertura por pestaña y una marca por equipo y día.
// No guarda datos personales: solo el tipo de uso (cuenta, perfil local o sin registro) y un
// identificador aleatorio del equipo. Usa la API REST de Firestore para no cargar Firebase.

import { firebaseConfig } from '../firebaseConfig';

export type UsageKind = 'cuenta' | 'local' | 'sinRegistro';

const BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const DEVICE_KEY = 'la-h-dispositivo';
const SENT_KEY = 'la-h-uso-registrado';

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.getRandomValues(new Uint32Array(3)).reduce((s, n) => s + n.toString(36), '');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'sin-almacenamiento';
  }
}

/** Día en la hora del equipo (AAAA-MM-DD). */
export const usageDay = (d = new Date()) => d.toLocaleDateString('sv-SE');

/** Registra una apertura de la app (una vez por pestaña). Los errores se ignoran: no afecta el uso. */
export async function recordUsage(kind: UsageKind) {
  if (!import.meta.env.PROD || !navigator.onLine) return;
  try {
    if (sessionStorage.getItem(SENT_KEY)) return;
    sessionStorage.setItem(SENT_KEY, '1');
  } catch {
    /* sin almacenamiento: se cuenta igual */
  }
  const day = usageDay();
  const key = `key=${firebaseConfig.apiKey}`;
  try {
    await fetch(`${BASE}:commit?${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            transform: {
              document: `projects/${firebaseConfig.projectId}/databases/(default)/documents/usage/${day}`,
              fieldTransforms: [
                { fieldPath: 'opens', increment: { integerValue: '1' } },
                { fieldPath: kind, increment: { integerValue: '1' } },
              ],
            },
          },
        ],
      }),
    });
    // Equipo distinto del día (si ya existe, la nube lo rechaza y no pasa nada).
    await fetch(`${BASE}/usage/${day}/devices?documentId=${encodeURIComponent(deviceId())}&${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { kind: { stringValue: kind } } }),
    });
  } catch {
    /* sin conexión o bloqueado: no afecta la app */
  }
}
