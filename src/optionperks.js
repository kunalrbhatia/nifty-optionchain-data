import { saveRawSnapshot, saveUnifiedSnapshot, updateManifest, isSnapshotCollected } from './store.js';
import { normalizeOptionPerks } from './normalize.js';

const SLEEP_MS = 300;
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchOneOptionPerksSnapshot(expiryDate, dayStr, timeStr) {
  const url = `https://www.optionperks.com/option_simulator_data?index=NIFTY&expiryDate=${expiryDate}&startDate=${dayStr}&createTime=${encodeURIComponent(timeStr)}`;

  let attempt = 0;
  let delay = 1000;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      });

      if (response.status === 429) {
        throw new Error('BLOCKED_429');
      }

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const rawJson = await response.json();
      return rawJson;
    } catch (err) {
      if (err.message === 'BLOCKED_429') {
        throw err; // Re-throw to stop pipeline
      }
      if (attempt >= MAX_RETRIES) {
        throw err;
      }
      await sleep(delay);
      delay *= 2;
    }
  }

  return null;
}

export async function processOptionPerksSnapshot(expiryDate, dayStr, timeStr) {
  if (isSnapshotCollected(dayStr, timeStr, expiryDate, 'optionperks')) {
    return { skipped: true };
  }

  await sleep(SLEEP_MS);

  try {
    const rawData = await fetchOneOptionPerksSnapshot(expiryDate, dayStr, timeStr);
    
    // Save raw data
    saveRawSnapshot('optionperks', dayStr, timeStr, expiryDate, rawData);

    const normalized = normalizeOptionPerks(rawData, expiryDate, dayStr, timeStr);
    if (!normalized || normalized.rows.length === 0) {
      updateManifest(dayStr, timeStr, expiryDate, 'optionperks', false, 'ZERO_ROWS');
      return { success: false, reason: 'ZERO_ROWS' };
    }

    saveUnifiedSnapshot(dayStr, timeStr, expiryDate, normalized);
    updateManifest(dayStr, timeStr, expiryDate, 'optionperks', true);
    return { success: true, rows: normalized.rows.length };
  } catch (err) {
    if (err.message === 'BLOCKED_429') {
      throw err;
    }
    updateManifest(dayStr, timeStr, expiryDate, 'optionperks', false, err.message);
    return { success: false, reason: err.message };
  }
}
