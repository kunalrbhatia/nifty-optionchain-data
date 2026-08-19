import fs from 'fs';
import { SCRIP_MASTER_PATH, SENSEX_SPOT_TOKEN } from './sensex-config.js';
import { writeJsonAtomicSync, readJsonSync } from './store.js';

const SCRIP_MASTER_URL = 'https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json';

const MONTH_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

export function convertDDMMMYYYYToISO(expiryStr) {
  if (!expiryStr || expiryStr.length < 9) return expiryStr;
  const day = expiryStr.substring(0, 2);
  const mmm = expiryStr.substring(2, 5).toUpperCase();
  const year = expiryStr.substring(5);
  const month = MONTH_MAP[mmm] || '01';
  return `${year}-${month}-${day}`;
}

export async function downloadScripMaster(forceRefresh = false) {
  if (!forceRefresh && fs.existsSync(SCRIP_MASTER_PATH)) {
    const stat = fs.statSync(SCRIP_MASTER_PATH);
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
    if (ageHours < 12) {
      return readJsonSync(SCRIP_MASTER_PATH);
    }
  }

  console.log('Downloading latest Angel One Scrip Master...');
  const res = await fetch(SCRIP_MASTER_URL);
  if (!res.ok) {
    throw new Error(`Failed to download Scrip Master: HTTP ${res.status}`);
  }
  const data = await res.json();
  writeJsonAtomicSync(SCRIP_MASTER_PATH, data);
  console.log(`Scrip Master saved (${data.length} instruments).`);
  return data;
}

/**
 * Parse SENSEX options from the scrip master.
 * SENSEX options trade on the BFO segment (BSE F&O), name='SENSEX',
 * instrumenttype='OPTIDX'. Strikes are stored in paise (÷100 → rupees).
 * Returns { options: [...], spotToken, exchange }.
 */
export function parseSensexOptionsMaster(scripMasterData) {
  const options = [];
  let spotToken = SENSEX_SPOT_TOKEN; // default BSE SENSEX spot

  for (const item of scripMasterData) {
    // BSE SENSEX spot index (AMXIDX on BSE)
    if (item.symbol === 'SENSEX' && item.exch_seg === 'BSE' && item.instrumenttype === 'AMXIDX') {
      spotToken = item.token;
    }
    if (item.name === 'SENSEX' && item.exch_seg === 'BFO' && item.instrumenttype === 'OPTIDX') {
      const isoExpiry = convertDDMMMYYYYToISO(item.expiry);
      const strike = Number(item.strike) / 100; // paise → rupees
      const symbol = item.symbol;
      const optionType = symbol.endsWith('CE') ? 'CE' : symbol.endsWith('PE') ? 'PE' : null;

      if (optionType) {
        options.push({
          token: item.token,
          symbol: item.symbol,
          expiry: isoExpiry,
          strike,
          optionType,
          lotSize: Number(item.lotsize) || 20,
          exchange: 'BFO',
        });
      }
    }
  }

  return { options, spotToken, exchange: 'BFO' };
}

/** Get the nearest N weekly expiries for SENSEX (Thursday expiries for weekly). */
export function getNearestExpiries(options, n = 4) {
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const expiries = [...new Set(options.map((o) => o.expiry))]
    .filter((e) => e >= todayISO)
    .sort();
  return expiries.slice(0, n);
}
