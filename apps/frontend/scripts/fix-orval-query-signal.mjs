/**
 * Orval + fetch client emits `fn(params, signal)` where the second arg must be RequestInit.
 * Wrap abort signals as `{ signal }` so TypeScript and runtime match fetch().
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../lib/api/generated/platform.ts');

let s = fs.readFileSync(target, 'utf8');
s = s.replaceAll(', signal)', ', { signal })');
for (const name of [
  'getPlatformSubscriptionPlans',
  'getPlatformFeatures',
  'getPlatformSaasOperatorCompany'
]) {
  s = s.replaceAll(`${name}(signal)`, `${name}({ signal })`);
}
fs.writeFileSync(target, s);
