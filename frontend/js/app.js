/**
 * Holy Family International School (HOFIS) - Parent Outpass Portal
 * Multi-Step Centered Flow with Duplicate & Status Detection
 */

document.addEventListener("DOMContentLoaded", () => {
  // Navigation State
  let currentStep = 1;
  let activeStudent = null;
  let studentOutpasses = [];

  // DOM Views
  const stepViews = {
    1: document.getElementById("stepView1"),
    2: document.getElementById("stepView2"),
    3: document.getElementById("stepView3"),
    4: document.getElementById("stepView4")
  };

  const progressDots = {
    1: document.getElementById("dot1"),
    2: document.getElementById("dot2"),
    3: document.getElementById("dot3"),
    4: document.getElementById("dot4")
  };

  // Step 1 Elements
  const formStep1 = document.getElementById("formStep1");
  const admissionInput = document.getElementById("admissionInput");
  const btnSearch = document.getElementById("btnSearch");
  const step1Alert = document.getElementById("step1Alert");

  // Step 2 Elements (Read-only)
  const viewStudentName = document.getElementById("viewStudentName");
  const viewAdmissionNo = document.getElementById("viewAdmissionNo");
  const viewFatherName = document.getElementById("viewFatherName");
  const viewClassDiv = document.getElementById("viewClassDiv");
  const step2ExistingAlert = document.getElementById("step2ExistingAlert");
  const step2HistorySummary = document.getElementById("step2HistorySummary");
  const step2HistoryList = document.getElementById("step2HistoryList");
  const btnConfirmStudent = document.getElementById("btnConfirmStudent");
  const btnBackToStep1 = document.getElementById("btnBackToStep1");

  // Step 3 Elements
  const formOutpass = document.getElementById("formOutpass");
  const outpassStudentBadge = document.getElementById("outpassStudentBadge");
  const reasonInput = document.getElementById("reasonInput");
  const leaveTimeInput = document.getElementById("leaveTimeInput");
  const leaveTimeError = document.getElementById("leaveTimeError");
  const parentEmailInput = document.getElementById("parentEmailInput");
  const btnSubmitOutpass = document.getElementById("btnSubmitOutpass");
  const btnBackToStep2 = document.getElementById("btnBackToStep2");

  // Step 3 Existing Pass Card Elements
  const existingPassCard = document.getElementById("existingPassCard");
  const existingPassIcon = document.getElementById("existingPassIcon");
  const existingPassHeading = document.getElementById("existingPassHeading");
  const existingPassStatusPill = document.getElementById("existingPassStatusPill");
  const existingPassMsg = document.getElementById("existingPassMsg");
  const existingPassId = document.getElementById("existingPassId");
  const existingPassTime = document.getElementById("existingPassTime");
  const existingPassReason = document.getElementById("existingPassReason");
  const existingPassStatusText = document.getElementById("existingPassStatusText");
  const existingPassNotice = document.getElementById("existingPassNotice");

  // Step 4 Elements (Confirmation)
  const confirmEmailDisplay = document.getElementById("confirmEmailDisplay");
  const confirmOutpassId = document.getElementById("confirmOutpassId");
  const confirmStudentName = document.getElementById("confirmStudentName");
  const confirmLeaveTime = document.getElementById("confirmLeaveTime");
  const btnResetAll = document.getElementById("btnResetAll");

  // Function to navigate between steps smoothly
  function goToStep(step) {
    currentStep = step;

    // Toggle views
    Object.keys(stepViews).forEach((s) => {
      if (parseInt(s, 10) === step) {
        stepViews[s].classList.add("active-view");
      } else {
        stepViews[s].classList.remove("active-view");
      }
    });

    // Update progress dots
    Object.keys(progressDots).forEach((s) => {
      const sNum = parseInt(s, 10);
      progressDots[s].classList.remove("active", "completed");
      if (sNum === step) {
        progressDots[s].classList.add("active");
      } else if (sNum < step) {
        progressDots[s].classList.add("completed");
      }
    });

    // Refresh datetime constraints when entering step 3
    if (step === 3) {
      initDateTimePicker();
      checkExistingPassForSelectedDate();
    }
  }

  // Format local Date object to YYYY-MM-DDTHH:mm string for datetime-local
  function toLocalISOString(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  // Initialize DateTime Picker with local datetime string & 7-day limits
  function initDateTimePicker() {
    const now = new Date();
    const minTime = toLocalISOString(now);
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // exactly 7 days
    const maxTime = toLocalISOString(maxDate);

    // Default departure time suggested is 15 minutes ahead of current time
    const defaultDeparture = new Date(now.getTime() + 15 * 60 * 1000);
    leaveTimeInput.value = toLocalISOString(defaultDeparture);
    leaveTimeInput.min = minTime;
    leaveTimeInput.max = maxTime;
    hideLeaveTimeError();
  }
  initDateTimePicker();

  // Validate departure date & time
  function validateDepartureDateTime(val) {
    if (!val) {
      return { valid: false, message: "Please select the date and time of departure." };
    }
    const selectedDate = new Date(val);
    const selectedTime = selectedDate.getTime();
    if (isNaN(selectedTime)) {
      return { valid: false, message: "Invalid date or time." };
    }

    const now = new Date();
    const nowTime = now.getTime();

    // If selected time is in the past
    if (selectedTime < nowTime) {
      const selectedDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      if (selectedDay < today) {
        return {
          valid: false,
          message: "Departure date cannot be a previous day. Please choose today or an upcoming date."
        };
      } else {
        return {
          valid: false,
          message: "Departure time cannot be in the past. If applying for today, the time must be in the future (e.g., at 10:00 AM you cannot apply for 9:59 AM)."
        };
      }
    }

    const maxAllowedTime = nowTime + 7 * 24 * 60 * 60 * 1000;
    if (selectedTime > maxAllowedTime) {
      return {
        valid: false,
        message: "Outpass can only be applied up to 7 days in advance."
      };
    }

    return { valid: true };
  }

  function showLeaveTimeError(msg) {
    if (!leaveTimeError) return;
    leaveTimeError.textContent = msg;
    leaveTimeError.style.display = "block";
    leaveTimeInput.classList.add("is-invalid");
  }

  function hideLeaveTimeError() {
    if (!leaveTimeError) return;
    leaveTimeError.style.display = "none";
    leaveTimeInput.classList.remove("is-invalid");
  }

  // Check if an outpass already exists for the student on the selected calendar date
  function checkExistingPassForSelectedDate() {
    if (!activeStudent || !leaveTimeInput || !leaveTimeInput.value) {
      hideExistingPassCard();
      return;
    }

    const selectedVal = leaveTimeInput.value;
    const selectedDateKey = window.apiService.getLocalDateKey(selectedVal);
    if (!selectedDateKey) {
      hideExistingPassCard();
      return;
    }

    // Find all outpasses for this student on the selected calendar date
    const matching = studentOutpasses.filter((item) => {
      const itemDateKey = window.apiService.getLocalDateKey(item.leaveDateTime);
      return itemDateKey === selectedDateKey;
    });

    if (matching.length === 0) {
      hideExistingPassCard();
      return;
    }

    // Prioritize display: APPROVED (1) > PENDING (2) > EXITED (3) > CANCELLED / REJECTED (4)
    const priority = { APPROVED: 1, PENDING: 2, EXITED: 3, REJECTED: 4, CANCELLED: 5 };
    matching.sort((a, b) => {
      const pA = priority[a.status] || 99;
      const pB = priority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const topMatch = matching[0];
    showExistingPassCard(topMatch, selectedVal);
  }

  // Display the status message card for the already submitted outpass
  function showExistingPassCard(pass, selectedVal) {
    if (!existingPassCard) return;

    const d = new Date(pass.leaveDateTime || selectedVal);
    const formattedDate = !isNaN(d.getTime())
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : selectedVal;
    const formattedTime = !isNaN(d.getTime())
      ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
      : "";

    if (existingPassId) existingPassId.textContent = pass.outpassId;
    if (existingPassTime) existingPassTime.textContent = `${formattedDate} at ${formattedTime}`;
    if (existingPassReason) existingPassReason.textContent = pass.reason || "N/A";
    if (existingPassStatusText) existingPassStatusText.textContent = pass.status;

    // Reset base classes
    existingPassCard.className = "existing-pass-card";
    if (existingPassStatusPill) existingPassStatusPill.className = "status-pill";

    const st = (pass.status || "PENDING").toUpperCase();

    if (st === "PENDING") {
      existingPassCard.classList.add("is-pending");
      if (existingPassStatusPill) {
        existingPassStatusPill.classList.add("status-pending");
        existingPassStatusPill.innerHTML = `<span>⏳</span><span>PENDING</span>`;
      }
      if (existingPassIcon) existingPassIcon.textContent = "⏳";
      if (existingPassHeading) existingPassHeading.textContent = "Outpass Already Submitted for this Date";
      if (existingPassMsg) {
        existingPassMsg.innerHTML = `An outpass has already been submitted for <strong>${activeStudent.studentName}</strong> on <strong>${formattedDate}</strong> with status: <strong style="color: #b45309;">PENDING</strong>.`;
      }
      if (existingPassStatusText) existingPassStatusText.style.color = "#b45309";
      if (existingPassNotice) {
        existingPassNotice.innerHTML = `⚠️ <em>This request is currently awaiting school administration approval. A duplicate outpass cannot be submitted for the same day while a request is pending.</em>`;
      }

      // Block duplicate submission
      btnSubmitOutpass.disabled = true;
      btnSubmitOutpass.style.opacity = "0.6";
      btnSubmitOutpass.style.cursor = "not-allowed";
      btnSubmitOutpass.innerHTML = `⚠️ Outpass Already Pending for this Date`;

    } else if (st === "APPROVED") {
      existingPassCard.classList.add("is-approved");
      if (existingPassStatusPill) {
        existingPassStatusPill.classList.add("status-approved");
        existingPassStatusPill.innerHTML = `<span>✅</span><span>APPROVED</span>`;
      }
      if (existingPassIcon) existingPassIcon.textContent = "✅";
      if (existingPassHeading) existingPassHeading.textContent = "Outpass Already Approved for this Date";
      if (existingPassMsg) {
        existingPassMsg.innerHTML = `An outpass has already been approved for <strong>${activeStudent.studentName}</strong> on <strong>${formattedDate}</strong> with status: <strong style="color: #047857;">APPROVED</strong>.`;
      }
      if (existingPassStatusText) existingPassStatusText.style.color = "#047857";
      if (existingPassNotice) {
        existingPassNotice.innerHTML = `🛡️ <em>An approved outpass is already active for this date. Please display Outpass ID <strong>${pass.outpassId}</strong> to the security guard at the gate. Duplicate requests are not permitted.</em>`;
      }

      // Block duplicate submission
      btnSubmitOutpass.disabled = true;
      btnSubmitOutpass.style.opacity = "0.6";
      btnSubmitOutpass.style.cursor = "not-allowed";
      btnSubmitOutpass.innerHTML = `✅ Outpass Already Approved for this Date`;

    } else if (st === "CANCELLED" || st === "REJECTED") {
      existingPassCard.classList.add("is-cancelled");
      if (existingPassStatusPill) {
        existingPassStatusPill.classList.add("status-cancelled");
        existingPassStatusPill.innerHTML = `<span>❌</span><span>CANCELLED</span>`;
      }
      if (existingPassIcon) existingPassIcon.textContent = "❌";
      if (existingPassHeading) existingPassHeading.textContent = "Previous Outpass was Cancelled / Rejected";
      if (existingPassMsg) {
        existingPassMsg.innerHTML = `A previous outpass request for <strong>${activeStudent.studentName}</strong> on <strong>${formattedDate}</strong> was marked with status: <strong style="color: #b91c1c;">CANCELLED</strong>.`;
      }
      if (existingPassStatusText) existingPassStatusText.style.color = "#b91c1c";
      if (existingPassNotice) {
        existingPassNotice.innerHTML = `ℹ️ <em>Since the previous pass was cancelled, you may proceed to submit a new outpass request below.</em>`;
      }

      // Allow submitting a new request
      btnSubmitOutpass.disabled = false;
      btnSubmitOutpass.style.opacity = "1";
      btnSubmitOutpass.style.cursor = "pointer";
      btnSubmitOutpass.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Submit New Outpass Request
      `;

    } else if (st === "EXITED") {
      existingPassCard.classList.add("is-exited");
      if (existingPassStatusPill) {
        existingPassStatusPill.classList.add("status-exited");
        existingPassStatusPill.innerHTML = `<span>🚪</span><span>EXITED</span>`;
      }
      if (existingPassIcon) existingPassIcon.textContent = "🚪";
      if (existingPassHeading) existingPassHeading.textContent = "Student Already Exited School Gate";
      if (existingPassMsg) {
        existingPassMsg.innerHTML = `The student has already departed the school under Outpass ID <strong>${pass.outpassId}</strong> on <strong>${formattedDate}</strong> with status: <strong style="color: #0284c7;">EXITED</strong>.`;
      }
      if (existingPassStatusText) existingPassStatusText.style.color = "#0284c7";
      if (existingPassNotice) {
        existingPassNotice.innerHTML = `🚪 <em>This outpass has already been fully utilized and completed at the gate.</em>`;
      }

      // Block submission
      btnSubmitOutpass.disabled = true;
      btnSubmitOutpass.style.opacity = "0.6";
      btnSubmitOutpass.style.cursor = "not-allowed";
      btnSubmitOutpass.innerHTML = `🚪 Student Already Exited on this Date`;
    }

    existingPassCard.style.display = "block";
  }

  function hideExistingPassCard() {
    if (existingPassCard) existingPassCard.style.display = "none";

    // Restore submit button to normal active state
    btnSubmitOutpass.disabled = false;
    btnSubmitOutpass.style.opacity = "1";
    btnSubmitOutpass.style.cursor = "pointer";
    btnSubmitOutpass.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      Submit Outpass Request
    `;
  }

  // Populate Step 2 with ONLY the single last submitted outpass (approved, pending, or cancelled)
  function updateStep2HistoryBanner() {
    if (!step2ExistingAlert) return;

    if (!studentOutpasses || studentOutpasses.length === 0) {
      step2ExistingAlert.style.display = "none";
      return;
    }

    // Filter to valid outpasses with known status (approved, pending, cancelled, etc.)
    const validOutpasses = studentOutpasses.filter(
      (o) =>
        o &&
        o.status &&
        ["APPROVED", "PENDING", "CANCELLED", "REJECTED", "EXITED"].includes(
          o.status.toUpperCase()
        )
    );

    if (validOutpasses.length === 0) {
      step2ExistingAlert.style.display = "none";
      return;
    }

    // Sort newest first by creation / update timestamp
    validOutpasses.sort(
      (a, b) =>
        new Date(b.createdAt || b.updatedAt || 0) -
        new Date(a.createdAt || a.updatedAt || 0)
    );

    // ONLY show the single last submitted outpass
    const lastPass = validOutpasses[0];

    const d = new Date(lastPass.leaveDateTime);
    const dtStr = !isNaN(d.getTime())
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        ", " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
      : "N/A";

    const st = (lastPass.status || "PENDING").toUpperCase();
    const pillClass =
      st === "APPROVED"
        ? "status-approved"
        : st === "CANCELLED" || st === "REJECTED"
        ? "status-cancelled"
        : st === "EXITED"
        ? "status-exited"
        : "status-pending";
    const icon =
      st === "APPROVED"
        ? "✅"
        : st === "CANCELLED" || st === "REJECTED"
        ? "❌"
        : st === "EXITED"
        ? "🚪"
        : "⏳";

    let statusDisplayLabel = st;
    if (st === "REJECTED") statusDisplayLabel = "CANCELLED";

    if (step2HistorySummary) {
      step2HistorySummary.innerHTML = `Last Submitted Outpass`;
    }

    if (step2HistoryList) {
      step2HistoryList.innerHTML = `
        <div class="history-item-row">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <strong style="color: var(--primary); font-family: monospace;">${lastPass.outpassId}</strong>
            <span style="color: var(--text-muted); margin-left: 6px; font-size: 0.74rem;">Leave: <strong>${dtStr}</strong></span>
          </div>
          <span class="status-pill ${pillClass}">
            <span>${icon}</span>
            <span>${statusDisplayLabel}</span>
          </span>
        </div>
      `;
    }

    step2ExistingAlert.style.display = "block";
  }

  // Date picker change & input listeners
  leaveTimeInput.addEventListener("change", () => {
    const res = validateDepartureDateTime(leaveTimeInput.value);
    if (!res.valid) {
      showLeaveTimeError(res.message);
      hideExistingPassCard();
    } else {
      hideLeaveTimeError();
      checkExistingPassForSelectedDate();
    }
  });

  leaveTimeInput.addEventListener("input", () => {
    hideLeaveTimeError();
    checkExistingPassForSelectedDate();
  });

  // Helper: Show/Hide Step 1 alert
  function showStep1Error(msg) {
    step1Alert.textContent = msg;
    step1Alert.style.display = "flex";
  }
  function hideStep1Error() {
    step1Alert.style.display = "none";
  }

  // Step 1: Search Admission Number
  async function handleSearch() {
    const admissionNo = admissionInput.value.trim();
    if (!admissionNo) {
      showStep1Error("Please enter a student admission number.");
      admissionInput.focus();
      return;
    }

    hideStep1Error();
    btnSearch.disabled = true;
    btnSearch.innerHTML = `<span class="spinner"></span> Searching...`;

    try {
      const student = await window.apiService.getStudentByAdmissionNumber(admissionNo);
      activeStudent = student;

      // Fetch existing outpasses for this student
      try {
        studentOutpasses = await window.apiService.getOutpassesForStudent(student.admissionNumber);
      } catch (e) {
        console.warn("Could not load outpass history:", e);
        studentOutpasses = [];
      }

      // Populate Step 2 (Read-only presentation)
      viewStudentName.textContent = student.studentName || "N/A";
      viewAdmissionNo.textContent = student.admissionNumber || admissionNo;
      viewFatherName.textContent = student.fatherName || "N/A";
      viewClassDiv.textContent = `Class ${student.class} - Division ${student.division}`;

      // Update Step 2 History Summary
      updateStep2HistoryBanner();

      // Move to Step 2
      goToStep(2);
    } catch (err) {
      activeStudent = null;
      studentOutpasses = [];
      showStep1Error(err.message || `Student with admission number "${admissionNo}" not found.`);
    } finally {
      btnSearch.disabled = false;
      btnSearch.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Search Student
      `;
    }
  }

  // Search form submit & click
  formStep1.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSearch();
  });

  admissionInput.addEventListener("input", () => {
    hideStep1Error();
  });

  // Step 2: Confirm Student & proceed to Step 3
  btnConfirmStudent.addEventListener("click", () => {
    if (!activeStudent) {
      goToStep(1);
      return;
    }

    // Populate Step 3 header badge
    outpassStudentBadge.textContent = `${activeStudent.studentName} (${activeStudent.admissionNumber}) • Class ${activeStudent.class}-${activeStudent.division}`;

    // Auto-fill parent email if already available, or focus email field
    if (activeStudent.contactEmail) {
      parentEmailInput.value = activeStudent.contactEmail;
    }

    goToStep(3);
  });

  // Back to Step 1
  btnBackToStep1.addEventListener("click", () => {
    goToStep(1);
    admissionInput.focus();
    admissionInput.select();
  });

  // Step 3: Reason quick chips
  document.querySelectorAll(".reason-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".reason-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      const reasonText = chip.getAttribute("data-reason");
      if (reasonText && reasonText !== "Other") {
        reasonInput.value = reasonText;
      } else {
        reasonInput.value = "";
        reasonInput.focus();
      }
    });
  });

  // Back to Step 2
  btnBackToStep2.addEventListener("click", () => {
    goToStep(2);
  });

  // Step 3: Outpass Form Submission
  formOutpass.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!activeStudent) {
      alert("Please select and confirm a student first.");
      goToStep(1);
      return;
    }

    const reason = reasonInput.value.trim();
    const leaveDateTime = leaveTimeInput.value;
    const parentEmail = parentEmailInput.value.trim();

    if (!reason) {
      alert("Please provide the reason to leave school.");
      reasonInput.focus();
      return;
    }

    if (!leaveDateTime) {
      showLeaveTimeError("Please select the date and time of departure.");
      leaveTimeInput.focus();
      return;
    }

    const dateCheck = validateDepartureDateTime(leaveDateTime);
    if (!dateCheck.valid) {
      showLeaveTimeError(dateCheck.message);
      leaveTimeInput.focus();
      return;
    }

    hideLeaveTimeError();

    // Check duplicate submission before proceeding
    const selectedDateKey = window.apiService.getLocalDateKey(leaveDateTime);
    const activeDuplicate = studentOutpasses.find((item) => {
      const itemDateKey = window.apiService.getLocalDateKey(item.leaveDateTime);
      return (
        itemDateKey === selectedDateKey &&
        (item.status === "PENDING" || item.status === "APPROVED")
      );
    });

    if (activeDuplicate) {
      alert(
        `Cannot submit: An outpass request has already been submitted for this student on this date with status: ${activeDuplicate.status} (Pass ID: ${activeDuplicate.outpassId}).`
      );
      showExistingPassCard(activeDuplicate, leaveDateTime);
      return;
    }

    if (!parentEmail || !parentEmail.includes("@")) {
      alert("Please enter a valid parent email address to receive notifications.");
      parentEmailInput.focus();
      return;
    }

    btnSubmitOutpass.disabled = true;
    btnSubmitOutpass.innerHTML = `<span class="spinner"></span> Submitting...`;

    try {
      const payload = {
        admissionNumber: activeStudent.admissionNumber,
        studentName: activeStudent.studentName,
        fatherName: activeStudent.fatherName || "Parent",
        class: String(activeStudent.class || ""),
        division: String(activeStudent.division || ""),
        reason: reason,
        leaveDateTime: leaveDateTime,
        parentEmail: parentEmail,
        parentName: activeStudent.fatherName || "Parent",
        parentPhone: activeStudent.contactNumber || ""
      };

      const outpassResult = await window.apiService.submitOutpass(payload);

      // Track newly created outpass in local cache
      studentOutpasses.unshift(outpassResult);

      // Populate Step 4 (Confirmation Message)
      confirmEmailDisplay.textContent = parentEmail;
      confirmOutpassId.textContent = outpassResult.outpassId;
      confirmStudentName.textContent = `${activeStudent.studentName} (Class ${activeStudent.class}-${activeStudent.division})`;

      const dt = new Date(leaveDateTime);
      confirmLeaveTime.textContent = dt.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      });

      goToStep(4);
    } catch (err) {
      alert("Failed to submit outpass request: " + err.message);
    } finally {
      btnSubmitOutpass.disabled = false;
      btnSubmitOutpass.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Submit Outpass Request
      `;
    }
  });

  // Step 4: Reset & Request Another Outpass
  btnResetAll.addEventListener("click", () => {
    activeStudent = null;
    studentOutpasses = [];
    admissionInput.value = "";
    reasonInput.value = "";
    parentEmailInput.value = "";
    document.querySelectorAll(".reason-chip").forEach((c) => c.classList.remove("selected"));
    initDateTimePicker();
    hideExistingPassCard();
    goToStep(1);
    admissionInput.focus();
  });
});
