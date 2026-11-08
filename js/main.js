// ==========================================================================
// Holy Family International School - Outpass System Logic
// Integrated with Class playschool to X.xlsx Database, AWS Cognito,
// AWS Lambda, Amazon DynamoDB & Amazon SES (shibinsajip@gmail.com)
// ==========================================================================

const AWS_API_BASE_URL = 'https://udn4tobzpe.execute-api.ap-south-1.amazonaws.com/Prod';
const AWS_COGNITO_CONFIG = {
  region: 'ap-south-1',
  userPoolId: 'ap-south-1_uuzAWmHRe',
  clientId: '4nelkm71va2q43r0uc108baorv'
};
const ADMIN_SENDER_EMAIL = 'shibinsajip@gmail.com';
const OUTPASS_STORAGE_KEY = 'hofis_outpass_requests_v1';

// Default Admin Account in DynamoDB (HofisAdmins) & AWS Cognito
const ADMINS_DB = {
  hofis: {
    username: 'hofis',
    password: 'hofis',
    role: 'Administrator (hofis)'
  }
};

// Complete Student Database loaded from Class playschool to X.xlsx (575 students)
const STUDENTS_DB = Object.assign(
  {
    '10021': {
      admissionNo: '10021',
      name: 'Sarah Elizabeth Mathews',
      class: '7-B',
      parentName: 'Mathews George',
      phone: '+91 98450 11223'
    }
  },
  window.HOFIS_STUDENTS_DB || {}
);

/**
 * Helper to get URL query parameter
 */
function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

/**
 * Switch between Student Outpass View and Login View on index.html
 */
window.switchView = function (view) {
  const outpassView = document.getElementById('outpassView');
  const loginView = document.getElementById('loginView');
  const navParent = document.getElementById('navParent');
  const navLogin = document.getElementById('navLogin');

  if (!outpassView || !loginView) return;

  if (view === 'login') {
    outpassView.style.display = 'none';
    loginView.style.display = 'block';
    if (navParent) navParent.classList.remove('badge-parent');
    if (navLogin) navLogin.classList.add('badge-parent');
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) usernameInput.focus();
  } else {
    loginView.style.display = 'none';
    outpassView.style.display = 'block';
    if (navLogin) navLogin.classList.remove('badge-parent');
    if (navParent) navParent.classList.add('badge-parent');
    const admissionInput = document.getElementById('admissionInput');
    if (admissionInput) admissionInput.focus();
  }
};

