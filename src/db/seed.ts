// Seed the Bloom Salon tenant (companyId "salon-01"). Runs automatically on
// first boot (see index.ts) and via `npm run seed` / POST /admin/seed.

import 'dotenv/config'; // load .env for standalone `npm run seed`
import { collections } from '../models/collections';
import { Booking, Company, Service, Stylist, Block } from '../models/types';
import { id, bookingReference } from '../lib/ids';
import { DateTime } from 'luxon';
import { localToUtcISO } from '../lib/time';

const COMPANY_ID = 'salon-01';
const TZ = 'Asia/Kolkata';

const company: Company = {
  id: COMPANY_ID,
  name: 'Bloom Salon',
  type: 'salon',
  timezone: TZ,
  currency: 'INR',
  locale: 'en-IN',
  address: 'Second floor, above the pharmacy, near the bus stand',
  addressSpoken: 'on the second floor, above the pharmacy, near the bus stand',
  cancellationWindowHours: 24,
  slotStepMinutes: 30,
  hours: [
    { day: 'mon', openTime: null, closeTime: null },
    { day: 'tue', openTime: '10:00', closeTime: '20:00' },
    { day: 'wed', openTime: '10:00', closeTime: '20:00' },
    { day: 'thu', openTime: '10:00', closeTime: '20:00' },
    { day: 'fri', openTime: '10:00', closeTime: '20:00' },
    { day: 'sat', openTime: '10:00', closeTime: '20:00' },
    { day: 'sun', openTime: '10:00', closeTime: '20:00' },
  ],
  createdAt: DateTime.utc().toISO()!,
};

const services: Service[] = [
  svc('svc_haircut', 'Haircut and blow dry', 60, 800, true, true),
  svc('svc_wash', 'Hair wash and blow dry', 45, 500, true, false),
  svc('svc_root', 'Root touch up colour', 90, 2000, true, false),
  svc('svc_global', 'Global colour', 180, 4000, true, false),
  svc('svc_highlights', 'Highlights or balayage', 210, 6000, true, false),
  svc('svc_keratin', 'Keratin treatment', 240, 8000, true, false),
  svc('svc_threading', 'Threading and facial', 60, 700, true, true),
  svc('svc_manipedi', 'Manicure and pedicure', 60, 900, true, false),
  {
    id: 'svc_bridal', companyId: COMPANY_ID, name: 'Bridal package',
    description: null, durationMinutes: null, startingPrice: null,
    bookableByPhone: false, escalationReason: 'needs a consultation with a team member',
    walkInAllowed: false, active: true,
  },
];

function svc(
  sid: string, name: string, mins: number, price: number, bookable: boolean, walkIn: boolean
): Service {
  return {
    id: sid, companyId: COMPANY_ID, name, description: null,
    durationMinutes: mins, startingPrice: price, bookableByPhone: bookable,
    escalationReason: null, walkInAllowed: walkIn, active: true,
  };
}

const stylists: Stylist[] = [
  sty('sty_priya', 'Priya', 'Colour specialist', ['svc_root', 'svc_global', 'svc_highlights']),
  sty('sty_ramesh', 'Ramesh', 'Cuts and styling', ['svc_haircut', 'svc_wash', 'svc_keratin']),
  sty('sty_anita', 'Anita', 'Beauty services', ['svc_threading', 'svc_manipedi']),
  sty('sty_kavya', 'Kavya', 'Cuts and colour', ['svc_haircut', 'svc_wash', 'svc_root']),
];

function sty(sid: string, name: string, speciality: string, serviceIds: string[]): Stylist {
  return { id: sid, companyId: COMPANY_ID, name, speciality, serviceIds, hoursOverride: [], active: true };
}

const DURATION: Record<string, number> = Object.fromEntries(
  services.filter((s) => s.durationMinutes).map((s) => [s.id, s.durationMinutes!])
);

const CUSTOMERS = [
  { name: 'Meera', phone: '9876543210' },
  { name: 'Anjali', phone: '9811122233' },
  { name: 'Rahul', phone: '9700011122' },
  { name: 'Sneha', phone: '9822233344' },
  { name: 'Karthik', phone: '9933344455' },
];

