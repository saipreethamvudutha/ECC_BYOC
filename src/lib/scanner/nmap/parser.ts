// Nmap XML Parser — Converts Nmap XML output to structured TypeScript objects
// Uses fast-xml-parser for reliable XML parsing

import { XMLParser } from 'fast-xml-parser';
import type { NmapHost, NmapPort, NmapService, NmapOS, NmapScript, NmapScanResult } from './types';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => {
    // These elements can appear multiple times
    return ['host', 'port', 'osmatch', 'osclass', 'script', 'elem', 'table',
            'address', 'hostname', 'hop', 'cpe'].includes(name);
  },
  parseAttributeValue: true,
});

export function parseNmapXml(xml: string): NmapScanResult {
  if (!xml || xml.trim().length === 0) {
    throw new Error('[NmapParser] Empty XML input');
  }

  const parsed = xmlParser.parse(xml);
  const nmaprun = parsed.nmaprun;

  if (!nmaprun) {
    throw new Error('[NmapParser] Invalid Nmap XML: missing <nmaprun> root element');
  }

  const hosts = parseHosts(nmaprun.host || []);
  const scanInfo = parseScanInfo(nmaprun);

  return {
    hosts,
    scanInfo: {
      ...scanInfo,
      args: nmaprun['@_args'] || '',
    },
    rawXml: xml,
  };
}

function parseScanInfo(nmaprun: Record<string, any>) {
  const scaninfo = nmaprun.scaninfo;
  const runstats = nmaprun.runstats;
  const finished = runstats?.finished;

  return {
    type: scaninfo?.['@_type'] || 'unknown',
    protocol: scaninfo?.['@_protocol'] || 'tcp',
    numServices: scaninfo?.['@_numservices'] || 0,
    startTime: new Date((nmaprun['@_start'] || 0) * 1000),
    endTime: finished ? new Date((finished['@_time'] || 0) * 1000) : new Date(),
    elapsed: finished?.['@_elapsed'] ? parseFloat(finished['@_elapsed']) : 0,
    version: nmaprun['@_version'] || 'unknown',
  };
}

function parseHosts(hostsData: any[]): NmapHost[] {
  if (!Array.isArray(hostsData)) {
    hostsData = hostsData ? [hostsData] : [];
  }

  return hostsData.map((h) => parseHost(h)).filter(Boolean) as NmapHost[];
}

function parseHost(hostData: Record<string, any>): NmapHost | null {
  if (!hostData) return null;

  // Extract IP and MAC addresses
  const addresses = ensureArray(hostData.address);
  let ip = '';
  let macAddress: string | null = null;
  let vendor: string | null = null;

  for (const addr of addresses) {
    if (addr['@_addrtype'] === 'ipv4' || addr['@_addrtype'] === 'ipv6') {
      ip = addr['@_addr'] || '';
    } else if (addr['@_addrtype'] === 'mac') {
      macAddress = addr['@_addr'] || null;
      vendor = addr['@_vendor'] || null;
    }
  }

  // Extract hostname
  const hostnames = ensureArray(hostData.hostnames?.hostname);
  const hostname = hostnames.length > 0 ? (hostnames[0]['@_name'] || null) : null;

  // Status
  const status = hostData.status?.['@_state'] === 'up' ? 'up' as const : 'down' as const;

  // Parse ports
  const ports = parsePorts(hostData.ports);

  // Parse OS
  const os = parseOS(hostData.os);

  // Uptime
  const uptime = hostData.uptime?.['@_seconds'] ? parseInt(hostData.uptime['@_seconds']) : null;

  // Distance (hops)
  const distance = hostData.distance?.['@_value'] ? parseInt(hostData.distance['@_value']) : null;

  return {
    ip,
    hostname,
    status,
    ports,
    os,
    uptime,
    distance,
    macAddress,
    vendor,
  };
}

function parsePorts(portsData: any): NmapPort[] {
  if (!portsData) return [];

  const portEntries = ensureArray(portsData.port);
  return portEntries.map((p: any) => ({
    number: parseInt(p['@_portid'] || '0'),
    protocol: (p['@_protocol'] || 'tcp') as 'tcp' | 'udp',
    state: (p.state?.['@_state'] || 'closed') as NmapPort['state'],
    service: parseService(p.service),
    scripts: parseScripts(p.script),
  }));
}

function parseService(serviceData: any): NmapService | null {
  if (!serviceData) return null;

  const cpeEntries = ensureArray(serviceData.cpe);
  const cpes = cpeEntries.map((c: any) => (typeof c === 'string' ? c : c['#text'] || '')).filter(Boolean);

  return {
    name: serviceData['@_name'] || 'unknown',
    product: serviceData['@_product'] || null,
    version: serviceData['@_version'] || null,
    extraInfo: serviceData['@_extrainfo'] || null,
    cpe: cpes,
    method: serviceData['@_method'] === 'probed' ? 'probed' : 'table',
    confidence: parseInt(serviceData['@_conf'] || '0'),
  };
}

function parseOS(osData: any): NmapOS | null {
  if (!osData) return null;

  const matches = ensureArray(osData.osmatch);
  if (matches.length === 0) return null;

  // Take the best match (highest accuracy)
  const bestMatch = matches.reduce((best: any, current: any) => {
    const bestAcc = parseInt(best?.['@_accuracy'] || '0');
    const currAcc = parseInt(current?.['@_accuracy'] || '0');
    return currAcc > bestAcc ? current : best;
  }, matches[0]);

  const osClasses = ensureArray(bestMatch?.osclass);
  const primaryClass = osClasses[0] || {};

  const cpeEntries = ensureArray(primaryClass.cpe);
  const cpes = cpeEntries.map((c: any) => (typeof c === 'string' ? c : c['#text'] || '')).filter(Boolean);

  return {
    name: bestMatch?.['@_name'] || 'Unknown',
    family: primaryClass['@_osfamily'] || 'Unknown',
    generation: primaryClass['@_osgen'] || null,
    accuracy: parseInt(bestMatch?.['@_accuracy'] || '0'),
    cpe: cpes,
  };
}

function parseScripts(scriptData: any): NmapScript[] {
  if (!scriptData) return [];

  const scripts = ensureArray(scriptData);
  return scripts.map((s: any) => ({
    id: s['@_id'] || 'unknown',
    output: s['@_output'] || '',
    elements: parseScriptElements(s),
  }));
}

function parseScriptElements(scriptData: any): Record<string, unknown> {
  const elements: Record<string, unknown> = {};

  // Extract elem entries
  const elems = ensureArray(scriptData.elem);
  for (const elem of elems) {
    if (elem['@_key']) {
      elements[elem['@_key']] = elem['#text'] || elem;
    }
  }

  // Extract table entries
  const tables = ensureArray(scriptData.table);
  for (const table of tables) {
    if (table['@_key']) {
      const tableElems = ensureArray(table.elem);
      elements[table['@_key']] = tableElems.map((e: any) => {
        if (e['@_key']) return { [e['@_key']]: e['#text'] || e };
        return typeof e === 'string' ? e : e['#text'] || e;
      });
    }
  }

  return elements;
}

function ensureArray(value: any): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
