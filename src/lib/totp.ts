/**
 * TOTP (Time-based One-Time Password) utilities.
 * RFC 6238 implementation using otpauth library.
 *
 * Used for: MFA setup, verification, backup codes.
 */

import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";
import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { encrypt, decrypt } from "./encryption";

const ISSUER = "BYOC Security";
const PERIOD = 30; // seconds
const DIGITS = 6;
const ALGORITHM = "SHA1";

/**
 * Generate a new TOTP secret and QR code for enrollment.
 */
export async function generateTOTPSecret(email: string): Promise<{
  secret: string; // base32-encoded secret (for manual entry)
  encryptedSecret: string; // AES-256-GCM encrypted (for DB storage)
  qrCodeDataUrl: string; // data:image/png;base64,... (for QR display)
  otpauthUrl: string; // otpauth://totp/... URL
}> {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
  });

  const secret = totp.secret.base32;
  const otpauthUrl = totp.toString();
  const encryptedSecret = encrypt(secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 256,
    margin: 2,
    color: { dark: "#0ea5e9", light: "#0f172a" },
  });

  return { secret, encryptedSecret, qrCodeDataUrl, otpauthUrl };
}

/**
 * Verify a TOTP code against an encrypted secret.
 * Allows ±1 time-step window (90 seconds total).
 */
export function verifyTOTPCode(encryptedSecret: string, code: string): boolean {
  const secret = decrypt(encryptedSecret);
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // delta returns null if invalid, otherwise the time step difference
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate 10 random backup codes.
 * Returns both plaintext (shown once) and hashed versions (stored).
 */
export async function generateBackupCodes(): Promise<{
  plainCodes: string[]; // Show to user once
  hashedCodes: string[]; // Store in DB
}> {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    // 8-character alphanumeric code like "A3F9-K2M7"
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }

  const hashedCodes = await Promise.all(
    codes.map((code) => bcrypt.hash(code.replace("-", ""), 10))
  );

  return { plainCodes: codes, hashedCodes };
}

/**
 * Verify a backup code against stored hashes.
 * Returns the index of the matched code (for removal), or -1 if no match.
 */
export async function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): Promise<number> {
  const normalized = code.replace("-", "").toUpperCase();
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalized, hashedCodes[i]);
    if (match) return i;
  }
  return -1;
}
