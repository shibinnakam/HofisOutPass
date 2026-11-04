const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const STUDENTS_TABLE = process.env.STUDENTS_TABLE || "Hofis_Students";

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
    const admissionNumber = event.pathParameters?.admissionNumber
      ? decodeURIComponent(event.pathParameters.admissionNumber).trim()
      : null;

    if (!admissionNumber) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: "Admission Number is required."
        })
      };
    }

    const command = new GetCommand({
      TableName: STUDENTS_TABLE,
      Key: {
        admissionNumber: admissionNumber
      }
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: `Student with Admission Number '${admissionNumber}' was not found. Please verify and try again.`
        })
      };
    }

    const student = response.Item;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          admissionNumber: student.admissionNumber,
          studentName: student.studentName || student.name,
          fatherName: student.fatherName || student.fathername || student.guardianName,
          class: student.class || student.grade,
          division: student.division || student.div || student.section || "",
          contactNumber: student.contactNumber || student.phone || ""
        }
      })
    };
  } catch (error) {
    console.error("Error in getStudent handler:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: "Internal server error fetching student details.",
        error: error.message
      })
    };
  }
};

