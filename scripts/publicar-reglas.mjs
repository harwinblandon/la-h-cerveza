// Publica firestore.rules en Firebase con el correo del administrador (archivo local .admin-email,
// que no se sube al repositorio). Uso: node scripts/publicar-reglas.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const email = readFileSync('.admin-email', 'utf8').trim();
if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Pon el correo del administrador en .admin-email');
const rules = readFileSync('firestore.rules', 'utf8').replaceAll('CORREO_DEL_ADMINISTRADOR', email);
mkdirSync('.firebase', { recursive: true });
writeFileSync('.firebase/firestore.rules', rules);
writeFileSync('.firebase/firebase.json', JSON.stringify({ firestore: { rules: 'firestore.rules' } }));
const cli = process.env.FIREBASE_CLI;
const args = ['deploy', '--only', 'firestore:rules', '--project', 'h-cerveza', '--config', '.firebase/firebase.json'];
if (cli) execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
else execFileSync('npx', ['-y', 'firebase-tools@15.34.1', ...args], { stdio: 'inherit', shell: true });
