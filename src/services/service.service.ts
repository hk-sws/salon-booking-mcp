import { collections, getDoc } from '../models/collections';
import { Company, Service, Stylist } from '../models/types';
import { ApiError } from '../lib/errors';
import { durationToWords, priceToWords } from '../lib/spoken';
import { requireCompany } from './company.service';

export async function requireService(companyId: string, serviceId: string): Promise<Service> {
  const svc = await getDoc(collections.services(), serviceId);
  if (!svc || svc.companyId !== companyId) {
    throw new ApiError(
      'SERVICE_NOT_FOUND',
      `Service ${serviceId} not found for ${companyId}`,
      'Sorry, I could not find that service.'
    );
  }
  return svc;
}

function priceSpokenFor(svc: Service, currency: string): string {
  if (svc.startingPrice == null) {
    return svc.bookableByPhone ? 'price on request' : 'by consultation only';
  }
  return `starting at ${priceToWords(svc.startingPrice, currency)}`;
}

/** Shape one service for the API, attaching the stylists who perform it. */
function present(svc: Service, currency: string, stylists: Stylist[]) {
  const stylistIds = stylists.filter((s) => s.serviceIds.includes(svc.id)).map((s) => s.id);
  return {
    id: svc.id,
    name: svc.name,
    durationMinutes: svc.durationMinutes,
    durationSpoken: durationToWords(svc.durationMinutes),
    startingPrice: svc.startingPrice,
    priceSpoken: priceSpokenFor(svc, currency),
    bookableByPhone: svc.bookableByPhone,
    ...(svc.bookableByPhone ? {} : { escalationReason: svc.escalationReason ?? undefined }),
    walkInAllowed: svc.walkInAllowed,
    stylistIds,
  };
}

export async function listServices(companyId: string, bookableOnly = false) {
  const company: Company = await requireCompany(companyId);

  const [svcSnap, stySnap] = await Promise.all([
    collections.services().where('companyId', '==', companyId).get(),
    collections.stylists().where('companyId', '==', companyId).get(),
  ]);

  const stylists = stySnap.docs.map((d) => d.data());
  let services = svcSnap.docs.map((d) => d.data()).filter((s) => s.active);
  if (bookableOnly) services = services.filter((s) => s.bookableByPhone);
  services.sort((a, b) => a.name.localeCompare(b.name));

  return {
    services: services.map((s) => present(s, company.currency, stylists)),
    pricingNoteSpoken:
      'All prices are starting prices. The final price depends on hair length and stylist, and is confirmed at the salon.',
  };
}
