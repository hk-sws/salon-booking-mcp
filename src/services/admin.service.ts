import { collections } from '../models/collections';
import { Block } from '../models/types';
import { id } from '../lib/ids';
import { DateTime } from 'luxon';
import { cacheInvalidateCompany } from '../lib/cache';
import { requireCompany } from './company.service';

export async function listBookingsAdmin(
  companyId: string, from?: string, to?: string, status?: string
) {
  await requireCompany(companyId);
  const snap = await collections.bookings().where('companyId', '==', companyId).get();
  let rows = snap.docs.map((d) => d.data());
  if (status) rows = rows.filter((b) => b.status === status);
  if (from) rows = rows.filter((b) => b.startAt >= from);
  if (to) rows = rows.filter((b) => b.startAt <= `${to}T23:59:59Z`);
  rows.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { bookings: rows, count: rows.length };
}

export async function listMessagesAdmin(companyId: string, status?: string) {
  await requireCompany(companyId);
  const snap = await collections.messages().where('companyId', '==', companyId).get();
  let rows = snap.docs.map((d) => d.data());
  if (status) rows = rows.filter((m) => m.status === status);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { messages: rows, count: rows.length };
}

export async function addBlock(input: {
  companyId: string; stylistId?: string | null; startAt: string; endAt: string; reason: string;
}) {
  await requireCompany(input.companyId);
  const blockId = id('blk');
  const block: Block = {
    id: blockId,
    companyId: input.companyId,
    stylistId: input.stylistId ?? null,
    startAt: DateTime.fromISO(input.startAt).toUTC().toISO()!,
    endAt: DateTime.fromISO(input.endAt).toUTC().toISO()!,
    reason: input.reason,
  };
  await collections.blocks().doc(blockId).set(block);
  cacheInvalidateCompany(input.companyId);
  return { blockId, block };
}
