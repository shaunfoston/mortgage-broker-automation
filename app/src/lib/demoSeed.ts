import type { Repo } from '@mortgage-options/shared/db/repo.ts';
import { DEMO_CLIENTS } from '@mortgage-options/shared/demo.ts';

/** Adds the fictional demo clients (flagged as demo data). */
export async function seedDemo(repo: Repo): Promise<number> {
  let n = 0;
  for (const d of DEMO_CLIENTS) {
    const existing = await repo.listClients(d.lastName);
    if (existing.some((c) => c.isDemo && c.firstName === d.firstName)) continue;
    const c = await repo.createClient({ firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone, isDemo: true });
    const k = await repo.createCase(c.id, { purpose: d.purpose, numApplicants: d.numApplicants });
    if (d.numApplicants === 2) {
      await repo.saveSection(k.id, 'a2', 'personal', { firstName: 'Sam', lastName: d.lastName, dateOfBirth: '02/07/1986' });
      await repo.saveSection(k.id, 'case', 'property', { estimatedValue: '410000', propertyType: 'Detached house', tenure: 'Freehold', postcode: 'ZZ99 5ZZ' });
      await repo.saveSection(k.id, 'case', 'mortgage', { loanAmount: '210000', termYears: '22', currentLender: 'Example Building Society', currentDealEnds: '31/01/2027' });
    }
    n++;
  }
  if (n) await repo.audit({ action: 'data.demo_seeded', entityType: 'app', entityId: null, caseId: null, details: { clients: n } });
  return n;
}
