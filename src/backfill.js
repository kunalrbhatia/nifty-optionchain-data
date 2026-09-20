import { getMarketSnapshotsForDay } from './ist.js';
import { processOptionPerksSnapshot } from './optionperks.js';

// Helper to get Tuesdays (NIFTY expiry) in a date range
function getDatesInRange(startDateStr, endDateStr) {
  const dates = [];
  let curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  while (curr <= end) {
    const dayOfWeek = curr.getDay();
    // Exclude weekends (0 = Sun, 6 = Sat)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// Find upcoming Tuesdays for expiries
function getTuesdaysInRange(startDateStr, endDateStr) {
  const tuesdays = [];
  let curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  // Extend end date by 75 days so far-dated monthly (~45 DTE) expiries are in range
  const extendedEnd = new Date(end);
  extendedEnd.setDate(extendedEnd.getDate() + 75);

  while (curr <= extendedEnd) {
    if (curr.getDay() === 2) { // Tuesday
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      tuesdays.push(`${year}-${month}-${day}`);
    }
    curr.setDate(curr.getDate() + 1);
  }
  return tuesdays;
}

function getNearExpiriesForDay(tradingDayStr, allExpiries, count = 2) {
  return allExpiries
    .filter(exp => exp >= tradingDayStr)
    .slice(0, count);
}

/**
 * The monthly expiry (~45 DTE) for a given trading day: the LAST listed expiry
 * within each calendar month. Needed by the NIFTY Monthly 45-DTE naked straddle
 * backtest — getNearExpiriesForDay only ever returns the near weeklies.
 */
function getFarMonthlyExpiriesForDay(tradingDayStr, allExpiries, minDte = 18, maxDte = 70) {
  const baseMs = Date.parse(`${tradingDayStr}T00:00:00Z`);
  const lastByMonth = new Map();
  for (const exp of [...allExpiries].sort()) {
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

function parseArgs() {
  const args = process.argv.slice(2);
  let from = null;
  let to = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = args[i + 1];
    }
    if (args[i] === '--to' && args[i + 1]) {
      to = args[i + 1];
    }
  }

  if (!from || !to) {
    const now = new Date();
    const toDate = new Date(now);
    const fromDate = new Date(now);
    fromDate.setMonth(fromDate.getMonth() - 3);

    const format = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    from = from || format(fromDate);
    to = to || format(toDate);
  }

  return { from, to };
}

async function runBackfill() {
  const { from, to } = parseArgs();
  console.log(`Starting OptionPerks backfill from ${from} to ${to}...`);

  const tradingDays = getDatesInRange(from, to);
  const allTuesdays = getTuesdaysInRange(from, to);

  let totalSnapshots = 0;
  let skipped = 0;
  let gaps = 0;
  const startTime = Date.now();

  for (const dayStr of tradingDays) {
    const snapshots = getMarketSnapshotsForDay(dayStr);
    const expiries = getNearExpiriesForDay(dayStr, allTuesdays, 2);

    // Also capture the far-dated monthly/monthlies (18-70 DTE) for the monthly
    // straddle backtest — the near-expiry window never contains them.
    for (const farMonthly of getFarMonthlyExpiriesForDay(dayStr, allTuesdays)) {
      if (!expiries.includes(farMonthly)) expiries.push(farMonthly);
    }

    for (const timeStr of snapshots) {
      for (const expiryDate of expiries) {
        totalSnapshots++;
        try {
          const res = await processOptionPerksSnapshot(expiryDate, dayStr, timeStr);
          if (res.skipped) {
            skipped++;
          } else if (!res.success) {
            gaps++;
          }
        } catch (err) {
          if (err.message === 'BLOCKED_429') {
            console.error('\nCRITICAL: OptionPerks rate limit (429) encountered! Stopping backfill run to prevent blocking.');
            process.exit(1);
          }
          console.error(`Error processing ${dayStr} ${timeStr} ${expiryDate}:`, err.message);
          gaps++;
        }

        if (totalSnapshots % 100 === 0) {
          const elapsedSec = (Date.now() - startTime) / 1000;
          console.log(`[Progress] Processed ${totalSnapshots} snapshots (Skipped: ${skipped}, Gaps: ${gaps}). Elapsed: ${Math.round(elapsedSec)}s`);
        }
      }
    }
  }

  const durationMin = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log(`\n--- Backfill Completed ---`);
  console.log(`Total Snapshots Evaluated: ${totalSnapshots}`);
  console.log(`Already Stored (Skipped): ${skipped}`);
  console.log(`Gaps Encountered: ${gaps}`);
  console.log(`Time Taken: ${durationMin} minutes`);
}

runBackfill().catch(err => {
  console.error('Backfill script failed:', err);
  process.exit(1);
});
