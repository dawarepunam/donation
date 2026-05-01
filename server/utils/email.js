const nodemailer = require("nodemailer");

let transporter = null;
// Support common env key variants so mail setup works without changing the rest of the app.
const emailUser = process.env.EMAIL_USER || process.env.EMAIL || "";
const emailPass =
  process.env.EMAIL_PASS ||
  process.env.EMAILPASS ||
  process.env.EMAIL_PASSWORD ||
  "";
const emailProvider = process.env.EMAIL_PROVIDER || "gmail";
const smtpHost = process.env.EMAIL_SMTP_HOST || "";
const smtpPort = Number(process.env.EMAIL_SMTP_PORT || 465);
const smtpSecure = String(process.env.EMAIL_SMTP_SECURE || "true").toLowerCase() === "true";
const emailFrom = process.env.EMAIL_FROM || emailUser;

if (emailUser && emailPass) {
  // Keep backward compatibility with both EMAIL/EMAIL_PASS and EMAIL_USER/EMAIL_PASS env names.
  transporter = nodemailer.createTransport(
    smtpHost
      ? {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: emailUser,
            pass: emailPass,
          },
        }
      : {
          service: emailProvider,
          auth: {
            user: emailUser,
            pass: emailPass,
          },
        }
  );

  // Verify SMTP once at startup so mail configuration problems are visible immediately in server logs.
  transporter
    .verify()
    .then(() => {
      console.log(`Email transporter ready for ${emailUser}`);
    })
    .catch((error) => {
      console.error(`Email transporter failed for ${emailUser}: ${error.message}`);
    });
}

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  if (!transporter) {
    console.log(`Email skipped for ${to}: transporter not configured`);
    return { skipped: true };
  }

  return transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    html,
    attachments,
  });
};

module.exports = { sendEmail };
