#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {installUws} from './install-uws.js';

const __dirname = import.meta.dirname;
const TARGET_FILE = `uws_${process.platform}_${process.arch}_${process.versions.modules}.node`;
const UWS_DIR = path.join(__dirname, '..', 'uws');

// If binary already exists, skip installation (helps Docker cache)
if (fs.existsSync(path.join(UWS_DIR, TARGET_FILE))) {
  console.log(`✓ uWebSockets.js already installed: ${TARGET_FILE}`);
  process.exit(0);
}

// Otherwise run your installer
await installUws();
