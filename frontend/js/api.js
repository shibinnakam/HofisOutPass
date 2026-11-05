/**
 * API Service for HOFIS Outpass System
 * Calls AWS Lambda / API Gateway for all data operations.
 * Falls back to local student registry for offline / fallback use.
 */

// ─── Official Students Registry (from students.json injected as window.HOFIS_STUDENTS) ───
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

  // ─── Config ───────────────────────────────────────────────────────────────
  get config() {
    return window.AWS_CONFIG || {
      apiEndpoint: "https://jrq7fg37tb.execute-api.ap-south-1.amazonaws.com/Prod",
      USE_MOCK_AWS: false
    };
  }

  // ─── Init local storage defaults ──────────────────────────────────────────
  initMockStorage() {
    // Cache student registry locally
    const list = getRegisteredStudents();
    if (list && list.length > 0) {
      localStorage.setItem("hofis_students", JSON.stringify(list));
    }

    // Default admin credentials: hofis / hofis@2026
    const curCredRaw = localStorage.getItem("hofis_admin_cred");
    let needsDefaultCred = true;
    if (curCredRaw) {
      try {
        const parsed = JSON.parse(curCredRaw);
        if (parsed && parsed.username && parsed.password && parsed.username !== "admin") {
          needsDefaultCred = false;
        }
      } catch (e) {}
    }
    if (needsDefaultCred) {
      localStorage.setItem("hofis_admin_cred", JSON.stringify({
        username: "hofis",
        password: "hofis@2026",
        displayName: "Administrator (HOFIS)",
        isDefault: true
      }));
    }

    // Seed sample outpass only if list is completely empty
    if (!localStorage.getItem("hofis_outpasses")) {
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
          parentEmail: "",
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

  // ─── Student lookup ────────────────────────────────────────────────────────
  /**
   * Step 1 of the outpass flow:
   * Parent enters admission number → verify against DynamoDB (via Lambda) → show details.
   */
  async getStudentByAdmissionNumber(admissionNumber) {
    const cleanId = String(admissionNumber || "").trim();
    if (!cleanId) {
      throw new Error("Please enter an admission number.");
    }

    // 1. Try the backend Lambda (GET /students/{admissionNumber})
    try {
      const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/students/${encodeURIComponent(cleanId)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await res.json();
      if (res.ok && payload.success && payload.data) {
        return payload.data;  // student found in DynamoDB
      }
      // Backend returned an error (e.g. 404 – student not in DB yet)
      console.warn(`Student lookup from backend: ${payload.message || res.statusText}`);
    } catch (err) {
      console.warn("Backend student lookup failed, checking local registry:", err.message);
    }

    // 2. Fall back to the local student registry (students.json)
    await new Promise((r) => setTimeout(r, 150));
    const students = getRegisteredStudents();
    const found = students.find(
      (s) => String(s.admissionNumber).trim().toLowerCase() === cleanId.toLowerCase()
    );

    if (!found) {
      throw new Error(
        `Student with Admission Number "${cleanId}" not found in school records. Please check and try again.`
      );
    }

    return {
      admissionNumber: String(found.admissionNumber),
      studentName: found.studentName,
      fatherName: found.fatherName || found.fathername || "",
      class: String(found.class || ""),
      division: String(found.division || found.div || ""),
      contactNumber: found.contactNumber || ""
    };
  }

  // ─── Outpass submission ────────────────────────────────────────────────────
  /**
   * Step 3 of the outpass flow:
   * Parent fills reason, date/time, and their email → submits outpass.
   * Payload MUST include: admissionNumber, reason, leaveDateTime, parentEmail.
   */
  async submitOutpass(payload) {
    if (!payload.admissionNumber || !payload.reason || !payload.leaveDateTime) {
      throw new Error("Missing required outpass fields.");
    }

    // Try live AWS Lambda (POST /outpass)
    if (this.config.apiEndpoint) {
      try {
        const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success && data.data) {
          this.syncLocalOutpass(data.data);
          return data.data;
        }
        console.warn("AWS submission not accepted (" + (data.message || res.status) + "). Saving locally.");
      } catch (err) {
        console.warn("AWS connection issue (" + err.message + "). Completing outpass locally.");
      }
    }

    // Fall back to local simulation
    return await this.submitOutpassLocal(payload);
  }

  async submitOutpassLocal(payload) {
    await new Promise((r) => setTimeout(r, 400));

    const leaveTimestamp = new Date(payload.leaveDateTime).getTime();
    if (isNaN(leaveTimestamp)) {
      throw new Error("Invalid departure date and time.");
    }
    const now = Date.now();
    if (leaveTimestamp < now - 60 * 1000) {
      throw new Error("Departure date and time cannot be in the past.");
    }
    const maxAllowedTimestamp = now + 7 * 24 * 60 * 60 * 1000;
    if (leaveTimestamp > maxAllowedTimestamp) {
      throw new Error("Outpass can only be applied up to 7 days in advance.");
    }

    let student = payload.studentName ? payload : null;
    if (!student) {
      student = await this.getStudentByAdmissionNumber(payload.admissionNumber);
    }

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
      outpassId,
      admissionNumber: String(student.admissionNumber),
      studentName: student.studentName || "Student",
      fatherName: student.fatherName || "Parent",
      class: String(student.class || ""),
      division: String(student.division || ""),
      reason: payload.reason.trim(),
      leaveDateTime: payload.leaveDateTime,
      parentEmail: payload.parentEmail ? payload.parentEmail.trim() : "",
      parentName: payload.parentName?.trim() || student.fatherName || "Parent",
      parentPhone: payload.parentPhone?.trim() || student.contactNumber || "",
      pickupPerson: payload.pickupPerson?.trim() || student.fatherName || "Parent",
      status: "PENDING",
      createdAt: nowIso,
      updatedAt: nowIso
    };

    existingOutpasses.unshift(newOutpass);
    localStorage.setItem("hofis_outpasses", JSON.stringify(existingOutpasses));

    return newOutpass;
  }

  // ─── Outpass listing ───────────────────────────────────────────────────────
  async listOutpasses(filter = {}) {
    let awsList = [];

    if (this.config.apiEndpoint) {
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

    // Merge AWS + local
    const localList = JSON.parse(localStorage.getItem("hofis_outpasses") || "[]");
    const map = new Map();
    localList.forEach((item) => {
      if (item && item.outpassId) map.set(item.outpassId, { ...item });
    });
    awsList.forEach((item) => {
      if (item && item.outpassId) {
        const local = map.get(item.outpassId) || {};
        map.set(item.outpassId, { ...local, ...item });
      }
    });

    // Extract admin config record
    const configRecord = awsList.find(o => o && (o.outpassId === "HOFIS-SYSTEM-ADMIN-CONFIG" || o.status === "CONFIG"));
    if (configRecord && configRecord.remarks) {
      try {
        const creds = JSON.parse(configRecord.remarks);
        if (creds.username && creds.password) {
          localStorage.setItem("hofis_admin_cred", JSON.stringify({
            username: creds.username.trim(),
            password: creds.password.trim(),
            displayName: `Administrator (${creds.username.trim()})`,
            isDefault: creds.username.trim() === "hofis" && creds.password.trim() === "hofis@2026",
            updatedAt: configRecord.updatedAt || new Date().toISOString()
          }));
        }
      } catch (e) {}
    }

    map.delete("HOFIS-SYSTEM-ADMIN-CONFIG");
    let list = Array.from(map.values()).filter(
      item => item.outpassId !== "HOFIS-SYSTEM-ADMIN-CONFIG" && item.status !== "CONFIG"
    );

    // Enrich missing student details from registry
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
    });

    // Cache merged set locally
    try { localStorage.setItem("hofis_outpasses", JSON.stringify(list)); } catch (e) {}

    // Apply filters
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

    list.sort((a, b) => new Date(b.createdAt || b.leaveDateTime || 0) - new Date(a.createdAt || a.leaveDateTime || 0));
    return list;
  }

  // ─── Outpass update (admin approve / reject / cancel) ─────────────────────
  /**
   * When admin approves, the Lambda (updateOutpass.js) automatically
   * sends an email from hofispr@gmail.com to the parentEmail stored in the record.
   */
  async updateOutpassStatus(outpassId, status, remarks = "", updatedBy = "Staff") {
    let updatedItem = null;

    if (this.config.apiEndpoint) {
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

    // Always sync locally too
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

  // ─── Helpers ───────────────────────────────────────────────────────────────
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

  getLocalDateKey(dateInput) {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async getOutpassesForStudent(admissionNumber) {
    return this.listOutpasses({ admissionNumber });
  }

  // ─── Authentication ────────────────────────────────────────────────────────
  async syncCloudAdminCredentials() {
    if (this.config.apiEndpoint) {
      try {
        const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass`;
        const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });
        const data = await res.json();
        if (res.ok && Array.isArray(data.data)) {
          const configItem = data.data.find(
            (o) => o && (o.outpassId === "HOFIS-SYSTEM-ADMIN-CONFIG" || o.status === "CONFIG")
          );
          if (configItem && configItem.remarks) {
            try {
              const creds = JSON.parse(configItem.remarks);
              if (creds.username && creds.password) {
                const updated = {
                  username: creds.username.trim(),
                  password: creds.password.trim(),
                  displayName: `Administrator (${creds.username.trim()})`,
                  isDefault: creds.username.trim() === "hofis" && creds.password.trim() === "hofis@2026",
                  updatedAt: configItem.updatedAt || new Date().toISOString()
                };
                localStorage.setItem("hofis_admin_cred", JSON.stringify(updated));
                return updated;
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn("Could not sync admin credentials from AWS:", e.message);
      }
    }
    return this.getAdminCredentials();
  }

  async login(username, password) {
    const cleanUser = String(username || "").trim();
    const cleanPass = String(password || "").trim();

    if (!cleanUser || !cleanPass) {
      throw new Error("Please enter both username and password.");
    }

    // Sync latest cloud credentials
    try { await this.syncCloudAdminCredentials(); } catch (e) {}

    const adminCred = this.getAdminCredentials();

    const mockStaff = [
      {
        usernames: [adminCred.username, `${adminCred.username}@hofis.edu`],
        password: adminCred.password,
        role: "ADMIN",
        displayName: adminCred.displayName || `Administrator (${adminCred.username})`
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

  getAdminCredentials() {
    const raw = localStorage.getItem("hofis_admin_cred");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Migrate old "admin" / "Admin@123" credentials
        if (parsed.username === "admin" && parsed.password === "Admin@123") {
          parsed.username = "hofis";
          parsed.password = "hofis@2026";
          parsed.displayName = "Administrator (HOFIS)";
          parsed.isDefault = true;
          localStorage.setItem("hofis_admin_cred", JSON.stringify(parsed));
        }
        return parsed;
      } catch (e) {}
    }
    return {
      username: "hofis",
      password: "hofis@2026",
      displayName: "Administrator (HOFIS)",
      isDefault: true
    };
  }

  async updateAdminCredentials(currentPassword, newUsername, newPassword) {
    const current = this.getAdminCredentials();
    if (current.password !== currentPassword) {
      throw new Error("Current password is incorrect. Please re-enter.");
    }
    const cleanUser = String(newUsername || "").trim();
    const cleanPass = String(newPassword || "").trim();

    if (!cleanUser) throw new Error("New username cannot be empty.");
    if (cleanPass.length < 6) throw new Error("New password must be at least 6 characters long.");

    const updated = {
      username: cleanUser,
      password: cleanPass,
      displayName: `Administrator (${cleanUser})`,
      isDefault: cleanUser === "hofis" && cleanPass === "hofis@2026",
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem("hofis_admin_cred", JSON.stringify(updated));

    const active = this.getCurrentUser();
    if (active && active.role === "ADMIN") {
      active.username = cleanUser;
      active.displayName = updated.displayName;
      sessionStorage.setItem("hofis_auth_user", JSON.stringify(active));
    }

    // Persist to AWS DynamoDB
    if (this.config.apiEndpoint) {
      try {
        const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/outpass/HOFIS-SYSTEM-ADMIN-CONFIG`;
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "CONFIG",
            remarks: JSON.stringify({ username: cleanUser, password: cleanPass }),
            updatedBy: `Admin (${cleanUser})`
          })
        });
        console.log("Admin credentials successfully synced to AWS database.");
      } catch (err) {
        console.warn("Could not sync updated credentials to AWS:", err.message);
      }
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
