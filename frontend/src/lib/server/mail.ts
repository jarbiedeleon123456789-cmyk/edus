import nodemailer from "nodemailer";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]!);

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  ignoreTLS: boolean;
  user?: string;
  pass?: string;
};

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const portValue = process.env.SMTP_PORT ?? "587";
  const port = Number(portValue);
  const secureMode = process.env.SMTP_SECURE?.trim().toLowerCase() ?? "";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (secureMode && !["ssl", "tls", "none"].includes(secureMode)) return null;
  if (Boolean(user) !== Boolean(pass)) return null;
  const encryption = secureMode || (port === 465 ? "ssl" : port === 587 ? "tls" : "none");

  return {
    host,
    port,
    secure: encryption === "ssl",
    requireTLS: encryption === "tls",
    ignoreTLS: encryption === "none",
    ...(user && pass ? { user, pass } : {}),
  };
}

export const mailConfigured = () => Boolean(getSmtpConfig());

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const config = getSmtpConfig();
  if (!config) {
    console.error("Email delivery is not configured: check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASSWORD.");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      ...config,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? "EduSphere <noreply@edusphere.dev>",
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("SMTP email delivery failed.", error);
    return false;
  }
}

export const verificationEmail = (code: string) => `
  <div style="font-family:system-ui;color:#12142b">
    <h2>Verify your EduSphere email</h2>
    <p>Enter this verification code to finish creating your account:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:0.2em">${escapeHtml(code)}</p>
    <p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
  </div>`;

export const welcomeEmail = (name: string) => `
  <div style="font-family:system-ui;color:#12142b">
    <h2>You're in, ${escapeHtml(name)}.</h2>
    <p>Your first stop is the placement assessment — 10 questions, about 5 minutes. Your learning path is generated from the result, so answer honestly rather than well.</p>
    <p>— EduSphere</p>
  </div>`;

export const notificationEmail = (title: string, body: string) => `
  <div style="font-family:system-ui;color:#12142b">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>
    <p>— EduSphere</p>
  </div>`;
