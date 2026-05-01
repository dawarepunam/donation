const { sendEmail } = require("./email");
const { uniqueEmails } = require("./admin");

const sendSafeEmail = async (payload, contextLabel = "notification") => {
  try {
    return await sendEmail(payload);
  } catch (error) {
    console.error(`Failed to send ${contextLabel} email:`, error.message);
    return { failed: true, message: error.message };
  }
};

const notifyUsers = async ({ recipients = [], subject, html, attachments = [], contextLabel }) => {
  const emails = uniqueEmails(recipients);
  if (!emails.length) return { skipped: true };

  const results = [];
  for (const email of emails) {
    // Send one by one so a single bad recipient does not block all admin/superadmin notifications.
    const result = await sendSafeEmail(
      {
        to: email,
        subject,
        html,
        attachments,
      },
      `${contextLabel}:${email}`
    );
    results.push({ email, result });
  }

  return { delivered: results };
};

const buildActorLabel = (actor = {}) => actor.name || actor.email || actor.role || "System";

const notifyOperation = async ({
  actor,
  recipients = [],
  subject,
  operationTitle,
  operationDetails = [],
  contextLabel = "operation-notification",
}) => {
  const detailMarkup = operationDetails
    .filter(Boolean)
    .map((line) => `<li>${line}</li>`)
    .join("");

  return notifyUsers({
    recipients,
    subject,
    contextLabel,
    html: `
      <h2>${operationTitle}</h2>
      <p><strong>Performed by:</strong> ${buildActorLabel(actor)}</p>
      ${detailMarkup ? `<ul>${detailMarkup}</ul>` : "<p>Please review the latest platform activity.</p>"}
    `,
  });
};

module.exports = {
  sendSafeEmail,
  notifyUsers,
  notifyOperation,
};
