import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const RAW_OPTIONPERKS_DIR = path.join(DATA_DIR, 'raw', 'optionperks');
export const RAW_SMARTAPI_DIR = path.join(DATA_DIR, 'raw', 'smartapi');
export const CHAINS_DIR = path.join(DATA_DIR, 'chains');
export const CHAINS_SENSEX_DIR = path.join(DATA_DIR, 'chains-sensex');
export const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
export const SCRIP_MASTER_PATH = path.join(DATA_DIR, 'scrip_master.json');

export const TIMEZONE = 'Asia/Kolkata';

export const MARKET_OPEN_HOUR = 9;
export const MARKET_OPEN_MINUTE = 15;
export const MARKET_CLOSE_HOUR = 15;
export const MARKET_CLOSE_MINUTE = 30;

export const SMARTAPI_CONFIG = {
  apiKey: process.env.SMARTAPI_API_KEY || '',
  clientCode: process.env.SMARTAPI_CLIENT_CODE || '',
  clientPin: process.env.SMARTAPI_CLIENT_PIN || '',
  totpSecret: process.env.SMARTAPI_TOTP_SECRET || '',
};

export const GREEKS_SOURCE = process.env.GREEKS_SOURCE || 'null';
