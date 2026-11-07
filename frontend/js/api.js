/**
 * API Service for HOFIS Outpass System
 * Fully cloud-connected – all data operations go to AWS DynamoDB via Lambda.
 * No local storage fallbacks for student or outpass data.
 */

class HofisApiService {
  // Simple toast helper – replace with your UI library if you have one
  _showErrorToast(msg) {
    // If a toast element exists (e.g., Bootstrap toast), use it; otherwise fall back to alert.
    const toastEl = document.getElementById('errorToast');
    if (toastEl && typeof bootstrap !== 'undefined') {
      toastEl.querySelector('.toast-body').textContent = msg;
      const toast = new bootstrap.Toast(toastEl);
      toast.show();
    } else {
      alert(msg);
    }
  }
  constructor() {
    this._initAdminCred();
  }

  // ─── Config ───────────────────────────────────────────────────────────────
  get config() {
    return window.AWS_CONFIG || {
      apiEndpoint: "https://jrq7fg37tb.execute-api.ap-south-1.amazonaws.com/Prod",
      USE_MOCK_AWS: false
    };
  }

  get apiBase() {
    return this.config.apiEndpoint.replace(/\/$/, "");
  }

  // ─── Init admin credentials only (no data seeding locally) ────────────────
  _initAdminCred() {
    const raw = localStorage.getItem("hofis_admin_cred");
    if (!raw) {
      localStorage.setItem("hofis_admin_cred", JSON.stringify({
        username: "hofis",
        password: "hofis@2026",
        displayName: "Administrator (HOFIS)",
        isDefault: true
      }));
    }
  }

  // ─── Student Lookup (DynamoDB only) ───────────────────────────────────────
  /**
   * Verifies admission number against DynamoDB (Hofis_Students table).
   * No local fallback – if student not in DB, parent must contact admin.
   */
  async getStudentByAdmissionNumber(admissionNumber) {
    const cleanId = String(admissionNumber || "").trim();
    if (!cleanId) {
      throw new Error("Please enter an admission number.");
    }

    const url = `${this.apiBase}/students/${encodeURIComponent(cleanId)}`;
    let res, payload;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      payload = await res.json();
    } catch (err) {
      throw new Error("Cannot connect to the school database. Please check your internet and try again.");
    }

    if (res.ok && payload.success && payload.data) {
      return payload.data;
    }

    throw new Error(
      payload.message ||
      `Student with Admission Number "${cleanId}" was not found. Please verify the number and try again.`
    );
  }

  // ─── Outpass Submission (DynamoDB only) ───────────────────────────────────
  /**
   * Submits outpass to DynamoDB via Lambda.
   * Payload MUST include: admissionNumber, reason, leaveDateTime, parentEmail.
   */
  async submitOutpass(payload) {
    if (!payload.admissionNumber || !payload.reason || !payload.leaveDateTime) {
      const msg = "Missing required outpass fields.";
      this._showErrorToast(msg);
      throw new Error(msg);
    }
    if (!payload.parentEmail || !payload.parentEmail.includes("@")) {
      const msg = "A valid parent email address is required to receive the outpass approval.";
      this._showErrorToast(msg);
      throw new Error(msg);
    }

    const url = `${this.apiBase}/outpass`;
    let res, data;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      data = await res.json();
    } catch (err) {
      const msg = "Cannot connect to the school server. Please check your internet and try again.";
      this._showErrorToast(msg);
      throw new Error(msg);
    }

    if (res.ok && data.success && data.data) {
      return data.data;
    }

    const backendMsg = data.message || `HTTP ${res.status} ${res.statusText}`;
    this._showErrorToast(backendMsg);
    throw new Error(backendMsg);
  }
    if (!payload.admissionNumber || !payload.reason || !payload.leaveDateTime) {
      throw new Error("Missing required outpass fields.");
    }
    if (!payload.parentEmail || !payload.parentEmail.includes("@")) {
      throw new Error("A valid parent email address is required to receive the outpass approval.");
    }

    const url = `${this.apiBase}/outpass`;
    let res, data;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      data = await res.json();
    } catch (err) {
      throw new Error("Cannot connect to the school server. Please check your internet and try again.");
    }

    if (res.ok && data.success && data.data) {
      return data.data;
    }

    throw new Error(data.message || "Failed to submit outpass request. Please try again.");
  }

  // ─── List Outpasses (DynamoDB only) ───────────────────────────────────────
  async listOutpasses(filter = {}) {
    let url = `${this.apiBase}/outpass`;
    const params = new URLSearchParams();
    if (filter.status && filter.status !== "ALL") params.append("status", filter.status);
    if (filter.admissionNumber) params.append("admissionNumber", filter.admissionNumber);
    if (params.toString()) url += `?${params.toString()}`;

    let res, data;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      data = await res.json();
    } catch (err) {
      throw new Error("Cannot connect to the school server. Please check your internet and try again.");
    }

    if (res.ok && Array.isArray(data.data)) {
      let list = data.data.filter(
        item => item.status !== "CONFIG" && item.outpassId !== "HOFIS-SYSTEM-ADMIN-CONFIG"
      );

      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return list;
    }

    return [];
  }

  // ─── Update Outpass Status (DynamoDB only) ────────────────────────────────
  /**
   * Admin approves / rejects / cancels an outpass.
   * On APPROVE → Lambda automatically sends email to parentEmail via SES.
   */
  async updateOutpassStatus(outpassId, status, remarks = "", updatedBy = "Staff") {
    const url = `${this.apiBase}/outpass/${encodeURIComponent(outpassId)}`;
    let res, data;
    try {
      res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks, updatedBy })
      });
      data = await res.json();
    } catch (err) {
      throw new Error("Cannot connect to the school server. Please check your internet and try again.");
    }

    if (res.ok && data.data) {
      return data.data;
    }

    throw new Error(data.message || "Failed to update outpass status.");
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
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

  // Keep syncLocalOutpass as a no-op (cloud only)
  syncLocalOutpass() {}

  // ─── Authentication ────────────────────────────────────────────────────────
  async syncCloudAdminCredentials() {
    try {
      const url = `${this.apiBase}/outpass`;
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
                isDefault: false,
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
      token: "jwt-token-" + Date.now()
    };

    sessionStorage.setItem("hofis_auth_user", JSON.stringify(authUser));
    return authUser;
  }

  getAdminCredentials() {
    const raw = localStorage.getItem("hofis_admin_cred");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
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
    try {
      const url = `${this.apiBase}/outpass/HOFIS-SYSTEM-ADMIN-CONFIG`;
      await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIG",
          remarks: JSON.stringify({ username: cleanUser, password: cleanPass }),
          updatedBy: `Admin (${cleanUser})`
        })
      });
    } catch (err) {
      console.warn("Could not sync updated credentials to AWS:", err.message);
    }

    return updated;
  }

  logout() {
    sessionStorage.removeItem("hofis_auth_user");
  }

  getCurrentUser() {
    const raw = sessionStorage.getItem("hofis_auth_user");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  isAuthenticated() {
    return !!this.getCurrentUser();
  }
}

window.apiService = new HofisApiService();
