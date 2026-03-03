import { NextResponse } from "next/server";

/**
 * Validate that a string is a valid UUID v4.
 */
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Password validation with comprehensive rules.
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (password.length > 128) errors.push("Password must be less than 128 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain a special character");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Standardized API error response.
 */
export function apiError(
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    { error: message, ...(details && { details }) },
    { status }
  );
}
