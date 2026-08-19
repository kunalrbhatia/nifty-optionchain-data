import { SmartApiClient, collectLiveSmartApiSnapshots } from './smartapi.js';
import { downloadScripMaster } from './scripMaster.js';
import { isMarketHours, getISTNow, formatTimeIST } from './ist.js';

async function main() {
  const now = getISTNow();
  const timeStr = formatTimeIST(now);

  if (!isMarketHours(now)) {
    console.log(`[${timeStr}] Outside market hours. Skipping live collection.`);
    return;
  }

  const client = new SmartApiClient();
  try {
    await client.login();
    const scripData = await downloadScripMaster();

    // Collect NIFTY snapshots
    try {
      await collectLiveSmartApiSnapshots(client, scripData, 'NIFTY');
    } catch (err) {
      console.error(`[${timeStr}] NIFTY collection error:`, err.message);
    }

    // Collect SENSEX snapshots
    try {
      await collectLiveSmartApiSnapshots(client, scripData, 'SENSEX');
    } catch (err) {
      console.error(`[${timeStr}] SENSEX collection error:`, err.message);
    }

    console.log(`[${timeStr}] Live snapshot collection complete.`);
  } catch (err) {
    console.error(`[${timeStr}] Live collection error:`, err.message);
    process.exit(1);
  }
}

main();
