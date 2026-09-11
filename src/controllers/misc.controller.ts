// Messages, notifications, resolve-date, health.

import { Request, Response } from 'express';
import { createMessage } from '../services/message.service';
import { sendConfirmation } from '../services/notification.service';
import { resolveDate } from '../services/dateResolve.service';
import { firestoreMode } from '../config/firestore';

const startedAt = Date.now();

export async function postMessage(_req: Request, res: Response) {
  const result = await createMessage(res.locals.body);
  await res.locals.saveIdempotent(201, result);
  res.status(201).json(result);
}

export async function postConfirmation(_req: Request, res: Response) {
  const result = await sendConfirmation(res.locals.body);
  await res.locals.saveIdempotent(202, result);
  res.status(202).json(result);
}

export async function postResolveDate(_req: Request, res: Response) {
  const { companyId, phrase } = res.locals.body;
  res.json(await resolveDate(companyId, phrase));
}

export function getHealth(_req: Request, res: Response) {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    firestore: firestoreMode(),
  });
}
