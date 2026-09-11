import { collections, getDoc } from '../models/collections';
import { Company, DayHours } from '../models/types';
import { ApiError } from '../lib/errors';
import { timeToWords } from '../lib/spoken';
import { Weekday } from '../lib/time';

const DAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_FULL: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export async function requireCompany(companyId: string): Promise<Company> {
  const company = await getDoc(collections.companies(), companyId);
  if (!company) {
    throw new ApiError(
      'COMPANY_NOT_FOUND',
      `Company ${companyId} not found`,
      'Sorry, I could not find that business.'
    );
  }
  return company;
}

function sortedHours(hours: DayHours[]): DayHours[] {
  const byDay = new Map(hours.map((h) => [h.day, h]));
  return DAY_ORDER.map(
    (d) => byDay.get(d) ?? { day: d, openTime: null, closeTime: null }
  );
}

function daySpoken(h: DayHours): string {
  if (!h.openTime || !h.closeTime) return `closed on ${DAY_FULL[h.day]}s`;
  return `${DAY_FULL[h.day]}, ${timeToWords(h.openTime)} to ${timeToWords(h.closeTime)}`;
}

/** Collapse consecutive identical open/close days: "Tuesday to Sunday, ...". */
function hoursSpoken(hours: DayHours[]): string {
  const sorted = sortedHours(hours);
  const openDays = sorted.filter((h) => h.openTime && h.closeTime);
  const closedDays = sorted.filter((h) => !h.openTime || !h.closeTime);

  const parts: string[] = [];
  let i = 0;
  while (i < openDays.length) {
    let j = i;
    while (
      j + 1 < openDays.length &&
      openDays[j + 1].openTime === openDays[i].openTime &&
      openDays[j + 1].closeTime === openDays[i].closeTime
    ) {
      j++;
    }
    const { openTime, closeTime } = openDays[i];
    const window = `${timeToWords(openTime!)} to ${timeToWords(closeTime!)}`;
    if (i === j) {
      parts.push(`Open ${DAY_FULL[openDays[i].day]}, ${window}`);
    } else {
      parts.push(`Open ${DAY_FULL[openDays[i].day]} to ${DAY_FULL[openDays[j].day]}, ${window}`);
    }
    i = j + 1;
  }
  if (closedDays.length) {
    parts.push(
      'Closed on ' + closedDays.map((h) => `${DAY_FULL[h.day]}s`).join(' and ')
    );
  }
  return parts.join('. ') + '.';
}

export async function getBusinessInfo(companyId: string) {
  const company = await requireCompany(companyId);

  const services = (await collections.services().where('companyId', '==', companyId).get()).docs.map(
    (d) => d.data()
  );
  const walkIn = services.filter((s) => s.walkInAllowed && s.active);
  const walkInServiceIds = walkIn.map((s) => s.id);
  const walkInSpoken = walkIn.length
    ? `Walk ins are welcome for ${walkIn
        .map((s) => s.name.toLowerCase())
        .join(' and ')} only, subject to availability.`
    : 'Walk ins are not available; everything is by appointment.';

  const hours = sortedHours(company.hours).map((h) => ({
    day: h.day,
    open: h.openTime,
    close: h.closeTime,
    spoken: daySpoken(h),
  }));

  return {
    companyId: company.id,
    name: company.name,
    timezone: company.timezone,
    currency: company.currency,
    address: company.address,
    addressSpoken: company.addressSpoken,
    hours,
    hoursSpoken: hoursSpoken(company.hours),
    walkInServiceIds,
    walkInSpoken,
    cancellationWindowHours: company.cancellationWindowHours,
  };
}
