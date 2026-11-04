# 🎓 Holy Family International School (HOFIS) - Student Outpass System

A modern, cloud-native Student Early Departure & Gate Outpass Management System designed for **Holy Family International School** (*Moulding winners of life*), powered by **AWS Serverless (Cognito, Lambda, DynamoDB, API Gateway)** and a responsive frontend featuring the school's official crest logo sticker (`hofis.png`).

---

## 🌟 Key Features

1. **School Branding & Identity**:
   - Integrated official school logo sticker (`hofis.png`) featuring the school shield emblem and typography.
   - Professional school header with motto *"Moulding winners of life"*.

2. **Parent Centered Multi-Step Workflow**:
   - **Step 1: Admission Number Search Only**:
     - Clean, focused card centered in the middle of the screen.
     - Displays school logo sticker (`hofis.png`) and only the Admission Number input field with a "Search Student" button.
   - **Step 2: Read-Only Student Verification**:
     - Fetches and displays student details (Student Name, Admission Number, Father Name, Class & Division).
     - **Locked / Read-Only**: User cannot edit school records; only view and verify.
     - "Confirm Details & Proceed" button to continue.
   - **Step 3: Outpass Details & Parent Email**:
     - Reason for early departure (with category chips and detailed reason box).
     - **Strict Date & Time Departure Validation**:
       - **No Past Dates**: Previous calendar days are blocked.
       - **No Past Times Today**: Departure time must strictly be in the future (e.g., at 10:00 AM you cannot select 9:59 AM; selecting 12:30 PM is allowed).
       - **7-Day Advance Window**: Outpasses can only be scheduled for today or up to 7 days in advance.
     - **Existing Outpass / Duplicate Check for Date**:
       - Whenever a parent selects a leave date, the system checks if an outpass was already submitted for that student on that calendar date.
       - Displays a dynamic status banner with exact status (`PENDING`, `APPROVED`, or `CANCELLED`):
         - **PENDING**: Warns that an outpass is already awaiting administration approval and blocks duplicate submission.
         - **APPROVED**: Alerts that an outpass has already been officially approved with Outpass ID, blocking duplicate requests.
         - **CANCELLED**: Informs the parent that a previous pass was cancelled, and allows submitting a new request.
     - **Parent Email Address**: Email field to receive the approved outpass slip.
     - "Submit Outpass Request" button.
   - **Step 4: Submission Confirmation & Email Notice**:
     - Confirmation message:
       > *"Your outpass request has been submitted successfully! You will be notified with the outpass after school administration approves it. Please check your email: [parent@example.com]"*
     - Reference ID tracking and quick link to submit another request.

3. **Staff & Gate Security Login (`frontend/login.html`)**:
   - Dedicated login page requiring **Username and Password**.
   - Backed by **AWS Cognito User Pool** (with built-in test accounts in local mode).
   - Authentication guard on `admin.html`: redirects unauthorized visitors to `login.html`.
   - Pre-configured demo credentials:
     - **Gate Security**: `security` / `Gate@123`
     - **Administrator / Principal**: `admin` / `Admin@123`
     - **Class Staff**: `staff` / `Staff@123`

4. **Staff & Gate Security Console (`frontend/admin.html`)**:
   - **Default View: Pending Requests**: Automatically filters and displays pending approvals on load.
   - **Request Date & Time**: Displays both when the parent requested the pass (`createdAt`) and the scheduled departure date/time (`leaveDateTime`).
   - **Sort Options**: Instant sorting by:
     - Request Date (Newest First / Oldest First)
     - Leave Schedule (Soonest First)
     - Student Name (A to Z)
   - **Status Filters**: Quick filter tabs with live counters for **Pending**, **Approved**, **Cancelled / Rejected**, **Exited Gate**, and **All**.
   - **Gatekeeper Fast Scanner**: Search bar and QR scanner with instant validation and gate exit authorization.
   - **Authentication Protected**: Signed-in user profile with one-click "Sign Out".

---

## 🏗️ AWS Cloud Architecture

```
                      +-----------------------------+
                      |   Parent / Staff Browser    |
                      |    (HTML5, CSS3, JS)        |
                      +--------------+--------------+
                                     |
                                     v
                       +---------------------------+
                       |    Amazon Cognito         |
                       |  (User Pool & App Client) |
                       +---------------------------+
                                     |
                                     v
                       +---------------------------+
                       |    Amazon API Gateway     |
                       |    (REST API with CORS)   |
                       +-------------+-------------+
                                     |
                  +------------------+------------------+
                  |                                     |
                  v                                     v
       +--------------------+                +--------------------+
       |  AWS Lambda        |                |  AWS Lambda        |
       |  getStudent        |                |  createOutpass     |
       +----------+---------+                +----------+---------+
                  |                                     |
                  +------------------+------------------+
                                     |
                                     v
                       +---------------------------+
                       |     Amazon DynamoDB       |
                       |  - Hofis_Students         |
                       |  - Hofis_Outpasses        |
                       +---------------------------+
```

