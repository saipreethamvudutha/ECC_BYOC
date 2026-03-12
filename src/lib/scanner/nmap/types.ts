// Nmap Scanner Types — Enterprise-Grade Nmap Integration for BYOC

export interface NmapHost {
  ip: string;
  hostname: string | null;
  status: 'up' | 'down';
  ports: NmapPort[];
  os: NmapOS | null;
  uptime: number | null;
  distance: number | null;
  macAddress: string | null;
  vendor: string | null;
}

export interface NmapPort {
  number: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered' | 'open|filtered';
  service: NmapService | null;
  scripts: NmapScript[];
}

export interface NmapService {
  name: string;
  product: string | null;
  version: string | null;
  extraInfo: string | null;
  cpe: string[];
  method: 'probed' | 'table';
  confidence: number;
}

export interface NmapOS {
  name: string;
  family: string;
  generation: string | null;
  accuracy: number;
  cpe: string[];
}

export interface NmapScript {
  id: string;
  output: string;
  elements: Record<string, unknown>;
}

export interface NmapScanResult {
  hosts: NmapHost[];
  scanInfo: {
    type: string;
    protocol: string;
    numServices: number;
    startTime: Date;
    endTime: Date;
    elapsed: number;
    version: string;
    args: string;
  };
  rawXml: string;
}

export interface NmapScanProfile {
  name: string;
  args: string[];
  timeout: number;
  description: string;
}

export interface NvdCveEntry {
  id: string;
  description: string;
  cvssScore: number;
  severity: string;
  vectorString: string | null;
  references: string[];
  publishedDate: string;
}
