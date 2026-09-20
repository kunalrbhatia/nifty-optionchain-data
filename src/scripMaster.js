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

export function parseIndexOptionsMaster(scripMasterData, indexName = 'NIFTY') {
  const isSensex = indexName.toUpperCase() === 'SENSEX';
  const targetName = isSensex ? 'SENSEX' : 'NIFTY';
  const targetOptionExch = isSensex ? 'BFO' : 'NFO';
  const targetSpotExch = isSensex ? 'BSE' : 'NSE';
  let defaultSpotToken = isSensex ? '99919000' : '99926000';

  const options = [];
  let spotToken = defaultSpotToken;

  for (const item of scripMasterData) {
    if (
      item.symbol === targetName &&
      item.exch_seg === targetSpotExch &&
      (item.instrumenttype === 'AMXIDX' || item.instrumenttype === 'INDEX')
    ) {
      spotToken = item.token;
    }
    if (
      item.name === targetName &&
      item.exch_seg === targetOptionExch &&
      item.instrumenttype === 'OPTIDX'
    ) {
      const isoExpiry = convertDDMMMYYYYToISO(item.expiry);
      const strike = Number(item.strike) / 100;
      const symbol = item.symbol;
      const optionType = symbol.endsWith('CE')
        ? 'CE'
        : symbol.endsWith('PE')
          ? 'PE'
          : null;

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

export function parseNiftyOptionsMaster(scripMasterData) {
  return parseIndexOptionsMaster(scripMasterData, 'NIFTY');
}

export function getNearestExpiries(optionsList, count = 4, targetDateStr = null) {
  const nowStr = targetDateStr || new Date().toISOString().substring(0, 10);
  const expiries = Array.from(new Set(optionsList.map(o => o.expiry)))
    .filter(exp => exp >= nowStr)
    .sort();
  return expiries.slice(0, count);
}

/**
 * NIFTY monthly expiries = the LAST listed expiry within each calendar month
 * (normally the last Tuesday; holiday-shifted months can land on a Monday).
 *
 * Returns EVERY monthly expiry whose DTE from `targetDateStr` falls inside
 * [minDte, maxDte], ascending. Two can qualify at once, which is intentional:
 * while one monthly is being tracked down to its 21-DTE exit, the next one is
 * approaching its 45-DTE entry.
 *
 * Needed because the near-weekly capture window (getNearestExpiries) never
 * includes the far-dated monthly contracts required by the NIFTY Monthly
 * 45-DTE naked straddle backtest.
 */
export function getFarMonthlyExpiries(optionsList, targetDateStr = null, minDte = 18, maxDte = 70) {
  const baseStr = targetDateStr || new Date().toISOString().substring(0, 10);
  const baseMs = Date.parse(`${baseStr}T00:00:00Z`);

  const expiries = Array.from(new Set(optionsList.map(o => o.expiry))).filter(Boolean).sort();

  // Monthly = last listed expiry within each calendar month (holiday-shift safe)
  const lastByMonth = new Map();
  for (const exp of expiries) {
    const ym = exp.substring(0, 7);
    if (!lastByMonth.has(ym) || exp > lastByMonth.get(ym)) lastByMonth.set(ym, exp);
  }

  const inBand = [];
  for (const exp of lastByMonth.values()) {
    const dte = Math.round((Date.parse(`${exp}T00:00:00Z`) - baseMs) / 86400000);
    if (dte >= minDte && dte <= maxDte) inBand.push({ exp, dte });
  }
  return inBand.sort((a, b) => a.dte - b.dte).map(x => x.exp);
}
