import type { SendInvitationEmailParams } from "./email";

export function buildInvitationEmailHtml(params: SendInvitationEmailParams): string {
  const { inviteeName, inviterName, orgName, roleName, inviteLink, expiresAt } = params;
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${orgName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0a0e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="width:56px;height:56px;background:linear-gradient(135deg,#06b6d4,#3b82f6);border-radius:16px;display:inline-block;text-align:center;line-height:56px;">
                <span style="font-size:28px;color:white;">&#128737;</span>
              </div>
              <div style="margin-top:12px;font-size:22px;font-weight:700;color:#06b6d4;letter-spacing:2px;">BYOC</div>
              <div style="font-size:12px;color:#64748b;letter-spacing:1px;">CYBERSECURITY PLATFORM</div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:40px 32px;">

              <!-- Greeting -->
              <div style="font-size:24px;font-weight:700;color:#f1f5f9;margin-bottom:8px;">
                You're Invited!
              </div>
              <div style="font-size:15px;color:#94a3b8;margin-bottom:24px;line-height:1.6;">
                Hi ${inviteeName},
              </div>

              <!-- Invitation details -->
              <div style="font-size:15px;color:#cbd5e1;line-height:1.6;margin-bottom:24px;">
                <strong style="color:#f1f5f9;">${inviterName}</strong> has invited you to join
                <strong style="color:#f1f5f9;">${orgName}</strong> on BYOC, the enterprise cybersecurity platform.
              </div>

              <!-- Role badge -->
              <div style="background-color:#164e63;border:1px solid #0e7490;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
                <div style="font-size:12px;color:#67e8f9;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Assigned Role</div>
                <div style="font-size:18px;font-weight:600;color:#06b6d4;">${roleName}</div>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${inviteLink}"
                   style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.5px;">
                  Accept Invitation
                </a>
              </div>

              <!-- Expiry notice -->
              <div style="font-size:13px;color:#64748b;text-align:center;margin-bottom:20px;">
                This invitation expires on ${expiryDate}
              </div>

              <!-- Divider -->
              <div style="border-top:1px solid #1e293b;margin:20px 0;"></div>

              <!-- Fallback link -->
              <div style="font-size:12px;color:#475569;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:
                <br>
                <a href="${inviteLink}" style="color:#06b6d4;word-break:break-all;text-decoration:none;">
                  ${inviteLink}
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:32px;">
              <div style="font-size:12px;color:#475569;">
                BYOC Cybersecurity Platform
              </div>
              <div style="font-size:11px;color:#334155;margin-top:4px;">
                You received this email because you were invited to join ${orgName}.
                If you didn't expect this, you can safely ignore it.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
