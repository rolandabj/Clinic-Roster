/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Repository Singleton Provider
 */

import { JsonFileRepository } from './jsonStore';
import path from 'path';

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data', 'db');
export const serverRepo = new JsonFileRepository(dataDir);
export const getServerRepository = (): JsonFileRepository => serverRepo;
