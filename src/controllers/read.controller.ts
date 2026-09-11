// Read endpoints: /business, /services, /stylists. Cached aggressively.

import { Request, Response } from 'express';
import { cacheGet, cacheSet } from '../lib/cache';
import { getBusinessInfo } from '../services/company.service';
import { listServices } from '../services/service.service';
import { listStylists } from '../services/stylist.service';

export async function getBusiness(_req: Request, res: Response) {
  const { companyId } = res.locals.query;
  const key = `business:${companyId}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);
  const data = await getBusinessInfo(companyId);
  cacheSet(key, data);
  res.json(data);
}

export async function getServices(_req: Request, res: Response) {
  const { companyId, bookableOnly } = res.locals.query;
  const key = `services:${companyId}:${bookableOnly ? 'bookable' : 'all'}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);
  const data = await listServices(companyId, bookableOnly);
  cacheSet(key, data);
  res.json(data);
}

export async function getStylists(_req: Request, res: Response) {
  const { companyId, serviceId } = res.locals.query;
  const key = `stylists:${companyId}:${serviceId ?? 'all'}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);
  const data = await listStylists(companyId, serviceId);
  cacheSet(key, data);
  res.json(data);
}
