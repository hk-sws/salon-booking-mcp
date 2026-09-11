import { Request, Response } from 'express';
import { getAvailability } from '../services/availability.service';

export async function checkAvailability(_req: Request, res: Response) {
  const data = await getAvailability(res.locals.query);
  res.json(data);
}
