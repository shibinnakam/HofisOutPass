/**
 * API Service for HOFIS Outpass System
 * Seamlessly switches between AWS Lambda/DynamoDB endpoints and Local Mock Store.
 */

// Initial seed data from Book1.xlsx and school records
const INITIAL_STUDENTS = [
  {
    admissionNumber: "12345",
    studentName: "ALBIN",
    fatherName: "JOSEPH",
    class: "5",
    division: "A",
    contactNumber: "+91 98765 43210"
  },
  {
    admissionNumber: "10021",
    studentName: "Sarah Elizabeth Mathews",
    fatherName: "Mathews George",
    class: "7",
    division: "B",
    contactNumber: "+91 98450 11223"
  },
  {
    admissionNumber: "10022",
    studentName: "Aarav Sharma",
    fatherName: "Vikram Sharma",
    class: "9",
    division: "A",
    contactNumber: "+91 98111 22334"
  },
  {
    admissionNumber: "10023",
    studentName: "Hannah Mary Kurian",
    fatherName: "Kurian Varghese",
    class: "11",
    division: "Science",
    contactNumber: "+91 94470 55667"
  },
  {
    admissionNumber: "10024",
    studentName: "Rohan Jacob",
    fatherName: "Jacob Philip",
    class: "4",
    division: "C",
    contactNumber: "+91 98950 99887"
  }
];

class HofisApiService {
  constructor() {
    this.initMockStorage();
  }

  initMockStorage() {
    if (!localStorage.getItem("hofis_students")) {
      localStorage.setItem("hofis_students", JSON.stringify(INITIAL_STUDENTS));
    }
    if (!localStorage.getItem("hofis_outpasses")) {
      // Seed with 1 sample historical outpass
      const sampleOutpasses = [
        {
          outpassId: "HOFIS-261104-E1F2",
          admissionNumber: "10021",
          studentName: "Sarah Elizabeth Mathews",
          fatherName: "Mathews George",
          class: "7",
          division: "B",
          reason: "Medical checkup appointment with dentist",
          leaveDateTime: new Date(Date.now() - 3600000).toISOString(),
          parentName: "Mathews George",
          parentPhone: "+91 98450 11223",
          pickupPerson: "Father (Mathews George)",
          status: "APPROVED",
          remarks: "Approved by Grade Coordinator",
          updatedBy: "Mrs. Jennifer (Vice Principal)",
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString()
        }
      ];
      localStorage.setItem("hofis_outpasses", JSON.stringify(sampleOutpasses));
    }
  }

  get config() {
    return window.AWS_CONFIG || { USE_MOCK_AWS: true };
  }

  /**
   * Fetch student details by Admission Number
   * Matches AWS Lambda: GET /students/{admissionNumber}
   */
  async getStudentByAdmissionNumber(admissionNumber) {
    const cleanId = String(admissionNumber).trim();
    if (!cleanId) {
      throw new Error("Please enter an admission number.");
    }

    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/students/${encodeURIComponent(cleanId)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Student not found (HTTP ${res.status})`);
      }
      return data.data;
    }

    // Local Mock / Offline DynamoDB Simulation
    await new Promise((r) => setTimeout(r, 400)); // Simulate slight network latency
    const students = JSON.parse(localStorage.getItem("hofis_students") || "[]");
    const found = students.find((s) => s.admissionNumber.toLowerCase() === cleanId.toLowerCase());

    if (!found) {
      throw new Error(`Student with Admission Number "${cleanId}" not found in school records. Please check the number.`);
    }

    return {
      admissionNumber: found.admissionNumber,
      studentName: found.studentName,
      fatherName: found.fatherName,
      class: found.class,
      division: found.division,
      contactNumber: found.contactNumber || ""
    };
  }

  /**
   * Create an Outpass request
   * Matches AWS Lambda: POST /outpass
   */
  async submitOutpass(payload) {
    if (!payload.admissionNumber || !payload.reason || !payload.leaveDateTime) {
      throw new Error("Missing required outpass fields.");
    }

    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit outpass to AWS.");
      }
      return data.data;
    }

    // Local Mock / DynamoDB PutItem Simulation
    await new Promise((r) => setTimeout(r, 600));

    // Validate Departure DateTime
    const leaveTimestamp = new Date(payload.leaveDateTime).getTime();
    if (isNaN(leaveTimestamp)) {
      throw new Error("Invalid departure date and time.");
    }

    const now = Date.now();
    if (leaveTimestamp < now) {
      throw new Error("Departure date and time cannot be in the past. If applying for today, the time must be in the future.");
    }

    const maxAllowedTimestamp = now + 7 * 24 * 60 * 60 * 1000;
    if (leaveTimestamp > maxAllowedTimestamp) {
      throw new Error("Outpass can only be applied up to 7 days in advance.");
    }

    // Verify student exists
    const student = await this.getStudentByAdmissionNumber(payload.admissionNumber);

    // Check for existing outpass on the same calendar departure date
    const targetDateKey = this.getLocalDateKey(payload.leaveDateTime);
    const existingOutpasses = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    const activeDuplicate = existingOutpasses.find((item) => {
      if (item.admissionNumber.toLowerCase() !== String(payload.admissionNumber).trim().toLowerCase()) return false;
      const itemDateKey = this.getLocalDateKey(item.leaveDateTime);
      return itemDateKey === targetDateKey && (item.status === "PENDING" || item.status === "APPROVED");
    });

    if (activeDuplicate) {
      throw new Error(
        `An outpass has already been submitted for this student on ${targetDateKey} with status: ${activeDuplicate.status} (Pass ID: ${activeDuplicate.outpassId}).`
      );
    }

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const outpassId = `HOFIS-${dateStr}-${randomHex}`;
    const nowIso = new Date().toISOString();

    const newOutpass = {
      outpassId: outpassId,
      admissionNumber: student.admissionNumber,
      studentName: student.studentName,
      fatherName: student.fatherName,
      class: String(student.class),
      division: String(student.division),
      reason: payload.reason.trim(),
      leaveDateTime: payload.leaveDateTime,
      parentEmail: payload.parentEmail ? payload.parentEmail.trim() : "",
      parentName: payload.parentName?.trim() || student.fatherName,
      parentPhone: payload.parentPhone?.trim() || student.contactNumber || "N/A",
      pickupPerson: payload.pickupPerson?.trim() || student.fatherName,
      status: "PENDING",
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const outpasses = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    outpasses.unshift(newOutpass);
    localStorage.setItem("hofis_outpasses", JSON.stringify(outpasses));

    return newOutpass;
  }

  /**
   * List Outpasses (For Admin / Gate Security)
   * Matches AWS Lambda: GET /outpass
   */
  async listOutpasses(filter = {}) {
    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      let url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass`;
      const params = new URLSearchParams();
      if (filter.status) params.append("status", filter.status);
      if (filter.admissionNumber) params.append("admissionNumber", filter.admissionNumber);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch outpasses");
      return data.data;
    }

    await new Promise((r) => setTimeout(r, 200));
    let list = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    if (filter.status && filter.status !== "ALL") {
      const target = filter.status.toUpperCase();
      if (target === "CANCELLED" || target === "REJECTED") {
        list = list.filter((item) => item.status.toUpperCase() === "CANCELLED" || item.status.toUpperCase() === "REJECTED");
      } else {
        list = list.filter((item) => item.status.toUpperCase() === target);
      }
    }
    if (filter.admissionNumber) {
      list = list.filter((item) => item.admissionNumber.toLowerCase() === filter.admissionNumber.toLowerCase());
    }
    return list;
  }

