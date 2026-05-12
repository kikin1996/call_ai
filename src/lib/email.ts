import { Resend } from "resend";

export async function sendEmailNotification(
  to: string,
  subject: string,
  text: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "Renote <notifikace@notifications.alfie-ai.com>",
    to,
    subject,
    text,
  });
}
