import { z } from "zod";
import { createTool } from "./mod.ts";

/**
 * Email configuration
 */
interface EmailConfig {
  service: "resend" | "smtp";
  apiKey?: string;
  smtpConfig?: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  fromEmail: string;
  fromName?: string;
}

/**
 * Send email via Resend API (recommended)
 */
async function sendViaResend(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error("Resend API key is required");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.fromName
        ? `${config.fromName} <${config.fromEmail}>`
        : config.fromEmail,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * Generate HTML email template for research updates
 */
function generateResearchEmailTemplate(
  title: string,
  content: string,
  papers?: Array<{
    title: string;
    authors: string;
    abstract: string;
    url: string;
    date: string;
  }>,
): string {
  const papersHtml = papers
    ? papers
      .map(
        (paper) => `
    <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
      <h3 style="margin: 0 0 10px 0; color: #007bff;">
        <a href="${paper.url}" style="color: #007bff; text-decoration: none;">${paper.title}</a>
      </h3>
      <p style="margin: 5px 0; color: #6c757d; font-size: 14px;">
        <strong>Authors:</strong> ${paper.authors}
      </p>
      <p style="margin: 5px 0; color: #6c757d; font-size: 14px;">
        <strong>Date:</strong> ${paper.date}
      </p>
      <p style="margin: 10px 0; color: #333; line-height: 1.6;">
        ${paper.abstract}
      </p>
    </div>
  `,
      )
      .join("")
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">

  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px; margin-bottom: 30px;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎓 ${title}</h1>
  </div>

  <div style="background-color: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    ${content}
    ${papersHtml}
  </div>

  <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
    <p style="margin: 0; color: #6c757d; font-size: 14px;">
      You're receiving this email because you subscribed to research updates.
    </p>
    <p style="margin: 10px 0 0 0; color: #6c757d; font-size: 14px;">
      Powered by <strong>Academic Research Assistant</strong>
    </p>
  </div>

</body>
</html>
  `.trim();
}

/**
 * Create email sending tool with configuration
 */
export function createSendEmailTool(config: EmailConfig) {
  return createTool({
    name: "send_email",
    description:
      "Send an email with research updates, paper summaries, or notifications. Supports HTML formatting for rich content presentation.",
    schema: z.object({
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      content: z.string().describe(
        "Main email content (markdown or plain text will be converted to HTML)",
      ),
      papers: z
        .array(
          z.object({
            title: z.string(),
            authors: z.string(),
            abstract: z.string(),
            url: z.string(),
            date: z.string(),
          }),
        )
        .optional()
        .describe("Optional array of paper objects to include in email"),
    }),
    execute: async ({ to, subject, content, papers }) => {
      try {
        console.log(`Sending email to ${to}...`);

        // Generate HTML email
        const html = generateResearchEmailTemplate(subject, content, papers);

        // Send via configured service
        let emailId: string;

        if (config.service === "resend") {
          emailId = await sendViaResend(config, to, subject, html);
        } else {
          throw new Error(
            "SMTP service not yet implemented. Please use Resend.",
          );
        }

        console.log(`Email sent successfully! ID: ${emailId}`);

        return `Email sent successfully to ${to}. Email ID: ${emailId}`;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.error("Error sending email:", errorMessage);
        return `Error sending email: ${errorMessage}`;
      }
    },
  });
}

/**
 * Default email tool using environment variables
 */
export const SendEmailTool = createSendEmailTool({
  service: "resend",
  apiKey: Deno.env.get("RESEND_API_KEY"),
  fromEmail: Deno.env.get("FROM_EMAIL") || "research@example.com",
  fromName: Deno.env.get("FROM_NAME") || "Academic Research Assistant",
});
