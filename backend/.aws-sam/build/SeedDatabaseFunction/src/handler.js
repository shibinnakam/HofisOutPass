// ==========================================================================
// Holy Family International School (HOFIS) - AWS Lambda Handlers
// Services: Amazon Cognito, Amazon DynamoDB, Amazon SES, Amazon API Gateway
// ==========================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const nodemailer = require('nodemailer');
const EXCEL_STUDENTS = require('./students-data.json');

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const cognitoClient = new CognitoIdentityProviderClient({});
const sesClient = new SESClient({});

const STUDENTS_TABLE = process.env.STUDENTS_TABLE || 'HofisStudents';
const OUTPASS_TABLE = process.env.OUTPASS_TABLE || 'HofisOutpassRequests';
const ADMINS_TABLE = process.env.ADMINS_TABLE || 'HofisAdmins';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hofispr@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || 'euow uhqa cbyu kdja';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

/**
 * Helper: Send Approved / Cancelled Outpass Email from shibinsajip@gmail.com to Parent Email
 */
async function sendParentOutpassEmail(outpassItem, status) {
  const recipientEmail = outpassItem.parentEmail;
  if (!recipientEmail) return { sent: false, reason: 'No parentEmail provided' };

  const isApproved = status === 'approved';
  const subject = isApproved
    ? `[HOFIS APPROVED] Student Outpass Pass ID: ${outpassItem.passId} (${outpassItem.studentName})`
    : `[HOFIS CANCELLED] Student Outpass Request: ${outpassItem.passId} (${outpassItem.studentName})`;

  const statusBadgeColor = isApproved ? '#059669' : '#dc2626';
  const statusHeading = isApproved
    ? 'Your Student Outpass Request Has Been APPROVED'
    : 'Your Student Outpass Request Has Been CANCELLED';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
      <h2 style="color: #0284c7; margin-top: 0;">Holy Family International School</h2>
      <p style="display: inline-block; padding: 6px 14px; border-radius: 999px; background: ${statusBadgeColor}; color: #fff; font-weight: bold; font-size: 13px;">
        ${status.toUpperCase()}
      </p>
      <h3 style="color: #0f172a;">${statusHeading}</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Pass Reference ID:</strong></td><td><strong>${outpassItem.passId}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Student Name:</strong></td><td>${outpassItem.studentName}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Admission Number:</strong></td><td>${outpassItem.admissionNo}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Class:</strong></td><td>${outpassItem.classSection}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Father / Guardian:</strong></td><td>${outpassItem.guardian}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Reason for Outpass:</strong></td><td>${outpassItem.reason}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;"><strong>Scheduled Departure:</strong></td><td>${outpassItem.leaveTime}</td></tr>
      </table>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b;">
        Sent from Holy Family International School Outpass Administration (${SENDER_EMAIL}).
      </p>
    </div>
  `;

  // 1) Send automatically via Gmail SMTP (Nodemailer) if GMAIL_APP_PASSWORD is set
  const cleanAppPass = GMAIL_APP_PASSWORD.replace(/\s+/g, '');
  if (cleanAppPass && cleanAppPass !== 'PASTE_YOUR_16_CHAR_GMAIL_APP_PASSWORD_HERE') {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: SENDER_EMAIL,
          pass: cleanAppPass
        }
      });

      await transporter.sendMail({
        from: `"Holy Family International School" <${SENDER_EMAIL}>`,
        to: recipientEmail,
        subject,
        html: htmlBody
      });

      return { sent: true, provider: 'gmail_smtp', from: SENDER_EMAIL, to: recipientEmail };
    } catch (smtpErr) {
      console.error('Gmail SMTP error:', smtpErr.message);
      return { sent: false, provider: 'gmail_smtp', from: SENDER_EMAIL, to: recipientEmail, error: smtpErr.message };
    }
  }

  // 2) Fallback: Send automatically via Amazon SES
  try {
    await sesClient.send(
      new SendEmailCommand({
        Source: SENDER_EMAIL,
        Destination: { ToAddresses: [recipientEmail] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: htmlBody, Charset: 'UTF-8' }
          }
        }
      })
    );
    return { sent: true, provider: 'aws_ses', from: SENDER_EMAIL, to: recipientEmail };
  } catch (err) {
    console.warn('SES SendEmail warning:', err.message);
    return { sent: false, provider: 'aws_ses', from: SENDER_EMAIL, to: recipientEmail, error: err.message };
  }
}

// ==========================================================================
// 1. POST /auth/login - Authenticate Admin via Cognito & DynamoDB
// Default seeded credentials: username = "hofis", password = "hofis"
// ==========================================================================
exports.loginHandler = async (event) => {
  try {
    const { username, password } = JSON.parse(event.body || '{}');
    if (!username || !password) {
      return response(400, { message: 'Username and password are required.' });
    }

    // 1) Try AWS Cognito User Pool Authentication if configured
    if (COGNITO_CLIENT_ID) {
      try {
        const cognitoPassword = password.length < 6 ? password.padEnd(6, '0') : password;
        const authResult = await cognitoClient.send(
          new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: COGNITO_CLIENT_ID,
            AuthParameters: {
              USERNAME: username,
              PASSWORD: cognitoPassword
            }
          })
        );

        return response(200, {
          authenticated: true,
          provider: 'cognito',
          username,
          role: `Administrator (${username})`,
          token: authResult.AuthenticationResult?.IdToken
        });
      } catch (cognitoErr) {
        console.warn('Cognito auth fallback to DynamoDB:', cognitoErr.name);
      }
    }

    // 2) Verify against DynamoDB HofisAdmins table
    const adminRecord = await docClient.send(
      new GetCommand({
        TableName: ADMINS_TABLE,
        Key: { username }
      })
    );

    if (adminRecord.Item && adminRecord.Item.password === password) {
      return response(200, {
        authenticated: true,
        provider: 'dynamodb',
        username: adminRecord.Item.username,
        role: adminRecord.Item.role || `Administrator (${username})`
      });
    }

    // 3) Built-in fallback only if record is not yet in DynamoDB
    const defaultAdmins = { hofis: 'hofis', shibin: 'shibin' };
    if (!adminRecord.Item && defaultAdmins[username] && defaultAdmins[username] === password) {
      return response(200, {
        authenticated: true,
        provider: 'default_admin',
        username,
        role: `Administrator (${username})`
      });
    }

    return response(401, {
      authenticated: false,
      message: 'Invalid username or password.'
    });
  } catch (err) {
    console.error('Login error:', err);
    return response(500, { message: 'Internal server error', error: err.message });
  }
};

// ==========================================================================
// 1b. POST /auth/change-password - Update Admin Password in DynamoDB & Cognito
// ==========================================================================
exports.changePasswordHandler = async (event) => {
  try {
    const { username, currentPassword, newPassword } = JSON.parse(event.body || '{}');
    if (!username || !currentPassword || !newPassword) {
      return response(400, { message: 'Username, current password, and new password are required.' });
    }

    const adminRecord = await docClient.send(
      new GetCommand({
        TableName: ADMINS_TABLE,
        Key: { username }
      })
    );

    const defaultAdmins = { hofis: 'hofis', shibin: 'shibin' };
    const storedPassword = adminRecord.Item ? adminRecord.Item.password : defaultAdmins[username];

    if (!storedPassword || storedPassword !== currentPassword) {
      return response(401, { message: 'Current password is incorrect.' });
    }

    // 1) Update password in DynamoDB HofisAdmins table
    await docClient.send(
      new PutCommand({
        TableName: ADMINS_TABLE,
        Item: {
          username,
          password: newPassword,
          role: `Administrator (${username})`,
          email: SENDER_EMAIL,
          updatedAt: new Date().toISOString()
        }
      })
    );

    // 2) Update password in AWS Cognito User Pool
    if (COGNITO_USER_POOL_ID) {
      const cognitoPassword = newPassword.length < 6 ? newPassword.padEnd(6, '0') : newPassword;
      try {
        await cognitoClient.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: COGNITO_USER_POOL_ID,
            Username: username,
            Password: cognitoPassword,
            Permanent: true
          })
        );
      } catch (e) {
        console.warn('Cognito password update warning:', e.message);
      }
    }

    return response(200, {
      updated: true,
      username,
      message: `Password for '${username}' has been updated in the database.`
    });
  } catch (err) {
    console.error('changePassword error:', err);
    return response(500, { message: 'Failed to update password', error: err.message });
  }
};

// ==========================================================================
// 2. GET /students/{admissionNo} - Strictly Lookup Student in Database
// Only students present in the database (Class playschool to X.xlsx) can apply
// ==========================================================================
exports.getStudentHandler = async (event) => {
  try {
    const admissionNo = (event.pathParameters?.admissionNo || '').trim();
    if (!admissionNo) {
      return response(400, { message: 'Admission Number is required.' });
    }

    // 1) Check DynamoDB HofisStudents table
    const result = await docClient.send(
      new GetCommand({
        TableName: STUDENTS_TABLE,
        Key: { admissionNo }
      })
    );

    if (result.Item) {
      return response(200, result.Item);
    }

    // 2) Check embedded Excel dataset (Class playschool to X.xlsx)
    if (EXCEL_STUDENTS[admissionNo]) {
      return response(200, EXCEL_STUDENTS[admissionNo]);
    }

    return response(404, {
      message: `Student with Admission Number '${admissionNo}' was not found in the school database. Please verify and try again.`
    });
  } catch (err) {
    console.error('getStudent error:', err);
    return response(500, { message: 'Failed to fetch student', error: err.message });
  }
};

// ==========================================================================
// 3. POST /outpasses - Create New Student Outpass Request (Parent Submit)
// Validates that student exists in database before accepting request
// ==========================================================================
exports.createOutpassHandler = async (event) => {
  try {
    const payload = JSON.parse(event.body || '{}');
    const {
      admissionNo,
      reason,
      leaveDate,
      leaveTime,
      leaveTimeRaw,
      parentEmail,
      phone
    } = payload;

    if (!admissionNo || !reason || !parentEmail || !leaveDate) {
      return response(400, {
        message: 'Admission Number, Reason for Outpass, Departure Date, and Parent Email ID are required.'
      });
    }

    // ========================================================================
    // Enforce School Outpass Guidelines (Asia/Kolkata IST Timezone)
    // 1. Outpass cannot be submitted on Sundays
    // 2. Outpass can be submitted for same day, 1 day before, or 2 days before (max 3 days)
    // 3. Departure time must be strictly between 9:30 AM (09:30) and 3:30 PM (15:30)
    // 4. Cannot select a departure date and time that has already passed
    // ========================================================================
    const nowUtc = new Date();
    const istDateStr = nowUtc.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const [istY, istM, istD] = istDateStr.split('-').map(Number);
    const maxIstDateObj = new Date(Date.UTC(istY, istM - 1, istD + 2));
    const maxIstDateStr = maxIstDateObj.toISOString().slice(0, 10);

    const istTimeParts = nowUtc
      .toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
      .split(':')
      .map(Number);
    const currentIstMins = istTimeParts[0] * 60 + istTimeParts[1];

    const dateParts = String(leaveDate).split('-').map(Number);
    if (dateParts.length !== 3 || dateParts.some(isNaN)) {
      return response(400, { message: 'Invalid departure date format. Use YYYY-MM-DD.' });
    }
    const [selY, selM, selD] = dateParts;
    const selectedDateObj = new Date(Date.UTC(selY, selM - 1, selD));

    // Rule 1: Sunday check
    if (selectedDateObj.getUTCDay() === 0) {
      return response(400, {
        message: 'Outpass cannot be submitted on Sundays. School is closed on Sunday.'
      });
    }

    // Rule 2: Past date & Maximum 3 days check (same day, 1 day before, or 2 days before)
    if (leaveDate < istDateStr) {
      return response(400, {
        message: 'Cannot select a departure date that has already passed.'
      });
    }
    if (leaveDate > maxIstDateStr) {
      return response(400, {
        message:
          'Outpass can only be submitted for the same day, 1 day before, or 2 days before departure (maximum 3 days).'
      });
    }

    // Extract HH:MM from leaveTimeRaw or leaveTime
    const rawTimeStr =
      leaveTimeRaw ||
      (leaveTime && String(leaveTime).includes(' ') ? String(leaveTime).split(' ').pop() : leaveTime);
    const timeMatch = String(rawTimeStr || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      return response(400, {
        message: 'Valid departure time between 9:30 AM and 3:30 PM is required.'
      });
    }
    const leaveH = Number(timeMatch[1]);
    const leaveM = Number(timeMatch[2]);
    const leaveTotalMins = leaveH * 60 + leaveM;

    // Rule 3: Departure time window 9:30 AM (570 mins) to 3:30 PM (930 mins)
    if (leaveTotalMins < 570 || leaveTotalMins > 930) {
      return response(400, {
        message: 'Departure time must be strictly between 9:30 AM and 3:30 PM.'
      });
    }

    // Rule 4: Past departure time check (applies when leaving today)
    if (leaveDate === istDateStr && leaveTotalMins <= currentIstMins) {
      return response(400, {
        message: 'Cannot select a departure date and time that has already passed.'
      });
    }

    // Verify student exists in DynamoDB or Excel database
    let studentRecord = EXCEL_STUDENTS[String(admissionNo).trim()];
    if (!studentRecord) {
      const dbStudent = await docClient.send(
        new GetCommand({
          TableName: STUDENTS_TABLE,
          Key: { admissionNo: String(admissionNo).trim() }
        })
      );
      studentRecord = dbStudent.Item;
    }

    if (!studentRecord) {
      return response(403, {
        message: `Admission Number '${admissionNo}' does not exist in the school database. Outpass request denied.`
      });
    }

    // Rule 5: Only 1 outpass submission per student per day AND max 1 request per departure date
    const existingScan = await docClient.send(
      new ScanCommand({
        TableName: OUTPASS_TABLE,
        FilterExpression: 'admissionNo = :adm AND #st <> :cancelled',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':adm': String(studentRecord.admissionNo).trim(),
          ':cancelled': 'cancelled'
        }
      })
    );

    const activeReqs = existingScan.Items || [];
    const duplicateLeaveDate = activeReqs.find((r) => r.leaveDate === leaveDate);
    if (duplicateLeaveDate) {
      return response(400, {
        message: `An outpass request (${duplicateLeaveDate.passId}) has already been submitted for ${studentRecord.name} for departure date ${leaveDate}. More than one request for the same day is not accepted.`
      });
    }

    const submittedToday = activeReqs.find((r) => {
      if (r.timestamp && Number(r.timestamp) > 1000000000) {
        const subIstDate = new Date(Number(r.timestamp)).toLocaleDateString('en-CA', {
          timeZone: 'Asia/Kolkata'
        });
        if (subIstDate === istDateStr) return true;
      }
      if (r.reqTime && String(r.reqTime).startsWith(istDateStr)) {
        return true;
      }
      return false;
    });

    if (submittedToday) {
      return response(400, {
        message: `Only one outpass request can be submitted per student per day. A request (${submittedToday.passId}) was already submitted today for ${studentRecord.name}.`
      });
    }

    const randomHex = Math.floor(0x1000 + Math.random() * 0x9000)
      .toString(16)
      .toUpperCase();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePart = String(yyyy).slice(-2) + mm + dd;
    const passId = payload.passId || `HOFIS-${datePart}-${randomHex}`;
    const monthKey = leaveDate ? leaveDate.slice(0, 7) : `${yyyy}-${mm}`;

    const item = {
      passId,
      admissionNo: studentRecord.admissionNo,
      studentName: studentRecord.name,
      classSection: `Class ${studentRecord.class}`,
      reqTime:
        payload.reqTime ||
        now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }),
      leaveDate: leaveDate || `${yyyy}-${mm}-${dd}`,
      leaveTime: leaveTime || 'Today',
      monthKey,
      reason,
      guardian: `Father (${studentRecord.parentName})`,
      parentEmail: parentEmail.trim(),
      phone: phone || '',
      status: 'pending',
      timestamp: Date.now()
    };

    await docClient.send(
      new PutCommand({
        TableName: OUTPASS_TABLE,
        Item: item
      })
    );

    return response(201, item);
  } catch (err) {
    console.error('createOutpass error:', err);
    return response(500, { message: 'Failed to create outpass', error: err.message });
  }
};

// ==========================================================================
// 4. GET /outpasses - List Outpass Requests for Admin Console
// ==========================================================================
exports.listOutpassesHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;
    const result = await docClient.send(
      new ScanCommand({
        TableName: OUTPASS_TABLE
      })
    );

    let items = result.Items || [];
    if (statusFilter && statusFilter !== 'all') {
      items = items.filter((i) => i.status === statusFilter);
    }

    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return response(200, { items, count: items.length });
  } catch (err) {
    console.error('listOutpasses error:', err);
    return response(500, { message: 'Failed to list outpasses', error: err.message });
  }
};

// ==========================================================================
// 5. PATCH /outpasses/{passId} - Admin Approve / Cancel / Mark Exit
// Sends email from shibinsajip@gmail.com to parentEmail when approved/cancelled
// ==========================================================================
exports.updateOutpassStatusHandler = async (event) => {
  try {
    const passId = event.pathParameters?.passId;
    const { status } = JSON.parse(event.body || '{}');

    if (!passId || !['pending', 'approved', 'cancelled', 'exited'].includes(status)) {
      return response(400, { message: 'Valid passId and status are required.' });
    }

    const updated = await docClient.send(
      new UpdateCommand({
        TableName: OUTPASS_TABLE,
        Key: { passId },
        UpdateExpression: 'SET #st = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':now': Date.now()
        },
        ReturnValues: 'ALL_NEW'
      })
    );

    const outpassItem = updated.Attributes;
    let emailNotification = null;

    if (outpassItem && (status === 'approved' || status === 'cancelled')) {
      emailNotification = await sendParentOutpassEmail(outpassItem, status);
    }

    return response(200, {
      outpass: outpassItem,
      emailNotification
    });
  } catch (err) {
    console.error('updateOutpassStatus error:', err);
    return response(500, { message: 'Failed to update status', error: err.message });
  }
};

// ==========================================================================
// 6. DELETE /outpasses/monthly?month=YYYY-MM - Admin Monthly Data Deletion
// Deletes all outpass requests for the specified month (or all if omitted)
// ==========================================================================
exports.deleteMonthlyOutpassesHandler = async (event) => {
  try {
    const month = event.queryStringParameters?.month; // e.g., "2026-11"
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: OUTPASS_TABLE
      })
    );

    const allItems = scanRes.Items || [];
    const toDelete = month
      ? allItems.filter((item) => item.monthKey === month || (item.leaveDate && item.leaveDate.startsWith(month)))
      : allItems;

    for (const item of toDelete) {
      await docClient.send(
        new DeleteCommand({
          TableName: OUTPASS_TABLE,
          Key: { passId: item.passId }
        })
      );
    }

    return response(200, {
      deletedCount: toDelete.length,
      month: month || 'ALL',
      message: `Deleted ${toDelete.length} outpass request(s) for month ${month || 'ALL'}.`
    });
  } catch (err) {
    console.error('deleteMonthlyOutpasses error:', err);
    return response(500, { message: 'Failed to delete monthly data', error: err.message });
  }
};

// ==========================================================================
// 6b. DELETE /outpasses/{passId} - Delete a Single Outpass Request
// ==========================================================================
exports.deleteOutpassHandler = async (event) => {
  try {
    const passId = event.pathParameters?.passId;
    if (!passId) {
      return response(400, { message: 'passId is required.' });
    }

    await docClient.send(
      new DeleteCommand({
        TableName: OUTPASS_TABLE,
        Key: { passId }
      })
    );

    return response(200, {
      deleted: true,
      passId,
      message: `Outpass request ${passId} deleted.`
    });
  } catch (err) {
    console.error('deleteOutpass error:', err);
    return response(500, { message: 'Failed to delete outpass request', error: err.message });
  }
};

// ==========================================================================
// 7. POST /seed - Seed DynamoDB & Cognito with:
//    - Admin User (username: "hofis", password: "hofis")
//    - All 575 Students from Class playschool to X.xlsx
// ==========================================================================
exports.seedDatabaseHandler = async () => {
  try {
    const adminUsers = [
      { username: 'hofis', password: 'hofis', role: 'Administrator (hofis)' },
      { username: 'shibin', password: 'shibin', role: 'Administrator (shibin)' }
    ];

    // 1) Seed Admin Users in DynamoDB (only if not already created so changed passwords are kept)
    for (const admin of adminUsers) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: ADMINS_TABLE,
            Item: {
              username: admin.username,
              password: admin.password,
              role: admin.role,
              email: SENDER_EMAIL,
              createdAt: new Date().toISOString()
            },
            ConditionExpression: 'attribute_not_exists(username)'
          })
        );
      } catch (condErr) {
        // Admin already exists in DynamoDB; preserve their current password
      }
    }

    // 2) Seed Admin Users in AWS Cognito User Pool
    if (COGNITO_USER_POOL_ID) {
      for (const admin of adminUsers) {
        const cognitoPassword = admin.password.length < 6 ? admin.password.padEnd(6, '0') : admin.password;
        try {
          await cognitoClient.send(
            new AdminCreateUserCommand({
              UserPoolId: COGNITO_USER_POOL_ID,
              Username: admin.username,
              MessageAction: 'SUPPRESS'
            })
          );
        } catch (e) {}

        try {
          await cognitoClient.send(
            new AdminSetUserPasswordCommand({
              UserPoolId: COGNITO_USER_POOL_ID,
              Username: admin.username,
              Password: cognitoPassword,
              Permanent: true
            })
          );
        } catch (e) {
          console.warn('Cognito password set warning:', e.message);
        }
      }
    }

    // 3) Batch-seed all 575 Students from Class playschool to X.xlsx into DynamoDB
    const studentList = Object.values(EXCEL_STUDENTS);
    for (let i = 0; i < studentList.length; i += 25) {
      const batch = studentList.slice(i, i + 25).map((student) => ({
        PutRequest: { Item: student }
      }));
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [STUDENTS_TABLE]: batch
          }
        })
      );
    }

    return response(200, {
      message: `Database seeded successfully with Admins (hofis/hofis, shibin/shibin) and ${studentList.length} students from Class playschool to X.xlsx.`
    });
  } catch (err) {
    console.error('Seed error:', err);
    return response(500, { message: 'Failed to seed database', error: err.message });
  }
};
