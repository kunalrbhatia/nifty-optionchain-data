import fs from 'fs';
import path from 'path';
import { RAW_OPTIONPERKS_DIR, RAW_SMARTAPI_DIR, CHAINS_DIR, MANIFEST_PATH } from './config.js';

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeJsonAtomicSync(filePath, data) {
  ensureDirSync(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function readJsonSync(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return fallback;
  }
}

export function getManifest() {
  return readJsonSync(MANIFEST_PATH, {
    lastUpdated: null,
    collected: {},
    gaps: []
  });
}

export function updateManifest(dateStr, timeStr, expiryDate, source, success = true, gapReason = null) {
  const manifest = getManifest();
  manifest.lastUpdated = new Date().toISOString();

  const timeKey = timeStr.replace(/:/g, '').substring(0, 4); // HHmm
  const entryKey = `${dateStr}_${timeKey}_${expiryDate}_${source}`;

  if (success) {
    manifest.collected[entryKey] = {
      date: dateStr,
      time: timeStr,
      expiry: expiryDate,
      source,
      timestamp: manifest.lastUpdated
    };
  } else {
    // Check if gap already recorded
    const existingIdx = manifest.gaps.findIndex(g => g.key === entryKey);
    const gapObj = { key: entryKey, date: dateStr, time: timeStr, expiry: expiryDate, source, reason: gapReason, timestamp: manifest.lastUpdated };
    if (existingIdx >= 0) {
      manifest.gaps[existingIdx] = gapObj;
    } else {
      manifest.gaps.push(gapObj);
    }
  }

  writeJsonAtomicSync(MANIFEST_PATH, manifest);
}

export function isSnapshotCollected(dateStr, timeStr, expiryDate, source) {
  const timeKey = timeStr.replace(/:/g, '').substring(0, 4);
  const entryKey = `${dateStr}_${timeKey}_${expiryDate}_${source}`;
  const manifest = getManifest();
  return Boolean(manifest.collected[entryKey]);
}

export function saveRawSnapshot(source, dateStr, timeStr, expiryDate, rawData) {
  const timeKey = timeStr.replace(/:/g, '').substring(0, 4);
  const baseDir = source === 'optionperks' ? RAW_OPTIONPERKS_DIR : RAW_SMARTAPI_DIR;
  const filePath = path.join(baseDir, dateStr, `${expiryDate}_${timeKey}.json`);
  writeJsonAtomicSync(filePath, rawData);
}

export function saveUnifiedSnapshot(dateStr, timeStr, expiryDate, unifiedData) {
  const timeKey = timeStr.replace(/:/g, '').substring(0, 4);
  const filePath = path.join(CHAINS_DIR, dateStr, `${expiryDate}_${timeKey}.json`);
  writeJsonAtomicSync(filePath, unifiedData);
}
