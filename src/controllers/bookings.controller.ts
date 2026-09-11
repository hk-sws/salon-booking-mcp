import { Request, Response } from 'express';
import { COMPANY_ID } from '../config/tenant';
import { createBooking, findBookings, cancelBooking, rescheduleBooking } from '../services/booking.service';

export async function postBooking(_req: Request, res: Response) {
  const result = await createBooking({ ...res.locals.body, companyId: COMPANY_ID });
  await res.locals.saveIdempotent(201, result);
  res.status(201).json(result);
}

export async function getFindBookings(_req: Request, res: Response) {
  const { phone, reference } = res.locals.query;
  res.json(await findBookings(COMPANY_ID, phone, reference));
}

export async function postCancel(req: Request, res: Response) {
  const { reason } = res.locals.body;
  const result = await cancelBooking(COMPANY_ID, req.params.id, reason);
  await res.locals.saveIdempotent(200, result);
  res.json(result);
}

export async function postReschedule(req: Request, res: Response) {
  const { date, start, stylistId } = res.locals.body;
  const result = await rescheduleBooking(COMPANY_ID, req.params.id, date, start, stylistId);
  await res.locals.saveIdempotent(200, result);
  res.json(result);
}
