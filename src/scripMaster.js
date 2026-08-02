import fs from 'fs';
import { SCRIP_MASTER_PATH } from './config.js';
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

export function parseNiftyOptionsMaster(scripMasterData) {
  // Filter for NIFTY OPTIDX NFO instruments
  const options = [];
  let spotToken = '99926000'; // Default NSE NIFTY 50 spot token

  for (const item of scripMasterData) {
    if (item.symbol === 'NIFTY' && item.exch_seg === 'NSE' && item.instrumenttype === 'AMXIDX') {
      spotToken = item.token;
    }
    if (item.name === 'NIFTY' && item.exch_seg === 'NFO' && item.instrumenttype === 'OPTIDX') {
      const isoExpiry = convertDDMMMYYYYToISO(item.expiry);
      const strike = Number(item.strike) / 100;
      const symbol = item.symbol;
      const optionType = symbol.endsWith('CE') ? 'CE' : symbol.endsWith('PE') ? 'PE' : null;

      if (optionType) {
        options.push({
          token: item.token,
          symbol: item.symbol,
          expiry: isoExpiry,
          rawExpiry: item.expiry,
          strike,
          optionType,
        });
      }
    }
  }

  return { options, spotToken };
}

export function getNearestExpiries(optionsList, count = 4, targetDateStr = null) {
  const nowStr = targetDateStr || new Date().toISOString().substring(0, 10);
  const expiries = Array.from(new Set(optionsList.map(o => o.expiry)))
    .filter(exp => exp >= nowStr)
    .sort();
  return expiries.slice(0, count);
}
