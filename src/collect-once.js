import { SmartApiClient, collectLiveSmartApiSnapshots } from './smartapi.js';
import { isMarketHours, getISTNow, formatDateIST, formatTimeIST } from './ist.js';

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
    await collectLiveSmartApiSnapshots(client);
    console.log(`[${timeStr}] Live snapshot collection complete.`);
  } catch (err) {
    console.error(`[${timeStr}] Live collection error:`, err.message);
    process.exit(1);
  }
}

main();