### AWS Resources Defined in `backend/template.yaml`:
* **AWS Cognito**:
  - `HofisUserPool`: User pool for school staff and parent accounts.
  - `HofisUserPoolClient`: Client configured for browser single-page applications.
* **Amazon DynamoDB**:
  - `Hofis_Students`: Key: `admissionNumber` (String). Stores student master data.
  - `Hofis_Outpasses`: Key: `outpassId` (String). Global Secondary Indexes on `admissionNumber` and `status`.
* **AWS Lambda (Node.js 20.x)**:
  - `getStudent.js`: `GET /students/{admissionNumber}` - looks up student record.
  - `createOutpass.js`: `POST /outpass` - validates student and saves outpass request.
  - `listOutpasses.js`: `GET /outpass` - lists outpasses with optional status filters.
  - `updateOutpass.js`: `PUT /outpass/{outpassId}` - updates status (APPROVED / REJECTED / EXITED).

---

## 📂 Project Structure

```
outpass hofis/
├── frontend/
│   ├── index.html               # Main Parent Outpass Portal
│   ├── login.html               # Staff & Gate Security Login Page (Username & Password)
│   ├── admin.html               # Staff & Gate Security Verification Console
│   ├── css/
│   │   └── style.css            # Custom CSS with HOFIS branding & print styles
│   ├── js/
│   │   ├── aws-config.js        # AWS Cognito, API Gateway & Local Mock settings
│   │   ├── api.js               # Unified API Client (AWS Cloud & Local Mock adapter)
│   │   ├── app.js               # Parent portal form validation & workflow logic
│   │   └── qrcode.min.js        # Gate verification QR code generator
│   └── assets/
│       └── hofis.png            # School Logo Sticker
├── backend/
│   ├── template.yaml            # AWS SAM / CloudFormation Infrastructure as Code
│   ├── package.json             # Backend dependencies (@aws-sdk)
│   ├── handlers/
│   │   ├── getStudent.js        # Lambda: Fetch student by admission number
│   │   ├── createOutpass.js     # Lambda: Create student outpass request
│   │   ├── listOutpasses.js     # Lambda: Admin/Gatekeeper outpass listing
│   │   └── updateOutpass.js     # Lambda: Approve / reject / gate exit
│   ├── scripts/
│   │   ├── seedDynamoDB.js      # Seed student records into DynamoDB table
│   │   └── deploy.ps1           # 1-click AWS SAM deployment script
│   └── test/
│       └── mockData.json        # Student records (includes Book1.xlsx row)
├── Book1.xlsx                   # Original student dataset provided
├── hofis.png                    # School crest sticker provided
├── server.js                    # Local static HTTP server for instant preview
└── package.json                 # Project runner scripts
```

---

## 🚀 Quick Start (Instant Local Demo)

The system includes a **Dual-Mode Architecture**: it can run immediately in your browser without requiring active AWS credentials, while remaining 100% ready to switch to your deployed AWS infrastructure.

### Option 1: Direct File / Browser Preview
Simply double-click or open:
`c:\Users\LENOVO\Pictures\outpass hofis\frontend\index.html`
in Google Chrome, Microsoft Edge, or any modern web browser.

### Option 2: Local HTTP Server
Run in your terminal:
```bash
npm start
```
Then visit:
- **Parent Portal**: [http://localhost:3000/index.html](http://localhost:3000/index.html)
- **Staff / Security Console**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

### Sample Admission Numbers to Test:
* **`12345`** -> **ALBIN**, Father: **JOSEPH**, Class: **5**, Division: **A** *(From `Book1.xlsx`)*
* **`10021`** -> **Sarah Elizabeth Mathews**, Class: **7 - B**
* **`10022`** -> **Aarav Sharma**, Class: **9 - A**
* **`10023`** -> **Hannah Mary Kurian**, Class: **11 - Science**

---

## ☁️ Deploying to AWS (Cognito, Lambda, DynamoDB)

When you are ready to deploy to your AWS account:

### Step 1: Configure AWS Credentials
Run in PowerShell / Terminal:
```bash
aws configure
```
Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region name (e.g. `ap-south-1` or `us-east-1`)
- Default output format (`json`)

### Step 2: Deploy with AWS SAM
Run the automated deployment script:
```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\deploy.ps1
```
*Or manually:*
```bash
cd backend
sam build
sam deploy --guided
```

### Step 3: Populate DynamoDB with Student Data
Upload students from `mockData.json` (including `Book1.xlsx` records) to your live DynamoDB table:
```bash
npm run seed
```

### Step 4: Link Frontend to AWS
Open `frontend/js/aws-config.js` and set:
```javascript
const AWS_CONFIG = {
  USE_MOCK_AWS: false, // Set to false to use live AWS
  region: "ap-south-1",
  apiEndpoint: "https://<your-api-id>.execute-api.ap-south-1.amazonaws.com/Prod",
  cognito: {
    userPoolId: "<your-user-pool-id>",
    userPoolClientId: "<your-client-id>"
  }
};
```
Once configured, all requests flow through your **AWS API Gateway -> AWS Lambda -> AWS DynamoDB** seamlessly!

