import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const SENSEX_CHAINS_DIR = path.join(DATA_DIR, 'sensex-chains');
export const SENSEX_RAW_DIR = path.join(DATA_DIR, 'raw', 'smartapi-sensex');
export const SENSEX_MANIFEST_PATH = path.join(DATA_DIR, 'manifest-sensex.json');
export const SCRIP_MASTER_PATH = path.join(DATA_DIR, 'scrip_master.json');

export const TIMEZONE = 'Asia/Kolkata';
export const MARKET_OPEN_HOUR = 9;
export const MARKET_OPEN_MINUTE = 15;
export const MARKET_CLOSE_HOUR = 15;
export const MARKET_CLOSE_MINUTE = 30;

export const SENSEX_SPOT_TOKEN = '99919000'; // BSE SENSEX spot (AMXIDX)
export const SENSEX_SPOT_EXCHANGE = 'BSE';
export const SENSEX_OPTIONS_EXCHANGE = 'BFO';

export const SMARTAPI_CONFIG = {
  apiKey: process.env.SMARTAPI_API_KEY || process.env.API_KEY || '',
  clientCode: process.env.SMARTAPI_CLIENT_CODE || process.env.CLIENT_CODE || '',
  clientPin: process.env.SMARTAPI_CLIENT_PIN || process.env.CLIENT_PIN || '',
  totpSecret: process.env.SMARTAPI_TOTP_SECRET || process.env.CLIENT_TOTP_PIN || '',
};
