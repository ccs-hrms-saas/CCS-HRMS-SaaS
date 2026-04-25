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

/**
 * Resolves the effective daily working hours for a given employee.
 *
 * Resolution order (first non-null wins):
 *   1. profileHours  — per-employee override (Tier 3 only, profiles.hours_per_day)
 *   2. settingsHours — org-wide default (app_settings.hours_per_day)
 *   3. 8.5           — absolute fallback (legacy behaviour)
 *
 * @param profileHours  profiles.hours_per_day — null/undefined = not set
 * @param settingsHours app_settings.hours_per_day — null/undefined = not set
 */
export function resolveHoursPerDay(
  profileHours?: number | null,
  settingsHours?: number | null
): number {
  if (profileHours !== null && profileHours !== undefined && profileHours > 0) return profileHours;
  if (settingsHours !== null && settingsHours !== undefined && settingsHours > 0) return settingsHours;
  return 8.5;
}

// ── Per-Employee Shift Timing Helpers ─────────────────────────────────────────

/**
 * Computes working hours from two "HH:MM" strings.
 * Returns null if either value is missing or the result is non-positive.
 */
export function computeShiftHours(
  startTime?: string | null,
  endTime?: string | null
): number | null {
  if (!startTime || !endTime) return null;
  const [h1, m1] = startTime.split(":").map(Number);
  const [h2, m2] = endTime.split(":").map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : null;
}

/**
 * Formats "HH:MM" to "10:00 AM" display format.
 */
export function formatShiftTime(time?: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Returns true if the employee checked in late.
 * Late = actual check-in time > prescribed shift_start + grace_minutes.
 *
 * @param checkInISO    ISO datetime string from attendance_records.check_in
 * @param shiftStart    "HH:MM" prescribed start from profiles.shift_start_time
 * @param graceMinutes  Grace period in minutes (from app_settings.grace_minutes)
 */
export function isLateArrival(
  checkInISO?: string | null,
  shiftStart?: string | null,
  graceMinutes: number = 0
): boolean {
  if (!checkInISO || !shiftStart) return false;
  const ci   = new Date(checkInISO);
  const ciMins = ci.getHours() * 60 + ci.getMinutes();
  const [h, m] = shiftStart.split(":").map(Number);
  const allowedMins = h * 60 + m + graceMinutes;
  return ciMins > allowedMins;
}

/**
 * Returns true if the employee checked out before completing required hours.
 * Early departure = actual checkout time < prescribed shift_end_time
 * AND actual hours worked < required hours_per_day.
 *
 * @param checkOutISO   ISO datetime string from attendance_records.check_out
 * @param checkInISO    ISO datetime string from attendance_records.check_in
 * @param shiftEnd      "HH:MM" prescribed end from profiles.shift_end_time
 * @param requiredHours hours_per_day from profiles (resolved)
 */
export function isEarlyDeparture(
  checkOutISO?: string | null,
  checkInISO?: string | null,
  shiftEnd?: string | null,
  requiredHours?: number | null
): boolean {
  if (!checkOutISO || !checkInISO || !shiftEnd) return false;
  const co   = new Date(checkOutISO);
  const coMins = co.getHours() * 60 + co.getMinutes();
  const [h, m] = shiftEnd.split(":").map(Number);
  const shiftEndMins = h * 60 + m;
  // Left before shift end
  if (coMins >= shiftEndMins) return false;
  // AND didn't complete required hours
  if (requiredHours && requiredHours > 0) {
    const workedHours = (new Date(checkOutISO).getTime() - new Date(checkInISO).getTime()) / 3600000;
    return workedHours < requiredHours;
  }
  return true;
}

// ── Group-Scoped Holiday Helpers ──────────────────────────────────────────────

/**
 * Fetches the effective holiday date set for a given employee.
 *
 * Merges:
 *   1. All global holidays (scope = 'all') for the company
 *   2. Group-scoped holidays (scope = 'group') where the employee is a member
 *
 * Falls back to global-only if group tables aren't available.
 *
 * @param supabase   Supabase client instance
 * @param companyId  The tenant's company UUID
 * @param userId     The employee's profile UUID (nullable — returns only global holidays)
 */
export async function fetchEmployeeHolidays(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  userId?: string | null
): Promise<Set<string>> {
  // 1. Fetch all company holidays
  const { data: all } = await supabase
    .from("company_holidays")
    .select("id, date, scope")
    .eq("company_id", companyId);

  if (!all || all.length === 0) return new Set<string>();

  const globalDates = (all as { id: string; date: string; scope: string }[])
    .filter(h => h.scope === "all")
    .map(h => h.date);

  const groupHolidays = (all as { id: string; date: string; scope: string }[])
    .filter(h => h.scope === "group");

  // No user or no group holidays → return global only
  if (!userId || groupHolidays.length === 0) {
    return new Set<string>(globalDates);
  }

  // 2. Fetch which groups the employee belongs to
  const { data: memberships } = await supabase
    .from("employee_group_members")
    .select("group_id")
    .eq("user_id", userId)
    .eq("company_id", companyId);

  const memberGroupIds = new Set<string>(
    (memberships ?? []).map((m: { group_id: string }) => m.group_id)
  );

  if (memberGroupIds.size === 0) {
    return new Set<string>(globalDates);
  }

  // 3. Fetch group scopes for the group holidays
  const groupHolidayIds = groupHolidays.map(h => h.id);
  const { data: scopes } = await supabase
    .from("holiday_group_scopes")
    .select("holiday_id, group_id")
    .in("holiday_id", groupHolidayIds);

  // 4. Find group holidays where employee's group is listed
  const applicableGroupDates = groupHolidays
    .filter(h =>
      (scopes ?? []).some(
        (s: { holiday_id: string; group_id: string }) =>
          s.holiday_id === h.id && memberGroupIds.has(s.group_id)
      )
    )
    .map(h => h.date);

  return new Set<string>([...globalDates, ...applicableGroupDates]);
}
