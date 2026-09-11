// Messages, notifications, resolve-date, health.

import { Request, Response } from 'express';
import { COMPANY_ID } from '../config/tenant';
import { createMessage } from '../services/message.service';
import { sendConfirmation } from '../services/notification.service';
import { resolveDate } from '../services/dateResolve.service';
import { firestoreMode } from '../config/firestore';

const startedAt = Date.now();

export async function postMessage(_req: Request, res: Response) {
  const result = await createMessage({ ...res.locals.body, companyId: COMPANY_ID });
  await res.locals.saveIdempotent(201, result);
  res.status(201).json(result);
}

export async function postConfirmation(_req: Request, res: Response) {
  const result = await sendConfirmation({ ...res.locals.body, companyId: COMPANY_ID });
  await res.locals.saveIdempotent(202, result);
  res.status(202).json(result);
}

export async function postResolveDate(_req: Request, res: Response) {
  const { phrase } = res.locals.body;
  res.json(await resolveDate(COMPANY_ID, phrase));
}

export function getHealth(_req: Request, res: Response) {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    firestore: firestoreMode(),
  });
}
