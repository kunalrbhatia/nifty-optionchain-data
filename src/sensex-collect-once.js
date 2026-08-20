import { SmartApiClient, collectLiveSmartApiSnapshots } from './smartapi.js';
import { downloadScripMaster } from './scripMaster.js';
import { isMarketHours, getISTNow, formatTimeIST } from './ist.js';

async function main() {
  const now = getISTNow();
  const timeStr = formatTimeIST(now);

  if (!isMarketHours(now)) {
    console.log(`[${timeStr}] Outside market hours. Skipping SENSEX live collection.`);
    return;
  }

  const client = new SmartApiClient();
  try {
    await client.login();
    const scripData = await downloadScripMaster();

    try {
      await collectLiveSmartApiSnapshots(client, scripData, 'SENSEX');
    } catch (err) {
      console.error(`[${timeStr}] SENSEX collection error:`, err.message);
      process.exit(1);
    }

    console.log(`[${timeStr}] SENSEX snapshot collection complete.`);
  } catch (err) {
    console.error(`[${timeStr}] SENSEX collection error:`, err.message);
    process.exit(1);
  }
}

main();
