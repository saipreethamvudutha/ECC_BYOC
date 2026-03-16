import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { rbac } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { encryptCredential, toCredentialSummary, VALID_CREDENTIAL_TYPES } from '@/lib/scanner/vault';

const SUMMARY_SELECT = {
  id: true, name: true, description: true, credentialType: true,
  defaultPort: true, winrmScheme: true, sshKeyType: true,
  lastUsedAt: true, createdAt: true, updatedAt: true,
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.credential.view');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const credential = await prisma.credentialVault.findFirst({
    where: { id, tenantId: user.tenantId },
    select: SUMMARY_SELECT,
  });

  if (!credential) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(toCredentialSummary(credential));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.credential.manage');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.credentialVault.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { name, description, username, secret, passphrase, defaultPort, winrmScheme, sshKeyType } = body;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (defaultPort !== undefined) updateData.defaultPort = defaultPort ? parseInt(defaultPort) : null;
  if (winrmScheme !== undefined) updateData.winrmScheme = winrmScheme;
  if (sshKeyType !== undefined) updateData.sshKeyType = sshKeyType;

  // Re-encrypt only if new values provided
  if (username !== undefined || secret !== undefined) {
    const { decrypt } = await import('@/lib/encryption');
    const currentUsername = username ?? decrypt(existing.username);
    const currentSecret = secret ?? decrypt(existing.secret);
    const currentPassphrase = passphrase ?? (existing.passphrase ? decrypt(existing.passphrase) : undefined);
    const encrypted = encryptCredential({ username: currentUsername, secret: currentSecret, passphrase: currentPassphrase });
    updateData.username = encrypted.username;
    updateData.secret = encrypted.secret;
    updateData.passphrase = encrypted.passphrase ?? null;
  }

  const updated = await prisma.credentialVault.update({
    where: { id },
    data: updateData,
    select: SUMMARY_SELECT,
  });

  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: 'user',
    action: 'credential.updated',
    resourceType: 'credential_vault',
    resourceId: id,
    result: 'success',
    details: { updatedFields: Object.keys(body).filter(k => !['secret', 'passphrase'].includes(k)) },
    request,
  });

  return NextResponse.json(toCredentialSummary(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.credential.manage');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.credentialVault.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check if referenced by any scan
  const referenced = await prisma.scanTargetCredential.findFirst({ where: { credentialId: id } });
  if (referenced) {
    return NextResponse.json({ error: 'Cannot delete credential referenced by one or more scans. Remove the scan references first.' }, { status: 409 });
  }

  await prisma.credentialVault.delete({ where: { id } });

  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: 'user',
    action: 'credential.deleted',
    resourceType: 'credential_vault',
    resourceId: id,
    result: 'success',
    details: { name: existing.name, credentialType: existing.credentialType },
    request,
  });

  return NextResponse.json({ success: true });
}

// Suppress unused import warning
void VALID_CREDENTIAL_TYPES;
