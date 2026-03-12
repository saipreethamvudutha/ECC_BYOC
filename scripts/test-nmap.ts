/**
 * Quick Nmap integration test — run against scanme.nmap.org (authorized target)
 * Usage: npx tsx scripts/test-nmap.ts
 */

import { isNmapAvailable, runNmap, getNmapVersion } from '../src/lib/scanner/nmap/executor';
import { parseNmapXml } from '../src/lib/scanner/nmap/parser';

async function main() {
  console.log('=== BYOC Nmap Integration Test ===\n');

  // 1. Check availability
  const available = await isNmapAvailable();
  console.log('Nmap installed:', available);
  if (!available) {
    console.log('FAIL: Nmap not found. Install from https://nmap.org/download.html');
    process.exit(1);
  }

  const version = await getNmapVersion();
  console.log('Nmap version:', version);

  // 2. Run a quick TCP connect scan (no admin needed)
  console.log('\nRunning TCP connect scan on scanme.nmap.org (top 10 ports)...');
  const start = Date.now();
  const { xml, stderr } = await runNmap(
    ['-sT', '-T4', '--top-ports', '10', '-sV', '--version-light', '--open', 'scanme.nmap.org'],
    60000
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Scan completed in ${elapsed}s (XML: ${xml.length} bytes)`);

  if (stderr) {
    console.log('Nmap stderr:', stderr.substring(0, 200));
  }

  // 3. Parse results
  const result = parseNmapXml(xml);
  console.log(`\nHosts found: ${result.hosts.length}`);

  if (result.hosts.length > 0) {
    const host = result.hosts[0];
    console.log(`Host: ${host.ip} (${host.hostname || 'no hostname'})`);
    console.log(`Status: ${host.status}`);

    const openPorts = host.ports.filter(p => p.state === 'open');
    console.log(`Open ports: ${openPorts.length}`);

    for (const port of openPorts) {
      const svc = port.service;
      console.log(
        `  ${port.number}/${port.protocol} — ${svc?.name || '?'} ${svc?.product || ''} ${svc?.version || ''}`.trim()
      );
      if (svc?.cpe && svc.cpe.length > 0) {
        console.log(`    CPE: ${svc.cpe.join(', ')}`);
      }
    }
  }

  // 4. Test the full check module
  console.log('\n--- Testing nmapPortScanCheck module ---');
  const { nmapPortScanCheck } = await import('../src/lib/scanner/checks/nmap-port-scan');
  try {
    const findings = await nmapPortScanCheck.run('scanme.nmap.org');
    console.log(`Port scan findings: ${findings.length}`);
    for (const f of findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
    }
  } catch (e: any) {
    console.log(`Port scan module error: ${e.message}`);
  }

  console.log('\n=== ALL TESTS PASSED ===');
}

main().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
