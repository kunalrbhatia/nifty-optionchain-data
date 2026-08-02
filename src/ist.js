import { TIMEZONE, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE, MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE } from './config.js';

export function getISTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

export function formatDateIST(date = getISTNow()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeIST(date = getISTNow()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}:00`;
}

export function formatHHmmIST(date = getISTNow()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

export function formatISOWithISTOffset(date = getISTNow()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
}

export function isTradingDay(date = getISTNow()) {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Mon-Fri
}

export function isMarketHours(date = getISTNow()) {
  if (!isTradingDay(date)) return false;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMin = hours * 60 + minutes;
  const openMin = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const closeMin = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  return totalMin >= openMin && totalMin <= closeMin;
}

export function getMarketSnapshotsForDay(dateStr) {
  // 09:15 to 15:30 every 5 mins
  const snapshots = [];
  let totalMin = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const closeMin = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  while (totalMin <= closeMin) {
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    snapshots.push(`${hh}:${mm}:00`);
    totalMin += 5;
  }
  return snapshots;
}
