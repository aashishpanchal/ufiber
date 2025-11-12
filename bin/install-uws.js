#!/usr/bin/env node
/**
 * Safe uWebSockets.js installer
 * - Downloads and extracts uWS binary
 * - Tolerates missing optional dependencies (rimraf, unzipper)
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {pipeline} from 'stream/promises';

// Lazy imports — will load only if available
let rimraf;
let Extract;

// Try to load optional deps
try {
  ({rimraf} = await import('rimraf'));
} catch {
  console.warn('⚠️ rimraf not found — cleanup steps will be skipped.');
}

try {
  ({Extract} = await import('unzipper'));
} catch {
  console.warn('⚠️ unzipper not found — extraction will not run.');
}

const REPO = 'uNetworking/uWebSockets.js';
const VERSION = 'v20.56.0';
const DOWNLOAD_URL = `https://codeload.github.com/${REPO}/zip/refs/tags/${VERSION}`;
const TARGET_FILE = `uws_${process.platform}_${process.arch}_${process.versions.modules}.node`;

const __dirname = import.meta.dirname;
const ROOT = path.join(__dirname, '..');
const UWS_DIR = path.join(ROOT, 'uws');
const ZIP_PATH = path.join(ROOT, 'uws.zip');

/** Ensure directory exists. */
const ensureDir = dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
};

/** Download file using native https. */
const downloadFile = (url, dest) =>
  new Promise((resolve, reject) => {
    console.log(`⬇️  Downloading ${url}`);
    const file = fs.createWriteStream(dest);
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`Download failed: ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✅ Download complete');
          resolve();
        });
      })
      .on('error', err => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });

/** Extract ZIP file into a directory (if unzipper available). */
const unzipFile = async (zipPath, targetDir) => {
  if (!Extract) {
    console.warn('⚠️ unzipper missing — skipping extraction step.');
    return;
  }

  console.log('📦 Extracting package...');
  const tempDir = path.join(ROOT, 'uws_temp');
  ensureDir(tempDir);

  await pipeline(fs.createReadStream(zipPath), Extract({path: tempDir}));

  // Move from nested folder
  const extracted = fs.readdirSync(tempDir)[0];
  const nestedDir = path.join(tempDir, extracted);
  const files = fs.readdirSync(nestedDir);
  ensureDir(targetDir);
  for (const file of files) {
    fs.renameSync(path.join(nestedDir, file), path.join(targetDir, file));
  }

  if (rimraf) await rimraf(tempDir);
  else fs.rmSync(tempDir, {recursive: true, force: true});
};

/** Remove unused binaries (if rimraf available). */
const cleanupBinaries = async dir => {
  const binaryPath = path.join(dir, TARGET_FILE);
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Expected binary ${TARGET_FILE} not found.`);
  }

  if (!rimraf) {
    console.warn('⚠️ rimraf missing — skipping cleanup.');
    return binaryPath;
  }

  await rimraf([`${dir}/*.node`, `${dir}/README.MD`, `${dir}/source_commit`], {
    glob: true,
    filter: f => !f.endsWith(TARGET_FILE),
  });

  console.log(`✅ Kept binary: ${TARGET_FILE}`);
  return binaryPath;
};

/** Main installer logic. */
export async function installUws() {
  try {
    console.log('🔧 Installing uWebSockets.js...');

    // Clean previous files
    if (fs.existsSync(UWS_DIR))
      fs.rmSync(UWS_DIR, {recursive: true, force: true});
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

    ensureDir(UWS_DIR);

    await downloadFile(DOWNLOAD_URL, ZIP_PATH);
    await unzipFile(ZIP_PATH, UWS_DIR);
    const finalPath = await cleanupBinaries(UWS_DIR);
    fs.unlinkSync(ZIP_PATH);

    console.log(`✅ Installed uWS binary: ${finalPath}`);
  } catch (err) {
    console.error('❌ Installation failed:', err.message);
    process.exit(1);
  }
}
