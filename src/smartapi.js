import pkg from 'smartapi-javascript';
const { SmartAPI } = pkg;
import { authenticator } from 'otplib';
import { SMARTAPI_CONFIG } from './config.js';
import { downloadScripMaster, parseNiftyOptionsMaster, getNearestExpiries, getFarMonthlyExpiries } from './scripMaster.js';
import { normalizeSmartAPI } from './normalize.js';
import { saveRawSnapshot, saveUnifiedSnapshot, updateManifest } from './store.js';
import { formatISOWithISTOffset, formatDateIST, formatTimeIST } from './ist.js';

const CHUNK_SIZE = 50;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SmartApiClient {
  constructor() {
    this.smartApi = new SmartAPI({
      api_key: SMARTAPI_CONFIG.apiKey,
    });
    this.jwtToken = null;
  }

  async login() {
    if (!SMARTAPI_CONFIG.apiKey || !SMARTAPI_CONFIG.clientCode) {
      throw new Error('SmartAPI credentials missing in environment variables.');
    }

    const totp = authenticator.generate(SMARTAPI_CONFIG.totpSecret);
    const res = await this.smartApi.generateSession(
      SMARTAPI_CONFIG.clientCode,
      SMARTAPI_CONFIG.clientPin,
      totp
    );

    if (!res.status || !res.data?.jwtToken) {
      throw new Error(`SmartAPI login failed: ${res.message || JSON.stringify(res)}`);
    }

    this.jwtToken = res.data.jwtToken;
    this.smartApi.setAccessToken(this.jwtToken);
    console.log('SmartAPI authenticated successfully.');
  }

  async fetchMarketDataChunk(tokens, exchange = 'NFO') {
    // Retry on failure or session expiry
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await this.smartApi.marketData({
          mode: 'FULL',
          exchangeTokens: {
            [exchange]: tokens,
          },
        });

        if (response?.status && response?.data?.fetched) {
          return response.data.fetched;
        }

        if (response?.message?.includes('Invalid') || response?.errorcode === 'AG8001') {
          console.log('SmartAPI JWT expired. Re-authenticating...');
          await this.login();
          continue;
        }

        throw new Error(`marketData failed: ${response?.message || 'Unknown error'}`);
      } catch (err) {
        if (attempts >= 3) throw err;
        await sleep(1000);
      }
    }
    return [];
  }

  async fetchSpotLtp(spotToken = '99926000', spotExchange = 'NSE') {
    // Retry on failure or session expiry (same pattern as fetchMarketDataChunk)
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await this.smartApi.marketData({
          mode: 'FULL',
          exchangeTokens: {
            [spotExchange]: [spotToken],
          },
        });

        if (response?.status && response?.data?.fetched?.[0]) {
          const ltp = Number(response.data.fetched[0].ltp) || 0;
          if (ltp > 0) return ltp;
        }

        if (response?.message?.includes('Invalid') || response?.errorcode === 'AG8001') {
          console.log('SmartAPI JWT expired (spot fetch). Re-authenticating...');
          await this.login();
          continue;
        }

        throw new Error(response?.message || 'Spot LTP fetch failed');
      } catch (err) {
        if (attempts >= 3) throw err;
        await sleep(1000);
      }
    }
    return 0;
  }
}

export async function collectLiveSmartApiSnapshots(
  client,
  preDownloadedScripMaster = null,
  indexName = 'NIFTY',
  collectOptions = {}
) {
  const { includeNearExpiries = true, includeFarMonthly = true } = collectOptions;
  const isSensex = indexName.toUpperCase() === 'SENSEX';
  const targetIndex = isSensex ? 'SENSEX' : 'NIFTY';
  const optionExch = isSensex ? 'BFO' : 'NFO';
  const spotExch = isSensex ? 'BSE' : 'NSE';
  const strikeRange = isSensex ? 5000 : 2500;

  const scripData = preDownloadedScripMaster || (await downloadScripMaster());
  const { parseIndexOptionsMaster } = await import('./scripMaster.js');
  const { options, spotToken } = parseIndexOptionsMaster(scripData, targetIndex);

  const spotLtp = await client.fetchSpotLtp(spotToken, spotExch);
  if (!spotLtp) {
    console.warn(`Could not fetch ${targetIndex} spot LTP. Skipping ${targetIndex} collection.`);
    return;
  }

  let expiries = includeNearExpiries ? getNearestExpiries(options, 4) : [];

  // Always consider the far-dated monthly (~45 DTE): the near-weekly window never
  // contains it, and the NIFTY Monthly 45-DTE straddle needs it for backtesting.
  if (includeFarMonthly && !isSensex) {
    for (const farMonthly of getFarMonthlyExpiries(options)) {
      if (!expiries.includes(farMonthly)) expiries.push(farMonthly);
    }
  }

  if (!expiries || expiries.length === 0) {
    console.log(`No upcoming expiries found for ${targetIndex}. Skipping collection.`);
    return;
  }

  const now = new Date();
  const dayStr = formatDateIST(now);
  const timeStr = formatTimeIST(now);
  const isoSnapshotTime = formatISOWithISTOffset(now);

  for (const expiryDate of expiries) {
    // Filter options for this expiry and bound strikes around spot
    const minStrike = spotLtp - strikeRange;
    const maxStrike = spotLtp + strikeRange;

    const expiryOptions = options.filter(
      o => o.expiry === expiryDate && o.strike >= minStrike && o.strike <= maxStrike
    );

    const tokenMap = new Map();
    const tokens = [];

    for (const opt of expiryOptions) {
      tokens.push(opt.token);
      tokenMap.set(opt.token, {
        strike: opt.strike,
        optionType: opt.optionType,
        symbol: opt.symbol,
      });
    }

    // Chunk into 50 tokens
    const fetchedQuotes = [];
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const quotes = await client.fetchMarketDataChunk(chunk, optionExch);
      fetchedQuotes.push(...quotes);
      await sleep(100);
    }

    // Save raw snapshot (suffixed if sensex)
    const rawSource = isSensex ? 'smartapi-sensex' : 'smartapi';
    saveRawSnapshot(rawSource, dayStr, timeStr, expiryDate, fetchedQuotes);

    // Normalize and save unified snapshot
    const normalized = normalizeSmartAPI(fetchedQuotes, tokenMap, spotLtp, expiryDate, isoSnapshotTime, targetIndex, optionExch);
    saveUnifiedSnapshot(dayStr, timeStr, expiryDate, normalized, targetIndex);
    updateManifest(dayStr, timeStr, expiryDate, rawSource, true);

    console.log(`[${timeStr.substring(0, 5)}] ${targetIndex} ${expiryDate} chain saved: ${normalized.rows.length} rows (spot: ${spotLtp})`);
  }
}
