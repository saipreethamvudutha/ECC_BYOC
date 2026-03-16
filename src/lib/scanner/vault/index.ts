/**
 * Scanner Credential Vault
 * Wraps AES-256-GCM encryption for SSH/WinRM credentials.
 * PlainCredential MUST NEVER be logged, serialized to JSON responses, or stored in DB.
 */

import { encrypt, decrypt } from '@/lib/encryption';

export interface PlainCredential {
  credentialType: string;
  username: string;
  secret: string;       // password or SSH private key PEM
  passphrase?: string;  // SSH key passphrase
  defaultPort?: number;
  winrmScheme?: string;
}

export interface EncryptedCredentialFields {
  username: string;
  secret: string;
  passphrase?: string;
}

export function encryptCredential(plain: {
  username: string;
  secret: string;
  passphrase?: string;
}): EncryptedCredentialFields {
  return {
    username: encrypt(plain.username),
    secret: encrypt(plain.secret),
    passphrase: plain.passphrase ? encrypt(plain.passphrase) : undefined,
  };
}

export function decryptCredential(row: {
  credentialType: string;
  username: string;
  secret: string;
  passphrase?: string | null;
  defaultPort?: number | null;
  winrmScheme?: string | null;
}): PlainCredential {
  return {
    credentialType: row.credentialType,
    username: decrypt(row.username),
    secret: decrypt(row.secret),
    passphrase: row.passphrase ? decrypt(row.passphrase) : undefined,
    defaultPort: row.defaultPort ?? undefined,
    winrmScheme: row.winrmScheme ?? undefined,
  };
}

/** Safe credential summary for API responses — never includes secret fields */
export interface CredentialSummary {
  id: string;
  name: string;
  description: string | null;
  credentialType: string;
  defaultPort: number | null;
  winrmScheme: string | null;
  sshKeyType: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toCredentialSummary(row: CredentialSummary): CredentialSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    credentialType: row.credentialType,
    defaultPort: row.defaultPort,
    winrmScheme: row.winrmScheme,
    sshKeyType: row.sshKeyType,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const VALID_CREDENTIAL_TYPES = ['ssh_password', 'ssh_key', 'winrm_password'] as const;
export type CredentialType = typeof VALID_CREDENTIAL_TYPES[number];
