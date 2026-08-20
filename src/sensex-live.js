import { SensexSmartApiClient, collectSensexSnapshot } from './sensexSmartapi.js';
import { isMarketHours, isExpiryDay, getISTNow, formatDateIST, formatTimeIST } from './ist.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMsToNextBoundary(now) {
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const ms = now.getMilliseconds();
  const minutesToNext = 5 - (minute % 5);
  return (minutesToNext * 60 - second) * 1000 - ms;
}

async function runSensexLiveDaemon() {
  console.log('Initializing SENSEX Option Chain Live Collector Daemon...');

  const client = new SensexSmartApiClient();

  try {
    await client.login();
  } catch (err) {
    console.error('Failed to log in to SmartAPI on SENSEX daemon start:', err.message);
  }

  let lastCollectedMinute = null;
  let consecutiveFailures = 0;

  while (true) {
    const now = getISTNow();
    const dayStr = formatDateIST(now);
    const timeStr = formatTimeIST(now);
    const currentMinuteStr = `${dayStr}_${timeStr.substring(0, 5)}`;

    if (isExpiryDay('SENSEX', now) && isMarketHours(now)) {
      const minute = now.getMinutes();
      // Execute snapshot on every 5th minute (0, 5, 10, 15, ..., 55)
      if (minute % 5 === 0 && lastCollectedMinute !== currentMinuteStr) {
        lastCollectedMinute = currentMinuteStr;
        console.log(`\n[${timeStr}] Market open & SENSEX expiry day match. Fetching live snapshot...`);
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
      // Outside market hours or non-expiry day heartbeat
      if (now.getSeconds() === 0 && now.getMinutes() % 15 === 0) {
        console.log(`[${timeStr}] Heartbeat: Outside SENSEX expiry trading window. Idle.`);
      }
      lastCollectedMinute = null;
    }

    const msToNext = getMsToNextBoundary(getISTNow());
    await sleep(Math.max(msToNext, 1000));
  }
}

runSensexLiveDaemon().catch((err) => {
  console.error('SENSEX live daemon fatal error:', err);
  process.exit(1);
});
