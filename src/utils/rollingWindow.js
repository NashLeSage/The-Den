// utils/rollingWindow.js

// Returns dayKey in YYYY-MM-DD for a Date
function toDayKey(dt) {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Adds delta days to a YYYY-MM-DD dayKey
export function addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toDayKey(dt);
}

// Returns an array of dayKeys ending at endDayKey (inclusive)
// Example: getRollingWindow("2025-12-27", 7) -> [.. 7 keys ..] oldest -> newest
export function getRollingWindow(endDayKey, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(addDays(endDayKey, -i));
  }
  return out;
}
