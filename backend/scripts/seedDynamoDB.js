const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs");
const path = require("path");

const TABLE_NAME = process.env.STUDENTS_TABLE || "Hofis_Students";
const REGION = process.env.AWS_REGION || "ap-south-1";

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function seedData() {
  const jsonPath = path.join(__dirname, "..", "test", "mockData.json");
  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const students = JSON.parse(rawData);

  console.log(`Starting to seed ${students.length} students into DynamoDB table '${TABLE_NAME}' in region '${REGION}'...`);

  for (const student of students) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: student
        })
      );
      console.log(`✅ Uploaded student: ${student.admissionNumber} - ${student.studentName} (Class ${student.class}-${student.division})`);
    } catch (err) {
      console.error(`❌ Failed to upload student ${student.admissionNumber}:`, err.message);
    }
  }

  console.log("Seeding process completed.");
}

seedData().catch((err) => {
  console.error("Error running seed script:", err.message);
  console.log("\nNote: Make sure your AWS credentials are configured via 'aws configure' before seeding DynamoDB.");
});

