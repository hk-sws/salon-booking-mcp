import { collections } from '../models/collections';
import { Message, MessageCategory } from '../models/types';
import { id } from '../lib/ids';
import { DateTime } from 'luxon';
import { requireCompany } from './company.service';

export interface CreateMessageInput {
  companyId: string;
  category: MessageCategory;
  name: string;
  phone: string;
  email?: string;
  note: string;
}

export async function createMessage(input: CreateMessageInput) {
  await requireCompany(input.companyId);
  const messageId = id('msg');
  const message: Message = {
    id: messageId,
    companyId: input.companyId,
    category: input.category,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    note: input.note,
    status: 'open',
    createdAt: DateTime.utc().toISO()!,
  };
  await collections.messages().doc(messageId).set(message);
  return { messageId, spoken: 'I have passed this on. Someone will call you back.' };
}
