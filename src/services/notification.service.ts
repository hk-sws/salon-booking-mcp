import { collections, getDoc } from '../models/collections';
import { ApiError } from '../lib/errors';
import { dateToWords, timeToWords, referenceToWords } from '../lib/spoken';
import { DateTime } from 'luxon';
import { requireCompany } from './company.service';
import { emailProvider, RenderedMessage } from '../providers/notification';

export interface ConfirmationInput {
  companyId: string;
  bookingId: string;
  channels: 'email'[];
}

/** Render + dispatch a confirmation. A failed send never fails a booking. */
export async function sendConfirmation(input: ConfirmationInput) {
  const company = await requireCompany(input.companyId);
  const booking = await getDoc(collections.bookings(), input.bookingId);
  if (!booking || booking.companyId !== input.companyId) {
    throw new ApiError('BOOKING_NOT_FOUND', `Booking ${input.bookingId} not found`,
      'I could not find that appointment to confirm.');
  }

  const service = await getDoc(collections.services(), booking.serviceId);
  const stylist = await getDoc(collections.stylists(), booking.stylistId);
  const local = DateTime.fromISO(booking.startAt, { zone: 'utc' }).setZone(company.timezone);
  const date = local.toFormat('yyyy-MM-dd');
  const time = local.toFormat('HH:mm');

  const body = [
    `Hi ${booking.customerName},`,
    `Your booking at ${company.name} is confirmed.`,
    `${service?.name ?? booking.serviceId} with ${stylist?.name ?? booking.stylistId}`,
    `${dateToWords(date)} at ${timeToWords(time)}.`,
    `Reference ${booking.reference} (${referenceToWords(booking.reference)}).`,
  ].join('\n');

  const rendered: RenderedMessage = {
    to: '',
    subject: `Booking confirmed — ${company.name}`,
    body,
  };

  const results: { channel: string; ok: boolean; detail: string }[] = [];
  for (const channel of input.channels) {
    try {
      if (!booking.customerEmail) {
        results.push({ channel, ok: false, detail: 'no email on file' });
        continue;
      }
      const r = await emailProvider().send({
        ...rendered, to: booking.customerEmail, toName: booking.customerName,
      });
      results.push({ channel, ...r });
    } catch (e) {
      results.push({ channel, ok: false, detail: e instanceof Error ? e.message : 'send failed' });
    }
  }

  return {
    bookingId: input.bookingId,
    results,
    spoken: 'I have sent your confirmation.',
  };
}
