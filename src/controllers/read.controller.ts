// Read endpoints: /business, /services, /stylists. Cached aggressively.

import { Request, Response } from 'express';
import { cacheGet, cacheSet } from '../lib/cache';
import { COMPANY_ID } from '../config/tenant';
import { getBusinessInfo } from '../services/company.service';
import { listServices } from '../services/service.service';
import { listStylists } from '../services/stylist.service';

export async function getBusiness(_req: Request, res: Response) {
  const key = `business:${COMPANY_ID}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);
  const data = await getBusinessInfo(COMPANY_ID);
  cacheSet(key, data);
  res.json(data);
}

export async function getServices(_req: Request, res: Response) {
  const { bookableOnly } = res.locals.query;
  const key = `services:${COMPANY_ID}:${bookableOnly ? 'bookable' : 'all'}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);
  const data = await listServices(COMPANY_ID, bookableOnly);
  cacheSet(key, data);
  res.json(data);
}

export async function getStylists(_req: Request, res: Response) {
  const { serviceId } = res.locals.query;
  const key = `stylists:${COMPANY_ID}:${serviceId ?? 'all'}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);
  const data = await listStylists(COMPANY_ID, serviceId);
  cacheSet(key, data);
  res.json(data);
}
