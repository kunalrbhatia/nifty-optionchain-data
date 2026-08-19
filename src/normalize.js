import { GREEKS_SOURCE } from './config.js';

export function normalizeOptionPerks(rawData, expiryDate, dayStr, timeStr) {
  const rows = rawData?.stock_data || [];
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const indexClose = Number(firstRow.index_close) || 0;

  // Format ISO snapshot time
  // created_at or dayStr + timeStr
  const snapshotTime = `${dayStr}T${timeStr}+05:30`;

  const normalizedRows = rows.map(r => ({
    strike_price: Number(r.strike_price),
    call_inst_type: r.call_inst_type || `NFO:NIFTY${r.expiry_date || ''}${r.strike_price}CE`,
    calls_ltp: Number(r.calls_ltp) || 0,
    calls_iv: r.calls_iv != null ? Number(r.calls_iv) : null,
    calls_oi: Number(r.calls_oi) || 0,
    calls_volume: Number(r.calls_volume) || 0,
    calls_delta: r.calls_delta != null ? Number(r.calls_delta) : null,
    calls_gamma: r.calls_gamma != null ? Number(r.calls_gamma) : null,
    calls_theta: r.calls_theta != null ? Number(r.calls_theta) : null,
    calls_vega: r.calls_vega != null ? Number(r.calls_vega) : null,
    put_inst_type: r.put_inst_type || `NFO:NIFTY${r.expiry_date || ''}${r.strike_price}PE`,
    puts_ltp: Number(r.puts_ltp) || 0,
    puts_iv: r.puts_iv != null ? Number(r.puts_iv) : null,
    puts_oi: Number(r.puts_oi) || 0,
    puts_volume: Number(r.puts_volume) || 0,
    puts_delta: r.puts_delta != null ? Number(r.puts_delta) : null,
    puts_gamma: r.puts_gamma != null ? Number(r.puts_gamma) : null,
    puts_theta: r.puts_theta != null ? Number(r.puts_theta) : null,
    puts_vega: r.puts_vega != null ? Number(r.puts_vega) : null,
  }));

  return {
    source: 'optionperks',
    symbol_name: 'NIFTY',
    expiry_date: expiryDate,
    snapshot_time: snapshotTime,
    index_close: indexClose,
    greeks_available: true,
    rows: normalizedRows,
  };
}

export function normalizeSmartAPI(fetchedQuotes, tokenMap, spotLtp, expiryDate, isoSnapshotTime, indexName = 'NIFTY', exchange = 'NFO') {
  // tokenMap: Map of symbolToken -> { strike: number, optionType: 'CE'|'PE', symbol: string }
  const strikesMap = new Map();

  for (const q of fetchedQuotes) {
    const meta = tokenMap.get(q.symbolToken);
    if (!meta) continue;

    const strike = meta.strike;
    if (!strikesMap.has(strike)) {
      strikesMap.set(strike, {
        strike_price: strike,
        call_inst_type: null,
        calls_ltp: 0,
        calls_iv: null,
        calls_oi: 0,
        calls_volume: 0,
        calls_delta: null,
        calls_gamma: null,
        calls_theta: null,
        calls_vega: null,
        put_inst_type: null,
        puts_ltp: 0,
        puts_iv: null,
        puts_oi: 0,
        puts_volume: 0,
        puts_delta: null,
        puts_gamma: null,
        puts_theta: null,
        puts_vega: null,
      });
    }

    const row = strikesMap.get(strike);
    if (meta.optionType === 'CE') {
      row.call_inst_type = `${exchange}:${meta.symbol}`;
      row.calls_ltp = Number(q.ltp) || 0;
      row.calls_oi = Number(q.opnInterest) || 0;
      row.calls_volume = Number(q.tradeVolume) || 0;
    } else if (meta.optionType === 'PE') {
      row.put_inst_type = `${exchange}:${meta.symbol}`;
      row.puts_ltp = Number(q.ltp) || 0;
      row.puts_oi = Number(q.opnInterest) || 0;
      row.puts_volume = Number(q.tradeVolume) || 0;
    }
  }

  const rows = Array.from(strikesMap.values()).sort((a, b) => a.strike_price - b.strike_price);

  return {
    source: 'smartapi',
    symbol_name: indexName,
    expiry_date: expiryDate,
    snapshot_time: isoSnapshotTime,
    index_close: spotLtp,
    greeks_available: false,
    rows: rows,
  };
}
