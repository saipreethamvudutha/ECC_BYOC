import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { rbac } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { encryptCredential, toCredentialSummary, VALID_CREDENTIAL_TYPES } from '@/lib/scanner/vault';

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.credential.view');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
  const type = searchParams.get('type');

  const where = {
    tenantId: user.tenantId,
    ...(type && VALID_CREDENTIAL_TYPES.includes(type as typeof VALID_CREDENTIAL_TYPES[number]) ? { credentialType: type } : {}),
  };

  const [credentials, total] = await Promise.all([
    prisma.credentialVault.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, description: true, credentialType: true,
        defaultPort: true, winrmScheme: true, sshKeyType: true,
        lastUsedAt: true, createdAt: true, updatedAt: true,
        // NEVER select: username, secret, passphrase
      },
    }),
    prisma.credentialVault.count({ where }),
  ]);

  return NextResponse.json({ credentials: credentials.map(toCredentialSummary), total, page, limit });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.credential.manage');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { name, description, credentialType, username, secret, passphrase, defaultPort, winrmScheme, sshKeyType } = body;

  if (!name || !credentialType || !username || !secret) {
    return NextResponse.json({ error: 'name, credentialType, username, and secret are required' }, { status: 400 });
  }

  if (!VALID_CREDENTIAL_TYPES.includes(credentialType)) {
    return NextResponse.json({ error: `credentialType must be one of: ${VALID_CREDENTIAL_TYPES.join(', ')}` }, { status: 400 });
  }

  if (credentialType === 'winrm_password' && !winrmScheme) {
    return NextResponse.json({ error: 'winrmScheme (http or https) is required for WinRM credentials' }, { status: 400 });
  }

  // Check name uniqueness within tenant
  const existing = await prisma.credentialVault.findFirst({ where: { tenantId: user.tenantId, name } });
  if (existing) return NextResponse.json({ error: 'A credential with this name already exists' }, { status: 409 });

  const encrypted = encryptCredential({ username, secret, passphrase });

  const credential = await prisma.credentialVault.create({
    data: {
      tenantId: user.tenantId,
      name,
      description: description ?? null,
      credentialType,
      username: encrypted.username,
      secret: encrypted.secret,
      passphrase: encrypted.passphrase ?? null,
      defaultPort: defaultPort ? parseInt(defaultPort) : null,
      winrmScheme: winrmScheme ?? null,
      sshKeyType: sshKeyType ?? null,
      createdById: user.id,
    },
    select: { id: true, name: true, credentialType: true, createdAt: true },
  });

  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: 'user',
    action: 'credential.created',
    resourceType: 'credential_vault',
    resourceId: credential.id,
    result: 'success',
    details: { name, credentialType },
    request,
  });

  return NextResponse.json(credential, { status: 201 });
}
