import fs from 'fs';
import path from 'path';
import { SENSEX_CHAINS_DIR, SENSEX_RAW_DIR, SENSEX_MANIFEST_PATH } from './sensex-config.js';

export function writeJsonAtomicSync(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, filePath);
}

export function readJsonSync(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Save the raw SmartAPI response for SENSEX (BFO) */
export function saveRawSensexSnapshot(dateStr, timeStr, expiryDate, payload) {
  const dir = path.join(SENSEX_RAW_DIR, dateStr);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${expiryDate}_${timeStr.replace(/:/g, '')}.json`);
  writeJsonAtomicSync(filePath, payload);
  return filePath;
}

/** Save unified SENSEX chain snapshot → data/sensex-chains/YYYY-MM-DD/EXPIRY_HHmm.json */
export function saveUnifiedSensexSnapshot(dateStr, timeStr, expiryDate, unifiedData) {
  const timeKey = timeStr.replace(/:/g, '').substring(0, 4);
  const dir = path.join(SENSEX_CHAINS_DIR, dateStr);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${expiryDate}_${timeKey}.json`);
  writeJsonAtomicSync(filePath, unifiedData);
  return filePath;
}

/** Manifest: track collected snapshots + gaps per day */
export function updateSensexManifest(dateStr, timeStr, expiryDate, rows, status = 'collected') {
  let manifest = {};
  if (fs.existsSync(SENSEX_MANIFEST_PATH)) {
    try { manifest = readJsonSync(SENSEX_MANIFEST_PATH); } catch { manifest = {}; }
  }
  const dayKey = manifest[dateStr] || { collected: {}, gaps: [] };
  const timeKey = timeStr.replace(/:/g, '').substring(0, 4);
  dayKey.collected[`${expiryDate}_${timeKey}`] = {
    rows,
    status,
    ts: new Date().toISOString(),
  };
  manifest[dateStr] = dayKey;
  writeJsonAtomicSync(SENSEX_MANIFEST_PATH, manifest);
}

export function getCollectedSensexSnapshots(dateStr) {
  if (!fs.existsSync(SENSEX_MANIFEST_PATH)) return [];
  try {
    const manifest = readJsonSync(SENSEX_MANIFEST_PATH);
    return Object.keys(manifest[dateStr]?.collected || {});
  } catch { return []; }
}
