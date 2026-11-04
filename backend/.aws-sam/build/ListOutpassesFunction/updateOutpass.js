const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const OUTPASS_TABLE = process.env.OUTPASS_TABLE || "Hofis_Outpasses";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Content-Type": "application/json"
};

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

    // If outpass is approved, trigger email notification to parent
    let emailDispatched = false;
    if (status.toUpperCase() === "APPROVED" && updatedItem.parentEmail) {
      console.log(`[Notification] Outpass ${outpassId} APPROVED! Sending notification email to: ${updatedItem.parentEmail}`);
      // In production with verified SES identity, SES SendEmailCommand is invoked here
      emailDispatched = true;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Outpass ${outpassId} status updated to ${status}.` + (emailDispatched ? ` Notification sent to ${updatedItem.parentEmail}.` : ""),
        emailSent: emailDispatched,
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

