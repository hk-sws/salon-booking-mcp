import { Request, Response } from 'express';
import { COMPANY_ID } from '../config/tenant';
import { listBookingsAdmin, listMessagesAdmin, addBlock } from '../services/admin.service';
import { cacheInvalidateCompany } from '../lib/cache';
import { seedSalon } from '../db/seed';

export async function getAdminBookings(_req: Request, res: Response) {
  const { from, to, status } = res.locals.query;
  res.json(await listBookingsAdmin(COMPANY_ID, from, to, status));
}

export async function getAdminMessages(_req: Request, res: Response) {
  const { status } = res.locals.query;
  res.json(await listMessagesAdmin(COMPANY_ID, status));
}

export async function postAdminBlock(_req: Request, res: Response) {
  const result = await addBlock({ ...res.locals.body, companyId: COMPANY_ID });
  res.status(201).json(result);
}

export async function postAdminSeed(_req: Request, res: Response) {
  await seedSalon({ reset: true });
  cacheInvalidateCompany(COMPANY_ID);
  res.json({ ok: true, message: `Reset seed data for ${COMPANY_ID}` });
}
