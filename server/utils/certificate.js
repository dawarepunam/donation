const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const uploadsDir = path.join(__dirname, "..", "uploads");
const certificatesDir = path.join(uploadsDir, "certificates");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const escapePdfText = (text) =>
  String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const formatCertificateDate = (value) => {
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

const formatLongCertificateDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const sanitizeDisplayValue = (value, fallback = "-") => {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
};

const estimateTextWidth = (text, fontSize = 12) => {
  const normalized = String(text || "");
  let units = 0;

  for (const char of normalized) {
    if ("il.,'|!:; ".includes(char)) {
      units += 0.22;
    } else if ("mwMW@#%&".includes(char)) {
      units += 0.9;
    } else if (/[A-Z0-9]/.test(char)) {
      units += 0.68;
    } else {
      units += 0.56;
    }
  }

  return units * fontSize;
};

const centerTextX = (text, fontSize, pageWidth = 595) => {
  const width = estimateTextWidth(text, fontSize);
  return Math.max(40, Math.round((pageWidth - width) / 2));
};

const wrapByWidth = (text, fontSize, maxWidth) => {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
};

const buildStyledPdf = ({
  donorName,
  amount,
  donationDate,
  campaignTitle,
  certificateId,
  ngoName,
  pan,
  eightyGNumber,
  ngoAddress,
  ngoEmail,
  ngoPhone,
}) => {
  const objects = [];

  const pushObject = (body) => {
    objects.push(body);
  };

  pushObject("<< /Type /Catalog /Pages 2 0 R >>");
  pushObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  pushObject("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>");

  const safeDonorName = sanitizeDisplayValue(donorName, "Supporter");
  const safeCampaignTitle = sanitizeDisplayValue(campaignTitle, "Campaign");
  const safeAmount = `INR ${Number(amount || 0).toFixed(0)}`;
  const safeDate = formatCertificateDate(donationDate);
  const safeLongDate = formatLongCertificateDate(donationDate);
  const safeNgoName = sanitizeDisplayValue(ngoName, "HopeSpring NGO");
  const leftInfoLines = [
    `Certificate ID: ${certificateId}`,
    `Campaign: ${safeCampaignTitle}`,
    `Amount: ${safeAmount}`,
    `Date: ${safeDate}`,
  ];
  const rightInfoLines = [
    `NGO PAN: ${sanitizeDisplayValue(pan)}`,
    `80G Number: ${sanitizeDisplayValue(eightyGNumber)}`,
    sanitizeDisplayValue(ngoAddress),
    sanitizeDisplayValue(ngoEmail),
    sanitizeDisplayValue(ngoPhone),
  ].filter((line) => line && line !== "-");
  const donorDisplay = `[${safeDonorName}]`;
  const appreciationLine = "COMMUNITY IMPACT APPRECIATION";
  const titleLine = "DONATION CERTIFICATE";
  const appreciationX = centerTextX(appreciationLine, 16);
  const titleX = centerTextX(titleLine, 26);
  const donorNameLines = wrapByWidth(donorDisplay, 24, 340);
  const donorStartY = donorNameLines.length > 1 ? 366 : 350;

  const contentLines = [
    "q",
    "1 1 1 rg",
    "0 0 595 842 re f",
    "0.16 0.33 0.28 rg",
    "36 768 68 68 re f",
    "492 750 68 68 re f",
    "0.88 0.84 0.14 rg",
    "44 776 52 52 re f",
    "508 766 52 52 re f",
    "0.17 0.34 0.28 RG",
    "2 w",
    "12 24 571 794 re S",
    "0.88 0.84 0.14 RG",
    "0.9 w",
    "24 36 547 770 re S",
    "0.17 0.34 0.28 rg",
    "BT",
    "/F2 18 Tf",
    "60 726 Td",
    `(${escapePdfText(safeNgoName.toUpperCase())}) Tj`,
    "ET",
    "BT",
    "/F1 9 Tf",
    "60 712 Td",
    "(Donation Certificate) Tj",
    "ET",
    "0.42 0.60 0.25 rg",
    "BT",
    "/F1 16 Tf",
    `${appreciationX} 622 Td`,
    `(${escapePdfText(appreciationLine)}) Tj`,
    "ET",
    "0.17 0.34 0.28 rg",
    "BT",
    "/F3 26 Tf",
    `${titleX} 558 Td`,
    `(${escapePdfText(titleLine)}) Tj`,
    "ET",
    "BT",
    "/F1 14 Tf",
    `${centerTextX("This Certificate is Presented to", 14)} 476 Td`,
    "(This Certificate is Presented to) Tj",
    "ET"
  ];

  donorNameLines.forEach((line, index) => {
    contentLines.push(
      "0.42 0.60 0.25 rg",
      "BT",
      "/F2 24 Tf",
      `${centerTextX(line, 24)} ${donorStartY - index * 28} Td`,
      `(${escapePdfText(line)}) Tj`,
      "ET"
    );
  });

  contentLines.push(
    "0.17 0.34 0.28 rg",
    "BT",
    "/F1 11 Tf",
    `${centerTextX("In recognition of your generous contribution and support for this cause.", 11)} 286 Td`,
    "(In recognition of your generous contribution and support for this cause.) Tj",
    "ET",
    "BT",
    "/F1 11 Tf",
    `${centerTextX("Your donation has helped move this campaign forward and strengthen our mission.", 11)} 262 Td`,
    "(Your donation has helped move this campaign forward and strengthen our mission.) Tj",
    "ET",
    "BT",
    "/F1 11 Tf",
    `${centerTextX(`Given on ${safeLongDate}`, 11)} 228 Td`,
    `(Given on ${escapePdfText(safeLongDate)}) Tj`,
    "ET"
  );

  let leftDetailY = 168;
  leftInfoLines.forEach((line) => {
    const wrappedLines = wrapByWidth(line, 9, 190);
    wrappedLines.forEach((wrappedLine, index) => {
      contentLines.push(
        "BT",
        "/F1 9 Tf",
        `${58} ${leftDetailY - index * 12} Td`,
        `(${escapePdfText(wrappedLine)}) Tj`,
        "ET"
      );
    });
    leftDetailY -= wrappedLines.length > 1 ? wrappedLines.length * 12 + 4 : 14;
  });

  let rightDetailY = 168;
  rightInfoLines.forEach((line) => {
    const wrappedLines = wrapByWidth(line, 9, 190);
    wrappedLines.forEach((wrappedLine, index) => {
      contentLines.push(
        "BT",
        "/F1 9 Tf",
        `${346} ${rightDetailY - index * 12} Td`,
        `(${escapePdfText(wrappedLine)}) Tj`,
        "ET"
      );
    });
    rightDetailY -= wrappedLines.length > 1 ? wrappedLines.length * 12 + 4 : 14;
  });

  contentLines.push(
    "0.88 0.84 0.14 RG",
    "1.3 w",
    "72 118 m 240 118 l S",
    "356 118 m 522 118 l S",
    "0.17 0.34 0.28 rg",
    "BT",
    "/F1 10 Tf",
    "126 96 Td",
    "(Donor Record) Tj",
    "ET",
    "BT",
    "/F1 10 Tf",
    "396 96 Td",
    "(Authorized Signatory) Tj",
    "ET",
    "BT",
    "/F1 8 Tf",
    "105 74 Td",
    "(This certificate is system generated.) Tj",
    "ET",
    "BT",
    "/F1 8 Tf",
    "364 74 Td",
    "(Thank you for supporting this cause.) Tj",
    "ET",
    "Q"
  );

  const content = contentLines.join("\n");
  pushObject(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};

const generateCertificate = ({
  donorName,
  amount,
  donationDate,
  campaignTitle,
  ngoName,
  pan,
  eightyGNumber,
  ngoAddress,
  ngoEmail,
  ngoPhone,
  certificateId: providedCertificateId,
}) => {
  ensureDir(certificatesDir);

  const certificateId = providedCertificateId || `80G-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const fileName = `${certificateId}.pdf`;
  const filePath = path.join(certificatesDir, fileName);

  fs.writeFileSync(
    filePath,
    buildStyledPdf({
      donorName,
      amount,
      donationDate,
      campaignTitle,
      ngoName,
      pan,
      eightyGNumber,
      ngoAddress,
      ngoEmail,
      ngoPhone,
      certificateId,
    })
  );

  return {
    certificateId,
    fileName,
    filePath,
    fileUrl: `/api/donation/certificate/download/${certificateId}`,
    donorName: sanitizeDisplayValue(donorName, "Supporter"),
    campaignTitle: sanitizeDisplayValue(campaignTitle, "Campaign"),
    amount: Number(amount || 0),
    issuedOn: new Date(donationDate),
    ngoName: sanitizeDisplayValue(ngoName, "HopeSpring NGO"),
    pan: sanitizeDisplayValue(pan),
    eightyGNumber: sanitizeDisplayValue(eightyGNumber),
    ngoAddress: sanitizeDisplayValue(ngoAddress),
    ngoEmail: sanitizeDisplayValue(ngoEmail),
    ngoPhone: sanitizeDisplayValue(ngoPhone),
  };
};

module.exports = { generateCertificate, ensureDir, uploadsDir, certificatesDir };
