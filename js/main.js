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
const ADMIN_SENDER_EMAIL = 'hofispr@gmail.com';
const OUTPASS_STORAGE_KEY = 'hofis_outpass_requests_v2';
try { localStorage.removeItem('hofis_outpass_requests_v1'); } catch (e) {}

// Default Admin Accounts in DynamoDB (HofisAdmins) & AWS Cognito
const ADMINS_STORAGE_KEY = 'hofis_admins_db_v1';
const DEFAULT_ADMINS_DB = {
  hofis: {
    username: 'hofis',
    password: 'hofis',
    role: 'Administrator (hofis)'
  },
  shibin: {
    username: 'shibin',
    password: 'shibin',
    role: 'Administrator (shibin)'
  }
};

function loadAdminsDb() {
  try {
    const raw = localStorage.getItem(ADMINS_STORAGE_KEY);
    if (raw) {
      return Object.assign({}, DEFAULT_ADMINS_DB, JSON.parse(raw));
    }
  } catch (e) {}
  return Object.assign({}, DEFAULT_ADMINS_DB);
}

function saveAdminsDb(db) {
  try {
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(db));
  } catch (e) {}
}

let ADMINS_DB = loadAdminsDb();

// Complete Student Database loaded from Class playschool to X.xlsx (575 students)
// Plus persistent Custom Added Students & Permanently Deleted Students
const CUSTOM_STUDENTS_KEY = 'hofis_custom_students_v1';
const DELETED_STUDENTS_KEY = 'hofis_deleted_students_v1';

