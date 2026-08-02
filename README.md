# NIFTY Option Chain Data Pipeline (Node.js) — Backfill + Live Collector

A unified Node.js data pipeline that builds a local NIFTY options data lake for backtesting options strategies (such as the calendar ratio strangle strategy).

---

## Architecture Overview

```
┌─────────────────────┐     ┌──────────────────────┐
│ OptionPerks (web)   │     │ Angel One SmartAPI   │
│ historical backfill │     │ live every 5 min     │
└─────────┬───────────┘     └──────────┬───────────┘
          │                            │
          ▼                            ▼
┌────────────────────────────────────────────────────┐
│           src/backfill.js   src/live.js            │
│        (one-shot 3-month pull)   (daemon, cron)    │
└────────────────────────┬───────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────┐
│        Normalizer → unified chain snapshot         │
│        (identical schema for BOTH sources)         │
└────────────────────────┬───────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────┐
│   data/chains/YYYY-MM-DD/YYYY-MM-DD_HHmm.json      │
│   data/manifest.json (what's collected, gaps)      │
│   data/raw/optionperks/… , data/raw/smartapi/…     │
└────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
nifty-optionchain-data/
├── package.json                          # Node.js ESM package
├── .env.example                          # Environment variables template
├── .gitignore
├── src/
│   ├── config.js                         # Constants, file paths, market timings
│   ├── ist.js                            # IST timezone helpers & market hour checks
│   ├── store.js                          # Atomic file operations & manifest tracking
│   ├── normalize.js                      # Unified schema normalizers
│   ├── optionperks.js                    # OptionPerks web scraper with exponential backoff
│   ├── scripMaster.js                    # SmartAPI scrip master cache & strike mapper
│   ├── smartapi.js                       # SmartAPI auth & chunked quote collector
│   ├── backfill.js                       # CLI tool for 3-month OptionPerks backfill
│   └── live.js                           # Daemon for 5-minute live collection during market hours
├── scripts/
│   └── verify-schema.mjs                 # Schema parity assertion script
└── data/                                 # Local storage (Git ignored)
    ├── raw/
    │   ├── optionperks/YYYY-MM-DD/
    │   └── smartapi/YYYY-MM-DD/
    ├── chains/YYYY-MM-DD/
    └── manifest.json
```

---

## Prerequisites & Installation

- **Node.js**: >= 20.x
- **pnpm**: package manager

```bash
pnpm install
```

---

## Environment Setup

Copy `.env.example` to `.env` and fill in your Angel One SmartAPI credentials:

```ini
SMARTAPI_API_KEY=your_api_key
SMARTAPI_CLIENT_CODE=your_client_code
SMARTAPI_CLIENT_PIN=your_client_pin
SMARTAPI_TOTP_SECRET=your_totp_secret
```

---

## Data Schema

Every file stored under `data/chains/YYYY-MM-DD/YYYY-MM-DD_HHmm.json` adheres to the unified schema:

```json
{
  "source": "optionperks" | "smartapi",
  "symbol_name": "NIFTY",
  "expiry_date": "2026-07-14",
  "snapshot_time": "2026-07-01T09:45:00+05:30",
  "index_close": 23946.05,
  "greeks_available": true | false,
  "rows": [
    {
      "strike_price": 24000,
      "call_inst_type": "NFO:NIFTY2671424000CE",
      "calls_ltp": 45.2,
      "calls_iv": 13.8,
      "calls_oi": 123456,
      "calls_volume": 1000,
      "calls_delta": 0.42,
      "calls_gamma": 0.0012,
      "calls_theta": -8.5,
      "calls_vega": 9.1,
      "put_inst_type": "NFO:NIFTY2671424000PE",
      "puts_ltp": 42.1,
      "puts_iv": 14.2,
      "puts_oi": 98765,
      "puts_volume": 900,
      "puts_delta": -0.58,
      "puts_gamma": 0.0012,
      "puts_theta": -7.9,
      "puts_vega": 9.3
    }
  ]
}
```

*Note: SmartAPI does not return IV or Greeks; fields for SmartAPI snapshots will be `null` with `greeks_available: false`.*

---

## Usage

### 1. Verification
Run schema parity verification script:
```bash
npm run verify
```

### 2. Historical Backfill (OptionPerks)
Run the backfill CLI. By default, it backfills the last 3 months from today.
```bash
# Default (last 3 months)
npm run backfill

# Custom range
node src/backfill.js --from 2026-05-01 --to 2026-07-31
```
Features:
- Resumable: re-running skips already stored snapshots based on `manifest.json`.
- Rate-limit aware: 300ms delay between requests with automatic stop on 429 response.
- Graceful gap tracking: zero-row days/expiries are logged in `manifest.gaps`.

### 3. Live Daemon (Angel One SmartAPI)
Run the live collector daemon.
```bash
npm run live
```

#### Running with Crontab (Recommended)
Add a crontab entry to collect snapshot every 5 minutes during market hours:
```bash
*/5 9-15 * * 1-5 cd /home/ubuntu/nifty-optionchain-data && /usr/bin/node src/collect-once.js >> logs/cron-collect.log 2>&1
```

#### Running with PM2
For production deployment, run using `pm2`:
```bash
pm2 start src/live.js --name "nifty-live-collector"
pm2 save
```

---

## Data Storage & Resilience

- **Atomic Writes**: Data is saved via temporary files before being renamed to ensure no corrupted files during unexpected shutdowns.
- **Manifest Tracking**: `data/manifest.json` acts as an index of all successfully stored snapshots and recorded data gaps.
