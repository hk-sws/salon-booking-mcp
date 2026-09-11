import { collections, getDoc } from '../models/collections';
import { Stylist } from '../models/types';
import { ApiError } from '../lib/errors';
import { requireCompany } from './company.service';

export async function requireStylist(companyId: string, stylistId: string): Promise<Stylist> {
  const sty = await getDoc(collections.stylists(), stylistId);
  if (!sty || sty.companyId !== companyId) {
    throw new ApiError(
      'STYLIST_NOT_FOUND',
      `Stylist ${stylistId} not found for ${companyId}`,
      'Sorry, I could not find that stylist.'
    );
  }
  return sty;
}

function servicesSpoken(name: string, serviceNames: string[]): string {
  if (!serviceNames.length) return `${name} is on the team.`;
  const lower = serviceNames.map((n) => n.toLowerCase());
  const list =
    lower.length === 1
      ? lower[0]
      : `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
  return `${name} does ${list}.`;
}

export async function listStylists(companyId: string, serviceId?: string) {
  await requireCompany(companyId);

  const [stySnap, svcSnap] = await Promise.all([
    collections.stylists().where('companyId', '==', companyId).get(),
    collections.services().where('companyId', '==', companyId).get(),
  ]);

  const serviceName = new Map(svcSnap.docs.map((d) => [d.id, d.data().name]));
  let stylists = stySnap.docs.map((d) => d.data()).filter((s) => s.active);
  if (serviceId) stylists = stylists.filter((s) => s.serviceIds.includes(serviceId));

  return {
    stylists: stylists.map((s) => ({
      id: s.id,
      name: s.name,
      speciality: s.speciality,
      serviceIds: s.serviceIds,
      servicesSpoken: servicesSpoken(
        s.name,
        s.serviceIds.map((id) => serviceName.get(id)).filter(Boolean) as string[]
      ),
    })),
  };
}
