// Delete an outpass permanently
// Lambda handler for HTTP DELETE /outpass/{outpassId}
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const OUTPASS_TABLE = process.env.OUTPASS_TABLE || "Hofis_Outpasses";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
  "Access-Control-Allow-Methods": "DELETE,OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const outpassId = event.pathParameters?.outpassId;
  if (!outpassId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "outpassId parameter is required." })
    };
  }

  try {
    const command = new DeleteCommand({
      TableName: OUTPASS_TABLE,
      Key: { outpassId },
      ReturnValues: "ALL_OLD"
    });
    const response = await docClient.send(command);
    const deleted = response.Attributes || null;
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: `Outpass ${outpassId} deleted.`, data: deleted })
    };
  } catch (err) {
    console.error("DeleteOutpass error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Failed to delete outpass.", error: err.message })
    };
  }
};

