const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

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
    const queryParams = event.queryStringParameters || {};
    const { status, admissionNumber } = queryParams;

    let items = [];

    if (admissionNumber) {
      const command = new QueryCommand({
        TableName: OUTPASS_TABLE,
        IndexName: "AdmissionNumberIndex",
        KeyConditionExpression: "admissionNumber = :adm",
        ExpressionAttributeValues: {
          ":adm": admissionNumber.trim()
        }
      });
      const res = await docClient.send(command);
      items = res.Items || [];
    } else if (status) {
      const command = new QueryCommand({
        TableName: OUTPASS_TABLE,
        IndexName: "StatusIndex",
        KeyConditionExpression: "#s = :statusVal",
        ExpressionAttributeNames: {
          "#s": "status"
        },
        ExpressionAttributeValues: {
          ":statusVal": status.toUpperCase()
        }
      });
      const res = await docClient.send(command);
      items = res.Items || [];
    } else {
      const command = new ScanCommand({
        TableName: OUTPASS_TABLE,
        Limit: 100
      });
      const res = await docClient.send(command);
      items = res.Items || [];
    }

    // Sort by createdAt descending
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        count: items.length,
        data: items
      })
    };
  } catch (error) {
    console.error("Error in listOutpasses handler:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: "Failed to list outpasses.",
        error: error.message
      })
    };
  }
};

