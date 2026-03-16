/**
 * SSH Connection Helper
 * Creates SSH sessions for authenticated Linux/Unix scanning.
 * Uses ssh2 package — the only new npm dependency in Phase 12C.
 */

import { Client, type ConnectConfig } from 'ssh2';
import type { PlainCredential } from '../vault';

export interface SshCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

const SSH_CONNECT_TIMEOUT_MS = 15000;
const SSH_COMMAND_TIMEOUT_MS = 30000;

export async function createSshConnection(
  host: string,
  port: number,
  credential: PlainCredential
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();

    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`[SSH] Connection to ${host}:${port} timed out after ${SSH_CONNECT_TIMEOUT_MS}ms`));
    }, SSH_CONNECT_TIMEOUT_MS);

    client.on('ready', () => {
      clearTimeout(timer);
      resolve(client);
    });

    client.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`[SSH] ${host}: ${err.message}`));
    });

    const cfg: ConnectConfig = {
      host,
      port,
      username: credential.username,
      readyTimeout: SSH_CONNECT_TIMEOUT_MS - 1000,
      // Disable host key checking for scanner use (enterprise: use known_hosts in future)
      hostVerifier: () => true,
    };

    if (credential.credentialType === 'ssh_key') {
      cfg.privateKey = credential.secret;
      if (credential.passphrase) {
        cfg.passphrase = credential.passphrase;
      }
    } else {
      cfg.password = credential.secret;
    }

    client.connect(cfg);
  });
}

export async function runSshCommand(
  client: Client,
  command: string,
  timeoutMs: number = SSH_COMMAND_TIMEOUT_MS
): Promise<SshCommandResult> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(new Error(`[SSH] exec failed: ${err.message}`));
        return;
      }

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error(`[SSH] Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      stream.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      stream.on('close', (code: number) => {
        clearTimeout(timer);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 0 });
      });

      stream.on('error', (streamErr: Error) => {
        clearTimeout(timer);
        reject(new Error(`[SSH] Stream error: ${streamErr.message}`));
      });
    });
  });
}

export function closeSshConnection(client: Client): void {
  try {
    client.end();
  } catch {
    // Ignore close errors
  }
}