  /**
   * Helper: Standardize date to YYYY-MM-DD in local timezone
   */
  getLocalDateKey(dateInput) {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Helper: Get all outpasses for a student
   */
  async getOutpassesForStudent(admissionNumber) {
    return this.listOutpasses({ admissionNumber });
  }

  /**
   * Update Outpass status (Approved / Rejected / Exited)
   * Matches AWS Lambda: PUT /outpass/{outpassId}
   */
  async updateOutpassStatus(outpassId, status, remarks = "", updatedBy = "Staff") {
    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass/${encodeURIComponent(outpassId)}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks, updatedBy })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update outpass");
      return data.data;
    }

    await new Promise((r) => setTimeout(r, 300));
    const outpasses = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    const idx = outpasses.findIndex((o) => o.outpassId === outpassId);
    if (idx === -1) throw new Error("Outpass not found.");

    outpasses[idx].status = status.toUpperCase();
    outpasses[idx].remarks = remarks;
    outpasses[idx].updatedBy = updatedBy;
    outpasses[idx].updatedAt = new Date().toISOString();

    localStorage.setItem("hofis_outpasses", JSON.stringify(outpasses));
    return outpasses[idx];
  }

  /**
   * Authenticate Staff & Gate Security User
   * Supports both AWS Cognito User Pool and Local Mock Accounts
   */
  async login(username, password) {
    const cleanUser = String(username || "").trim();
    const cleanPass = String(password || "").trim();

    if (!cleanUser || !cleanPass) {
      throw new Error("Please enter both username and password.");
    }

    // Live AWS Cognito Authentication
    if (!this.config.USE_MOCK_AWS && this.config.cognito?.userPoolClientId) {
      const region = this.config.region || "ap-south-1";
      const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;

      const response = await fetch(cognitoEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
        },
        body: JSON.stringify({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: this.config.cognito.userPoolClientId,
          AuthParameters: {
            USERNAME: cleanUser,
            PASSWORD: cleanPass
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.__type || "Cognito authentication failed.");
      }

      const authUser = {
        username: cleanUser,
        role: "STAFF",
        displayName: cleanUser.split("@")[0].toUpperCase(),
        token: data.AuthenticationResult?.IdToken,
        accessToken: data.AuthenticationResult?.AccessToken
      };
      sessionStorage.setItem("hofis_auth_user", JSON.stringify(authUser));
      return authUser;
    }

    // Local Mock / Demo Authentication
    await new Promise((r) => setTimeout(r, 450));

    const mockStaff = [
      {
        usernames: ["admin", "admin@hofis.edu"],
        password: "Admin@123",
        role: "ADMIN",
        displayName: "Dr. Joseph (Principal / Admin)"
      },
      {
        usernames: ["security", "gate@hofis.edu", "security@hofis.edu"],
        password: "Gate@123",
        role: "GATE_SECURITY",
        displayName: "Officer Ramesh (Main Gate)"
      },
      {
        usernames: ["staff", "teacher@hofis.edu"],
        password: "Staff@123",
        role: "STAFF",
        displayName: "Mrs. Jennifer (Vice Principal)"
      }
    ];

    const matched = mockStaff.find(
      (s) =>
        s.usernames.some((u) => u.toLowerCase() === cleanUser.toLowerCase()) &&
        s.password === cleanPass
    );

    if (!matched) {
      throw new Error("Invalid username or password. Please check your credentials.");
    }

    const authUser = {
      username: cleanUser,
      role: matched.role,
      displayName: matched.displayName,
      token: "mock-jwt-token-" + Date.now()
    };

    sessionStorage.setItem("hofis_auth_user", JSON.stringify(authUser));
    return authUser;
  }

  logout() {
    sessionStorage.removeItem("hofis_auth_user");
  }

  getCurrentUser() {
    const raw = sessionStorage.getItem("hofis_auth_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    return !!this.getCurrentUser();
  }
}

window.apiService = new HofisApiService();

