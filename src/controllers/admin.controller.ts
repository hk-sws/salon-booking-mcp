import { Request, Response } from 'express';
import { listBookingsAdmin, listMessagesAdmin, addBlock } from '../services/admin.service';
import { cacheInvalidateCompany } from '../lib/cache';
import { seedSalon } from '../db/seed';

export async function getAdminBookings(_req: Request, res: Response) {
  const { companyId, from, to, status } = res.locals.query;
  res.json(await listBookingsAdmin(companyId, from, to, status));
}

export async function getAdminMessages(_req: Request, res: Response) {
  const { companyId, status } = res.locals.query;
  res.json(await listMessagesAdmin(companyId, status));
}

export async function postAdminBlock(_req: Request, res: Response) {
  const result = await addBlock(res.locals.body);
  res.status(201).json(result);
}

export async function postAdminSeed(_req: Request, res: Response) {
  const { companyId } = res.locals.query;
  await seedSalon({ reset: true });
  cacheInvalidateCompany(companyId);
  res.json({ ok: true, message: `Reset seed data for ${companyId}` });
}