function loadCustomStudents() {
  try {
    const raw = localStorage.getItem(CUSTOM_STUDENTS_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch (e) {}
  return {};
}

function saveCustomStudents(map) {
  try {
    localStorage.setItem(CUSTOM_STUDENTS_KEY, JSON.stringify(map));
  } catch (e) {}
}

function loadDeletedStudents() {
  try {
    const raw = localStorage.getItem(DELETED_STUDENTS_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch (e) {}
  return {};
}

function saveDeletedStudents(map) {
  try {
    localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(map));
  } catch (e) {}
}

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
  window.HOFIS_STUDENTS_DB || {},
  loadCustomStudents()
);

// Apply permanent deletions to STUDENTS_DB and window.HOFIS_STUDENTS_DB
(function applyDeletedStudents() {
  const deletedMap = loadDeletedStudents();
  Object.keys(deletedMap).forEach((adm) => {
    delete STUDENTS_DB[adm];
    if (window.HOFIS_STUDENTS_DB) {
      delete window.HOFIS_STUDENTS_DB[adm];
    }
  });
  if (window.HOFIS_STUDENTS_DB) {
    Object.assign(window.HOFIS_STUDENTS_DB, loadCustomStudents());
  }
})();

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
  const helpdeskView = document.getElementById('helpdeskView');
  const guidelinesView = document.getElementById('guidelinesView');
  const navParent = document.getElementById('navParent');
  const navLogin = document.getElementById('navLogin');
  const navHelpdesk = document.getElementById('navHelpdesk');
  const navGuidelines = document.getElementById('navGuidelines');

  if (!outpassView || !loginView) return;

  outpassView.style.display = 'none';
  loginView.style.display = 'none';
  if (helpdeskView) helpdeskView.style.display = 'none';
  if (guidelinesView) guidelinesView.style.display = 'none';

  if (navParent) navParent.classList.remove('badge-parent');
  if (navLogin) navLogin.classList.remove('badge-parent');
  if (navHelpdesk) navHelpdesk.classList.remove('badge-parent');
  if (navGuidelines) navGuidelines.classList.remove('badge-parent');

  if (view === 'login') {
    loginView.style.display = 'block';
    if (navLogin) navLogin.classList.add('badge-parent');
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) usernameInput.focus();
  } else if (view === 'helpdesk' && helpdeskView) {
    helpdeskView.style.display = 'block';
    if (navHelpdesk) navHelpdesk.classList.add('badge-parent');
  } else if (view === 'guidelines' && guidelinesView) {
    guidelinesView.style.display = 'block';
    if (navGuidelines) navGuidelines.classList.add('badge-parent');
  } else {
    outpassView.style.display = 'block';
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

    const isDeletedLocally = Boolean(loadDeletedStudents()[admissionNo]);

    // 1) Check local database extracted from Class playschool to X.xlsx + Custom Added Students
    if (!isDeletedLocally && STUDENTS_DB[admissionNo]) {
      student = STUDENTS_DB[admissionNo];
    } else if (!isDeletedLocally) {
      // 2) Try AWS API Gateway / DynamoDB lookup
      try {
        const res = await fetch(`${AWS_API_BASE_URL}/students/${encodeURIComponent(admissionNo)}`);
        if (res.ok) {
          const awsStudent = await res.json();
          if (awsStudent && !awsStudent.deleted) {
            student = awsStudent;
          }
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

    // 2. Verify against seeded/updated DynamoDB credentials (hofis / shibin)
    ADMINS_DB = loadAdminsDb();
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
      loginAlertMessage.textContent = 'Invalid username or password. Please verify and try again.';
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

  // Auto-set today's date & valid departure time (9:30 AM – 3:30 PM)
  const dateInput = document.getElementById('outpassDate');
  const timeInput = document.getElementById('outpassTime');
  const formErrorBox = document.getElementById('outpassFormError');
  const formErrorText = document.getElementById('outpassFormErrorText');

  const showOutpassError = (msg) => {
    if (formErrorBox && formErrorText) {
      formErrorText.textContent = msg;
      formErrorBox.style.display = 'flex';
    } else {
      alert(msg);
    }
  };

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const maxDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const maxDateStr = `${maxDateObj.getFullYear()}-${String(maxDateObj.getMonth() + 1).padStart(2, '0')}-${String(
    maxDateObj.getDate()
  ).padStart(2, '0')}`;

  if (dateInput) {
    dateInput.value = todayStr;
    dateInput.min = todayStr;
    dateInput.max = maxDateStr;
  }
  if (timeInput) {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let defaultMins = Math.max(570, nowMins + 5); // 570 = 09:30 AM
    if (defaultMins > 930) defaultMins = 570; // 930 = 03:30 PM
    const hh = String(Math.floor(defaultMins / 60)).padStart(2, '0');
    const min = String(defaultMins % 60).padStart(2, '0');
    timeInput.value = `${hh}:${min}`;
  }

  // Form Submission -> Validate Guidelines & Send Request to Admin
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (formErrorBox) formErrorBox.style.display = 'none';

    const reason = document.getElementById('outpassReason').value.trim();
    const leaveDate = document.getElementById('outpassDate').value;
    const leaveTimeRaw = document.getElementById('outpassTime').value;
    const parentEmail = document.getElementById('parentEmail').value.trim();
    const phone = document.getElementById('pickupContact').value.trim();

    if (!reason || !leaveDate || !leaveTimeRaw || !parentEmail) return;

    const currentNow = new Date();
    const currentTodayStr = `${currentNow.getFullYear()}-${String(currentNow.getMonth() + 1).padStart(2, '0')}-${String(
      currentNow.getDate()
    ).padStart(2, '0')}`;
    const currentMaxObj = new Date(currentNow.getFullYear(), currentNow.getMonth(), currentNow.getDate() + 2);
    const currentMaxDateStr = `${currentMaxObj.getFullYear()}-${String(currentMaxObj.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(currentMaxObj.getDate()).padStart(2, '0')}`;

    // 1) Check Sunday rule
    const [selY, selM, selD] = leaveDate.split('-').map(Number);
    const selectedDateObj = new Date(selY, selM - 1, selD);
    if (selectedDateObj.getDay() === 0) {
      showOutpassError('Outpass cannot be submitted on Sundays. School is closed on Sunday.');
      return;
    }

    // 2) Check Past Date & Maximum 3 Days rule (Same day, 1 day before, or 2 days before)
    if (leaveDate < currentTodayStr) {
      showOutpassError('Cannot select a departure date that has already passed.');
      return;
    }
    if (leaveDate > currentMaxDateStr) {
      showOutpassError(
        'Outpass can only be submitted for the same day, 1 day before, or 2 days before departure (maximum 3 days).'
      );
      return;
    }

    // 3) Check Departure Time Window (9:30 AM to 3:30 PM -> 570 to 930 mins)
    const [leaveH, leaveM] = leaveTimeRaw.split(':').map(Number);
    const leaveTotalMins = leaveH * 60 + leaveM;
    if (leaveTotalMins < 570 || leaveTotalMins > 930) {
      showOutpassError('Departure time must be strictly between 9:30 AM and 3:30 PM.');
      return;
    }

    // 4) Check Past Time rule (departure date & time already passed)
    const selectedDepartureDateTime = new Date(selY, selM - 1, selD, leaveH, leaveM, 0);
    if (selectedDepartureDateTime <= currentNow) {
      showOutpassError('Cannot select a departure date and time that has already passed.');
      return;
    }

    // 5) Check One Outpass Per Day & Same Departure Date Duplicate Rule
    let currentRequests = loadOutpassRequests();
    try {
      const checkRes = await fetch(`${AWS_API_BASE_URL}/outpasses`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (Array.isArray(checkData.items)) {
          currentRequests = checkData.items;
          saveOutpassRequests(currentRequests);
        }
      }
    } catch (err) {}

    const activeStudentRequests = currentRequests.filter(
      (r) => String(r.admissionNo).trim() === String(student.admissionNo).trim() && r.status !== 'cancelled'
    );

    const sameDepartureDateReq = activeStudentRequests.find((r) => r.leaveDate === leaveDate);
    if (sameDepartureDateReq) {
      showOutpassError(
        `An outpass request (${sameDepartureDateReq.passId}) has already been submitted for ${student.name} for departure date ${leaveDate}. More than one request for the same day is not accepted.`
      );
      return;
    }

    const submittedTodayReq = activeStudentRequests.find((r) => {
      if (r.timestamp && Number(r.timestamp) > 1000000000) {
        const subDt = new Date(Number(r.timestamp));
        const subDateStr = `${subDt.getFullYear()}-${String(subDt.getMonth() + 1).padStart(2, '0')}-${String(
          subDt.getDate()
        ).padStart(2, '0')}`;
        if (subDateStr === currentTodayStr) return true;
      }
      if (r.reqTime && String(r.reqTime).startsWith(currentTodayStr)) {
        return true;
      }
      return false;
    });

    if (submittedTodayReq) {
      showOutpassError(
        `Only one outpass request can be submitted per student per day. A request (${submittedTodayReq.passId}) was already submitted today for ${student.name}.`
      );
      return;
    }

    const randomHex = Math.floor(0x1000 + Math.random() * 0x9000)
      .toString(16)
      .toUpperCase();
    const dateCompact = leaveDate.replace(/-/g, '').slice(2);
    const passCode = `HOFIS-${dateCompact}-${randomHex}`;
    const monthKey = leaveDate.slice(0, 7);

    const formattedLeave = `${leaveDate} ${leaveTimeRaw}`;
    const submitNow = new Date();
    const reqDatePart = `${submitNow.getFullYear()}-${String(submitNow.getMonth() + 1).padStart(2, '0')}-${String(
      submitNow.getDate()
    ).padStart(2, '0')}`;
    const reqTimePart = submitNow.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const reqTimeStr = `${reqDatePart}, ${reqTimePart}`;

    let finalRequest = {
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

    // Send to AWS API Gateway / DynamoDB first and use the returned passId so only 1 entry exists
    try {
      const res = await fetch(`${AWS_API_BASE_URL}/outpasses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passId: passCode,
          admissionNo: student.admissionNo,
          reason,
          reqTime: reqTimeStr,
          leaveDate,
          leaveTimeRaw,
          leaveTime: formattedLeave,
          parentEmail,
          phone
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData && errData.message) {
          showOutpassError(errData.message);
          return;
        }
      } else {
        const awsItem = await res.json();
        if (awsItem && awsItem.passId) {
          finalRequest = awsItem;
        }
      }
    } catch (err) {}

    // Save the single canonical request to local store
    const allRequests = loadOutpassRequests().filter((r) => r.passId !== finalRequest.passId);
    allRequests.unshift(finalRequest);
    saveOutpassRequests(allRequests);

    // Show Submitted Confirmation Card
    const passResult = document.getElementById('passResult');
    if (!passResult) return;

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('ticketPassId', finalRequest.passId);
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

window.toggleAdminSidebar = function (forceState) {
  const layout = document.getElementById('oaLayout');
  if (!layout) return;
  if (window.innerWidth <= 768) {
    if (typeof forceState === 'boolean') {
      layout.classList.toggle('mobile-sidebar-open', forceState);
    } else {
      layout.classList.toggle('mobile-sidebar-open');
    }
  } else {
    layout.classList.toggle('sidebar-collapsed');
  }
};

window.filterAdminTab = function (tab) {
  currentAdminTab = tab;
  currentSearchFilter = '';
  const verifyInput = document.getElementById('verifyPassInput');
  if (verifyInput) verifyInput.value = '';
  const inlineInput = document.getElementById('inlinePassSearchInput');
  if (inlineInput) inlineInput.value = '';

  const layout = document.getElementById('oaLayout');
  if (layout) layout.classList.remove('mobile-sidebar-open');

  const outpassSec = document.getElementById('adminOutpassSection');
  const studentsSec = document.getElementById('adminStudentsSection');
  const mainHeading = document.getElementById('adminMainHeading');
  const mainSubtitle = document.getElementById('adminMainSubtitle');
  const breadcrumb = document.getElementById('adminBreadcrumbCurrent');

  if (outpassSec) outpassSec.style.display = 'block';
  if (studentsSec) studentsSec.style.display = 'none';
  if (mainHeading) mainHeading.textContent = 'Outpass Management';
  if (mainSubtitle) mainSubtitle.textContent = 'Create, review, approve and track student outpass requests.';
  if (breadcrumb) breadcrumb.textContent = 'Outpass Requests';

  document.querySelectorAll('.filter-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  document.querySelectorAll('.oa-nav-link[data-side-tab]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-side-tab') === tab);
  });

  renderAdminTable();
};

window.handleInlinePassSearch = function (val) {
  currentSearchFilter = (val || '').trim();
  const verifyInput = document.getElementById('verifyPassInput');
  if (verifyInput && verifyInput.value !== currentSearchFilter) {
    verifyInput.value = currentSearchFilter;
  }
  renderAdminTable();
};

window.showAdminStudentsSection = function () {
  const layout = document.getElementById('oaLayout');
  if (layout) layout.classList.remove('mobile-sidebar-open');

  const outpassSec = document.getElementById('adminOutpassSection');
  const studentsSec = document.getElementById('adminStudentsSection');
  const mainHeading = document.getElementById('adminMainHeading');
  const mainSubtitle = document.getElementById('adminMainSubtitle');
  const breadcrumb = document.getElementById('adminBreadcrumbCurrent');

  if (outpassSec) outpassSec.style.display = 'none';
  if (studentsSec) studentsSec.style.display = 'block';
  if (mainHeading) mainHeading.textContent = 'Students Database';
  if (mainSubtitle) mainSubtitle.textContent = 'View, search, add, or permanently delete students from the school database.';
  if (breadcrumb) breadcrumb.textContent = 'Students Database';

  document.querySelectorAll('.oa-nav-link[data-side-tab]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-side-tab') === 'students');
  });

  initAdminStudentsDatabase();
  renderAdminStudentsTable();
};

let studentsClassDropdownInitialized = false;

function initAdminStudentsDatabase() {
  const classSelect = document.getElementById('studentDbClassSelect');
  if (!classSelect) return;

  const currentVal = classSelect.value;
  const allStudents = Object.values(STUDENTS_DB);
  const classSet = new Set();
  allStudents.forEach((s) => {
    if (s && s.class) classSet.add(String(s.class).trim());
  });

  const sortedClasses = Array.from(classSet);
  classSelect.innerHTML =
    '<option value="">All Classes (' +
    allStudents.length +
    ' Students)</option>' +
    sortedClasses.map((c) => `<option value="${c}">Class ${c}</option>`).join('');

  if (currentVal && classSet.has(currentVal)) {
    classSelect.value = currentVal;
  }
  studentsClassDropdownInitialized = true;
}

window.deleteStudentRecord = async function (admissionNo) {
  const admKey = String(admissionNo).trim();
  const student = STUDENTS_DB[admKey];
  const studentLabel = student ? `${student.name} (Adm No: ${admKey})` : `Admission No: ${admKey}`;

  if (!confirm(`Are you sure you want to permanently delete student ${studentLabel} from the database?`)) {
    return;
  }

  // 1) Remove from in-memory databases
  delete STUDENTS_DB[admKey];
  if (window.HOFIS_STUDENTS_DB) {
    delete window.HOFIS_STUDENTS_DB[admKey];
  }

  // 2) Persist deletion locally
  const customMap = loadCustomStudents();
  delete customMap[admKey];
  saveCustomStudents(customMap);

  const deletedMap = loadDeletedStudents();
  deletedMap[admKey] = true;
  saveDeletedStudents(deletedMap);

  // 3) Re-render table & class dropdown immediately
  initAdminStudentsDatabase();
  renderAdminStudentsTable();

  // 4) Permanently delete in AWS DynamoDB via DELETE /students/{admissionNo}
  try {
    await fetch(`${AWS_API_BASE_URL}/students/${encodeURIComponent(admKey)}`, {
      method: 'DELETE'
    });
  } catch (err) {}
};

let editingOriginalAdm = null;

window.openAddStudentModal = function () {
  editingOriginalAdm = null;
  const modal = document.getElementById('addStudentModal');
  const modalTitle = document.getElementById('studentModalTitle');
  const submitBtn = document.getElementById('addStudentSubmitBtn');
  const admInput = document.getElementById('newStudentAdm');
  const nameInput = document.getElementById('newStudentName');
  const classInput = document.getElementById('newStudentClass');
  const parentInput = document.getElementById('newStudentParent');
  const alertBox = document.getElementById('addStudentAlertBox');

  if (!modal) return;
  if (modalTitle) modalTitle.textContent = 'Add New Student';
  if (submitBtn) submitBtn.textContent = 'Save Student';
  if (admInput) admInput.value = '';
  if (nameInput) nameInput.value = '';
  if (classInput) classInput.value = '';
  if (parentInput) parentInput.value = '';
  if (alertBox) alertBox.style.display = 'none';

  modal.style.display = 'flex';
  if (admInput) admInput.focus();
};

window.openEditStudentModal = function (admissionNo) {
  const admKey = String(admissionNo).trim();
  const student = STUDENTS_DB[admKey];
  if (!student) return;

  editingOriginalAdm = admKey;
  const modal = document.getElementById('addStudentModal');
  const modalTitle = document.getElementById('studentModalTitle');
  const submitBtn = document.getElementById('addStudentSubmitBtn');
  const admInput = document.getElementById('newStudentAdm');
  const nameInput = document.getElementById('newStudentName');
  const classInput = document.getElementById('newStudentClass');
  const parentInput = document.getElementById('newStudentParent');
  const alertBox = document.getElementById('addStudentAlertBox');

  if (!modal) return;
  if (modalTitle) modalTitle.textContent = 'Edit Student Details';
  if (submitBtn) submitBtn.textContent = 'Update Student';
  if (admInput) admInput.value = student.admissionNo || admKey;
  if (nameInput) nameInput.value = student.name || '';
  if (classInput) classInput.value = student.class || '';
  if (parentInput) parentInput.value = student.parentName || '';
  if (alertBox) alertBox.style.display = 'none';

  modal.style.display = 'flex';
  if (nameInput) nameInput.focus();
};

window.closeAddStudentModal = function () {
  editingOriginalAdm = null;
  const modal = document.getElementById('addStudentModal');
  if (modal) modal.style.display = 'none';
};

window.renderAdminStudentsTable = function () {
  const tbody = document.getElementById('adminStudentsTableBody');
  if (!tbody) return;

  const searchInput = document.getElementById('studentDbSearchInput');
  const classSelect = document.getElementById('studentDbClassSelect');
  const sortSelect = document.getElementById('studentDbSortSelect');
  const totalEl = document.getElementById('studentsTotalCount');
  const showingEl = document.getElementById('studentsShowingCount');

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const classFilter = classSelect ? classSelect.value : '';
  const sortBy = sortSelect ? sortSelect.value : 'adm';

  const allStudents = Object.values(STUDENTS_DB);
  if (totalEl) totalEl.textContent = allStudents.length;

  let filtered = allStudents.filter((s) => {
    if (!s) return false;
    if (classFilter && String(s.class).trim() !== classFilter) return false;
    if (query) {
      const adm = String(s.admissionNo || '').toLowerCase();
      const name = String(s.name || '').toLowerCase();
      const cls = String(s.class || '').toLowerCase();
      const parent = String(s.parentName || '').toLowerCase();
      return adm.includes(query) || name.includes(query) || cls.includes(query) || parent.includes(query);
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'name') {
      return String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (sortBy === 'class') {
      return String(a.class || '').localeCompare(String(b.class || ''));
    }
    const numA = parseInt(a.admissionNo, 10);
    const numB = parseInt(b.admissionNo, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a.admissionNo || '').localeCompare(String(b.admissionNo || ''));
  });

  if (showingEl) showingEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 32px; color:#64748b;">
          No students found matching your search filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (s, idx) => `
      <tr>
        <td data-label="#"><strong>${idx + 1}</strong></td>
        <td data-label="Admission No"><span class="pass-id-pill">${s.admissionNo}</span></td>
        <td data-label="Student Name"><div class="student-cell-name">${s.name}</div></td>
        <td data-label="Class"><span class="status-pill status-exited">Class ${s.class}</span></td>
        <td data-label="Father / Parent Name"><div class="guardian-name">${s.parentName || '--'}</div></td>
        <td data-label="Action" class="td-actions">
          <div class="action-buttons">
            <button type="button" class="btn-action btn-email" onclick="openEditStudentModal('${s.admissionNo}')" title="Edit student details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit
            </button>
            <button type="button" class="btn-action btn-revoke" onclick="deleteStudentRecord('${s.admissionNo}')" title="Permanently delete student">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');
};

const SCHOOL_COPY_EMAIL = 'hofiselangoi@gmail.com';

/**
 * Display automatic email delivery status banner in Admin Console
 */
function showEmailStatusBanner(item, status, emailResult) {
  const recipient = item.parentEmail || 'parent@example.com';
  const isApproved = status === 'approved';
  const statusLabel = isApproved ? 'APPROVED' : 'CANCELLED';
  const targetDisplay = isApproved
    ? `parent email <strong>${recipient}</strong> and <strong>${SCHOOL_COPY_EMAIL}</strong>`
    : `parent email <strong>${recipient}</strong>`;

  const banner = document.getElementById('adminEmailBanner');
  const bannerText = document.getElementById('adminEmailBannerText');

  if (!banner || !bannerText) return;

  banner.style.display = 'flex';
  if (emailResult && emailResult.sent) {
    banner.style.background = '#ecfdf5';
    banner.style.borderColor = '#a7f3d0';
    banner.style.color = '#065f46';
    bannerText.innerHTML = `<strong>✓ Outpass ${statusLabel}:</strong> Email automatically sent from <strong>${ADMIN_SENDER_EMAIL}</strong> to ${targetDisplay}.`;
  } else {
    banner.style.background = isApproved ? '#ecfdf5' : '#fef2f2';
    banner.style.borderColor = isApproved ? '#a7f3d0' : '#fecaca';
    banner.style.color = isApproved ? '#065f46' : '#991b1b';
    const errReason = emailResult && emailResult.error ? ` (${emailResult.error})` : '';
    bannerText.innerHTML = `<strong>✓ Outpass ${statusLabel}:</strong> Automatic email from <strong>${ADMIN_SENDER_EMAIL}</strong> to ${targetDisplay} triggered${errReason}.`;
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

  let emailNotification = null;

  // Trigger AWS Lambda automatic email (Nodemailer Gmail SMTP / Amazon SES) from shibinsajip@gmail.com
  try {
    const res = await fetch(`${AWS_API_BASE_URL}/outpasses/${encodeURIComponent(passId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      const data = await res.json();
      emailNotification = data.emailNotification || null;
    }
  } catch (err) {}

  if (newStatus === 'approved' || newStatus === 'cancelled') {
    showEmailStatusBanner(item, newStatus, emailNotification);
  }
};

window.sendPassEmail = async function (passId) {
  ADMIN_REQUESTS = loadOutpassRequests();
  const item = ADMIN_REQUESTS.find((r) => r.passId === passId);
  if (!item) return;
  const targetStatus = item.status === 'cancelled' ? 'cancelled' : 'approved';
  await window.markPassStatus(passId, targetStatus);
};

/**
 * Delete a single Outpass Request by passId
 */
window.deleteOutpassRequest = async function (passId) {
  if (!confirm(`Are you sure you want to delete request ${passId}?`)) {
    return;
  }

  ADMIN_REQUESTS = loadOutpassRequests().filter((r) => r.passId !== passId);
  saveOutpassRequests(ADMIN_REQUESTS);
  updateAdminCounts();
  renderAdminTable();

  try {
    await fetch(`${AWS_API_BASE_URL}/outpasses/${encodeURIComponent(passId)}`, {
      method: 'DELETE'
    });
  } catch (err) {}
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
        (r.passId || '').toLowerCase().includes(q) ||
        (r.admissionNo || '').toLowerCase().includes(q) ||
        (r.studentName || '').toLowerCase().includes(q) ||
        (r.guardian || '').toLowerCase().includes(q) ||
        (r.parentEmail || '').toLowerCase().includes(q)
      );
    }
    if (currentAdminTab === 'all') return true;
    return r.status === currentAdminTab;
  });

  rows.sort((a, b) => (sortOrder === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding: 0; border-bottom: none;">
          <div class="oa-empty-state">
            <div class="oa-empty-title">No outpass requests found</div>
            <div class="oa-empty-sub">There are no records to display for the selected filters.</div>
            <a href="index.html" class="oa-btn-create-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create New Outpass
            </a>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      let submittedDateTime = r.reqTime || '--';
      if (r.timestamp && Number(r.timestamp) > 1000000000) {
        const dt = new Date(Number(r.timestamp));
        const dStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
          dt.getDate()
        ).padStart(2, '0')}`;
        const tStr = dt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        submittedDateTime = `${dStr}, ${tStr}`;
      }

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

      const deleteBtnHtml = `
        <button type="button" class="btn-action btn-revoke" onclick="deleteOutpassRequest('${r.passId}')" title="Delete this request">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      `;

      let actionBtns = '';
      if (r.status === 'pending') {
        actionBtns = `
          <button type="button" class="btn-action btn-approve" onclick="markPassStatus('${r.passId}', 'approved')">Approve</button>
          <button type="button" class="btn-action btn-revoke" onclick="markPassStatus('${r.passId}', 'cancelled')">Cancel</button>
          ${deleteBtnHtml}
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
          ${deleteBtnHtml}
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
          ${deleteBtnHtml}
        `;
      }

      const emailLine = r.parentEmail
        ? `<div style="font-size:11.5px; color:#0284c7; margin-top:2px;">✉ ${r.parentEmail}</div>`
        : '';

      return `
        <tr>
          <td data-label="Pass ID">
            <span class="pass-id-pill">${r.passId}</span>
          </td>
          <td data-label="Student Details">
            <div class="student-cell-name">${r.studentName}</div>
            <div class="student-cell-meta">Adm: <strong>${r.admissionNo}</strong> &bull; ${r.classSection}</div>
          </td>
          <td data-label="Submitted">
            <div style="font-weight:600; color:#334155; font-size:12.5px;">${submittedDateTime}</div>
          </td>
          <td data-label="Leave Time">
            <div class="schedule-leave">${r.leaveTime}</div>
          </td>
          <td data-label="Reason" class="reason-cell">${r.reason}</td>
          <td data-label="Guardian & Email">
            <div class="guardian-name">${r.guardian}</div>
            <div class="guardian-phone">
              <svg viewBox="0 0 24 24" fill="currentColor" class="phone-icon">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              ${r.phone || '--'}
            </div>
            ${emailLine}
          </td>
          <td data-label="Status">${statusBadge}</td>
          <td data-label="Actions" class="td-actions">
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
      if (Array.isArray(data.items)) {
        const sorted = data.items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        saveOutpassRequests(sorted);
        updateAdminCounts();
        renderAdminTable();
      }
    }
  } catch (err) {}
}

window.openChangePasswordModal = function () {
  const layout = document.getElementById('oaLayout');
  if (layout) layout.classList.remove('mobile-sidebar-open');
  const modal = document.getElementById('changePasswordModal');
  const cpUsername = document.getElementById('cpUsername');
  const cpCurrent = document.getElementById('cpCurrentPassword');
  const cpNew = document.getElementById('cpNewPassword');
  const cpConfirm = document.getElementById('cpConfirmPassword');
  const cpAlert = document.getElementById('cpAlertBox');

  if (!modal) return;
  const loggedInAdmin = sessionStorage.getItem('adminUser') || 'hofis';
  if (cpUsername) cpUsername.value = loggedInAdmin;
  if (cpCurrent) cpCurrent.value = '';
  if (cpNew) cpNew.value = '';
  if (cpConfirm) cpConfirm.value = '';
  if (cpAlert) cpAlert.style.display = 'none';

  modal.style.display = 'flex';
  if (cpCurrent) cpCurrent.focus();
};

window.closeChangePasswordModal = function () {
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.style.display = 'none';
};

window.adminSignOut = function () {
  try {
    sessionStorage.removeItem('adminUser');
    sessionStorage.removeItem('cognitoToken');
    localStorage.removeItem('adminUser');
  } catch (e) {}
  window.location.replace('index.html#login');
};

function initAdminConsole() {
  const loggedInAdmin = sessionStorage.getItem('adminUser');
  if (!loggedInAdmin) {
    window.location.replace('index.html#login');
    return;
  }

  const verifyForm = document.getElementById('verifyPassForm');
  const verifyInput = document.getElementById('verifyPassInput');
  const deleteMonthInput = document.getElementById('deleteMonthInput');
  const adminUserLabel = document.getElementById('adminUserLabel');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const addStudentForm = document.getElementById('addStudentForm');

  if (adminUserLabel) {
    adminUserLabel.textContent = `Administrator (${loggedInAdmin})`;
  }

  if (addStudentForm) {
    addStudentForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const admNo = document.getElementById('newStudentAdm').value.trim();
      const name = document.getElementById('newStudentName').value.trim().toUpperCase();
      const cls = document.getElementById('newStudentClass').value.trim().toUpperCase();
      const parentName = document.getElementById('newStudentParent').value.trim().toUpperCase();
      const alertBox = document.getElementById('addStudentAlertBox');
      const submitBtn = document.getElementById('addStudentSubmitBtn');

      const showAddAlert = (msg, isSuccess) => {
        if (!alertBox) return;
        alertBox.style.display = 'block';
        alertBox.style.background = isSuccess ? '#ecfdf5' : '#fef2f2';
        alertBox.style.border = isSuccess ? '1px solid #a7f3d0' : '1px solid #fecaca';
        alertBox.style.color = isSuccess ? '#065f46' : '#991b1b';
        alertBox.textContent = msg;
      };

      if (!admNo || !name || !cls || !parentName) {
        showAddAlert('All student fields are required.', false);
        return;
      }

      const isEditing = Boolean(editingOriginalAdm);

      if (!isEditing && STUDENTS_DB[admNo]) {
        showAddAlert(`Admission Number '${admNo}' already exists for ${STUDENTS_DB[admNo].name}.`, false);
        return;
      }

      if (isEditing && admNo !== editingOriginalAdm && STUDENTS_DB[admNo]) {
        showAddAlert(`Admission Number '${admNo}' already exists for ${STUDENTS_DB[admNo].name}.`, false);
        return;
      }

      const newStudentRecord = {
        admissionNo: admNo,
        name: name,
        class: cls,
        parentName: parentName
      };

      if (submitBtn) submitBtn.disabled = true;

      const customMap = loadCustomStudents();
      const deletedMap = loadDeletedStudents();

      // If Admission Number was changed while editing, remove the old Admission Number first
      if (isEditing && admNo !== editingOriginalAdm) {
        delete STUDENTS_DB[editingOriginalAdm];
        if (window.HOFIS_STUDENTS_DB) {
          delete window.HOFIS_STUDENTS_DB[editingOriginalAdm];
        }
        delete customMap[editingOriginalAdm];
        deletedMap[editingOriginalAdm] = true;

        try {
          await fetch(`${AWS_API_BASE_URL}/students/${encodeURIComponent(editingOriginalAdm)}`, {
            method: 'DELETE'
          });
        } catch (err) {}
      }

      // 1) Save in local memory & localStorage
      STUDENTS_DB[admNo] = newStudentRecord;
      if (window.HOFIS_STUDENTS_DB) {
        window.HOFIS_STUDENTS_DB[admNo] = newStudentRecord;
      }

      customMap[admNo] = newStudentRecord;
      saveCustomStudents(customMap);

      if (deletedMap[admNo]) {
        delete deletedMap[admNo];
      }
      saveDeletedStudents(deletedMap);

      // 2) Save / update in AWS DynamoDB via POST /students
      try {
        await fetch(`${AWS_API_BASE_URL}/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newStudentRecord)
        });
      } catch (err) {}

      if (submitBtn) submitBtn.disabled = false;
      initAdminStudentsDatabase();
      renderAdminStudentsTable();
      showAddAlert(
        isEditing
          ? `Student '${name}' (Adm No: ${admNo}) updated in database!`
          : `Student '${name}' (Adm No: ${admNo}) added to database!`,
        true
      );

      setTimeout(() => {
        window.closeAddStudentModal();
      }, 900);
    });
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const username = document.getElementById('cpUsername').value.trim();
      const currentPassword = document.getElementById('cpCurrentPassword').value;
      const newPassword = document.getElementById('cpNewPassword').value;
      const confirmPassword = document.getElementById('cpConfirmPassword').value;
      const cpAlert = document.getElementById('cpAlertBox');
      const cpSubmitBtn = document.getElementById('cpSubmitBtn');

      const showCpAlert = (msg, isSuccess) => {
        if (!cpAlert) return;
        cpAlert.style.display = 'block';
        cpAlert.style.background = isSuccess ? '#ecfdf5' : '#fef2f2';
        cpAlert.style.border = isSuccess ? '1px solid #a7f3d0' : '1px solid #fecaca';
        cpAlert.style.color = isSuccess ? '#065f46' : '#991b1b';
        cpAlert.textContent = msg;
      };

      if (newPassword !== confirmPassword) {
        showCpAlert('New password and confirm password do not match.', false);
        return;
      }

      ADMINS_DB = loadAdminsDb();
      const localRecord = ADMINS_DB[username];
      let updatedOnAws = false;

      if (cpSubmitBtn) cpSubmitBtn.disabled = true;

      // 1) Update in AWS DynamoDB (HofisAdmins) & AWS Cognito via POST /auth/change-password
      try {
        const res = await fetch(`${AWS_API_BASE_URL}/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, currentPassword, newPassword })
        });
        if (res.ok) {
          updatedOnAws = true;
        } else if (res.status === 401) {
          if (cpSubmitBtn) cpSubmitBtn.disabled = false;
          showCpAlert('Current password is incorrect.', false);
          return;
        }
      } catch (err) {}

      // 2) Verify current password locally if AWS wasn't reached
      if (!updatedOnAws) {
        if (!localRecord || localRecord.password !== currentPassword) {
          if (cpSubmitBtn) cpSubmitBtn.disabled = false;
          showCpAlert('Current password is incorrect.', false);
          return;
        }
      }

      // 3) Save updated password in local ADMINS_DB as well
      ADMINS_DB[username] = {
        username,
        password: newPassword,
        role: `Administrator (${username})`
      };
      saveAdminsDb(ADMINS_DB);

      if (cpSubmitBtn) cpSubmitBtn.disabled = false;
      showCpAlert(`Password for '${username}' has been updated in the database!`, true);
      setTimeout(() => {
        window.closeChangePasswordModal();
      }, 1200);
    });
  }

  if (deleteMonthInput) {
    deleteMonthInput.value = '2026-11';
  }

  ADMIN_REQUESTS = loadOutpassRequests();
  // If there are pending requests submitted by parents, switch to Pending tab automatically
  const hasPending = ADMIN_REQUESTS.some((r) => r.status === 'pending');
  if (hasPending) {
    currentAdminTab = 'pending';
  }

  document.querySelectorAll('.filter-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === currentAdminTab);
  });
  document.querySelectorAll('.oa-nav-link[data-side-tab]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-side-tab') === currentAdminTab);
  });

  updateAdminCounts();
  renderAdminTable();
  syncAdminRequestsFromAws();

  if (verifyForm && verifyInput) {
    verifyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const outpassSec = document.getElementById('adminOutpassSection');
      const studentsSec = document.getElementById('adminStudentsSection');
      if (outpassSec) outpassSec.style.display = 'block';
      if (studentsSec) studentsSec.style.display = 'none';
      currentSearchFilter = verifyInput.value.trim();
      const inlineInput = document.getElementById('inlinePassSearchInput');
      if (inlineInput && inlineInput.value !== currentSearchFilter) {
        inlineInput.value = currentSearchFilter;
      }
      renderAdminTable();
    });

    verifyInput.addEventListener('input', function () {
      currentSearchFilter = verifyInput.value.trim();
      const inlineInput = document.getElementById('inlinePassSearchInput');
      if (inlineInput && inlineInput.value !== currentSearchFilter) {
        inlineInput.value = currentSearchFilter;
      }
      renderAdminTable();
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        verifyInput.focus();
      }
    });
  }

  if (window.location.hash === '#students') {
    window.showAdminStudentsSection();
  }
}

async function ensureAwsDatabaseSeeded() {
  if (localStorage.getItem('hofis_aws_seeded_v2') === 'true') return;
  try {
    const res = await fetch(`${AWS_API_BASE_URL}/seed`, { method: 'POST' });
    if (res.ok) {
      localStorage.setItem('hofis_aws_seeded_v2', 'true');
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
  } else if (window.location.hash === '#helpdesk') {
    window.switchView('helpdesk');
  } else if (window.location.hash === '#guidelines') {
    window.switchView('guidelines');
  }
});
