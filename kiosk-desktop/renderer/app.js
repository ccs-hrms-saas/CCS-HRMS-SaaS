'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   CCS HRMS Kiosk — Desktop App Logic
   State machine: setup → home → pin → camera → success
═══════════════════════════════════════════════════════════════════════════ */

// ── Constants ──────────────────────────────────────────────────────────────
const ADMIN_EXIT_PIN    = '9999';       // change this to a real secure PIN
const SUCCESS_DURATION  = 3000;        // ms before returning to home
const REFRESH_INTERVAL  = 5 * 60000;  // refresh employee list every 5 min
const COUNTDOWN_SECS    = 3;          // camera auto-capture countdown

// Avatar background colours (cycling)
const AVATAR_COLORS = [
  ['#6366f1','#ede9fe'], ['#10b981','#d1fae5'], ['#f59e0b','#fef3c7'],
  ['#ef4444','#fee2e2'], ['#3b82f6','#dbeafe'], ['#8b5cf6','#ede9fe'],
  ['#ec4899','#fce7f3'], ['#06b6d4','#cffafe'],
];

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  apiBase:         localStorage.getItem('kiosk_api_base')    || 'https://www.ccshrms.com',
  deviceToken:     localStorage.getItem('kiosk_device_token') || null,
  companyId:       localStorage.getItem('kiosk_company_id')   || null,
  companyName:     localStorage.getItem('kiosk_company_name') || 'CCS HRMS',
  companyLogo:     localStorage.getItem('kiosk_company_logo') || null,
  deviceNameLabel: localStorage.getItem('kiosk_device_name')  || 'Kiosk Device',

  employees: [],
  selectedEmp: null,   // { id, full_name, designation, avatar_url }
  enteredPin: '',
  capturedPhoto: null, // base64

  cameraStream: null,
  countdownTimer: null,
  clockTimer: null,
  refreshTimer: null,

  adminClickCount: 0,
  adminClickTimer: null,
};

// ── API Helper ─────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = state.apiBase.replace(/\/$/, '') + path;
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (state.deviceToken) headers['x-device-token'] = state.deviceToken;
  const res = await fetch(url, { ...opts, headers });
  const json = await res.json().catch(() => ({ error: 'Invalid server response' }));
  return { ok: res.ok, status: res.status, data: json };
}

// ── Screen Router ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.remove('active', 'entering');
  });
  const screen = document.getElementById(id);
  screen.classList.add('active', 'entering');
}

// ── Utilities ──────────────────────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setText(id, text) { document.getElementById(id).textContent = text; }
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError(id) { document.getElementById(id).classList.add('hidden'); }

function getInitials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function getAvatarColor(index) { return AVATAR_COLORS[index % AVATAR_COLORS.length]; }

// ── Live Clock ─────────────────────────────────────────────────────────────
function startClock() {
  const update = () => {
    const now = new Date();
    setText('clock-time', now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    setText('clock-date', now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  };
  update();
  state.clockTimer = setInterval(update, 1000);
}

function stopClock() { clearInterval(state.clockTimer); }

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN 1: SETUP
// ══════════════════════════════════════════════════════════════════════════════
async function initSetup() {
  showScreen('screen-setup');

  // Pre-fill saved values
  document.getElementById('input-api-url').value = state.apiBase;

  document.getElementById('btn-pair').addEventListener('click', doPairing);

  // Allow Enter key on last input
  document.getElementById('input-device-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') doPairing();
  });
}

