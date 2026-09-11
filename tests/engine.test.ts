import { describe, it, expect } from 'vitest';
import {
  numberToWords, priceToWords, durationToWords, dateToWords, timeToWords, referenceToWords,
} from '../src/lib/spoken';
import { slotsForStylistDate } from '../src/services/availability.service';
import { localToUtcISO } from '../src/lib/time';
import { Company, Stylist, Booking, Block } from '../src/models/types';

const TZ = 'Asia/Kolkata';

const company: Company = {
  id: 'salon-01', name: 'Bloom', type: 'salon', timezone: TZ, currency: 'INR',
  locale: 'en-IN', address: '', addressSpoken: '', cancellationWindowHours: 24,
  slotStepMinutes: 30,
  hours: [
    { day: 'mon', openTime: null, closeTime: null },
    { day: 'tue', openTime: '10:00', closeTime: '20:00' },
    { day: 'wed', openTime: '10:00', closeTime: '20:00' },
  ],
  createdAt: '',
};
const stylist: Stylist = {
  id: 'sty_x', companyId: 'salon-01', name: 'X', speciality: '',
  serviceIds: ['svc_a'], hoursOverride: [], active: true,
};

const TUE = '2027-01-05'; // a Tuesday, safely in the future
const MON = '2027-01-04'; // a Monday (closed)

function booking(date: string, start: string, end: string): Booking {
  return {
    id: 'b', reference: 'B1', companyId: 'salon-01', serviceId: 'svc_a', stylistId: 'sty_x',
    startAt: localToUtcISO(date, start, TZ), endAt: localToUtcISO(date, end, TZ),
    status: 'confirmed', customerName: '', customerPhone: '', customerEmail: null,
    notes: null, source: 'web', createdAt: '', cancelledAt: null, cancelReason: null,
  };
}

describe('spoken helpers', () => {
  it('numbers, prices, durations', () => {
    expect(numberToWords(800)).toBe('eight hundred');
    expect(priceToWords(800, 'INR')).toBe('eight hundred rupees');
    expect(durationToWords(60)).toBe('about one hour');
    expect(durationToWords(210)).toBe('about three and a half hours');
    expect(durationToWords(null)).toBeNull();
  });
  it('dates, times, references', () => {
    expect(dateToWords('2026-09-15')).toBe('Tuesday the fifteenth of September');
    expect(timeToWords('14:30')).toBe('half past two in the afternoon');
    expect(timeToWords('10:00')).toBe('ten in the morning');
    expect(referenceToWords('B729')).toBe('B seven two nine');
  });
});

describe('availability slot engine', () => {
  it('returns nothing on a closed day', () => {
    expect(slotsForStylistDate(company, stylist, 60, MON, [], [], 0)).toHaveLength(0);
  });

  it('generates 30-min slots that fit before closing', () => {
    // 10:00..20:00, 60-min service, 30-min step -> last start 19:00 -> 19 slots
    const slots = slotsForStylistDate(company, stylist, 60, TUE, [], [], 0);
    expect(slots).toHaveLength(19);
    expect(slots[0].start).toBe('10:00');
    expect(slots[slots.length - 1].start).toBe('19:00');
  });

  it('drops slots whose duration overflows past closing', () => {
    // 240-min service -> last start 16:00 -> 13 slots
    const slots = slotsForStylistDate(company, stylist, 240, TUE, [], [], 0);
    expect(slots[slots.length - 1].start).toBe('16:00');
    expect(slots).toHaveLength(13);
  });

  it('removes slots overlapping a confirmed booking', () => {
    const slots = slotsForStylistDate(company, stylist, 60, TUE, [booking(TUE, '10:00', '11:00')], [], 0);
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('10:30'); // 10:30+60 overlaps the 10:00-11:00 booking
    expect(starts).toContain('11:00');
  });

  it('removes slots overlapping a block', () => {
    const block: Block = {
      id: 'blk', companyId: 'salon-01', stylistId: 'sty_x',
      startAt: localToUtcISO(TUE, '12:00', TZ), endAt: localToUtcISO(TUE, '13:00', TZ),
      reason: 'lunch',
    };
    const starts = slotsForStylistDate(company, stylist, 60, TUE, [], [block], 0).map((s) => s.start);
    expect(starts).not.toContain('12:00');
    expect(starts).toContain('13:00');
  });

  it('drops slots in the past relative to now', () => {
    const farFuture = localToUtcISO('2099-01-01', '00:00', TZ);
    const nowMs = new Date(farFuture).getTime();
    expect(slotsForStylistDate(company, stylist, 60, TUE, [], [], nowMs)).toHaveLength(0);
  });
});
