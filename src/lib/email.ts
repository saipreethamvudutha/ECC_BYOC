import { Resend } from "resend";
import { buildInvitationEmailHtml } from "./email-templates";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is required");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export interface SendInvitationEmailParams {
  to: string;
  inviteeName: string;
  inviterName: string;
  orgName: string;
  roleName: string;
  inviteLink: string;
  expiresAt: Date;
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();
    const fromAddress = process.env.EMAIL_FROM || "BYOC <onboarding@resend.dev>";

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: params.to,
      subject: `${params.inviterName} invited you to join ${params.orgName} on BYOC`,
      html: buildInvitationEmailHtml(params),
    });

    if (error) {
      console.error("Failed to send invitation email:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("Email service error:", message);
    return { success: false, error: message };
  }
}
