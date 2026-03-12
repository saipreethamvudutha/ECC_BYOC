// NVD API 2.0 Client — Live CVE lookup by CPE string
// Rate limit: 5 requests per 30 seconds (without API key)
// Docs: https://nvd.nist.gov/developers/vulnerabilities

import type { NvdCveEntry } from './types';

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const RATE_LIMIT_INTERVAL = 6500; // 6.5s between requests (safe margin for 5/30s limit)
const CACHE_TTL = 3600000; // 1 hour

// In-memory cache
const cveCache = new Map<string, { data: NvdCveEntry[]; expiry: number }>();
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_INTERVAL) {
    const waitTime = RATE_LIMIT_INTERVAL - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'BYOC-Scanner/2.0',
    },
    signal: AbortSignal.timeout(15000),
  });
}

export async function queryCvesByCpe(cpe: string): Promise<NvdCveEntry[]> {
  // Check cache first
  const cached = cveCache.get(cpe);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const encodedCpe = encodeURIComponent(cpe);
    const url = `${NVD_API_BASE}?cpeName=${encodedCpe}&resultsPerPage=20`;

    console.log(`[NVD] Querying CVEs for CPE: ${cpe}`);
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        console.warn('[NVD] Rate limited. Skipping CVE enrichment for this CPE.');
        return [];
      }
      throw new Error(`NVD API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const entries: NvdCveEntry[] = [];

    for (const vuln of data.vulnerabilities || []) {
      const cve = vuln.cve;
      if (!cve) continue;

      // Extract CVSS v3.1 score (preferred) or v2
      let cvssScore = 0;
      let severity = 'unknown';
      let vectorString: string | null = null;

      const v31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
      const v30 = cve.metrics?.cvssMetricV30?.[0]?.cvssData;
      const v2 = cve.metrics?.cvssMetricV2?.[0]?.cvssData;

      if (v31) {
        cvssScore = v31.baseScore;
        severity = v31.baseSeverity;
        vectorString = v31.vectorString;
      } else if (v30) {
        cvssScore = v30.baseScore;
        severity = v30.baseSeverity;
        vectorString = v30.vectorString;
      } else if (v2) {
        cvssScore = v2.baseScore;
        severity = cvssScore >= 7.0 ? 'HIGH' : cvssScore >= 4.0 ? 'MEDIUM' : 'LOW';
        vectorString = v2.vectorString;
      }

      // Skip low-noise CVEs
      if (cvssScore < 4.0) continue;

      const description = cve.descriptions?.find((d: any) => d.lang === 'en')?.value || 'No description available';
      const references = (cve.references || []).slice(0, 3).map((r: any) => r.url);

      entries.push({
        id: cve.id,
        description: description.substring(0, 500),
        cvssScore,
        severity: severity.toLowerCase(),
        vectorString,
        references,
        publishedDate: cve.published || '',
      });
    }

    // Sort by CVSS score descending
    entries.sort((a, b) => b.cvssScore - a.cvssScore);

    // Cache the results
    cveCache.set(cpe, { data: entries, expiry: Date.now() + CACHE_TTL });

    console.log(`[NVD] Found ${entries.length} CVEs for ${cpe}`);
    return entries;
  } catch (error) {
    console.warn(`[NVD] Failed to query CVEs for ${cpe}: ${error}`);
    return [];
  }
}

export async function getCveDetails(cveId: string): Promise<NvdCveEntry | null> {
  try {
    const url = `${NVD_API_BASE}?cveId=${cveId}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    const vuln = data.vulnerabilities?.[0]?.cve;
    if (!vuln) return null;

    const v31 = vuln.metrics?.cvssMetricV31?.[0]?.cvssData;
    const cvssScore = v31?.baseScore || 0;

    return {
      id: vuln.id,
      description: vuln.descriptions?.find((d: any) => d.lang === 'en')?.value || '',
      cvssScore,
      severity: (v31?.baseSeverity || 'unknown').toLowerCase(),
      vectorString: v31?.vectorString || null,
      references: (vuln.references || []).slice(0, 5).map((r: any) => r.url),
      publishedDate: vuln.published || '',
    };
  } catch {
    return null;
  }
}

// Clear cache (useful for testing)
export function clearNvdCache(): void {
  cveCache.clear();
}