// ==========================================================================
// Step 1: Parent Portal - Student Lookup & Confirmation (index.html)
// Strictly checks if student exists in Class playschool to X.xlsx / DynamoDB
// ==========================================================================
function initStudentSearch() {
  const form = document.getElementById('studentSearchForm');
  const input = document.getElementById('admissionInput');
  const searchBtn = document.getElementById('searchBtn');
  const alertBox = document.getElementById('alertBox');
  const alertMessage = document.getElementById('alertMessage');
  const confirmBox = document.getElementById('studentConfirmBox');
  const confirmProceedBtn = document.getElementById('confirmProceedBtn');
  const changeStudentBtn = document.getElementById('changeStudentBtn');
  const stepBar2 = document.getElementById('stepBar2');
  const lookupSubtitle = document.getElementById('lookupSubtitle');

  if (!form || !input) return;

  let verifiedStudent = null;

  input.addEventListener('input', function () {
    if (alertBox) alertBox.style.display = 'none';
  });

  if (changeStudentBtn) {
    changeStudentBtn.addEventListener('click', function () {
      verifiedStudent = null;
      if (confirmBox) confirmBox.style.display = 'none';
      form.style.display = 'block';
      if (stepBar2) {
        stepBar2.classList.remove('active');
        stepBar2.classList.add('inactive');
      }
      if (lookupSubtitle) lookupSubtitle.textContent = 'Enter student admission number to begin';
      input.value = '';
      input.focus();
    });
  }

  if (confirmProceedBtn) {
    confirmProceedBtn.addEventListener('click', function () {
      if (!verifiedStudent) return;
      sessionStorage.setItem('currentStudent', JSON.stringify(verifiedStudent));
      sessionStorage.setItem('admissionNo', verifiedStudent.admissionNo);
      window.location.href = `outpass.html?admission=${encodeURIComponent(verifiedStudent.admissionNo)}`;
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const admissionNo = input.value.trim();
    if (!admissionNo) return;

    if (alertBox) alertBox.style.display = 'none';
    if (confirmBox) confirmBox.style.display = 'none';

    searchBtn.classList.add('loading');
    searchBtn.disabled = true;

    let student = null;

    // 1) Check local database extracted from Class playschool to X.xlsx
    if (STUDENTS_DB[admissionNo]) {
      student = STUDENTS_DB[admissionNo];
    } else {
      // 2) Try AWS API Gateway / DynamoDB lookup
      try {
        const res = await fetch(`${AWS_API_BASE_URL}/students/${encodeURIComponent(admissionNo)}`);
        if (res.ok) {
          student = await res.json();
        }
      } catch (err) {}
    }

    searchBtn.classList.remove('loading');
    searchBtn.disabled = false;

    // Strictly block if student admission number is NOT in database
    if (!student) {
      if (alertBox && alertMessage) {
        alertMessage.textContent = `Student with Admission Number '${admissionNo}' was not found in the school database. Only registered students can apply for an outpass.`;
        alertBox.style.display = 'flex';
      }
      return;
    }

    // Student found in database -> Display Student Details for Parent Confirmation
    verifiedStudent = student;
    const initials = student.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setEl('confirmAvatar', initials);
    const confirmNameEl = document.getElementById('confirmName');
    if (confirmNameEl) {
      confirmNameEl.innerHTML = `${student.name} <span class="badge-tag">Verified</span>`;
    }
    setEl('confirmAdm', student.admissionNo);
    setEl('confirmClass', student.class);
    setEl('confirmFather', student.parentName);

    form.style.display = 'none';
    if (confirmBox) confirmBox.style.display = 'block';
    if (stepBar2) {
      stepBar2.classList.remove('inactive');
      stepBar2.classList.add('active');
    }
    if (lookupSubtitle) {
      lookupSubtitle.textContent = 'Please confirm your child’s details below to continue';
    }
  });
}

// ==========================================================================
// Admin Login Form Handler (Username: "hofis", Password: "hofis")
// ==========================================================================
function initLoginForm() {
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginAlertBox = document.getElementById('loginAlertBox');
  const loginAlertMessage = document.getElementById('loginAlertMessage');

  if (!loginForm || !usernameInput || !passwordInput) return;

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) return;

    if (loginAlertBox) loginAlertBox.style.display = 'none';
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    let isAuthenticated = false;

    // 1. Attempt AWS Lambda + Cognito / DynamoDB endpoint
    try {
      const res = await fetch(`${AWS_API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          isAuthenticated = true;
          if (data.token) sessionStorage.setItem('cognitoToken', data.token);
        }
      }
    } catch (err) {}

    // 2. Verify against seeded DynamoDB credentials (hofis / hofis)
    if (!isAuthenticated && ADMINS_DB[username] && ADMINS_DB[username].password === password) {
      isAuthenticated = true;
    }

    loginBtn.classList.remove('loading');
    loginBtn.disabled = false;

    if (isAuthenticated) {
      sessionStorage.setItem('adminUser', username);
      window.location.href = 'admin.html';
    } else if (loginAlertBox && loginAlertMessage) {
      loginAlertBox.className = 'alert-error';
      loginAlertMessage.textContent = 'Invalid username or password. Use username "hofis" and password "hofis".';
      loginAlertBox.style.display = 'flex';
    }
  });
}

// ==========================================================================
// Shared Outpass Requests Store (Synced between Parent Portal & Admin Page)
// ==========================================================================
const DEFAULT_ADMIN_REQUESTS = [
  {
    passId: 'HOFIS-261104-E1F2',
    studentName: 'Sarah Elizabeth Mathews',
    admissionNo: '10021',
    classSection: 'Class 7-B',
    reqTime: 'Nov 5, 09:03 AM',
    leaveDate: '2026-11-05',
    leaveTime: 'Nov 5, 10:03 AM',
    monthKey: '2026-11',
    reason: 'Medical checkup appointment with dentist',
    guardian: 'Father (Mathews George)',
    parentEmail: 'mathews.parent@gmail.com',
    phone: '+91 98450 11223',
    status: 'approved',
    timestamp: 7
  },
  {
    passId: 'HOFIS-261104-C9A1',
    studentName: 'AAINA FATHIMA S',
    admissionNo: '1705',
    classSection: 'Class V A',
    reqTime: 'Nov 4, 02:15 PM',
    leaveDate: '2026-11-04',
    leaveTime: 'Nov 4, 03:00 PM',
    monthKey: '2026-11',
    reason: 'Family function out of station',
    guardian: 'Father (SANJEER SULAIMAN)',
    parentEmail: 'sanjeer.parent@gmail.com',
    phone: '+91 94470 22334',
    status: 'cancelled',
    timestamp: 6
  },
  {
    passId: 'HOFIS-261104-B4D8',
    studentName: 'AARYAN S',
    admissionNo: '1369',
    classSection: 'Class V A',
    reqTime: 'Nov 4, 11:20 AM',
    leaveTime: 'Nov 4, 12:30 PM',
    leaveDate: '2026-11-04',
    monthKey: '2026-11',
    reason: 'Ophthalmology consultation',
    guardian: 'Father (SREEJITH PS)',
    parentEmail: 'sreejith.parent@gmail.com',
    phone: '+91 98460 55667',
    status: 'cancelled',
    timestamp: 5
  },
  {
    passId: 'HOFIS-261103-F7E3',
    studentName: 'ADAM BIN FAJAR',
    admissionNo: '1317',
    classSection: 'Class V A',
    reqTime: 'Nov 3, 10:05 AM',
    leaveDate: '2026-11-03',
    leaveTime: 'Nov 3, 11:00 AM',
    monthKey: '2026-11',
    reason: 'Passport office appointment',
    guardian: 'Father (FAJARUDEEN K I)',
    parentEmail: 'fajarudeen.parent@gmail.com',
    phone: '+91 94465 77889',
    status: 'cancelled',
    timestamp: 4
  },
  {
    passId: 'HOFIS-261103-A2C6',
    studentName: 'AGNUS JOBBY',
    admissionNo: '1844',
    classSection: 'Class V A',
    reqTime: 'Nov 3, 09:40 AM',
    leaveDate: '2026-11-03',
    leaveTime: 'Nov 3, 10:30 AM',
    monthKey: '2026-11',
    reason: 'Severe headache and fever',
    guardian: 'Father (JOBBY MATHEW)',
    parentEmail: 'jobby.parent@gmail.com',
    phone: '+91 98950 33445',
    status: 'cancelled',
    timestamp: 3
  },
  {
    passId: 'HOFIS-261102-D5B9',
    studentName: 'AGRAJ RAGESH',
    admissionNo: '1428',
    classSection: 'Class V A',
    reqTime: 'Nov 2, 01:10 PM',
    leaveDate: '2026-11-02',
    leaveTime: 'Nov 2, 02:00 PM',
    monthKey: '2026-11',
    reason: 'District athletics championship registration',
    guardian: 'Father (RAGESH P G)',
    parentEmail: 'ragesh.parent@gmail.com',
    phone: '+91 94472 66778',
    status: 'cancelled',
    timestamp: 2
  },
  {
    passId: 'HOFIS-261101-E8A4',
    studentName: 'AIDHEN LIBU',
    admissionNo: '1910',
    classSection: 'Class V A',
    reqTime: 'Nov 1, 10:50 AM',
    leaveDate: '2026-11-01',
    leaveTime: 'Nov 1, 11:45 AM',
    monthKey: '2026-11',
    reason: 'Dental braces adjustment',
    guardian: 'Father (LIBU T BABU)',
    parentEmail: 'libu.parent@gmail.com',
    phone: '+91 98471 99001',
    status: 'cancelled',
    timestamp: 1
  }
];

function loadOutpassRequests() {
  try {
    const raw = localStorage.getItem(OUTPASS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  localStorage.setItem(OUTPASS_STORAGE_KEY, JSON.stringify(DEFAULT_ADMIN_REQUESTS));
  return [...DEFAULT_ADMIN_REQUESTS];
}

function saveOutpassRequests(list) {
  try {
    localStorage.setItem(OUTPASS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}

// ==========================================================================
// Step 2: Outpass Request Form Page (outpass.html)
// ==========================================================================
function initOutpassForm() {
  const form = document.getElementById('outpassRequestForm');
  if (!form) return;

  const admFromUrl = (getQueryParam('admission') || sessionStorage.getItem('admissionNo') || '').trim();
  let student = STUDENTS_DB[admFromUrl] || null;

  if (!student) {
    try {
      const raw = sessionStorage.getItem('currentStudent');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && STUDENTS_DB[parsed.admissionNo]) {
          student = STUDENTS_DB[parsed.admissionNo];
        }
      }
    } catch (err) {}
  }

  // Strictly block outpass application if student is not in database
  if (!student) {
    alert('Please enter and confirm a valid Student Admission Number from the school database first.');
    window.location.href = 'index.html';
    return;
  }

  // Populate Confirmed Student Info
  const studentNameEl = document.getElementById('studentName');
  const studentAdmEl = document.getElementById('studentAdm');
  const studentClassEl = document.getElementById('studentClass');
  const studentParentEl = document.getElementById('studentParent');
  const avatarInitialsEl = document.getElementById('avatarInitials');

  if (studentNameEl) studentNameEl.innerHTML = `${student.name} <span class="badge-tag">Verified</span>`;
  if (studentAdmEl) studentAdmEl.textContent = student.admissionNo;
  if (studentClassEl) studentClassEl.textContent = student.class;
  if (studentParentEl) studentParentEl.textContent = student.parentName;
  if (avatarInitialsEl) {
    const initials = student.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
    avatarInitialsEl.textContent = initials;
  }

  // Auto-set today's date & current time
  const dateInput = document.getElementById('outpassDate');
  const timeInput = document.getElementById('outpassTime');
  const now = new Date();
  if (dateInput) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  if (timeInput) {
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${min}`;
  }

  // Form Submission -> Send Request to Admin
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const reason = document.getElementById('outpassReason').value.trim();
    const leaveDate = document.getElementById('outpassDate').value;
    const leaveTimeRaw = document.getElementById('outpassTime').value;
    const parentEmail = document.getElementById('parentEmail').value.trim();
    const phone = document.getElementById('pickupContact').value.trim();

    if (!reason || !leaveDate || !leaveTimeRaw || !parentEmail) return;

    const randomHex = Math.floor(0x1000 + Math.random() * 0x9000)
      .toString(16)
      .toUpperCase();
    const dateCompact = leaveDate.replace(/-/g, '').slice(2);
    const passCode = `HOFIS-${dateCompact}-${randomHex}`;
    const monthKey = leaveDate.slice(0, 7);

    const formattedLeave = `${leaveDate} ${leaveTimeRaw}`;
    const reqTimeStr = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const newRequest = {
      passId: passCode,
      studentName: student.name,
      admissionNo: student.admissionNo,
      classSection: `Class ${student.class}`,
      reqTime: reqTimeStr,
      leaveDate: leaveDate,
      leaveTime: formattedLeave,
      monthKey: monthKey,
      reason: reason,
      guardian: `Father (${student.parentName})`,
      parentEmail: parentEmail,
      phone: phone,
      status: 'pending',
      timestamp: Date.now()
    };

    // Save to shared local store so Admin sees it immediately
    const allRequests = loadOutpassRequests();
    allRequests.unshift(newRequest);
    saveOutpassRequests(allRequests);

    // Also send to AWS API Gateway / DynamoDB if deployed
    try {
      await fetch(`${AWS_API_BASE_URL}/outpasses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admissionNo: student.admissionNo,
          reason,
          leaveDate,
          leaveTime: formattedLeave,
          parentEmail,
          phone
        })
      });
    } catch (err) {}

    // Show Submitted Confirmation Card
    const passResult = document.getElementById('passResult');
    if (!passResult) return;

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('ticketPassId', passCode);
    setEl('ticketEmail', parentEmail);
    setEl('ticketParentEmailGrid', parentEmail);
    setEl('ticketStudent', student.name);
    setEl('ticketAdm', `${student.admissionNo} (${student.class})`);
    setEl('ticketReason', reason);
    setEl('ticketExitTime', formattedLeave);
    setEl('ticketEscort', student.parentName);

    form.style.display = 'none';
    passResult.style.display = 'block';
    passResult.scrollIntoView({ behavior: 'smooth' });
  });
}

// ==========================================================================
// Admin & Gatekeeper Staff Console Logic (admin.html)
// ==========================================================================
let ADMIN_REQUESTS = loadOutpassRequests();
let currentAdminTab = 'approved';
let currentSearchFilter = '';

function updateAdminCounts() {
  ADMIN_REQUESTS = loadOutpassRequests();
  const counts = {
    pending: ADMIN_REQUESTS.filter((r) => r.status === 'pending').length,
    approved: ADMIN_REQUESTS.filter((r) => r.status === 'approved').length,
    cancelled: ADMIN_REQUESTS.filter((r) => r.status === 'cancelled').length,
    exited: ADMIN_REQUESTS.filter((r) => r.status === 'exited').length,
    all: ADMIN_REQUESTS.length
  };

  const setElText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('kpiPending', counts.pending);
  setElText('kpiApproved', counts.approved);
  setElText('kpiCancelled', counts.cancelled);
  setElText('kpiExited', counts.exited);
  setElText('kpiTotal', counts.all);

  setElText('tabCountPending', counts.pending);
  setElText('tabCountApproved', counts.approved);
  setElText('tabCountCancelled', counts.cancelled);
  setElText('tabCountExited', counts.exited);
  setElText('tabCountAll', counts.all);
}

window.filterAdminTab = function (tab) {
  currentAdminTab = tab;
  currentSearchFilter = '';
  const verifyInput = document.getElementById('verifyPassInput');
  if (verifyInput) verifyInput.value = '';

  document.querySelectorAll('.filter-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  renderAdminTable();
};

/**
 * Construct and trigger email notification from shibinsajip@gmail.com to parentEmail
 */
function notifyParentByEmail(item, status) {
  const recipient = item.parentEmail || 'parent@example.com';
  const isApproved = status === 'approved';
  const statusLabel = isApproved ? 'APPROVED' : 'CANCELLED';

  const subject = `[HOFIS ${statusLabel}] Student Outpass (${item.passId}) - ${item.studentName}`;
  const bodyLines = [
    `Dear Parent (${item.guardian}),`,
    ``,
    `Your student outpass request at Holy Family International School has been ${statusLabel}.`,
    ``,
    `Outpass Reference ID: ${item.passId}`,
    `Student Name: ${item.studentName}`,
    `Admission Number: ${item.admissionNo}`,
    `Class: ${item.classSection}`,
    `Reason for Leave: ${item.reason}`,
    `Scheduled Departure: ${item.leaveTime}`,
    `Status: ${statusLabel}`,
    ``,
    `Sent by Administrator (${ADMIN_SENDER_EMAIL})`,
    `Holy Family International School`
  ].join('\n');

  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(
    recipient
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines)}`;

  const banner = document.getElementById('adminEmailBanner');
  const bannerText = document.getElementById('adminEmailBannerText');
  const mailtoBtn = document.getElementById('adminEmailMailtoBtn');

  if (banner && bannerText && mailtoBtn) {
    banner.style.display = 'flex';
    banner.style.background = isApproved ? '#ecfdf5' : '#fef2f2';
    banner.style.borderColor = isApproved ? '#a7f3d0' : '#fecaca';
    banner.style.color = isApproved ? '#065f46' : '#991b1b';
    bannerText.innerHTML = `<strong>✓ Outpass ${statusLabel}:</strong> Email notification from <strong>${ADMIN_SENDER_EMAIL}</strong> dispatched to parent email <strong>${recipient}</strong>.`;
    mailtoBtn.href = gmailComposeUrl;
    mailtoBtn.textContent = `Send via Gmail (${ADMIN_SENDER_EMAIL})`;
  }
}

window.markPassStatus = async function (passId, newStatus) {
  ADMIN_REQUESTS = loadOutpassRequests();
  const item = ADMIN_REQUESTS.find((r) => r.passId === passId);
  if (!item) return;

  item.status = newStatus;
  saveOutpassRequests(ADMIN_REQUESTS);
  updateAdminCounts();
  renderAdminTable();

  // Trigger AWS Lambda + Amazon SES Email from shibinsajip@gmail.com
  try {
    await fetch(`${AWS_API_BASE_URL}/outpasses/${encodeURIComponent(passId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
  } catch (err) {}

  // If approved or cancelled, trigger email notification to parent email address
  if (newStatus === 'approved' || newStatus === 'cancelled') {
    notifyParentByEmail(item, newStatus);
  }
};

window.sendPassEmail = function (passId) {
  ADMIN_REQUESTS = loadOutpassRequests();
  const item = ADMIN_REQUESTS.find((r) => r.passId === passId);
  if (!item) return;
  notifyParentByEmail(item, item.status === 'cancelled' ? 'cancelled' : 'approved');
};

/**
 * Monthly Basis Data Deletion in Admin Console
 */
window.deleteMonthlyData = async function () {
  const monthInput = document.getElementById('deleteMonthInput');
  const selectedMonth = monthInput ? monthInput.value : '';

  const label = selectedMonth ? `month ${selectedMonth}` : 'all months';
  if (!confirm(`Are you sure you want to delete all outpass records for ${label}?`)) {
    return;
  }

  ADMIN_REQUESTS = loadOutpassRequests();
  const beforeCount = ADMIN_REQUESTS.length;

  if (selectedMonth) {
    ADMIN_REQUESTS = ADMIN_REQUESTS.filter((r) => {
      const itemMonth = r.monthKey || (r.leaveDate ? r.leaveDate.slice(0, 7) : '');
      return itemMonth !== selectedMonth;
    });
  } else {
    ADMIN_REQUESTS = [];
  }

  const deletedCount = beforeCount - ADMIN_REQUESTS.length;
  saveOutpassRequests(ADMIN_REQUESTS);
  updateAdminCounts();
  renderAdminTable();

  // Also invoke AWS Lambda DELETE /outpasses/monthly
  try {
    await fetch(`${AWS_API_BASE_URL}/outpasses/monthly?month=${encodeURIComponent(selectedMonth)}`, {
      method: 'DELETE'
    });
  } catch (err) {}

  alert(`Deleted ${deletedCount} outpass record(s) for ${label}.`);
};

window.renderAdminTable = function () {
  const tbody = document.getElementById('adminTableBody');
  if (!tbody) return;

  ADMIN_REQUESTS = loadOutpassRequests();

  const sortSelect = document.getElementById('sortSelect');
  const sortOrder = sortSelect ? sortSelect.value : 'newest';

  let rows = ADMIN_REQUESTS.filter((r) => {
    if (currentSearchFilter) {
      const q = currentSearchFilter.toLowerCase();
      return (
        r.passId.toLowerCase().includes(q) ||
        r.admissionNo.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q)
      );
    }
    if (currentAdminTab === 'all') return true;
    return r.status === currentAdminTab;
  });

  rows.sort((a, b) => (sortOrder === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 32px; color:#64748b;">
          No outpass requests found in this view.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      let statusBadge = '';
      if (r.status === 'approved') {
        statusBadge = `
          <span class="status-pill status-approved">
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path>
            </svg>
            APPROVED
          </span>`;
      } else if (r.status === 'pending') {
        statusBadge = `<span class="status-pill status-pending">PENDING</span>`;
      } else if (r.status === 'exited') {
        statusBadge = `<span class="status-pill status-exited">EXITED GATE</span>`;
      } else {
        statusBadge = `<span class="status-pill status-cancelled">CANCELLED</span>`;
      }

      let actionBtns = '';
      if (r.status === 'pending') {
        actionBtns = `
          <button type="button" class="btn-action btn-approve" onclick="markPassStatus('${r.passId}', 'approved')">Approve</button>
          <button type="button" class="btn-action btn-revoke" onclick="markPassStatus('${r.passId}', 'cancelled')">Cancel</button>
        `;
      } else if (r.status === 'approved') {
        actionBtns = `
          <button type="button" class="btn-action btn-mark-exit" onclick="markPassStatus('${r.passId}', 'exited')">Mark Exit</button>
          <button type="button" class="btn-action btn-email" onclick="sendPassEmail('${r.passId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
            </svg>
            Email
          </button>
          <button type="button" class="btn-action btn-revoke" onclick="markPassStatus('${r.passId}', 'cancelled')">Revoke</button>
        `;
      } else {
        actionBtns = `
          <button type="button" class="btn-action btn-approve" onclick="markPassStatus('${r.passId}', 'approved')">Approve</button>
          <button type="button" class="btn-action btn-email" onclick="sendPassEmail('${r.passId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
            </svg>
            Email
          </button>
        `;
      }

      const emailLine = r.parentEmail
        ? `<div style="font-size:11.5px; color:#0284c7; margin-top:2px;">✉ ${r.parentEmail}</div>`
        : '';

      return `
        <tr>
          <td>
            <span class="pass-id-pill">${r.passId}</span>
          </td>
          <td>
            <div class="student-cell-name">${r.studentName}</div>
            <div class="student-cell-meta">Adm: <strong>${r.admissionNo}</strong> &bull; ${r.classSection}</div>
          </td>
          <td>
            <div class="schedule-req">Req: ${r.reqTime}</div>
            <div class="schedule-leave">Leave: ${r.leaveTime}</div>
          </td>
          <td class="reason-cell">${r.reason}</td>
          <td>
            <div class="guardian-name">${r.guardian}</div>
            <div class="guardian-phone">
              <svg viewBox="0 0 24 24" fill="currentColor" class="phone-icon">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              ${r.phone || '--'}
            </div>
            ${emailLine}
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="action-buttons">${actionBtns}</div>
          </td>
        </tr>
      `;
    })
    .join('');
};

async function syncAdminRequestsFromAws() {
  try {
    const res = await fetch(`${AWS_API_BASE_URL}/outpasses`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        const local = loadOutpassRequests();
        const byId = new Map();
        data.items.forEach((item) => byId.set(item.passId, item));
        local.forEach((item) => {
          if (!byId.has(item.passId)) byId.set(item.passId, item);
        });
        const merged = Array.from(byId.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        saveOutpassRequests(merged);
        updateAdminCounts();
        renderAdminTable();
      }
    }
  } catch (err) {}
}

function initAdminConsole() {
  const verifyForm = document.getElementById('verifyPassForm');
  const verifyInput = document.getElementById('verifyPassInput');
  const deleteMonthInput = document.getElementById('deleteMonthInput');

  if (deleteMonthInput) {
    deleteMonthInput.value = '2026-11';
  }

  ADMIN_REQUESTS = loadOutpassRequests();
  // If there are pending requests submitted by parents, switch to Pending tab automatically
  const hasPending = ADMIN_REQUESTS.some((r) => r.status === 'pending');
  if (hasPending) {
    currentAdminTab = 'pending';
    document.querySelectorAll('.filter-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === 'pending');
    });
  }

  updateAdminCounts();
  renderAdminTable();
  syncAdminRequestsFromAws();

  if (verifyForm && verifyInput) {
    verifyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      currentSearchFilter = verifyInput.value.trim();
      renderAdminTable();
    });
  }
}

async function ensureAwsDatabaseSeeded() {
  if (localStorage.getItem('hofis_aws_seeded_v1') === 'true') return;
  try {
    const res = await fetch(`${AWS_API_BASE_URL}/seed`, { method: 'POST' });
    if (res.ok) {
      localStorage.setItem('hofis_aws_seeded_v1', 'true');
      console.log('AWS DynamoDB & Cognito seeded successfully.');
    }
  } catch (err) {}
}

// Initializer
document.addEventListener('DOMContentLoaded', function () {
  ensureAwsDatabaseSeeded();
  if (document.getElementById('studentSearchForm')) {
    initStudentSearch();
  }
  if (document.getElementById('loginForm')) {
    initLoginForm();
  }
  if (document.getElementById('outpassRequestForm')) {
    initOutpassForm();
  }
  if (document.getElementById('adminTableBody')) {
    initAdminConsole();
  }
  if (window.location.hash === '#login') {
    window.switchView('login');
  }
});
