import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { rbac } from '@/lib/rbac';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { decryptCredential } from '@/lib/scanner/vault';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await rbac.checkCapability(user.id, user.tenantId, 'scan.credential.manage');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const credential = await prisma.credentialVault.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!credential) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { target } = body;
  if (!target) return NextResponse.json({ error: 'target is required' }, { status: 400 });

  const plainCred = decryptCredential(credential);
  const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const port = plainCred.defaultPort ?? (plainCred.credentialType.startsWith('winrm') ? 5985 : 22);

  let success = false;
  let errorMessage: string | undefined;

  try {
    if (plainCred.credentialType.startsWith('ssh')) {
      const { createSshConnection, runSshCommand, closeSshConnection } = await import('@/lib/scanner/connectors/ssh-client');
      const client = await createSshConnection(host, port, plainCred);
      const result = await runSshCommand(client, 'echo byoc-test');
      closeSshConnection(client);
      success = result.stdout.includes('byoc-test');
    } else if (plainCred.credentialType.startsWith('winrm')) {
      const { runWinRMCommand } = await import('@/lib/scanner/connectors/winrm-client');
      const result = await runWinRMCommand({
        host,
        port: plainCred.defaultPort ?? undefined,
        scheme: (plainCred.winrmScheme as 'http' | 'https') ?? 'http',
        username: plainCred.username,
        password: plainCred.secret,
      }, 'Write-Output "byoc-test"');
      success = result.stdout.includes('byoc-test') || result.exitCode === 0;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Update lastUsedAt
  await prisma.credentialVault.update({ where: { id }, data: { lastUsedAt: new Date() } });

  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: 'user',
    action: 'credential.tested',
    resourceType: 'credential_vault',
    resourceId: id,
    result: success ? 'success' : 'error',
    details: { target: host, success, error: errorMessage },
    request,
  });

  return NextResponse.json({ success, error: errorMessage ?? null, target: host, port });
}
