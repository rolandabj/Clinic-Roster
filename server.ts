/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ClinicRoster Server Bootstrap Entrypoint
 * Under Node.js ESM execution (npm run start / node server.ts):
 * - If bundled in production (dist/server.js exists), imports the standalone bundle.
 * - Otherwise (in dev via tsx), imports the application source module.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distServer = path.resolve(__dirname, 'dist', 'server.js');

if (fs.existsSync(distServer)) {
  const dynamicDistPath = './dist/server.js';
  await import(dynamicDistPath);
} else {
  await import('./server/app.ts');
}
