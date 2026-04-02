export function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // Sunday is always off (day 0)
  if (dayOfWeek === 0) return false;

  // Monday to Friday are working days (1 to 5)
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return true;

  // Saturday (day 6): 1st and 3rd are off. 2nd, 4th, 5th are working.
  if (dayOfWeek === 6) {
    const dateOfMonth = date.getDate();
    const weekNumber = Math.ceil(dateOfMonth / 7);
    if (weekNumber === 1 || weekNumber === 3) {
      return false; // 1st and 3rd Sat are off
    }
    return true; // 2nd, 4th, 5th Sat are working
  }
  return false;
}

export function getLeaveDaysCount(startDateStr: string, endDateStr: string, countHolidays: boolean): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  let days = 0;
  
  if (start > end) return 0;

  let current = new Date(start);
  while (current <= end) {
    if (countHolidays) {
      days++; // count every single day (e.g. Earned Leave)
    } else {
      if (isWorkingDay(current)) {
        days++; // count only working days (e.g. Casual Leave)
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export function getWorkingDaysInMonth(year: number, month: number): number {
  // month is 0-indexed (0 = Jan)
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // last day of month
  let count = 0;
  let current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}
