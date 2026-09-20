import pkg from 'smartapi-javascript';
const { SmartAPI } = pkg;
import { authenticator } from 'otplib';
import { SMARTAPI_CONFIG, SENSEX_SPOT_TOKEN, SENSEX_SPOT_EXCHANGE, SENSEX_OPTIONS_EXCHANGE } from './sensex-config.js';
import { downloadScripMaster, parseSensexOptionsMaster, getNearestExpiries } from './sensexScripMaster.js';
import { saveRawSensexSnapshot, saveUnifiedSensexSnapshot, updateSensexManifest } from './sensexStore.js';
import { formatISOWithISTOffset, formatDateIST, formatTimeIST, msToNextTotpWindow } from './ist.js';

const CHUNK_SIZE = 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SensexSmartApiClient {
  constructor() {
    this.smartApi = new SmartAPI({ api_key: SMARTAPI_CONFIG.apiKey });
    this.jwtToken = null;
    this.spotToken = SENSEX_SPOT_TOKEN;
    this.expiries = [];
    this.optionsByToken = new Map();
  }

  async login(maxAttempts = 3) {
    if (!SMARTAPI_CONFIG.apiKey || !SMARTAPI_CONFIG.clientCode) {
      throw new Error('SmartAPI credentials missing in environment variables.');
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const totp = authenticator.generate(SMARTAPI_CONFIG.totpSecret);
      const res = await this.smartApi.generateSession(
        SMARTAPI_CONFIG.clientCode,
        SMARTAPI_CONFIG.clientPin,
        totp
      );

      if (res.status && res.data?.jwtToken) {
        this.jwtToken = res.data.jwtToken;
        this.smartApi.setAccessToken(this.jwtToken);
        console.log('SENSEX SmartAPI authenticated successfully.');
        return;
      }

      // 403 = this TOTP code was already consumed inside the current 30s window.
      // Wait out the window and retry with a fresh code rather than crash-looping.
      if (res.status === 403 && attempt < maxAttempts) {
        const waitMs = msToNextTotpWindow();
        console.log(
          `SENSEX login 403 (TOTP window already used). Retrying in ${Math.ceil(waitMs / 1000)}s with a fresh code...`
        );
        await sleep(waitMs);
        continue;
      }

      throw new Error(`SENSEX SmartAPI login failed: ${res.message || JSON.stringify(res)}`);
    }
  }

  async initInstruments() {
    const scripMaster = await downloadScripMaster();
    const { options, spotToken } = parseSensexOptionsMaster(scripMaster);
    this.spotToken = spotToken;
    this.expiries = getNearestExpiries(options, 4);
    for (const o of options) {
      if (this.expiries.includes(o.expiry)) {
        this.optionsByToken.set(o.token, o);
      }
    }
    console.log(
      `SENSEX instruments: ${this.optionsByToken.size} options across ${this.expiries.join(', ')}`
    );
  }

  async fetchMarketDataChunk(tokens) {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await this.smartApi.marketData({
          mode: 'FULL',
          exchangeTokens: { [SENSEX_OPTIONS_EXCHANGE]: tokens },
        });
        if (response?.status && response?.data?.fetched) {
          return response.data.fetched;
        }
        if (response?.message?.includes('Invalid') || response?.errorcode === 'AG8001') {
          console.log('SENSEX JWT expired. Re-authenticating...');
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

  async fetchSpotLtp() {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await this.smartApi.marketData({
          mode: 'FULL',
          exchangeTokens: { [SENSEX_SPOT_EXCHANGE]: [this.spotToken] },
        });
        if (response?.status && response?.data?.fetched?.[0]) {
          // NOTE: BSE SENSEX spot LTP arrives SCALED ×100 (769.09 for 76,909)
          // — multiply by 100 to get the real index value.
          let ltp = Number(response.data.fetched[0].ltp) || 0;
          if (ltp > 0 && ltp < 1000) ltp *= 100;
          return ltp;
        }
        if (response?.message?.includes('Invalid') || response?.errorcode === 'AG8001') {
          console.log('SENSEX JWT expired (spot fetch). Re-authenticating...');
          await this.login();
          continue;
        }
      } catch (err) {
        if (attempts >= 3) throw err;
        await sleep(1000);
      }
    }
    throw new Error('Could not fetch SENSEX spot LTP');
  }
}

