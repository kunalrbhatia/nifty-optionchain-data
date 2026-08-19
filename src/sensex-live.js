import { SensexSmartApiClient, collectSensexSnapshot } from './sensexSmartapi.js';
import { isMarketHours, getISTNow, formatDateIST, formatTimeIST } from './ist.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSensexLiveDaemon() {
  console.log('Initializing SENSEX Option Chain Live Collector Daemon...');

  const client = new SensexSmartApiClient();
  try {
    await client.login();
  } catch (err) {
    console.error('Failed to log in to SmartAPI on daemon start:', err.message);
  }

  let lastCollectedMinute = null;
  let consecutiveFailures = 0;

  while (true) {
    const now = getISTNow();
    const dayStr = formatDateIST(now);
    const timeStr = formatTimeIST(now);
    const currentMinuteStr = `${dayStr}_${timeStr.substring(0, 5)}`;

    if (isMarketHours(now)) {
      const minute = now.getMinutes();
      // Snapshot on every 5th minute (0, 5, 10, ..., 55)
      if (minute % 5 === 0 && lastCollectedMinute !== currentMinuteStr) {
        lastCollectedMinute = currentMinuteStr;
        console.log(`\n[${timeStr}] Market open & interval match. Fetching SENSEX snapshot...`);
        try {
          const startTime = Date.now();
          const { results, spotLtp } = await collectSensexSnapshot(client);
          const elapsed = Date.now() - startTime;
          consecutiveFailures = 0;
          console.log(
            `[${timeStr}] SENSEX snapshot complete in ${elapsed}ms — ${results.length} expiries (spot: ${spotLtp})`
          );
        } catch (err) {
          consecutiveFailures++;
          console.error(`[${timeStr}] SENSEX live collection error:`, err.message);
          if (consecutiveFailures >= 3) {
            console.log('Re-authenticating after repeated failures...');
            try { await client.login(); } catch (e) { console.error('Re-login failed:', e.message); }
            consecutiveFailures = 0;
          }
        }
      }
    } else {
      // Reset the dedup guard outside market hours so the first 5-min tick
      // after open fires immediately.
      lastCollectedMinute = null;
    }

    await sleep(15000); // check every 15s; snapshot only on 5-min boundaries
  }
}

runSensexLiveDaemon().catch((err) => {
  console.error('Fatal daemon error:', err);
  process.exit(1);
});
