import { SmartApiClient, collectLiveSmartApiSnapshots } from './smartapi.js';
import { downloadScripMaster } from './scripMaster.js';
import { isMarketHours, isExpiryDay, getISTNow, formatTimeIST } from './ist.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let index = 'BOTH';
  let expiryOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--index' && i + 1 < args.length) {
      index = args[++i].toUpperCase();
    } else if (arg.startsWith('--index=')) {
      index = arg.split('=')[1].toUpperCase();
    } else if (arg === '--nifty') {
      index = 'NIFTY';
    } else if (arg === '--sensex') {
      index = 'SENSEX';
    } else if (arg === '--expiry-only') {
      expiryOnly = true;
    }
  }
  return { index, expiryOnly };
}

async function main() {
  const { index, expiryOnly } = parseArgs();
  const now = getISTNow();
  const timeStr = formatTimeIST(now);

  if (!isMarketHours(now)) {
    console.log(`[${timeStr}] Outside market hours. Skipping live collection.`);
    return;
  }

  const collectNifty = (index === 'NIFTY' || index === 'BOTH' || index === 'ALL');
  const collectSensex = (index === 'SENSEX' || index === 'BOTH' || index === 'ALL');

  if (expiryOnly) {
    const niftyExpiry = isExpiryDay('NIFTY', now);
    const sensexExpiry = isExpiryDay('SENSEX', now);
    if ((collectNifty && !niftyExpiry) && (collectSensex && !sensexExpiry)) {
      console.log(`[${timeStr}] Today is not an expiry day for requested index (${index}). Skipping.`);
      return;
    }
  }

  const client = new SmartApiClient();
  try {
    await client.login();
    const scripData = await downloadScripMaster();

    if (collectNifty) {
      if (!expiryOnly || isExpiryDay('NIFTY', now)) {
        try {
          await collectLiveSmartApiSnapshots(client, scripData, 'NIFTY');
        } catch (err) {
          console.error(`[${timeStr}] NIFTY collection error:`, err.message);
        }
      } else {
        console.log(`[${timeStr}] Today is not NIFTY expiry day (Tue). Skipping NIFTY.`);
      }
    }

    if (collectSensex) {
      if (!expiryOnly || isExpiryDay('SENSEX', now)) {
        try {
          await collectLiveSmartApiSnapshots(client, scripData, 'SENSEX');
        } catch (err) {
          console.error(`[${timeStr}] SENSEX collection error:`, err.message);
        }
      } else {
        console.log(`[${timeStr}] Today is not SENSEX expiry day (Thu). Skipping SENSEX.`);
      }
    }

    console.log(`[${timeStr}] Live snapshot collection complete.`);
  } catch (err) {
    console.error(`[${timeStr}] Live collection error:`, err.message);
    process.exit(1);
  }
}

main();