async function doPairing() {
  clearError('setup-error');

  const companyCode = document.getElementById('input-company-code').value.trim().toLowerCase();
  const apiUrl      = document.getElementById('input-api-url').value.trim();
  const setupPin    = document.getElementById('input-setup-pin').value.trim();
  const deviceName  = document.getElementById('input-device-name').value.trim() || 'Desktop Kiosk';

  if (!companyCode) { showError('setup-error', 'Please enter your company code (subdomain).'); return; }
  if (!setupPin)    { showError('setup-error', 'Please enter the setup PIN from your admin panel.'); return; }

  // Update API base
  state.apiBase = apiUrl || 'https://www.ccshrms.com';
  localStorage.setItem('kiosk_api_base', state.apiBase);

  // Show loading state
  const btnText    = document.getElementById('btn-pair-text');
  const btnSpinner = document.getElementById('btn-pair-spinner');
  btnText.textContent = 'Pairing…';
  show(btnSpinner);

  try {
    const { ok, data } = await api('/api/kiosk/register', {
      method: 'POST',
      body: JSON.stringify({ company_code: companyCode, setup_pin: setupPin, device_name: deviceName }),
    });

    if (!ok) {
      showError('setup-error', data.error || 'Pairing failed. Check your company code and PIN.');
      return;
    }

    // Save to localStorage
    state.deviceToken     = data.device_token;
    state.companyId       = data.company_id;
    state.companyName     = data.company_name;
    state.deviceNameLabel = deviceName;

    localStorage.setItem('kiosk_device_token', data.device_token);
    localStorage.setItem('kiosk_company_id',   data.company_id);
    localStorage.setItem('kiosk_company_name', data.company_name);
    localStorage.setItem('kiosk_device_name',  deviceName);

    // Go to home
    await initHome();

  } catch (err) {
    showError('setup-error', `Network error: ${err.message}. Check your internet connection and API URL.`);
  } finally {
    btnText.textContent = 'Pair Device';
    hide(btnSpinner);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN 2: HOME
// ══════════════════════════════════════════════════════════════════════════════
async function initHome() {
  // First check if device is still valid
  const { ok, data } = await api('/api/kiosk/config');
  if (!ok) {
    if (data.is_active === false) {
      alert('⚠️ This device has been revoked. Please re-pair.');
      unpairDevice();
      return;
    }
  }

  // Update company info from config
  if (data.company_name) {
    state.companyName = data.company_name;
    localStorage.setItem('kiosk_company_name', data.company_name);
  }
  if (data.company_logo) {
    state.companyLogo = data.company_logo;
    localStorage.setItem('kiosk_company_logo', data.company_logo);
  }

  showScreen('screen-home');
  startClock();

  // Company info
  setText('company-name-display', state.companyName);
  setText('device-name-display',  state.deviceNameLabel);

  if (state.companyLogo) {
    document.getElementById('company-logo-img').src = state.companyLogo;
    show(document.getElementById('company-logo-wrap'));
  }

  // Load employees
  await loadEmployees();

  // Auto-refresh
  state.refreshTimer = setInterval(loadEmployees, REFRESH_INTERVAL);

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', loadEmployees);

  // Admin trigger (gear icon — 5 rapid clicks)
  document.getElementById('btn-admin-trigger').addEventListener('click', () => {
    state.adminClickCount++;
    if (state.adminClickTimer) clearTimeout(state.adminClickTimer);
    if (state.adminClickCount >= 3) {
      state.adminClickCount = 0;
      showAdminOverlay();
    } else {
      state.adminClickTimer = setTimeout(() => { state.adminClickCount = 0; }, 2000);
    }
  });

  // Ctrl+Shift+Q shortcut for admin exit
  document.addEventListener('keydown', onAdminShortcut);
}

function onAdminShortcut(e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Q') {
    showAdminOverlay();
  }
}

async function loadEmployees() {
  const grid = document.getElementById('employee-grid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading employees…</p></div>';

  const { ok, data } = await api('/api/kiosk/employees');

  if (!ok) {
    grid.innerHTML = `<div class="loading-state"><p style="color:var(--danger)">⚠️ ${data.error || 'Failed to load employees'}</p></div>`;
    return;
  }

  state.employees = data.employees || [];

  if (state.employees.length === 0) {
    grid.innerHTML = '<div class="loading-state"><p>No active employees found.</p></div>';
    return;
  }

  grid.innerHTML = '';
  state.employees.forEach((emp, idx) => {
    const card = document.createElement('div');
    card.className = 'employee-card';
    card.dataset.id = emp.id;

    const [bg, fg] = getAvatarColor(idx);
    const initials = getInitials(emp.full_name);

    card.innerHTML = `
      ${emp.avatar_url
        ? `<img class="emp-avatar" src="${emp.avatar_url}" alt="${emp.full_name}"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
        : ''}
      <div class="emp-initials" style="background:${bg}22; color:${bg}; ${emp.avatar_url ? 'display:none;' : ''}">${initials}</div>
      <div class="emp-name">${emp.full_name}</div>
      ${emp.designation ? `<div class="emp-designation">${emp.designation}</div>` : ''}
    `;

    card.addEventListener('click', () => selectEmployee(emp, idx));
    grid.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN 3: PIN
// ══════════════════════════════════════════════════════════════════════════════
function selectEmployee(emp, idx) {
  state.selectedEmp = emp;
  state.enteredPin  = '';
  clearError('pin-error');
  hide(document.getElementById('pin-spinner-wrap'));

  // Avatar / initials
  const [bg, fg] = getAvatarColor(idx);
  const avatarImg      = document.getElementById('pin-employee-avatar');
  const initialsEl     = document.getElementById('pin-employee-initials');
  initialsEl.textContent = getInitials(emp.full_name);
  initialsEl.style.background = `${bg}22`;
  initialsEl.style.color = bg;

  if (emp.avatar_url) {
    avatarImg.src = emp.avatar_url;
    avatarImg.style.display = 'block';
    initialsEl.style.display = 'none';
    avatarImg.onerror = () => {
      avatarImg.style.display = 'none';
      initialsEl.style.display = 'flex';
    };
  } else {
    avatarImg.style.display = 'none';
    initialsEl.style.display = 'flex';
  }

  setText('pin-employee-name', emp.full_name);
  setText('pin-action-label', '🔐 Enter your 4-digit attendance PIN');

  updatePinDots();
  showScreen('screen-pin');
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.toggle('filled', i < state.enteredPin.length);
  }
}

function handleNumInput(digit) {
  if (state.enteredPin.length >= 4) return;
  state.enteredPin += digit;
  updatePinDots();
  clearError('pin-error');

  if (state.enteredPin.length === 4) {
    // Small delay so user sees 4th dot fill before submit
    setTimeout(submitPin, 180);
  }
}

function handleDel() {
  state.enteredPin = state.enteredPin.slice(0, -1);
  updatePinDots();
  clearError('pin-error');
}

async function submitPin() {
  show(document.getElementById('pin-spinner-wrap'));
  clearError('pin-error');

  // We'll let the server verify the PIN — just go to camera
  // The actual verification happens in mark-attendance
  hide(document.getElementById('pin-spinner-wrap'));
  await initCamera();
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN 4: CAMERA
// ══════════════════════════════════════════════════════════════════════════════
async function initCamera() {
  state.capturedPhoto = null;
  state.countdownTimer && clearInterval(state.countdownTimer);

  clearError('camera-error');
  showScreen('screen-camera');

  const video   = document.getElementById('camera-video');
  const numEl   = document.getElementById('countdown-num');
  const circleEl = document.getElementById('countdown-circle');

  // Try to access webcam
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = state.cameraStream;
  } catch (err) {
    // No camera — skip straight to punch without photo
    showError('camera-error', '📷 No camera found. Proceeding without photo.');
    clearInterval(state.countdownTimer);
    setTimeout(() => submitAttendance(null), 1800);
    return;
  }

  // Countdown
  let secs = COUNTDOWN_SECS;
  numEl.textContent = secs;
  circleEl.textContent = secs;

  state.countdownTimer = setInterval(() => {
    secs--;
    numEl.textContent = secs;
    circleEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(state.countdownTimer);
      capturePhoto();
    }
  }, 1000);
}

function capturePhoto() {
  clearInterval(state.countdownTimer);

  const video  = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);

  // Flash effect
  const flash = document.getElementById('camera-flash');
  flash.classList.remove('hidden');
  setTimeout(() => flash.classList.add('hidden'), 400);

  state.capturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
  stopCamera();
  submitAttendance(state.capturedPhoto);
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  clearInterval(state.countdownTimer);
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBMIT ATTENDANCE
// ══════════════════════════════════════════════════════════════════════════════
async function submitAttendance(photoBase64) {
  const emp = state.selectedEmp;
  if (!emp) return;

  const { ok, data } = await api('/api/mark-attendance', {
    method: 'POST',
    body: JSON.stringify({
      user_id:      emp.id,
      pin:          state.enteredPin,
      photo_base64: photoBase64 || null,
    }),
  });

  if (!ok) {
    // If PIN error, go back to PIN screen to retry
    if (data.error && data.error.toLowerCase().includes('pin')) {
      state.enteredPin = '';
      stopCamera();
      showScreen('screen-pin');
      updatePinDots();
      showError('pin-error', `❌ ${data.error}`);
    } else {
      stopCamera();
      showScreen('screen-camera');
      showError('camera-error', `❌ ${data.error || 'Attendance failed. Try again.'}`);
      setTimeout(() => returnToHome(), 3000);
    }
    return;
  }

  // Success!
  stopCamera();
  showSuccessScreen(data.action, emp.full_name, data.timestamp);
}

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN 5: SUCCESS
// ══════════════════════════════════════════════════════════════════════════════
function showSuccessScreen(action, name, timestamp) {
  showScreen('screen-success');

  const isCheckIn = action === 'check_in';
  const timeStr   = new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const iconEl     = document.getElementById('success-icon');
  const headlineEl = document.getElementById('success-headline');
  iconEl.textContent     = isCheckIn ? '✅' : '👋';
  headlineEl.textContent = isCheckIn ? 'Checked In!' : 'Checked Out!';
  headlineEl.className   = `success-headline ${isCheckIn ? 'checkin' : 'checkout'}`;

  setText('success-name', name);
  setText('success-time', `at ${timeStr}`);

  // Reset progress bar animation
  const bar = document.getElementById('success-progress-bar');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = `drainProgress ${SUCCESS_DURATION / 1000}s linear forwards`;

  setTimeout(returnToHome, SUCCESS_DURATION);
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN EXIT OVERLAY
// ══════════════════════════════════════════════════════════════════════════════
function showAdminOverlay() {
  const overlay = document.getElementById('overlay-admin');
  overlay.classList.remove('hidden');
  document.getElementById('admin-exit-pin').value = '';
  clearError('admin-exit-error');
  setTimeout(() => document.getElementById('admin-exit-pin').focus(), 100);
}

function hideAdminOverlay() {
  document.getElementById('overlay-admin').classList.add('hidden');
}

document.getElementById('btn-admin-cancel').addEventListener('click', hideAdminOverlay);

document.getElementById('btn-admin-exit').addEventListener('click', async () => {
  const pin = document.getElementById('admin-exit-pin').value.trim();
  if (pin !== ADMIN_EXIT_PIN) {
    showError('admin-exit-error', 'Incorrect admin PIN. Contact your HRMS administrator.');
    return;
  }
  stopClock();
  stopCamera();
  clearInterval(state.refreshTimer);
  document.removeEventListener('keydown', onAdminShortcut);
  await window.kiosk.quit();
});

document.getElementById('admin-exit-pin').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-admin-exit').click();
});

// ── Also: 5 rapid taps on the clock area = admin exit ─────────────────────────
document.getElementById('clock-time')?.addEventListener('click', () => {
  state.adminClickCount++;
  if (state.adminClickTimer) clearTimeout(state.adminClickTimer);
  if (state.adminClickCount >= 5) {
    state.adminClickCount = 0;
    showAdminOverlay();
  } else {
    state.adminClickTimer = setTimeout(() => { state.adminClickCount = 0; }, 2000);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATION HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function returnToHome() {
  state.selectedEmp   = null;
  state.enteredPin    = '';
  state.capturedPhoto = null;
  stopCamera();
  showScreen('screen-home');
}

function unpairDevice() {
  localStorage.removeItem('kiosk_device_token');
  localStorage.removeItem('kiosk_company_id');
  localStorage.removeItem('kiosk_company_name');
  localStorage.removeItem('kiosk_company_logo');
  state.deviceToken = null;
  stopClock();
  clearInterval(state.refreshTimer);
  initSetup();
}

// PIN back button
document.getElementById('btn-pin-back').addEventListener('click', () => {
  state.enteredPin = '';
  updatePinDots();
  stopCamera();
  showScreen('screen-home');
});

// Numpad buttons
document.querySelectorAll('.num-btn[data-num]').forEach(btn => {
  btn.addEventListener('click', () => handleNumInput(btn.dataset.num));
});
document.getElementById('btn-del').addEventListener('click', handleDel);

// Keyboard PIN input (when PIN screen is active)
document.addEventListener('keydown', e => {
  if (!document.getElementById('screen-pin').classList.contains('active')) return;
  if (e.key >= '0' && e.key <= '9') handleNumInput(e.key);
  if (e.key === 'Backspace') handleDel();
  if (e.key === 'Escape') document.getElementById('btn-pin-back').click();
});

// Camera buttons
document.getElementById('btn-capture-now').addEventListener('click', () => {
  clearInterval(state.countdownTimer);
  capturePhoto();
});

document.getElementById('btn-skip-photo').addEventListener('click', () => {
  stopCamera();
  submitAttendance(null);
});

// ══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════════
async function boot() {
  if (state.deviceToken) {
    // Already paired — validate and go to home
    try {
      await initHome();
    } catch (err) {
      console.error('Boot error:', err);
      initSetup();
    }
  } else {
    initSetup();
  }
}

boot();
