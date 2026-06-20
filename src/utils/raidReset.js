const WEEKLY_RESET_DAY_UTC = 2;
const RESET_HOUR_UTC = 15;

export function getNextWeeklyReset(fromDate = new Date()) {
  const date = new Date(fromDate);
  const reset = new Date(date);
  reset.setUTCHours(RESET_HOUR_UTC, 0, 0, 0);

  const currentDay = reset.getUTCDay();
  let diff = WEEKLY_RESET_DAY_UTC - currentDay;

  if (diff < 0 || (diff === 0 && date >= reset)) {
    diff += 7;
  }

  reset.setUTCDate(reset.getUTCDate() + diff);
  return reset;
}

export function formatCountdown(targetDate) {
  const now = new Date();
  const diffMs = new Date(targetDate).getTime() - now.getTime();

  if (diffMs <= 0) {
    return "Due now";
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  return `${days}d ${remHours}h`;
}
