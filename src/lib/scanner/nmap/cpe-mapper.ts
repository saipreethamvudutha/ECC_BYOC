// CPE-to-CVE Mapper — Enriches Nmap service detection with NVD CVE data

import type { NmapService } from './types';
import type { CheckResult } from '../types';
import { queryCvesByCpe } from './nvd-client';

interface EnrichedService {
  service: NmapService;
  port: number;
  cves: CheckResult[];
}

export async function enrichServicesWithCves(
  services: Array<{ port: number; service: NmapService }>,
  maxCpeLookups: number = 10
): Promise<EnrichedService[]> {
  const results: EnrichedService[] = [];

  // Deduplicate CPEs across services
  const cpeToServices = new Map<string, Array<{ port: number; service: NmapService }>>();
  for (const { port, service } of services) {
    for (const cpe of service.cpe) {
      if (!cpeToServices.has(cpe)) {
        cpeToServices.set(cpe, []);
      }
      cpeToServices.get(cpe)!.push({ port, service });
    }
  }

  // Limit lookups to prevent excessive API calls
  const uniqueCpes = Array.from(cpeToServices.keys()).slice(0, maxCpeLookups);

  console.log(`[CPE] Enriching ${uniqueCpes.length} unique CPEs with NVD CVE data`);

  for (const cpe of uniqueCpes) {
    try {
      const cves = await queryCvesByCpe(cpe);
      const affectedServices = cpeToServices.get(cpe) || [];

      for (const { port, service } of affectedServices) {
        const cveResults: CheckResult[] = cves.slice(0, 5).map((cve) => {
          let severity: CheckResult['severity'] = 'info';
          if (cve.cvssScore >= 9.0) severity = 'critical';
          else if (cve.cvssScore >= 7.0) severity = 'high';
          else if (cve.cvssScore >= 4.0) severity = 'medium';
          else severity = 'low';

          return {
            title: `${cve.id} — ${service.product || service.name} ${service.version || ''} (Port ${port})`,
            severity,
            description: `${cve.description} Detected via CPE: ${cpe}`,
            remediation: `Update ${service.product || service.name} to the latest version. References: ${cve.references.join(', ')}`,
            cveId: cve.id,
            cvssScore: cve.cvssScore,
            details: {
              source: 'nvd-cpe-lookup',
              cpe,
              port,
              service: service.name,
              product: service.product,
              version: service.version,
              vectorString: cve.vectorString,
              publishedDate: cve.publishedDate,
            },
          };
        });

        results.push({ service, port, cves: cveResults });
      }
    } catch (error) {
      console.warn(`[CPE] Failed to enrich CPE ${cpe}: ${error}`);
    }
  }

  return results;
}
