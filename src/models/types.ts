// Domain models. These mirror the spec's data model, adapted to Firestore
// documents. Many-to-many stylist<->service is denormalised onto each doc as
// an id array (serviceIds on a stylist) for single-read lookups.

import { Weekday } from '../lib/time';

export type CompanyType = 'salon' | 'clinic' | 'generic';

export interface DayHours {
  day: Weekday;
  openTime: string | null; // "10:00", null = closed
  closeTime: string | null; // "20:00"
}

export interface Company {
  id: string; // "salon-01"
  name: string;
  type: CompanyType;
  timezone: string; // "Asia/Kolkata"
  currency: string; // "INR"
  locale: string; // "en-IN"
  address: string;
  addressSpoken: string;
  cancellationWindowHours: number;
  slotStepMinutes: number;
  hours: DayHours[]; // business hours, one entry per day present
  createdAt: string;
}

export interface Service {
  id: string; // "svc_haircut"
  companyId: string;
  name: string;
  description: string | null;
  durationMinutes: number | null; // null = consultation-only
  startingPrice: number | null; // whole rupees
  bookableByPhone: boolean;
  escalationReason: string | null; // required when bookableByPhone = false
  walkInAllowed: boolean;
  active: boolean;
}

export interface Stylist {
  id: string; // "sty_priya"
  companyId: string;
  name: string;
  speciality: string;
  serviceIds: string[]; // services this stylist performs
  hoursOverride: DayHours[]; // optional per-stylist schedule overrides
  active: boolean;
}

export interface Block {
  id: string;
  companyId: string;
  stylistId: string | null; // null = whole business
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  reason: string;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type BookingSource = 'voice_agent' | 'manual' | 'web';

export interface Booking {
  id: string; // "bkg_7fa2"
  reference: string; // "B729"
  companyId: string;
  serviceId: string;
  stylistId: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  notes: string | null;
  source: BookingSource;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export type MessageCategory =
  | 'bridal' | 'complaint' | 'health_query' | 'reschedule_late' | 'other';
export type MessageStatus = 'open' | 'handled';

export interface Message {
  id: string;
  companyId: string;
  category: MessageCategory;
  name: string;
  phone: string;
  email: string | null;
  note: string;
  status: MessageStatus;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  companyId: string;
  endpoint: string;
  response: unknown;
  statusCode: number;
  createdAt: string;
}
