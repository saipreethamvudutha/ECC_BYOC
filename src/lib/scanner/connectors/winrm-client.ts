/**
 * WinRM HTTP Client
 * Pure Node.js implementation — no extra npm packages.
 * Implements WS-Management protocol (WinRM) for Windows authenticated scanning.
 * Uses Basic auth over HTTPS (standard enterprise configuration).
 */

import * as http from 'http';
import * as https from 'https';
import { randomUUID } from 'crypto';

export interface WinRMConfig {
  host: string;
  port?: number;
  scheme?: 'http' | 'https';
  username: string;
  password: string;
  timeoutMs?: number;
}

export interface WinRMResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const WINRM_DEFAULT_HTTP_PORT = 5985;
const WINRM_DEFAULT_HTTPS_PORT = 5986;
const WINRM_CONNECT_TIMEOUT_MS = 15000;

function buildOpenShellXml(messageId: string, host: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <s:Header>
    <wsa:To>http://${host}/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2004/09/transfer/Create</wsa:Action>
    <wsman:ResourceURI>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI>
    <wsman:OperationTimeout>PT60.000S</wsman:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:Shell>
      <rsp:InputStreams>stdin</rsp:InputStreams>
      <rsp:OutputStreams>stdout stderr</rsp:OutputStreams>
    </rsp:Shell>
  </s:Body>
</s:Envelope>`;
}

function buildRunCommandXml(messageId: string, shellId: string, commandId: string, host: string, command: string): string {
  const escapedCmd = command.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <s:Header>
    <wsa:To>http://${host}/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:Action>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command</wsa:Action>
    <wsman:ResourceURI>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI>
    <wsman:SelectorSet><wsman:Selector Name="ShellId">${shellId}</wsman:Selector></wsman:SelectorSet>
    <wsman:OperationTimeout>PT60.000S</wsman:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:CommandLine>
      <rsp:Command>powershell.exe</rsp:Command>
      <rsp:Arguments>-NonInteractive -NoProfile -Command &quot;${escapedCmd}&quot;</rsp:Arguments>
    </rsp:CommandLine>
  </s:Body>
</s:Envelope>`;
}

function buildReceiveXml(messageId: string, shellId: string, commandId: string, host: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <s:Header>
    <wsa:To>http://${host}/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:Action>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive</wsa:Action>
    <wsman:ResourceURI>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI>
    <wsman:SelectorSet><wsman:Selector Name="ShellId">${shellId}</wsman:Selector></wsman:SelectorSet>
  </s:Header>
  <s:Body>
    <rsp:Receive><rsp:DesiredStream CommandId="${commandId}">stdout stderr</rsp:DesiredStream></rsp:Receive>
  </s:Body>
</s:Envelope>`;
}

function buildDeleteShellXml(messageId: string, shellId: string, host: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <wsa:To>http://${host}/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete</wsa:Action>
    <wsman:ResourceURI>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI>
    <wsman:SelectorSet><wsman:Selector Name="ShellId">${shellId}</wsman:Selector></wsman:SelectorSet>
  </s:Header>
  <s:Body/>
</s:Envelope>`;
}

async function winrmRequest(
  config: WinRMConfig,
  body: string,
  port: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
    const scheme = config.scheme ?? 'http';
    const transport = scheme === 'https' ? https : http;

    const options: http.RequestOptions & { rejectUnauthorized?: boolean } = {
      hostname: config.host,
      port,
      path: '/wsman',
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': authHeader,
        'User-Agent': 'BYOC-Scanner/1.0',
      },
      timeout: config.timeoutMs ?? WINRM_CONNECT_TIMEOUT_MS,
      // For HTTPS: skip cert validation for scanner use (enterprise: use proper certs)
      rejectUnauthorized: false,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`[WinRM] HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', (err: Error) => reject(new Error(`[WinRM] Request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error(`[WinRM] Request timed out`)); });
    req.write(body);
    req.end();
  });
}

function extractXmlValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
  if (!match) return '';
  // WinRM returns base64-encoded output
  try {
    return Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return match[1];
  }
}

export async function runWinRMCommand(
  config: WinRMConfig,
  psCommand: string
): Promise<WinRMResult> {
  const port = config.port ?? (config.scheme === 'https' ? WINRM_DEFAULT_HTTPS_PORT : WINRM_DEFAULT_HTTP_PORT);
  const host = config.host;

  // Step 1: Open shell
  const shellXml = await winrmRequest(config, buildOpenShellXml(randomUUID(), host), port);

  const actualShellId = shellXml.match(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i)?.[1] ?? '';

  if (!actualShellId) {
    throw new Error(`[WinRM] Failed to obtain shell ID from ${host}`);
  }

  // Step 2: Run command
  const commandId = randomUUID().toUpperCase();
  const safeCommand = `$ErrorActionPreference = 'SilentlyContinue'; ${psCommand}`;
  await winrmRequest(config, buildRunCommandXml(randomUUID(), actualShellId, commandId, host, safeCommand), port);

  // Step 3: Receive output
  const receiveXml = await winrmRequest(config, buildReceiveXml(randomUUID(), actualShellId, commandId, host), port);
  const stdout = extractXmlValue(receiveXml, 'rsp:Stream');
  const exitCodeMatch = receiveXml.match(/<rsp:ExitCode>(\d+)<\/rsp:ExitCode>/);
  const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : 0;

  // Step 4: Clean up shell
  try {
    await winrmRequest(config, buildDeleteShellXml(randomUUID(), actualShellId, host), port);
  } catch {
    // Ignore cleanup errors
  }

  return { stdout: stdout.trim(), stderr: '', exitCode };
}