const TEMPLATES = [
  { sty: 'sty_ramesh', svc: 'svc_haircut', time: '10:00' },
  { sty: 'sty_priya', svc: 'svc_highlights', time: '13:00' },
  { sty: 'sty_anita', svc: 'svc_threading', time: '11:00' },
  { sty: 'sty_kavya', svc: 'svc_root', time: '12:30' },
  { sty: 'sty_ramesh', svc: 'svc_keratin', time: '14:30' },
  { sty: 'sty_priya', svc: 'svc_root', time: '10:00' },
  { sty: 'sty_anita', svc: 'svc_manipedi', time: '15:00' },
  { sty: 'sty_kavya', svc: 'svc_haircut', time: '16:00' },
];

/** ~15 confirmed bookings scattered across the next ~12 days (skipping Mondays). */
function buildBookings(): Booking[] {
  const base = DateTime.now().setZone(TZ).startOf('day');
  const out: Booking[] = [];
  let idx = 0;
  for (let offset = 1; offset <= 12 && out.length < 15; offset++) {
    const day = base.plus({ days: offset });
    if (day.weekday === 1) continue; // Monday closed
    const date = day.toFormat('yyyy-MM-dd');
    for (let k = 0; k < 2 && out.length < 15; k++) {
      const t = TEMPLATES[idx % TEMPLATES.length];
      idx++;
      const dur = DURATION[t.svc];
      const [h, m] = t.time.split(':').map(Number);
      const endMin = h * 60 + m + dur;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      const cust = CUSTOMERS[out.length % CUSTOMERS.length];
      out.push({
        id: id('bkg'), reference: bookingReference(), companyId: COMPANY_ID,
        serviceId: t.svc, stylistId: t.sty,
        startAt: localToUtcISO(date, t.time, TZ), endAt: localToUtcISO(date, endTime, TZ),
        status: 'confirmed', customerName: cust.name, customerPhone: cust.phone,
        customerEmail: null, notes: null, source: 'web',
        createdAt: DateTime.utc().toISO()!, cancelledAt: null, cancelReason: null,
      });
    }
  }
  return out;
}

/** One stylist-holiday block (Priya off for a full day mid-window). */
function buildBlock(): Block {
  const base = DateTime.now().setZone(TZ).startOf('day');
  let holiday = base.plus({ days: 5 });
  if (holiday.weekday === 1) holiday = holiday.plus({ days: 1 });
  const date = holiday.toFormat('yyyy-MM-dd');
  return {
    id: id('blk'), companyId: COMPANY_ID, stylistId: 'sty_priya',
    startAt: localToUtcISO(date, '00:00', TZ), endAt: localToUtcISO(date, '23:59', TZ),
    reason: 'Priya on leave',
  };
}

export async function isSeeded(): Promise<boolean> {
  const snap = await collections.companies().doc(COMPANY_ID).get();
  return snap.exists;
}

async function deleteWhereCompany(
  c: FirebaseFirestore.CollectionReference<any> | any
): Promise<void> {
  const snap = await c.where('companyId', '==', COMPANY_ID).get();
  await Promise.all(snap.docs.map((d: any) => d.ref.delete()));
}

export async function seedSalon(opts: { reset: boolean }): Promise<void> {
  if (opts.reset) {
    await Promise.all([
      deleteWhereCompany(collections.services()),
      deleteWhereCompany(collections.stylists()),
      deleteWhereCompany(collections.bookings()),
      deleteWhereCompany(collections.blocks()),
      deleteWhereCompany(collections.messages()),
    ]);
  }

  await collections.companies().doc(COMPANY_ID).set(company);
  await Promise.all(services.map((s) => collections.services().doc(s.id).set(s)));
  await Promise.all(stylists.map((s) => collections.stylists().doc(s.id).set(s)));

  const bookings = buildBookings();
  await Promise.all(bookings.map((b) => collections.bookings().doc(b.id).set(b)));
  const block = buildBlock();
  await collections.blocks().doc(block.id).set(block);

  console.log(`[seed] ${services.length} services, ${stylists.length} stylists, ${bookings.length} bookings, 1 block`);
}

// Allow `npm run seed` to run this file directly.
if (require.main === module) {
  seedSalon({ reset: true })
    .then(() => { console.log('[seed] complete'); process.exit(0); })
    .catch((e) => { console.error('[seed] failed', e); process.exit(1); });
}
