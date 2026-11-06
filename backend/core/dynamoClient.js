/*
 * Core DynamoDB client used by all Lambda handlers.
 * It reads the AWS region from the environment (fallback to ap-south-1) and
 * creates a DynamoDBDocumentClient with the default AWS SDK credentials.
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "ap-south-1";

// The client can be reused across invocations – AWS SDK caches underlying sockets.
const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

module.exports = { docClient, REGION };

