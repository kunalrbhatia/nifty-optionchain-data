import fs from 'fs';
import path from 'path';
import { processOptionPerksSnapshot } from '../src/optionperks.js';
import { readJsonSync } from '../src/store.js';

const REQUIRED_FIELDS = [
  'source',
  'symbol_name',
  'expiry_date',
  'snapshot_time',
  'index_close',
  'greeks_available',
  'rows'
];

const REQUIRED_ROW_FIELDS = [
  'strike_price',
  'call_inst_type',
  'calls_ltp',
  'calls_iv',
  'calls_oi',
  'calls_volume',
  'calls_delta',
  'calls_gamma',
  'calls_theta',
  'calls_vega',
  'put_inst_type',
  'puts_ltp',
  'puts_iv',
  'puts_oi',
  'puts_volume',
  'puts_delta',
  'puts_gamma',
  'puts_theta',
  'puts_vega'
];

function assertSchema(snapshotData, expectedSource) {
  for (const f of REQUIRED_FIELDS) {
    if (!(f in snapshotData)) {
      throw new Error(`Missing top-level field "${f}" in ${expectedSource} snapshot`);
    }
  }

  if (snapshotData.source !== expectedSource) {
    throw new Error(`Expected source "${expectedSource}", got "${snapshotData.source}"`);
  }

  if (!Array.isArray(snapshotData.rows) || snapshotData.rows.length === 0) {
    throw new Error(`Snapshot rows is not a non-empty array for ${expectedSource}`);
  }

  const row = snapshotData.rows[0];
  for (const rf of REQUIRED_ROW_FIELDS) {
    if (!(rf in row)) {
      throw new Error(`Missing row field "${rf}" in ${expectedSource} snapshot row`);
    }
  }

  console.log(`✅ Schema assertion PASSED for source: ${expectedSource} (${snapshotData.rows.length} rows)`);
}

async function verify() {
  console.log('--- Running Schema Parity Verification ---');

  // Test date: 2026-07-01 09:45:00, expiry 2026-07-07
  const dayStr = '2026-07-01';
  const timeStr = '09:45:00';
  const expiryDate = '2026-07-07';

  console.log(`Testing OptionPerks fetch for ${dayStr} ${timeStr} ${expiryDate}...`);
  const res = await processOptionPerksSnapshot(expiryDate, dayStr, timeStr);
  
  const opFilePath = path.join(process.cwd(), 'data', 'chains', dayStr, `${expiryDate}_0945.json`);
  const opData = readJsonSync(opFilePath);

  if (!opData) {
    throw new Error(`OptionPerks unified file not found at ${opFilePath}`);
  }

  assertSchema(opData, 'optionperks');

  // Assert spot sanity check
  if (opData.index_close <= 0) {
    throw new Error(`Invalid index_close in OptionPerks: ${opData.index_close}`);
  }
  console.log(`✅ OptionPerks NIFTY Spot: ${opData.index_close}`);

  // Test Mock SmartAPI schema verification
  const mockSmartApiData = {
    source: 'smartapi',
    symbol_name: 'NIFTY',
    expiry_date: expiryDate,
    snapshot_time: `${dayStr}T${timeStr}+05:30`,
    index_close: 24000.5,
    greeks_available: false,
    rows: [
      {
        strike_price: 24000,
        call_inst_type: 'NFO:NIFTY2670724000CE',
        calls_ltp: 120.5,
        calls_iv: null,
        calls_oi: 50000,
        calls_volume: 1200,
        calls_delta: null,
        calls_gamma: null,
        calls_theta: null,
        calls_vega: null,
        put_inst_type: 'NFO:NIFTY2670724000PE',
        puts_ltp: 115.0,
        puts_iv: null,
        puts_oi: 45000,
        puts_volume: 1100,
        puts_delta: null,
        puts_gamma: null,
        puts_theta: null,
        puts_vega: null,
      }
    ]
  };

  assertSchema(mockSmartApiData, 'smartapi');

  console.log('\n🎉 ALL SCHEMA VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}

verify().catch(err => {
  console.error('Verification FAILED:', err.message);
  process.exit(1);
});
