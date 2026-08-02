import pkg from 'smartapi-javascript';
const { SmartAPI } = pkg;
import { authenticator } from 'otplib';
import { SMARTAPI_CONFIG } from './config.js';
import { downloadScripMaster, parseNiftyOptionsMaster, getNearestExpiries } from './scripMaster.js';
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

  async fetchMarketDataChunk(tokens) {
    // Retry on failure or session expiry
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await this.smartApi.marketData({
          mode: 'FULL',
          exchangeTokens: {
            NFO: tokens,
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

  async fetchSpotLtp(spotToken = '99926000') {
    const response = await this.smartApi.marketData({
      mode: 'FULL',
      exchangeTokens: {
        NSE: [spotToken],
      },
    });

    if (response?.status && response?.data?.fetched?.[0]) {
      return Number(response.data.fetched[0].ltp) || 0;
    }
    return 0;
  }
}

export async function collectLiveSmartApiSnapshots(client) {
  const scripData = await downloadScripMaster();
  const { options, spotToken } = parseNiftyOptionsMaster(scripData);

  const spotLtp = await client.fetchSpotLtp(spotToken);
  if (!spotLtp) {
    throw new Error('Could not fetch NIFTY spot LTP');
  }

  const expiries = getNearestExpiries(options, 4);
  const now = new Date();
  const dayStr = formatDateIST(now);
  const timeStr = formatTimeIST(now);
  const isoSnapshotTime = formatISOWithISTOffset(now);

  for (const expiryDate of expiries) {
    // Filter options for this expiry and bound strikes around spot (±2500)
    const minStrike = spotLtp - 2500;
    const maxStrike = spotLtp + 2500;

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
      const quotes = await client.fetchMarketDataChunk(chunk);
      fetchedQuotes.push(...quotes);
      await sleep(100);
    }

    // Save raw snapshot
    saveRawSnapshot('smartapi', dayStr, timeStr, expiryDate, fetchedQuotes);

    // Normalize and save unified snapshot
    const normalized = normalizeSmartAPI(fetchedQuotes, tokenMap, spotLtp, expiryDate, isoSnapshotTime);
    saveUnifiedSnapshot(dayStr, timeStr, expiryDate, normalized);
    updateManifest(dayStr, timeStr, expiryDate, 'smartapi', true);

    console.log(`[${timeStr.substring(0, 5)}] NIFTY ${expiryDate} chain saved: ${normalized.rows.length} rows (spot: ${spotLtp})`);
  }
}
