const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const REGION = process.env.AWS_REGION || "ap-south-1";
const sesClient = new SESClient({ region: REGION });

const OUTPASS_TABLE = process.env.OUTPASS_TABLE || "Hofis_Outpasses";
const SENDER_EMAIL = process.env.SENDER_EMAIL || "shibinsajinakathunkal@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Content-Type": "application/json"
};

/**
 * Generate official approval email HTML template
 */
function buildApprovalEmailHtml(outpass) {
  const dtStr = outpass.leaveDateTime
    ? new Date(outpass.leaveDateTime).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "Scheduled School Hours";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
    .body-content { padding: 32px 28px; }
    .status-badge { display: inline-block; background: #d1fae5; color: #065f46; border: 1.5px solid #a7f3d0; padding: 6px 18px; border-radius: 9999px; font-weight: 800; font-size: 13px; margin-bottom: 20px; text-transform: uppercase; }
    .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
    .data-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #e2e8f0; }
    .data-table tr:last-child td { border-bottom: none; }
    .data-label { color: #64748b; font-weight: 600; width: 40%; }
    .data-value { color: #0f172a; font-weight: 700; }
    .guideline-box { background: #eff6ff; border-left: 4px solid #0284c7; padding: 16px; border-radius: 8px; margin-top: 24px; font-size: 13px; line-height: 1.6; color: #1e3a8a; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748b; background: #f8fafc; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HOLY FAMILY INTERNATIONAL SCHOOL</h1>
      <p>Official Early Departure & Gate Outpass</p>
    </div>
    <div class="body-content">
      <div style="text-align: center;">
        <span class="status-badge">✔ OUTPASS APPROVED</span>
      </div>
      <p style="font-size: 15px; margin: 0 0 12px 0;">Dear Parent / Guardian,</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 20px 0;">
        The early departure outpass request for your child has been <strong>APPROVED</strong> by the school administration.
      </p>

      <table class="data-table">
        <tr>
          <td class="data-label">Outpass ID</td>
          <td class="data-value" style="color: #0284c7; font-family: monospace; font-size: 15px;">${outpass.outpassId}</td>
        </tr>
        <tr>
          <td class="data-label">Student Name</td>
          <td class="data-value">${outpass.studentName || "Student"}</td>
        </tr>
        <tr>
          <td class="data-label">Admission Number</td>
          <td class="data-value">${outpass.admissionNumber || "N/A"}</td>
        </tr>
        <tr>
          <td class="data-label">Class & Division</td>
          <td class="data-value">Class ${outpass.class || ""} - Division ${outpass.division || ""}</td>
        </tr>
        <tr>
          <td class="data-label">Departure Schedule</td>
          <td class="data-value">${dtStr}</td>
        </tr>
        <tr>
          <td class="data-label">Reason</td>
          <td class="data-value">${outpass.reason || "Early Departure"}</td>
        </tr>
        <tr>
          <td class="data-label">Approved By</td>
          <td class="data-value">${outpass.updatedBy || "School Administration"}</td>
        </tr>
      </table>

      <div class="guideline-box">
        <strong>📋 School Exit Verification Guideline:</strong><br/>
        Before leaving school, please tell the student's admission number (<strong>${outpass.admissionNumber}</strong>) to the class teacher. They will verify this approved outpass, after which you may leave safely.
      </div>
    </div>
    <div class="footer">
      Holy Family International School &bull; Gatekeeper & Student Safety System
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send real email via AWS SES
 */
async function sendSesEmail(outpass) {
  const recipient = (outpass.parentEmail || "").trim();
  if (!recipient || !recipient.includes("@")) {
    console.warn(`[SES] Invalid recipient email: '${recipient}'`);
    return { sent: false, reason: "No valid parent email" };
  }

  const subject = `[APPROVED] Holy Family International School Outpass (${outpass.outpassId}) - ${outpass.studentName || "Student"}`;
  const htmlBody = buildApprovalEmailHtml(outpass);
  const textBody = `Holy Family International School\n\nYour outpass (${outpass.outpassId}) for student ${outpass.studentName} (Admission: ${outpass.admissionNumber}) has been APPROVED.\nDeparture: ${outpass.leaveDateTime}\nReason: ${outpass.reason}\n\nSchool Exit Guideline: Before leaving school, tell the student's admission number to the class teacher to verify the approved outpass.`;

  const params = {
    Source: SENDER_EMAIL,
    Destination: {
      ToAddresses: [recipient]
    },
    Message: {
      Subject: {
        Charset: "UTF-8",
        Data: subject
      },
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: htmlBody
        },
        Text: {
          Charset: "UTF-8",
          Data: textBody
        }
      }
    }
  };

  try {
    const res = await sesClient.send(new SendEmailCommand(params));
    console.log(`[SES] Email delivered successfully to ${recipient}. MessageId: ${res.MessageId}`);
    return { sent: true, messageId: res.MessageId };
  } catch (err) {
    console.error(`[SES] Failed to send email to ${recipient}:`, err.message);
    return { sent: false, error: err.message };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const outpassId = event.pathParameters?.outpassId;
    if (!outpassId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "outpassId parameter is required." })
      };
    }

    const payload = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body;
    const { status, remarks, updatedBy } = payload;

    if (!status) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "Status is required." })
      };
    }

    const nowIso = new Date().toISOString();

    const command = new UpdateCommand({
      TableName: OUTPASS_TABLE,
      Key: { outpassId: outpassId },
      UpdateExpression: "SET #st = :status, remarks = :remarks, updatedBy = :updatedBy, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#st": "status"
      },
      ExpressionAttributeValues: {
        ":status": status.toUpperCase(),
        ":remarks": remarks || "",
        ":updatedBy": updatedBy || "Staff",
        ":updatedAt": nowIso
      },
      ReturnValues: "ALL_NEW"
    });

    const response = await docClient.send(command);
    const updatedItem = response.Attributes || {};

    // Trigger real AWS SES email notification when approved
    let sesResult = { sent: false };
    if (status.toUpperCase() === "APPROVED" && updatedItem.parentEmail) {
      sesResult = await sendSesEmail(updatedItem);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Outpass ${outpassId} status updated to ${status}.` + 
          (sesResult.sent 
            ? ` Official approval email delivered to ${updatedItem.parentEmail}.` 
            : (updatedItem.parentEmail ? ` Email queued for ${updatedItem.parentEmail}.` : "")),
        emailSent: sesResult.sent,
        emailError: sesResult.error || null,
        recipientEmail: updatedItem.parentEmail || null,
        data: updatedItem
      })
    };
  } catch (error) {
    console.error("Error in updateOutpass handler:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: "Failed to update outpass.",
        error: error.message
      })
    };
  }
};

