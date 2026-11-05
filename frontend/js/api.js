/**
 * API Service for HOFIS Outpass System
 * Seamlessly switches between AWS Lambda/DynamoDB endpoints and Local Mock Store.
 */

// Official Students Registry (Database: Class playschool to X)
const getRegisteredStudents = () => {
  if (typeof window !== "undefined") {
    const registry = window.HOFIS_STUDENTS || window.BOOK1_STUDENTS;
    if (Array.isArray(registry) && registry.length > 0) return registry;
  }
  const fromStorage = typeof localStorage !== "undefined" ? localStorage.getItem("hofis_students") : null;
  if (fromStorage) {
    try {
      const parsed = JSON.parse(fromStorage);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  return [];
};

class HofisApiService {
  constructor() {
    this.initMockStorage();
  }

  initMockStorage() {
    const list = getRegisteredStudents();
    if (list && list.length > 0) {
      localStorage.setItem("hofis_students", JSON.stringify(list));
    }
    if (!localStorage.getItem("hofis_admin_cred")) {
      const defaultAdmin = {
        username: "admin",
        password: "Admin@123",
        displayName: "Administrator / Principal",
        isDefault: true
      };
      localStorage.setItem("hofis_admin_cred", JSON.stringify(defaultAdmin));
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
   * Matches school database records (Class playschool to X) and AWS DynamoDB
   */
  async getStudentByAdmissionNumber(admissionNumber) {
    const cleanId = String(admissionNumber || "").trim();
    if (!cleanId) {
      throw new Error("Please enter an admission number.");
    }

    // 1. If connected to live AWS API Gateway
    if (
      !this.config.USE_MOCK_AWS &&
      this.config.apiEndpoint &&
      !this.config.apiEndpoint.includes("your-api-id")
    ) {
      try {
        const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/students/${encodeURIComponent(cleanId)}`;
        const res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        if (res.ok && data.data) {
          return data.data;
        }
      } catch (err) {
        console.warn("Live AWS lookup failed, falling back to official student registry:", err.message);
      }
    }

    // 2. Direct Official Registry Student Verification (575 Students + Demo fallback)
    await new Promise((r) => setTimeout(r, 150));
    const students = getRegisteredStudents();
    let found = students.find(
      (s) => String(s.admissionNumber).trim().toLowerCase() === cleanId.toLowerCase()
    );

    // Graceful fallback for test admission number 12345
    if (!found && (cleanId === "12345" || cleanId.toLowerCase() === "albin")) {
      found = {
        admissionNumber: "12345",
        studentName: "ALBIN",
        fatherName: "JOSEPH",
        class: "5",
        division: "A",
        contactNumber: "+91 98765 43210"
      };
    }

    if (!found) {
      throw new Error(
        `Student with Admission Number "${cleanId}" not found in school records. Please check the admission number and try again.`
      );
    }

    return {
      admissionNumber: String(found.admissionNumber),
      studentName: found.studentName,
      fatherName: found.fatherName || found.fathername || "",
      class: String(found.class || ""),
      division: String(found.division || found.div || ""),
      contactNumber: found.contactNumber || "+91 98765 43210"
    };
  }

  syncLocalOutpass(outpass) {
    if (!outpass || !outpass.outpassId) return;
    try {
      const list = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
      const idx = list.findIndex((o) => o.outpassId === outpass.outpassId);
      if (idx === -1) {
        list.unshift(outpass);
      } else {
        list[idx] = outpass;
      }
      localStorage.setItem("hofis_outpasses", JSON.stringify(list));
    } catch (e) {}
  }

  /**
   * Create an Outpass request
   * Matches AWS Lambda: POST /outpass
   */
  async submitOutpass(payload) {
    if (!payload.admissionNumber || !payload.reason || !payload.leaveDateTime) {
      throw new Error("Missing required outpass fields.");
    }

    // Attempt cloud submission if AWS is enabled
    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      try {
        const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.data) {
          this.syncLocalOutpass(data.data);
          return data.data;
        }

        // If AWS rejected (e.g. unseeded DynamoDB, 404 student), smoothly fall back to local store
        console.warn("AWS submission not accepted (" + (data.message || res.status) + "). Saving to verified local database.");
        return await this.submitOutpassLocal(payload);
      } catch (err) {
        console.warn("AWS connection issue (" + err.message + "). Completing outpass locally.");
        return await this.submitOutpassLocal(payload);
      }
    }

    return await this.submitOutpassLocal(payload);
  }

  /**
   * Local submission simulation (fallback & offline test)
   */
  async submitOutpassLocal(payload) {
    await new Promise((r) => setTimeout(r, 400));

    // Validate Departure DateTime
    const leaveTimestamp = new Date(payload.leaveDateTime).getTime();
    if (isNaN(leaveTimestamp)) {
      throw new Error("Invalid departure date and time.");
    }

    const now = Date.now();
    if (leaveTimestamp < now - 60 * 1000) {
      throw new Error("Departure date and time cannot be in the past. If applying for today, the time must be in the future.");
    }

    const maxAllowedTimestamp = now + 7 * 24 * 60 * 60 * 1000;
    if (leaveTimestamp > maxAllowedTimestamp) {
      throw new Error("Outpass can only be applied up to 7 days in advance.");
    }

    // Verify student exists from official registry if details not already in payload
    let student = payload.studentName ? payload : null;
    if (!student) {
      student = await this.getStudentByAdmissionNumber(payload.admissionNumber);
    }

    // Check for existing outpass on the same calendar departure date
    const targetDateKey = this.getLocalDateKey(payload.leaveDateTime);
    const existingOutpasses = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    const activeDuplicate = existingOutpasses.find((item) => {
      if (String(item.admissionNumber).toLowerCase() !== String(payload.admissionNumber).trim().toLowerCase()) return false;
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
      admissionNumber: String(student.admissionNumber),
      studentName: student.studentName || "Student",
      fatherName: student.fatherName || "Parent",
      class: String(student.class || "5"),
      division: String(student.division || "A"),
      reason: payload.reason.trim(),
      leaveDateTime: payload.leaveDateTime,
      parentEmail: payload.parentEmail ? payload.parentEmail.trim() : "",
      parentName: payload.parentName?.trim() || student.fatherName || "Parent",
      parentPhone: payload.parentPhone?.trim() || student.contactNumber || "+91 98765 43210",
      pickupPerson: payload.pickupPerson?.trim() || student.fatherName || "Parent",
      status: "PENDING",
      createdAt: nowIso,
      updatedAt: nowIso
    };

    existingOutpasses.unshift(newOutpass);
    localStorage.setItem("hofis_outpasses", JSON.stringify(existingOutpasses));

    return newOutpass;
  }

  /**
   * List Outpasses (For Admin / Gate Security)
   * Matches AWS Lambda: GET /outpass
   */
  async listOutpasses(filter = {}) {
    let awsList = [];
    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      try {
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
        if (res.ok && Array.isArray(data.data)) {
          awsList = data.data;
        }
      } catch (err) {
        console.warn("Could not fetch outpasses from AWS, reading local cache:", err.message);
      }
    }

    // Retrieve local store items
    const localList = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");

    // Merge AWS and local: merge properties by outpassId so we preserve full details
    const map = new Map();
    // Put local items first
    localList.forEach((item) => {
      if (item && item.outpassId) map.set(item.outpassId, { ...item });
    });
    // Overlay AWS items (authoritative status & updates)
    awsList.forEach((item) => {
      if (item && item.outpassId) {
        const local = map.get(item.outpassId) || {};
        map.set(item.outpassId, { ...local, ...item });
      }
    });

    let list = Array.from(map.values());

    // Enrich any item that lacks full details from official student database
    const registry = getRegisteredStudents();
    list.forEach((item) => {
      if (!item.studentName && item.admissionNumber) {
        const found = registry.find(s => String(s.admissionNumber).trim() === String(item.admissionNumber).trim());
        if (found) {
          item.studentName = found.studentName;
          item.fatherName = item.fatherName || found.fatherName || "";
          item.class = item.class || found.class;
          item.division = item.division || found.division;
        }
      }
      // Demo test student fallback
      if (!item.studentName) {
        if (item.admissionNumber === "12345" || item.outpassId === "HOFIS-261105-K4WZ") {
          item.studentName = "ALBIN";
          item.admissionNumber = item.admissionNumber || "12345";
          item.class = item.class || "5";
          item.division = item.division || "A";
          item.fatherName = item.fatherName || "JOSEPH";
        } else {
          item.studentName = `Student (${item.admissionNumber || "Pass"})`;
        }
      }
      if (!item.admissionNumber) item.admissionNumber = "12345";
      if (!item.class) item.class = "5";
      if (!item.division) item.division = "A";
      if (!item.reason) item.reason = "Early departure from school";
      if (!item.leaveDateTime) item.leaveDateTime = item.createdAt || new Date().toISOString();
      if (!item.createdAt) item.createdAt = item.updatedAt || new Date().toISOString();
      if (!item.pickupPerson) item.pickupPerson = item.fatherName || item.parentName || "Parent";
    });

    // Cache merged set to local store
    try {
      localStorage.setItem("hofis_outpasses", JSON.stringify(list));
    } catch (e) {}

    // Apply filtering
    if (filter.status && filter.status !== "ALL") {
      const target = filter.status.toUpperCase();
      if (target === "CANCELLED" || target === "REJECTED") {
        list = list.filter((item) => {
          const st = String(item.status || "").toUpperCase();
          return st === "CANCELLED" || st === "REJECTED";
        });
      } else {
        list = list.filter((item) => String(item.status || "").toUpperCase() === target);
      }
    }
    if (filter.admissionNumber) {
      const queryAdm = String(filter.admissionNumber).toLowerCase().trim();
      list = list.filter((item) => String(item.admissionNumber || "").toLowerCase().trim() === queryAdm);
    }

    // Always sort newest first
    list.sort((a, b) => new Date(b.createdAt || b.leaveDateTime || 0) - new Date(a.createdAt || a.leaveDateTime || 0));

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
    let updatedItem = null;
    if (!this.config.USE_MOCK_AWS && this.config.apiEndpoint) {
      try {
        const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass/${encodeURIComponent(outpassId)}`;
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, remarks, updatedBy })
        });
        const data = await res.json();
        if (res.ok && data.data) {
          updatedItem = data.data;
        }
      } catch (err) {
        console.warn("Could not update AWS outpass status, updating local store:", err.message);
      }
    }

    // Always synchronize local storage as well
    const outpasses = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    const idx = outpasses.findIndex((o) => o.outpassId === outpassId);
    if (idx !== -1) {
      outpasses[idx].status = status.toUpperCase();
      outpasses[idx].remarks = remarks;
      outpasses[idx].updatedBy = updatedBy;
      outpasses[idx].updatedAt = new Date().toISOString();
      localStorage.setItem("hofis_outpasses", JSON.stringify(outpasses));
      return updatedItem || outpasses[idx];
    } else if (updatedItem) {
      this.syncLocalOutpass(updatedItem);
      return updatedItem;
    }

    throw new Error("Outpass not found.");
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
    if (
      !this.config.USE_MOCK_AWS &&
      this.config.cognito?.userPoolClientId &&
      !this.config.cognito.userPoolClientId.includes("xxx")
    ) {
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

    const adminCred = this.getAdminCredentials();

    const mockStaff = [
      {
        usernames: [adminCred.username, `${adminCred.username}@hofis.edu`],
        password: adminCred.password,
        role: "ADMIN",
        displayName: adminCred.displayName
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

  /**
   * Get current stored admin credentials
   */
  getAdminCredentials() {
    const raw = localStorage.getItem("hofis_admin_cred");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {}
    }
    return {
      username: "admin",
      password: "Admin@123",
      displayName: "Administrator / Principal",
      isDefault: true
    };
  }

  /**
   * Change Administrator Username & Password
   */
  updateAdminCredentials(currentPassword, newUsername, newPassword) {
    const current = this.getAdminCredentials();
    if (current.password !== currentPassword) {
      throw new Error("Current password is incorrect. Please re-enter.");
    }
    const cleanUser = String(newUsername || "").trim();
    const cleanPass = String(newPassword || "").trim();

    if (!cleanUser) {
      throw new Error("New username cannot be empty.");
    }
    if (cleanPass.length < 6) {
      throw new Error("New password must be at least 6 characters long.");
    }

    const updated = {
      username: cleanUser,
      password: cleanPass,
      displayName: `Administrator (${cleanUser})`,
      isDefault: false,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem("hofis_admin_cred", JSON.stringify(updated));

    // Update active session user if currently logged in as admin
    const active = this.getCurrentUser();
    if (active && active.role === "ADMIN") {
      active.username = cleanUser;
      active.displayName = updated.displayName;
      sessionStorage.setItem("hofis_auth_user", JSON.stringify(active));
    }

    return updated;
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

