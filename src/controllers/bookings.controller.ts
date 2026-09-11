import { Request, Response } from 'express';
import { createBooking, findBookings, cancelBooking, rescheduleBooking } from '../services/booking.service';

export async function postBooking(_req: Request, res: Response) {
  const result = await createBooking(res.locals.body);
  await res.locals.saveIdempotent(201, result);
  res.status(201).json(result);
}

export async function getFindBookings(_req: Request, res: Response) {
  const { companyId, phone, reference } = res.locals.query;
  res.json(await findBookings(companyId, phone, reference));
}

export async function postCancel(req: Request, res: Response) {
  const { companyId, reason } = res.locals.body;
  const result = await cancelBooking(companyId, req.params.id, reason);
  await res.locals.saveIdempotent(200, result);
  res.json(result);
}

export async function postReschedule(req: Request, res: Response) {
  const { companyId, date, start, stylistId } = res.locals.body;
  const result = await rescheduleBooking(companyId, req.params.id, date, start, stylistId);
  await res.locals.saveIdempotent(200, result);
  res.json(result);
}
