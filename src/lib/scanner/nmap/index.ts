// Nmap Scanner Module — Public API
// Enterprise-grade Nmap integration for BYOC vulnerability scanner

export { isNmapAvailable, runNmap, getNmapVersion, getNmapPath, resetNmapCache } from './executor';
export { parseNmapXml } from './parser';
export { SCAN_PROFILES, getProfileForScanType } from './profiles';
export { queryCvesByCpe, getCveDetails, clearNvdCache } from './nvd-client';
export { enrichServicesWithCves } from './cpe-mapper';
export * from './nse-parsers';
export type {
  NmapHost,
  NmapPort,
  NmapService,
  NmapOS,
  NmapScript,
  NmapScanResult,
  NmapScanProfile,
  NvdCveEntry,
} from './types';
