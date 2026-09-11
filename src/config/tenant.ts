// Single-tenant deployment: the company id is hardcoded here (env-overridable)
// and injected server-side. No endpoint accepts or requires companyId.
export const COMPANY_ID = process.env.COMPANY_ID || 'salon-01';