/** Normalize one SmartAPI fetched quote into the unified chain schema */
function normalizeQuote(q, meta) {
  const ltp = Number(q.ltp) / 100; // option LTP arrives ×100 on BFO too (verify)
  return {
    strike: meta.strike,
    optionType: meta.optionType,
    expiry: meta.expiry,
    token: q.symbolToken,
    symbol: meta.symbol,
    ltp,
    change: Number(q.change) / 100 || 0,
    open: Number(q.open) / 100 || 0,
    high: Number(q.high) / 100 || 0,
    low: Number(q.low) / 100 || 0,
    close: Number(q.close) / 100 || 0,
    oi: Number(q.open_interest) || 0,
    volume: Number(q.volume) || 0,
    lotSize: meta.lotSize,
    iv: null,
    delta: null,
    theta: null,
    gamma: null,
    vega: null,
  };
}

/**
 * Collect one full SENSEX snapshot for all tracked expiries.
 * Returns { expiryDate, rows, spotLtp } per expiry saved.
 */
export async function collectSensexSnapshot(client) {
  if (client.optionsByToken.size === 0) {
    await client.initInstruments();
  }

  const now = new Date();
  const dayStr = formatDateIST(now);
  const timeStr = formatTimeIST(now);
  const spotLtp = await client.fetchSpotLtp();

  const allTokens = [...client.optionsByToken.keys()];
  const results = [];

  for (const expiryDate of client.expiries) {
    const expTokens = allTokens.filter((t) => client.optionsByToken.get(t).expiry === expiryDate);
    const rows = [];
    for (let i = 0; i < expTokens.length; i += CHUNK_SIZE) {
      const chunk = expTokens.slice(i, i + CHUNK_SIZE);
      const fetched = await client.fetchMarketDataChunk(chunk);
      for (const q of fetched) {
        const meta = client.optionsByToken.get(String(q.symbolToken).replace(/\D/g, ''));
        if (meta) rows.push(normalizeQuote(q, meta));
      }
    }
    rows.sort((a, b) => a.strike - b.strike || (a.optionType > b.optionType ? 1 : -1));

    const rawPayload = {
      source: 'smartapi-sensex',
      fetched_at: formatISOWithISTOffset(now),
      spot_ltp: spotLtp,
      rows: rows.map((r) => ({ ...r })),
    };
    saveRawSensexSnapshot(dayStr, timeStr, expiryDate, rawPayload);

    const unified = {
      source: 'smartapi',
      symbol_name: 'SENSEX',
      expiry_date: expiryDate,
      snapshot_time: timeStr,
      index_close: spotLtp,
      greeks_available: false,
      rows: rows.map((r) => ({
        strike: r.strike,
        option_type: r.optionType,
        expiry: r.expiry,
        token: r.token,
        symbol: r.symbol,
        ltp: r.ltp,
        oi: r.oi,
        volume: r.volume,
        lot_size: r.lotSize,
        change: r.change,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        iv: null,
        delta: null,
        theta: null,
        gamma: null,
        vega: null,
      })),
    };
    saveUnifiedSensexSnapshot(dayStr, timeStr, expiryDate, unified);
    updateSensexManifest(dayStr, timeStr, expiryDate, rows.length);
    results.push({ expiryDate, rows: rows.length, spotLtp });
    console.log(
      `[${timeStr.substring(0, 5)}] SENSEX ${expiryDate} chain saved: ${rows.length} rows (spot: ${spotLtp})`
    );
  }

  return { results, spotLtp };
}
