// Nmap Process Executor — Spawns nmap binary and captures XML output
// Uses execFile (not exec) to prevent shell injection

import { execFile } from 'child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

let cachedNmapPath: string | null | undefined = undefined;

const NMAP_SEARCH_PATHS_WINDOWS = [
  'C:\\Program Files (x86)\\Nmap\\nmap.exe',
  'C:\\Program Files\\Nmap\\nmap.exe',
  'C:\\Nmap\\nmap.exe',
];

const NMAP_SEARCH_PATHS_LINUX = [
  '/usr/bin/nmap',
  '/usr/local/bin/nmap',
  '/opt/nmap/bin/nmap',
];

export function getNmapPath(): string | null {
  if (cachedNmapPath !== undefined) return cachedNmapPath;

  const isWindows = process.platform === 'win32';
  const searchPaths = isWindows ? NMAP_SEARCH_PATHS_WINDOWS : NMAP_SEARCH_PATHS_LINUX;

  for (const p of searchPaths) {
    if (existsSync(p)) {
      cachedNmapPath = p;
      console.log(`[Nmap] Found binary at: ${p}`);
      return p;
    }
  }

  // Try PATH resolution via which/where
  try {
    const cmd = isWindows ? 'where' : 'which';
    const result = require('child_process').execSync(`${cmd} nmap`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (result) {
      const firstLine = result.split('\n')[0].trim();
      cachedNmapPath = firstLine;
      console.log(`[Nmap] Found via PATH: ${firstLine}`);
      return firstLine;
    }
  } catch {
    // nmap not in PATH
  }

  cachedNmapPath = null;
  return null;
}

export async function isNmapAvailable(): Promise<boolean> {
  return getNmapPath() !== null;
}

export async function getNmapVersion(): Promise<string | null> {
  const nmapPath = getNmapPath();
  if (!nmapPath) return null;

  return new Promise((resolve) => {
    execFile(nmapPath, ['--version'], { timeout: 10000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const match = stdout.match(/Nmap version ([\d.]+)/);
      resolve(match ? match[1] : null);
    });
  });
}

export interface NmapRunResult {
  xml: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export async function runNmap(
  args: string[],
  timeoutMs: number = 300000
): Promise<NmapRunResult> {
  const nmapPath = getNmapPath();
  if (!nmapPath) {
    throw new Error('[Nmap] Binary not found. Install Nmap from https://nmap.org/download.html');
  }

  const tempXmlFile = join(tmpdir(), `byoc-nmap-${randomUUID()}.xml`);
  const startTime = Date.now();

  // Add XML output flag
  const fullArgs = [...args, '-oX', tempXmlFile];

  // Filter out any dangerous args (safety)
  const blockedArgs = ['--script-args-file', '--datadir', '--servicedb', '--versiondb'];
  for (const arg of fullArgs) {
    for (const blocked of blockedArgs) {
      if (arg.startsWith(blocked)) {
        throw new Error(`[Nmap] Blocked argument: ${blocked}`);
      }
    }
  }

  console.log(`[Nmap] Executing: nmap ${fullArgs.join(' ')}`);

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`[Nmap] Scan timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    execFile(
      nmapPath,
      fullArgs,
      {
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large scans
        signal: controller.signal,
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        let xml = '';
        try {
          if (existsSync(tempXmlFile)) {
            xml = readFileSync(tempXmlFile, 'utf-8');
          }
        } catch (readErr) {
          console.warn(`[Nmap] Failed to read XML output: ${readErr}`);
        } finally {
          // Clean up temp file
          try {
            if (existsSync(tempXmlFile)) {
              unlinkSync(tempXmlFile);
            }
          } catch {
            // ignore cleanup errors
          }
        }

        if (error && !xml) {
          reject(new Error(`[Nmap] Scan failed: ${error.message}\nStderr: ${stderr}`));
          return;
        }

        console.log(`[Nmap] Scan completed in ${(duration / 1000).toFixed(1)}s`);

        resolve({
          xml,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? (error as any).code || 1 : 0,
          duration,
        });
      }
    );
  });
}

// Reset cached path (useful for testing)
export function resetNmapCache(): void {
  cachedNmapPath = undefined;
}

/**
 * Parallel Nmap execution — scans multiple targets concurrently.
 * Each target gets its own runNmap() call (already uses randomUUID for temp files = parallel safe).
 * @param targets  Array of IP addresses or hostnames
 * @param baseArgs Nmap args applied to every target (exclude the target itself)
 * @param timeoutMs Per-target timeout
 * @param concurrency Max simultaneous nmap processes (default 5)
 */
export async function runNmapParallel(
  targets: string[],
  baseArgs: string[],
  timeoutMs: number = 300000,
  concurrency: number = 5
): Promise<NmapRunResult[]> {
  if (targets.length === 0) return [];

  const results: NmapRunResult[] = new Array(targets.length);
  const queue = targets.map((t, i) => ({ target: t, index: i }));
  const active = Math.min(concurrency, targets.length);

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        results[item.index] = await runNmap([...baseArgs, item.target], timeoutMs);
      } catch (err) {
        // Return a minimal result on failure so the array stays indexed
        results[item.index] = {
          xml: '',
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: 1,
          duration: 0,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: active }, worker));
  return results;
}
