import { Request, Response } from 'express';
import { COMPANY_ID } from '../config/tenant';
import { getAvailability } from '../services/availability.service';

export async function checkAvailability(_req: Request, res: Response) {
  const data = await getAvailability({ ...res.locals.query, companyId: COMPANY_ID });
  res.json(data);
}
