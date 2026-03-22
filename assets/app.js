(function () {
  const STORAGE_BUCKET = "ppdb-documents";
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const requiredDocumentTypes = ["student_photo", "family_card", "birth_certificate", "report_card"];
  const documentFieldMap = {
    student_photo: { inputId: "file-photo", linkId: "link-student-photo", label: "Pas foto" },
    family_card: { inputId: "file-family-card", linkId: "link-family-card", label: "Kartu keluarga" },
    birth_certificate: { inputId: "file-birth-certificate", linkId: "link-birth-certificate", label: "Akte kelahiran" },
    report_card: { inputId: "file-report-card", linkId: "link-report-card", label: "Rapor / nilai" },
    achievement_certificate: { inputId: "file-achievement-certificate", linkId: "link-achievement-certificate", label: "Sertifikat prestasi" },
    parent_transfer_letter: { inputId: "file-parent-transfer-letter", linkId: "link-parent-transfer-letter", label: "Surat perpindahan tugas" }
  };

  const config = window.APP_CONFIG || {};
  const alertBox = document.getElementById("alert-box");
  const connectionStatus = document.getElementById("connection-status");
  const sessionStatus = document.getElementById("session-status");
  const publicHome = document.getElementById("public-home");
  const authPanel = document.getElementById("auth-panel");
  const userDashboard = document.getElementById("user-dashboard");
  const adminDashboard = document.getElementById("admin-dashboard");
  const loginForm = document.getElementById("login-tab");
  const registerForm = document.getElementById("register-tab");
  const applicationForm = document.getElementById("application-form");
  const studentForm = document.getElementById("student-form");
  const adminTableBody = document.getElementById("admin-table-body");
  const userNewsList = document.getElementById("user-news-list");
  const adminNewsList = document.getElementById("admin-news-list");
  const announcementForm = document.getElementById("announcement-form");
  const schoolForm = document.getElementById("school-form");
  const adminStudentsBody = document.getElementById("admin-students-body");
  const adminPositionBody = document.getElementById("admin-position-body");
  const adminSchoolsBody = document.getElementById("admin-schools-body");
  const adminTemplate = document.getElementById("admin-detail-template");
  const tabButtons = document.querySelectorAll(".tab-button");
  const menuButtons = document.querySelectorAll(".dashboard-nav .menu-button");
  const saveDraftButton = document.getElementById("save-draft-button");
  const saveStudentButton = document.getElementById("save-student-button");
  const adminSearch = document.getElementById("admin-search");
  const adminFilterLevel = document.getElementById("admin-filter-level");
  const adminFilterPath = document.getElementById("admin-filter-path");
  const adminFilterStatus = document.getElementById("admin-filter-status");
  const appLevelSelect = document.getElementById("app-level");
  const appTargetSchoolSelect = document.getElementById("app-target-school");
  const appPathSelect = document.getElementById("app-path");
  const positionCheckLevel = document.getElementById("position-check-level");
  const positionCheckSchool = document.getElementById("position-check-school");
  const positionTableBody = document.getElementById("position-table-body");
  const refreshPositionButton = document.getElementById("refresh-position-button");
  const documentRequirementHint = document.getElementById("document-requirement-hint");

  let supabaseClient = null;
  let currentProfile = null;
  let currentApplication = null;
  let currentDocuments = [];
  let currentHistory = [];
  let schoolTargets = [];
  let announcements = [];
  let adminRows = [];
  let activeModal = null;

  bindTabs();
  bindUserMenu();

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    connectionStatus.textContent = "Butuh konfigurasi";
    showAlert("Isi assets/config.js dulu dengan URL dan anon key Supabase.", true);
    return;
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  connectionStatus.textContent = "Supabase terhubung";

  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
  saveStudentButton.addEventListener("click", saveStudentData);
  applicationForm.addEventListener("submit", (event) => saveApplication(event, "pending"));
  saveDraftButton.addEventListener("click", (event) => saveApplication(event, "draft"));
  if (announcementForm) announcementForm.addEventListener("submit", saveAnnouncement);
  if (schoolForm) schoolForm.addEventListener("submit", saveSchoolTarget);
  document.getElementById("logout-button").addEventListener("click", logout);
  document.getElementById("logout-admin-button").addEventListener("click", logout);
  document.getElementById("refresh-admin-button").addEventListener("click", async () => {
    await loadAdminData();
    showAlert("Data admin diperbarui.");
  });
  appLevelSelect.addEventListener("change", () => {
    renderTargetSchoolOptions(appLevelSelect.value, appTargetSchoolSelect);
  });
  appPathSelect.addEventListener("change", renderDocumentRequirementHint);
  positionCheckLevel.addEventListener("change", () => {
    renderTargetSchoolOptions(positionCheckLevel.value, positionCheckSchool, true);
    loadSchoolPositionOverview();
  });
  positionCheckSchool.addEventListener("change", loadSchoolPositionOverview);
  refreshPositionButton.addEventListener("click", async () => {
    await loadUserPosition();
    await loadSchoolPositionOverview();
    showAlert("Posisi pendaftaran diperbarui.");
  });

  [adminSearch, adminFilterLevel, adminFilterPath, adminFilterStatus].forEach((element) => {
    element.addEventListener("input", renderFilteredAdminTable);
    element.addEventListener("change", renderFilteredAdminTable);
  });

  Object.entries(documentFieldMap).forEach(([type, info]) => {
    const input = document.getElementById(info.inputId);
    input.addEventListener("change", async () => {
      if (!input.files || !input.files[0]) return;
      await uploadDocument(type, input.files[0]);
      input.value = "";
    });
  });

  restoreSession();

  function bindTabs() {
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.tabTarget;
        tabButtons.forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(targetId).classList.add("active");
      });
    });
  }

  function bindUserMenu() {
    menuButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activateMenu(button);
      });
    });
  }

  function activateMenu(buttonOrTargetId) {
    const targetId = typeof buttonOrTargetId === "string" ? buttonOrTargetId : buttonOrTargetId.dataset.menuTarget;
    const button = typeof buttonOrTargetId === "string"
      ? document.querySelector(`.dashboard-nav .menu-button[data-menu-target="${targetId}"]`)
      : buttonOrTargetId;
    if (!button) return;

    const dashboard = button.closest("#user-dashboard, #admin-dashboard");
    if (!dashboard) return;

    dashboard.querySelectorAll(".dashboard-nav .menu-button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    dashboard.querySelectorAll(".menu-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === targetId);
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showAlert(error.message, true);
    showAlert("Login berhasil.");
    await restoreSession();
  }

  async function handleRegister(event) {
    event.preventDefault();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value.trim();
    const metadata = {
      full_name: document.getElementById("register-name").value.trim()
    };

    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: metadata } });
    if (error) return showAlert(error.message, true);
    registerForm.reset();
    showAlert("Registrasi berhasil. Jika konfirmasi email aktif, cek inbox lalu login.");
  }

  async function restoreSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return showAlert(error.message, true);
    if (!data.session) {
      sessionStatus.textContent = "Belum login";
      showLoggedOut();
      return;
    }

    sessionStatus.textContent = "Sudah login";
    const profile = await loadProfile(data.session.user.id);
    if (!profile) {
      showLoggedOut();
      return;
    }

    currentProfile = profile;
    if (profile.role === "admin") {
      showAdmin();
      await loadAnnouncements();
      await loadSchoolTargets();
      await loadAdminData();
      return;
    }

    showUser(profile);
    await loadAnnouncements();
    await loadSchoolTargets();
    await loadUserApplication(profile.id);
    await loadUserDocuments(profile.id);
    await loadUserHistory(profile.id);
    await loadUserPosition();
    await loadSchoolPositionOverview();
  }

  async function loadProfile(userId) {
    const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", userId).single();
    if (error) {
      showAlert("Profil belum ditemukan. Jalankan SQL Supabase dulu.", true);
      return null;
    }
    return data;
  }

  async function loadUserApplication(userId) {
    const { data, error } = await supabaseClient.from("applications").select("*").eq("user_id", userId).maybeSingle();
    if (error) return showAlert(error.message, true);
    currentApplication = data;
    populateApplication();
  }

  async function loadUserDocuments(userId) {
    const { data, error } = await supabaseClient
      .from("application_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) return showAlert(error.message, true);
    currentDocuments = data || [];
    renderUserDocumentLinks();
  }

  async function loadUserHistory(userId) {
    const { data, error } = await supabaseClient
      .from("application_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return showAlert(error.message, true);
    currentHistory = data || [];
    renderHistoryList(document.getElementById("user-history-list"), currentHistory);
  }

  function populateApplication() {
    const statusBadge = document.getElementById("application-status");
    const submissionLabel = document.getElementById("submission-label");
    const noteText = document.getElementById("admin-note-text");
    const noteLabel = document.getElementById("admin-note-label");

    if (!currentApplication) {
      applicationForm.reset();
      document.getElementById("app-level").value = currentProfile.school_level || "SD";
      document.getElementById("app-path").value = currentProfile.admission_path || "Zonasi";
      renderTargetSchoolOptions(document.getElementById("app-level").value, appTargetSchoolSelect);
      renderDocumentRequirementHint();
      setValue("student-full-name", currentProfile.full_name);
      setValue("student-phone", currentProfile.phone);
      updateStatusBadge(statusBadge, "");
      updateStatusBadge(submissionLabel, "draft");
      noteLabel.textContent = "Belum ada catatan admin.";
      noteText.textContent = "Lengkapi data dan kirim berkas agar admin bisa memverifikasi.";
      return;
    }

    setValue("app-nisn", currentApplication.nisn);
    setValue("student-full-name", currentProfile.full_name);
    setValue("student-phone", currentProfile.phone);
    setValue("app-nik", currentApplication.nik);
    setValue("app-family-card-number", currentApplication.family_card_number);
    setValue("app-gender", currentApplication.gender);
    setValue("app-birth-place", currentApplication.birth_place);
    setValue("app-birth-date", currentApplication.birth_date);
    setValue("app-religion", currentApplication.religion);
    setValue("app-origin-school", currentApplication.origin_school);
    setValue("app-level", currentApplication.school_level);
    setValue("app-path", currentApplication.admission_path);
    renderTargetSchoolOptions(currentApplication.school_level, appTargetSchoolSelect);
    renderDocumentRequirementHint();
    setValue("app-target-school", currentApplication.target_school_name);
    setValue("app-major-choice", currentApplication.major_choice);
    setValue("app-average-score", currentApplication.average_score);
    setValue("app-distance-km", currentApplication.distance_km);
    setValue("app-address", currentApplication.address);
    setValue("app-parent-name", currentApplication.parent_name);
    setValue("app-parent-phone", currentApplication.parent_phone);
    setValue("app-parent-job", currentApplication.parent_job);
    setValue("app-parent-income", currentApplication.parent_income);
    setValue("app-notes", currentApplication.notes);

    updateStatusBadge(statusBadge, currentApplication.status);
    updateStatusBadge(submissionLabel, currentApplication.submission_state || "draft");
    noteLabel.textContent = currentApplication.admin_notes ? "Catatan admin tersedia." : "Belum ada catatan admin.";
    noteText.textContent = currentApplication.admin_notes || "Belum ada catatan verifikasi.";
  }

  async function saveApplication(event, desiredSubmissionState) {
    event.preventDefault();
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData.user) return showAlert("Sesi tidak ditemukan. Silakan login ulang.", true);
    if (!studentForm.reportValidity()) return activateMenu("user-student-panel");
    if (!applicationForm.reportValidity()) return;

    if (desiredSubmissionState === "pending") {
      const missingDocs = getRequiredDocumentTypes(getValue("app-path"))
        .filter((type) => !currentDocuments.some((doc) => doc.document_type === type));
      if (missingDocs.length) {
        return showAlert(`Dokumen wajib belum lengkap: ${missingDocs.map((type) => documentFieldMap[type].label).join(", ")}.`, true);
      }
    }

    const payload = {
      user_id: userData.user.id,
      nisn: getValue("app-nisn"),
      nik: getValue("app-nik"),
      family_card_number: getValue("app-family-card-number"),
      gender: getValue("app-gender"),
      birth_place: getValue("app-birth-place"),
      birth_date: getValue("app-birth-date"),
      religion: getValue("app-religion"),
      origin_school: getValue("app-origin-school"),
      school_level: getValue("app-level"),
      admission_path: getValue("app-path"),
      target_school_name: getValue("app-target-school"),
      major_choice: getValue("app-major-choice"),
      average_score: nullableNumber("app-average-score"),
      distance_km: nullableNumber("app-distance-km"),
      address: getValue("app-address"),
      parent_name: getValue("app-parent-name"),
      parent_phone: getValue("app-parent-phone"),
      parent_job: getValue("app-parent-job"),
      parent_income: getValue("app-parent-income"),
      notes: getValue("app-notes"),
      submission_state: desiredSubmissionState,
      status: desiredSubmissionState === "draft" ? "draft" : (currentApplication?.status && currentApplication.status !== "draft" ? currentApplication.status : "pending")
    };

    const query = currentApplication
      ? supabaseClient.from("applications").update(payload).eq("id", currentApplication.id).select().single()
      : supabaseClient.from("applications").insert(payload).select().single();

    const { data, error } = await query;
    if (error) return showAlert(error.message, true);

    currentApplication = data;
    await syncDocumentApplicationLinks(data.id);
    await loadUserDocuments(userData.user.id);
    populateApplication();
    await loadUserHistory(userData.user.id);
    await loadUserPosition();
    await loadSchoolPositionOverview();
    showAlert(desiredSubmissionState === "draft" ? "Draft berhasil disimpan." : "Pendaftaran berhasil dikirim.");
  }

  async function saveStudentData() {
    if (!currentProfile) return showAlert("Sesi tidak ditemukan.", true);
    if (!studentForm.reportValidity()) return;

    const profilePayload = {
      full_name: getValue("student-full-name"),
      phone: getValue("student-phone")
    };
    const { data: updatedProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .update(profilePayload)
      .eq("id", currentProfile.id)
      .select()
      .single();
    if (profileError) return showAlert(profileError.message, true);

    currentProfile = { ...currentProfile, ...updatedProfile };
    document.getElementById("profile-name").textContent = currentProfile.full_name || "-";

    const payload = {
      user_id: currentProfile.id,
      nisn: getValue("app-nisn"),
      nik: getValue("app-nik"),
      family_card_number: getValue("app-family-card-number"),
      gender: getValue("app-gender"),
      birth_place: getValue("app-birth-place"),
      birth_date: getValue("app-birth-date"),
      religion: getValue("app-religion"),
      origin_school: getValue("app-origin-school"),
      address: getValue("app-address"),
      school_level: currentApplication?.school_level || currentProfile.school_level || "SD",
      admission_path: currentApplication?.admission_path || currentProfile.admission_path || "Zonasi",
      target_school_name: currentApplication?.target_school_name || "",
      major_choice: currentApplication?.major_choice || "",
      average_score: currentApplication?.average_score || null,
      distance_km: currentApplication?.distance_km || null,
      parent_name: currentApplication?.parent_name || "-",
      parent_phone: currentApplication?.parent_phone || "-",
      parent_job: currentApplication?.parent_job || "-",
      parent_income: currentApplication?.parent_income || "-",
      notes: currentApplication?.notes || "",
      submission_state: currentApplication?.submission_state || "draft",
      status: currentApplication?.status || "draft"
    };

    const query = currentApplication
      ? supabaseClient.from("applications").update(payload).eq("id", currentApplication.id).select().single()
      : supabaseClient.from("applications").insert(payload).select().single();
    const { data, error } = await query;
    if (error) return showAlert(error.message, true);

    currentApplication = data;
    await syncDocumentApplicationLinks(data.id);
    populateApplication();
    await loadUserHistory(currentProfile.id);
    showAlert("Data siswa berhasil disimpan.");
  }

  async function uploadDocument(documentType, file) {
    if (!currentProfile) return showAlert("Login dulu sebelum upload dokumen.", true);
    if (file.size > MAX_FILE_SIZE) return showAlert("Ukuran file melebihi 2 MB.", true);

    const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const filePath = `${currentProfile.id}/${documentType}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(filePath, file, { upsert: true });
    if (uploadError) return showAlert(uploadError.message, true);

    const { data: publicData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const existing = currentDocuments.find((doc) => doc.document_type === documentType);
    const payload = {
      user_id: currentProfile.id,
      application_id: currentApplication?.id || null,
      document_type: documentType,
      file_name: file.name,
      file_path: filePath,
      public_url: publicData.publicUrl
    };

    const query = existing
      ? supabaseClient.from("application_documents").update(payload).eq("id", existing.id).select().single()
      : supabaseClient.from("application_documents").insert(payload).select().single();
    const { data, error } = await query;
    if (error) return showAlert(error.message, true);

    currentDocuments = existing
      ? currentDocuments.map((doc) => (doc.id === existing.id ? data : doc))
      : [...currentDocuments, data];
    renderUserDocumentLinks();
    await loadUserHistory(currentProfile.id);
    showAlert(`${documentFieldMap[documentType].label} berhasil diupload.`);
  }

  function renderUserDocumentLinks() {
    Object.entries(documentFieldMap).forEach(([type, info]) => {
      const link = document.getElementById(info.linkId);
      const doc = currentDocuments.find((item) => item.document_type === type);
      if (!doc) {
        link.classList.add("hidden");
        link.removeAttribute("href");
        return;
      }
      link.href = doc.public_url;
      link.textContent = `Lihat file: ${doc.file_name}`;
      link.classList.remove("hidden");
    });
  }

  async function syncDocumentApplicationLinks(applicationId) {
    if (!applicationId || !currentProfile) return;
    const unlinkedIds = currentDocuments
      .filter((doc) => !doc.application_id)
      .map((doc) => doc.id);
    if (!unlinkedIds.length) return;

    const { error } = await supabaseClient
      .from("application_documents")
      .update({ application_id: applicationId })
      .in("id", unlinkedIds);
    if (error) {
      showAlert("Formulir tersimpan, tapi ada dokumen yang belum tertaut ke pendaftaran.", true);
    }
  }

  async function loadAdminData() {
    const { data, error } = await supabaseClient
      .from("admin_applications_view")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return showAlert(error.message, true);
    adminRows = data || [];
    renderAdminStats(adminRows);
    renderAdminStudents(adminRows);
    renderFilteredAdminTable();
    await loadAdminPosition();
    renderAdminSchools();
  }

  async function loadSchoolTargets() {
    const { data, error } = await supabaseClient
      .from("school_targets")
      .select("*")
      .order("school_level", { ascending: true })
      .order("school_name", { ascending: true });
    if (error) return showAlert(error.message, true);
    schoolTargets = data || [];
    renderTargetSchoolOptions(appLevelSelect.value || currentProfile?.school_level || "", appTargetSchoolSelect);
    renderTargetSchoolOptions(positionCheckLevel.value, positionCheckSchool, true);
  }

  async function loadAnnouncements() {
    const query = currentProfile?.role === "admin"
      ? supabaseClient.from("announcements").select("*").order("created_at", { ascending: false })
      : supabaseClient.from("announcements").select("*").eq("is_published", true).order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) return showAlert(error.message, true);
    announcements = data || [];
    renderAnnouncements(userNewsList, announcements.filter((item) => item.is_published), false);
    if (currentProfile?.role === "admin") {
      renderAnnouncements(adminNewsList, announcements, true);
    }
  }

  function renderTargetSchoolOptions(level, selectElement, includeAllOption) {
    const placeholder = includeAllOption
      ? '<option value="">Semua sekolah</option>'
      : '<option value="">Pilih sekolah tujuan</option>';
    const options = schoolTargets
      .filter((item) => !level || item.school_level === level)
      .map((item) => `<option value="${escapeHtml(item.school_name)}">${escapeHtml(item.school_name)}</option>`)
      .join("");
    const currentValue = selectElement.value;
    selectElement.innerHTML = placeholder + options;
    if (currentValue) {
      selectElement.value = currentValue;
    }
  }

  async function loadUserPosition() {
    if (!currentProfile) return;
    const { data, error } = await supabaseClient.rpc("get_user_school_position", { p_user_id: currentProfile.id });
    if (error) return showAlert(error.message, true);
    const row = data && data[0];
    document.getElementById("user-position-school").textContent = row?.target_school_name || "-";
    document.getElementById("user-position-rank").textContent = row?.queue_position ? `#${row.queue_position}` : "-";
    document.getElementById("user-position-total").textContent = row?.total_competitors ?? "-";
    document.getElementById("user-position-remaining").textContent = row?.remaining_seats ?? "-";
  }

  async function loadSchoolPositionOverview() {
    const level = positionCheckLevel.value || null;
    const school = positionCheckSchool.value || null;
    const { data, error } = await supabaseClient.rpc("get_school_position_overview", {
      p_school_level: level,
      p_target_school_name: school
    });
    if (error) return showAlert(error.message, true);
    renderSchoolPositionTable(data || []);
  }

  async function loadAdminPosition() {
    const { data, error } = await supabaseClient.rpc("get_school_position_overview", {
      p_school_level: null,
      p_target_school_name: null
    });
    if (error) return showAlert(error.message, true);

    if (!data || !data.length) {
      adminPositionBody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada data posisi.</td></tr>';
      return;
    }

    adminPositionBody.innerHTML = data.map((row) => `
      <tr>
        <td>${escapeHtml(row.school_name || "-")}</td>
        <td>${escapeHtml(row.school_level || "-")}</td>
        <td>${escapeHtml(row.quota ?? "-")}</td>
        <td>${escapeHtml(row.total_applicants ?? "-")}</td>
        <td>${escapeHtml(row.pending_count ?? "-")}</td>
        <td>${escapeHtml(row.accepted_count ?? "-")}</td>
        <td>${escapeHtml(row.remaining_seats ?? "-")}</td>
      </tr>
    `).join("");
  }

  function renderSchoolPositionTable(rows) {
    if (!rows.length) {
      positionTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada data posisi.</td></tr>';
      return;
    }

    positionTableBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.school_name || "-")}</td>
        <td>${escapeHtml(row.school_level || "-")}</td>
        <td>${escapeHtml(row.quota ?? "-")}</td>
        <td>${escapeHtml(row.total_applicants ?? "-")}</td>
        <td>${escapeHtml(row.pending_count ?? "-")}</td>
        <td>${escapeHtml(row.accepted_count ?? "-")}</td>
        <td>${escapeHtml(row.remaining_seats ?? "-")}</td>
      </tr>
    `).join("");
  }

  function renderAnnouncements(container, rows, showStatus) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<article class="news-card empty-state-block">Belum ada informasi.</article>';
      return;
    }

    container.innerHTML = rows.map((row) => `
      <article class="news-card">
        <div class="news-card-head">
          <strong>${escapeHtml(row.title || "-")}</strong>
          ${showStatus ? `<span class="status-badge ${row.is_published ? "accepted" : "draft"}">${row.is_published ? "Publish" : "Draft"}</span>` : ""}
        </div>
        <p>${escapeHtml(row.content || "-")}</p>
        <div class="news-card-foot">
          <span class="news-meta">${escapeHtml(formatDateTime(row.created_at))}</span>
          ${showStatus ? `<button class="danger-button news-delete-button" data-announcement-delete="${row.id}" type="button">Hapus</button>` : ""}
        </div>
      </article>
    `).join("");

    if (showStatus) {
      container.querySelectorAll("[data-announcement-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteAnnouncement(button.dataset.announcementDelete));
      });
    }
  }

  function renderAdminStats(rows) {
    document.getElementById("total-registrants").textContent = rows.length;
    document.getElementById("draft-count").textContent = rows.filter((row) => row.status === "draft").length;
    document.getElementById("pending-count").textContent = rows.filter((row) => row.status === "pending").length;
    document.getElementById("accepted-count").textContent = rows.filter((row) => row.status === "accepted").length;
    document.getElementById("rejected-count").textContent = rows.filter((row) => row.status === "rejected").length;
  }

  function renderAdminStudents(rows) {
    if (!rows.length) {
      adminStudentsBody.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada data siswa.</td></tr>';
      return;
    }

    adminStudentsBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.full_name || "-")}</td>
        <td>${escapeHtml(row.nisn || "-")}</td>
        <td>${escapeHtml(row.nik || "-")}</td>
        <td>${escapeHtml(row.origin_school || "-")}</td>
        <td>${escapeHtml(row.school_level || "-")}</td>
        <td>${escapeHtml(row.target_school_name || "-")}</td>
      </tr>
    `).join("");
  }

  function renderAdminSchools() {
    if (!adminSchoolsBody) return;
    if (!schoolTargets.length) {
      adminSchoolsBody.innerHTML = '<tr><td colspan="4" class="empty-state">Belum ada sekolah.</td></tr>';
      return;
    }

    adminSchoolsBody.innerHTML = schoolTargets.map((row) => `
      <tr>
        <td>${escapeHtml(row.school_name || "-")}</td>
        <td>${escapeHtml(row.school_level || "-")}</td>
        <td>${escapeHtml(row.quota ?? "-")}</td>
        <td><button class="danger-button" data-school-delete="${row.id}" type="button">Hapus</button></td>
      </tr>
    `).join("");

    adminSchoolsBody.querySelectorAll("[data-school-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteSchoolTarget(button.dataset.schoolDelete));
    });
  }

  function renderFilteredAdminTable() {
    const search = adminSearch.value.trim().toLowerCase();
    const level = adminFilterLevel.value;
    const path = adminFilterPath.value;
    const status = adminFilterStatus.value;

    const filtered = adminRows.filter((row) => {
      const haystack = [row.full_name, row.email, row.nisn, row.origin_school].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (level && row.school_level !== level) return false;
      if (path && row.admission_path !== path) return false;
      if (status && row.status !== status) return false;
      return true;
    });

    if (!filtered.length) {
      adminTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Tidak ada data yang cocok.</td></tr>';
      return;
    }

    adminTableBody.innerHTML = filtered.map((row) => `
      <tr>
        <td>
          <div class="person-meta">
            <strong>${escapeHtml(row.full_name || "-")}</strong>
            <p class="person-meta">${escapeHtml(row.email || "-")}</p>
            <p class="person-meta">NISN: ${escapeHtml(row.nisn || "-")}</p>
            <p class="person-meta">Asal: ${escapeHtml(row.origin_school || "-")}</p>
          </div>
        </td>
        <td>${escapeHtml(row.school_level || "-")}</td>
        <td>${escapeHtml(row.admission_path || "-")}</td>
        <td><span class="status-badge ${statusClass(row.status)}">${statusLabel(row.status)}</span></td>
        <td>${Number(row.document_count || 0)} file</td>
        <td>
          <div class="action-row">
            <button class="status-action" data-open-detail="${row.application_id}" type="button">Lihat Detail</button>
          </div>
        </td>
      </tr>
    `).join("");

    adminTableBody.querySelectorAll("[data-open-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const row = adminRows.find((item) => item.application_id === button.dataset.openDetail);
        if (row) openAdminModal(row);
      });
    });
  }

  function openAdminModal(row) {
    closeModal();
    const fragment = adminTemplate.content.cloneNode(true);
    const backdrop = fragment.querySelector(".modal-backdrop");
    const detailGrid = fragment.querySelector("#modal-detail-grid");
    const documentLinks = fragment.querySelector("#modal-document-links");
    const notesField = fragment.querySelector("#modal-admin-notes");
    const deleteButton = fragment.querySelector("#modal-delete-user");
    const historyList = fragment.querySelector("#modal-history-list");

    fragment.querySelector("#modal-name").textContent = row.full_name || "-";
    notesField.value = row.admin_notes || "";

    const fields = [
      ["Email", row.email],
      ["No. HP", row.phone],
      ["NISN", row.nisn],
      ["NIK", row.nik],
      ["No. KK", row.family_card_number],
      ["Asal sekolah", row.origin_school],
      ["Jenis kelamin", row.gender],
      ["Tempat, tanggal lahir", joinText(row.birth_place, row.birth_date)],
      ["Agama", row.religion],
      ["Alamat", row.address],
      ["Jenjang", row.school_level],
      ["Jalur", row.admission_path],
      ["Sekolah tujuan", row.target_school_name],
      ["Jurusan", row.major_choice],
      ["Nilai rata-rata", row.average_score],
      ["Jarak (km)", row.distance_km],
      ["Orang tua / wali", row.parent_name],
      ["No. HP orang tua", row.parent_phone],
      ["Pekerjaan orang tua", row.parent_job],
      ["Penghasilan", row.parent_income],
      ["Catatan siswa", row.notes]
    ];

    detailGrid.innerHTML = fields.map(([label, value]) => `
      <article class="detail-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "-")}</strong>
      </article>
    `).join("");

    const docs = parseDocuments(row.documents);
    documentLinks.innerHTML = docs.length
      ? docs.map((doc) => `<a class="file-link" href="${doc.public_url}" target="_blank" rel="noreferrer">${escapeHtml(doc.document_type)}: ${escapeHtml(doc.file_name)}</a>`).join("")
      : '<p class="helper-text">Belum ada dokumen.</p>';

    loadAdminHistory(row.user_id, historyList);

    fragment.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal();
    });

    fragment.querySelectorAll("[data-modal-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        await updateApplicationStatus(row.application_id, button.dataset.modalStatus, notesField.value.trim());
      });
    });

    deleteButton.addEventListener("click", async () => {
      await deleteUser(row.user_id);
    });

    document.body.appendChild(fragment);
    activeModal = document.body.lastElementChild;
  }

  async function updateApplicationStatus(applicationId, status, adminNotes) {
    const payload = {
      status,
      submission_state: status === "draft" ? "draft" : "pending",
      admin_notes: adminNotes || null
    };
    const { error } = await supabaseClient.from("applications").update(payload).eq("id", applicationId);
    if (error) return showAlert(error.message, true);
    closeModal();
    await loadAdminData();
    if (currentProfile && currentProfile.role !== "admin") {
      await loadUserHistory(currentProfile.id);
    }
    showAlert("Status pendaftaran berhasil diperbarui.");
  }

  async function deleteUser(userId) {
    const confirmed = window.confirm("Hapus user ini? Auth, profil, pendaftaran, dan dokumennya akan ikut terhapus.");
    if (!confirmed) return;
    const { error } = await supabaseClient.functions.invoke("admin-delete-user", { body: { userId } });
    if (error) return showAlert(`Gagal hapus via Edge Function: ${error.message}`, true);
    closeModal();
    await loadAdminData();
    showAlert("User berhasil dihapus.");
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const payload = {
      title: document.getElementById("announcement-title").value.trim(),
      content: document.getElementById("announcement-content").value.trim(),
      is_published: document.getElementById("announcement-published").value === "true"
    };
    const { error } = await supabaseClient.from("announcements").insert(payload);
    if (error) return showAlert(error.message, true);
    announcementForm.reset();
    document.getElementById("announcement-published").value = "true";
    await loadAnnouncements();
    showAlert("Berita berhasil ditambahkan.");
  }

  async function deleteAnnouncement(id) {
    const confirmed = window.confirm("Hapus berita ini?");
    if (!confirmed) return;
    const { error } = await supabaseClient.from("announcements").delete().eq("id", id);
    if (error) return showAlert(error.message, true);
    await loadAnnouncements();
    showAlert("Berita berhasil dihapus.");
  }

  async function saveSchoolTarget(event) {
    event.preventDefault();
    const payload = {
      school_level: document.getElementById("school-level").value,
      school_name: document.getElementById("school-name").value.trim(),
      quota: Number(document.getElementById("school-quota").value)
    };
    const { error } = await supabaseClient.from("school_targets").insert(payload);
    if (error) return showAlert(error.message, true);
    schoolForm.reset();
    document.getElementById("school-level").value = "SD";
    await loadSchoolTargets();
    renderAdminSchools();
    await loadAdminPosition();
    showAlert("Sekolah berhasil ditambahkan.");
  }

  async function deleteSchoolTarget(id) {
    const confirmed = window.confirm("Hapus sekolah ini dari daftar tujuan?");
    if (!confirmed) return;
    const { error } = await supabaseClient.from("school_targets").delete().eq("id", id);
    if (error) return showAlert(error.message, true);
    await loadSchoolTargets();
    renderAdminSchools();
    await loadAdminPosition();
    showAlert("Sekolah berhasil dihapus.");
  }

  async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) return showAlert(error.message, true);
    currentProfile = null;
    currentApplication = null;
    currentDocuments = [];
    currentHistory = [];
    adminRows = [];
    sessionStatus.textContent = "Belum login";
    showLoggedOut();
    showAlert("Logout berhasil.");
  }

  function showLoggedOut() {
    publicHome.classList.remove("hidden");
    authPanel.classList.remove("hidden");
    userDashboard.classList.add("hidden");
    adminDashboard.classList.add("hidden");
    closeModal();
  }

  function showUser(profile) {
    publicHome.classList.add("hidden");
    authPanel.classList.add("hidden");
    userDashboard.classList.remove("hidden");
    adminDashboard.classList.add("hidden");
    document.getElementById("profile-name").textContent = profile.full_name || "-";
    document.getElementById("profile-email").textContent = profile.email || "-";
    activateMenu(userDashboard.querySelector('.menu-button[data-menu-target="user-news-panel"]'));
  }

  function showAdmin() {
    publicHome.classList.add("hidden");
    authPanel.classList.add("hidden");
    userDashboard.classList.add("hidden");
    adminDashboard.classList.remove("hidden");
    activateMenu(adminDashboard.querySelector('.menu-button[data-menu-target="admin-news-panel"]'));
  }

  function closeModal() {
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
  }

  function parseDocuments(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  async function loadAdminHistory(userId, container) {
    const { data, error } = await supabaseClient
      .from("application_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      container.innerHTML = '<article class="history-item empty-history">Gagal memuat riwayat.</article>';
      return;
    }
    renderHistoryList(container, data || []);
  }

  function renderHistoryList(container, rows) {
    if (!rows.length) {
      container.innerHTML = '<article class="history-item empty-history">Belum ada riwayat.</article>';
      return;
    }

    container.innerHTML = rows.map((row) => `
      <article class="history-item">
        <strong>${escapeHtml(row.title || "-")}</strong>
        <p class="history-meta">${escapeHtml(historyActorLabel(row.actor_role))} | ${escapeHtml(formatDateTime(row.created_at))}</p>
        <p class="history-desc">${escapeHtml(row.description || "Aktivitas tercatat.")}</p>
      </article>
    `).join("");
  }

  function showAlert(message, isError) {
    alertBox.textContent = message;
    alertBox.classList.remove("hidden", "error");
    if (isError) alertBox.classList.add("error");
  }

  function updateStatusBadge(element, status) {
    element.textContent = statusLabel(status);
    element.className = `status-badge ${statusClass(status)}`;
  }

  function statusClass(status) {
    if (status === "accepted") return "accepted";
    if (status === "rejected") return "rejected";
    if (status === "draft" || !status) return "draft";
    return "";
  }

  function statusLabel(status) {
    if (status === "accepted") return "Diterima";
    if (status === "rejected") return "Ditolak";
    if (status === "pending") return "Pending";
    if (status === "draft" || !status) return "Draft";
    return status;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getValue(id) {
    return document.getElementById(id).value.trim();
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    element.value = value ?? "";
  }

  function nullableNumber(id) {
    const value = document.getElementById(id).value.trim();
    return value ? Number(value) : null;
  }

  function joinText(a, b) {
    return [a, b].filter(Boolean).join(", ");
  }

  function historyActorLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "system") return "Sistem";
    return "User";
  }

  function formatDateTime(value) {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function getRequiredDocumentTypes(path) {
    const base = [...requiredDocumentTypes];
    if (path === "Prestasi" || path === "Non Akademik") {
      base.push("achievement_certificate");
    }
    if (path === "Perpindahan Tugas Orang Tua/Wali") {
      base.push("parent_transfer_letter");
    }
    return base;
  }

  function renderDocumentRequirementHint() {
    if (!documentRequirementHint) return;
    const path = getValue("app-path") || "Zonasi";
    const labels = getRequiredDocumentTypes(path).map((type) => documentFieldMap[type].label);
    documentRequirementHint.textContent = `Dokumen wajib jalur ${path}: ${labels.join(", ")}.`;
  }
})();

