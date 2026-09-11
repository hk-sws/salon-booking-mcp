// Typed collection accessors + a couple of generic helpers. This is the only
// place that names Firestore collections, so swapping the datastore later
// touches one file.

import { CollectionReference } from '@google-cloud/firestore';
import { db } from '../config/firestore';
import {
  Company, Service, Stylist, Block, Booking, Message, IdempotencyRecord,
} from './types';

function col<T>(name: string): CollectionReference<T> {
  return db.collection(name) as unknown as CollectionReference<T>;
}

export const collections = {
  companies: () => col<Company>('companies'),
  services: () => col<Service>('services'),
  stylists: () => col<Stylist>('stylists'),
  blocks: () => col<Block>('blocks'),
  bookings: () => col<Booking>('bookings'),
  messages: () => col<Message>('messages'),
  idempotency: () => col<IdempotencyRecord>('idempotencyKeys'),
};

/** Fetch a single document by id, or null. */
export async function getDoc<T>(c: CollectionReference<T>, docId: string): Promise<T | null> {
  const snap = await c.doc(docId).get();
  return snap.exists ? (snap.data() as T) : null;
}
