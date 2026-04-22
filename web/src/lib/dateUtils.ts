/**
 * WorkSchedule — passed to isWorkingDay / getWorkingDaysInMonth so that
 * every tenant's unique schedule is respected instead of using a hardcoded
 * CCSPL-specific schedule.
 *
 * When NOT provided, the function falls back to the legacy behaviour
 * (Sunday off + 1st & 3rd Saturday off) so every existing caller remains
 * unaffected until it is explicitly upgraded.
 */
export interface WorkSchedule {
  /** 'fixed'    — all employees share the same off day(s) (week_off_days)   */
  /** 'rotating' — each employee has their own off day (employee_off_day)     */
  week_off_type: "fixed" | "rotating";

  /** Day-of-week numbers that are off for ALL employees (fixed mode).         */
  /** 0 = Sunday … 6 = Saturday. e.g. [0] = Sunday only, [0,6] = Sun + Sat.  */
  week_off_days: number[];

  /** The specific employee's off day (rotating mode).                         */
  /** 0–6 as above. NULL/undefined = treat the day as a working day.           */
  employee_off_day?: number | null;
}

/**
 * Returns true when `date` is a regular working day for the given schedule.
 *
 * Priority order:
 *   1. Public holiday → NOT a working day
 *   2. Week off (schedule-driven or legacy fallback) → NOT a working day
 *   3. Everything else → working day
 *
 * @param date      The date to classify.
 * @param holidays  Set of "YYYY-MM-DD" strings for public holidays.
 * @param schedule  Optional tenant work schedule. When omitted the legacy
 *                  CCSPL schedule is used (Sun off + 1st/3rd Sat off).
 */
export function isWorkingDay(
  date: Date,
  holidays: Set<string> = new Set(),
  schedule?: WorkSchedule
): boolean {
  const dateStr = date.toISOString().split("T")[0];

  // 1. Public holiday
  if (holidays.has(dateStr)) return false;

  const dow = date.getDay(); // 0 = Sunday

  // 2. Week off — schedule-driven
  if (schedule) {
    if (schedule.week_off_type === "fixed") {
      return !schedule.week_off_days.includes(dow);
    }
    // rotating — use the employee's personal off day
    if (
      schedule.employee_off_day !== null &&
      schedule.employee_off_day !== undefined &&
      dow === schedule.employee_off_day
    ) {
      return false;
    }
    return true;
  }

  // 3. Legacy fallback — CCSPL schedule (Sun always off + 1st & 3rd Sat off)
  if (dow === 0) return false; // Sunday
  if (dow >= 1 && dow <= 5) return true; // Mon–Fri
  if (dow === 6) {
    const weekNum = Math.ceil(date.getDate() / 7);
    return !(weekNum === 1 || weekNum === 3); // 1st & 3rd Sat off
  }
  return false;
}

/**
 * Counts leave days between two date strings, optionally crossing holidays.
 *
 * @param startDateStr  "YYYY-MM-DD"
 * @param endDateStr    "YYYY-MM-DD"
 * @param countHolidays When true every calendar day counts (e.g. EL).
 *                      When false only working days count (e.g. CL).
 * @param holidays      Set of holiday date strings.
 * @param schedule      Optional work schedule for this employee.
 */
export function getLeaveDaysCount(
  startDateStr: string,
  endDateStr: string,
  countHolidays: boolean,
  holidays: Set<string> = new Set(),
  schedule?: WorkSchedule
): number {
  const start = new Date(startDateStr);
  const end   = new Date(endDateStr);
  if (start > end) return 0;

  let days = 0;
  const current = new Date(start);
  while (current <= end) {
    if (countHolidays) {
      days++;
    } else {
      if (isWorkingDay(current, holidays, schedule)) days++;
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/**
 * Counts total working days in a calendar month.
 *
 * @param year     Full year (e.g. 2026)
 * @param month    0-indexed month (0 = January)
 * @param holidays Set of holiday date strings.
 * @param schedule Optional work schedule.
 */
export function getWorkingDaysInMonth(
  year: number,
  month: number,
  holidays: Set<string> = new Set(),
  schedule?: WorkSchedule
): number {
  const end = new Date(year, month + 1, 0); // last day of month
  let count = 0;
  const current = new Date(year, month, 1);
  while (current <= end) {
    if (isWorkingDay(current, holidays, schedule)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ── Financial Year Helpers ────────────────────────────────────────────────────

/** Returns the starting year of the current Indian financial year (Apr–Mar). */
export function getCurrentFinancialYear(): number {
  const today = new Date();
  const year  = today.getFullYear();
  // Jan, Feb, Mar → belong to previous FY
  return today.getMonth() < 3 ? year - 1 : year;
}

/**
 * Builds a WorkSchedule from app_settings + profile rows.
 * Use this helper in any page that needs to call isWorkingDay().
 *
 * @param settings  Row from app_settings (needs week_off_type, week_off_days)
 * @param profile   Row from profiles (needs weekly_off_day) — optional
 */
export function buildWorkSchedule(
  settings: { week_off_type?: string; week_off_days?: number[] } | null,
  profile?: { weekly_off_day?: number | null } | null
): WorkSchedule {
  return {
    week_off_type:   (settings?.week_off_type as "fixed" | "rotating") ?? "fixed",
    week_off_days:   settings?.week_off_days ?? [0],
    employee_off_day: profile?.weekly_off_day ?? null,
  };
}
