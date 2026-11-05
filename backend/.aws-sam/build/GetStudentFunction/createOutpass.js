const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const STUDENTS_TABLE = process.env.STUDENTS_TABLE || "Hofis_Students";
const OUTPASS_TABLE = process.env.OUTPASS_TABLE || "Hofis_Outpasses";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Content-Type": "application/json"
};

function generateOutpassId() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `HOFIS-${dateStr}-${randomSuffix}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: "Request body cannot be empty." })
      };
    }

    const payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { admissionNumber, reason, leaveDateTime, parentEmail, parentName, parentPhone, pickupPerson } = payload;

    if (!admissionNumber || !reason || !leaveDateTime) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: "admissionNumber, reason, and leaveDateTime are required fields."
        })
      };
    }

    // Validate Departure DateTime: No past dates/times, up to 7 days ahead
    const leaveTimestamp = new Date(leaveDateTime).getTime();
    if (isNaN(leaveTimestamp)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: "Invalid departure date and time."
        })
      };
    }

    const now = Date.now();
    // 1-minute buffer for network transit latency
    if (leaveTimestamp < now - 60 * 1000) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: "Departure date and time cannot be in the past. If applying for today, the time must be in the future (e.g. at 10:00 AM you cannot apply for 9:59 AM)."
        })
      };
    }

    const maxAllowedTimestamp = now + 7 * 24 * 60 * 60 * 1000;
    if (leaveTimestamp > maxAllowedTimestamp) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: "Outpass can only be applied up to 7 days in advance."
        })
      };
    }

    // Verify student exists in DynamoDB
    let student = null;
    const studentCheck = await docClient.send(
      new GetCommand({
        TableName: STUDENTS_TABLE,
        Key: { admissionNumber: String(admissionNumber).trim() }
      })
    );

    if (studentCheck.Item) {
      student = studentCheck.Item;
    } else if (payload.studentName) {
      // Auto-cache student into DynamoDB
      student = {
        admissionNumber: String(admissionNumber).trim(),
        studentName: payload.studentName,
        fatherName: payload.fatherName || payload.parentName || "Parent",
        class: String(payload.class || "5"),
        division: String(payload.division || "A"),
        contactEmail: payload.parentEmail || "",
        contactNumber: payload.parentPhone || "+91 98765 43210"
      };
      try {
        await docClient.send(
          new PutCommand({
            TableName: STUDENTS_TABLE,
            Item: student
          })
        );
      } catch (cacheErr) {
        console.warn("Could not auto-insert student into DynamoDB:", cacheErr.message);
      }
    } else {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: `Cannot issue outpass: Student with Admission Number '${admissionNumber}' does not exist.`
        })
      };
    }

    // Check if an outpass already exists for this student on this departure date
    const targetDateStr = new Date(leaveDateTime).toISOString().slice(0, 10); // YYYY-MM-DD
    const existingCheck = await docClient.send(
      new QueryCommand({
        TableName: OUTPASS_TABLE,
        IndexName: "AdmissionNumberIndex",
        KeyConditionExpression: "admissionNumber = :adm",
        ExpressionAttributeValues: {
          ":adm": String(admissionNumber).trim()
        }
      })
    );

    const existingItems = existingCheck.Items || [];
    const duplicateMatch = existingItems.find(item => {
      if (!item.leaveDateTime) return false;
      const itemDateStr = new Date(item.leaveDateTime).toISOString().slice(0, 10);
      return itemDateStr === targetDateStr && (item.status === "PENDING" || item.status === "APPROVED");
    });

    if (duplicateMatch) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          alreadySubmitted: true,
          status: duplicateMatch.status,
          existingOutpass: duplicateMatch,
          message: `An outpass has already been submitted for this student on ${targetDateStr} with status: ${duplicateMatch.status} (Pass ID: ${duplicateMatch.outpassId}).`
        })
      };
    }

    const outpassId = generateOutpassId();
    const nowIso = new Date().toISOString();

    const outpassItem = {
      outpassId: outpassId,
      admissionNumber: student.admissionNumber,
      studentName: student.studentName || student.name || "N/A",
      fatherName: student.fatherName || student.fathername || "N/A",
      class: String(student.class || student.grade || ""),
      division: String(student.division || student.div || ""),
      reason: reason.trim(),
      leaveDateTime: leaveDateTime,
      parentEmail: parentEmail ? parentEmail.trim() : "",
      parentName: parentName ? parentName.trim() : (student.fatherName || "Parent/Guardian"),
      parentPhone: parentPhone ? parentPhone.trim() : (student.contactNumber || "N/A"),
      pickupPerson: pickupPerson ? pickupPerson.trim() : (student.fatherName || "Self / Parent"),
      status: "PENDING", // PENDING -> APPROVED / REJECTED -> EXITED
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await docClient.send(
      new PutCommand({
        TableName: OUTPASS_TABLE,
        Item: outpassItem
      })
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: "Outpass request submitted successfully.",
        data: outpassItem
      })
    };
  } catch (error) {
    console.error("Error in createOutpass handler:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: "Failed to submit outpass request.",
        error: error.message
      })
    };
  }
};

