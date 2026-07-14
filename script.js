/**
 * DynoNutriAI — Frontend Application
 * =====================================
 * Powered by IBM watsonx.ai · Granite LLMs
 *
 * Modules:
 *   - AppState       : Persistent state + localStorage management
 *   - Navigation     : Panel switching, sidebar, topbar
 *   - Chat           : Message rendering, send/receive, markdown
 *   - Dashboard      : Stats, water tracker, macro log
 *   - NutritionAnalyzer : Meal analysis API
 *   - MealPlanner    : AI meal plan generation + download
 *   - BMI Calculator : BMI + TDEE + animated gauge
 *   - FamilyProfiles : Profile CRUD + context switching
 *   - UI Utilities   : Toast, loaders, health check
 */

/* ═══════════════════════════════════════════════════════════════════════════
   APP STATE
   ═══════════════════════════════════════════════════════════════════════════ */
const AppState = {
  chatHistory:    [],
  activeMember:   null,
  waterGlasses:   parseInt(localStorage.getItem('dna_water') || '0'),
  macroLog:       JSON.parse(localStorage.getItem('dna_macros') || '[]'),
  familyMembers:  JSON.parse(localStorage.getItem('dna_family') || '[]'),
  bmiData:        null,
  lastNutrition:  null,
  lastMealPlan:   '',

  saveFamily()  { localStorage.setItem('dna_family',  JSON.stringify(this.familyMembers)); },
  saveMacros()  { localStorage.setItem('dna_macros',  JSON.stringify(this.macroLog));      },
  saveWater()   { localStorage.setItem('dna_water',   this.waterGlasses);                  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */
const PANEL_META = {
  chat:      { title: 'Chat Assistant',       sub: 'Ask DynoNutriAI anything about nutrition' },
  dashboard: { title: 'Nutrition Dashboard',  sub: 'Your daily nutrition overview'            },
  nutrition: { title: 'Nutrition Analyzer',   sub: 'Detailed nutritional breakdown of any meal'},
  meals:     { title: 'Meal Planner',         sub: 'AI-generated personalised Indian meal plans'},
  bmi:       { title: 'BMI Calculator',       sub: 'Calculate BMI, TDEE & get AI dietary advice'},
  family:    { title: 'Family Profiles',      sub: 'Manage profiles for personalised nutrition' },
};

/**
 * Switch to the given panel.
 * @param {string} id   - Panel key (matches PANEL_META + DOM id="panel-{id}")
 * @param {Element} btn - The nav button that was clicked (optional)
 */
function showPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');

  const activateBtn = btn || document.querySelector(`[data-panel="${id}"]`);
  if (activateBtn) activateBtn.classList.add('active');

  const meta = PANEL_META[id] || {};
  document.getElementById('topbar-title').textContent = meta.title || '';
  document.getElementById('topbar-sub').textContent   = meta.sub   || '';

  if (id === 'dashboard') refreshDashboard();
  if (id === 'family')    renderFamilyGrid();

  closeSidebar();
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const burger   = document.getElementById('hamburger');
  const isOpen   = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('show', !isOpen);
  burger.classList.toggle('is-open', !isOpen);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
  document.getElementById('hamburger').classList.remove('is-open');
}

// Close sidebar with Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
});

// Sidebar close button
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════════════════ */
/**
 * Show a transient toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.textContent = `${icons[type] || ''} ${message}`;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Lightweight Markdown renderer supporting:
 *   **bold**, *italic*, `code`, bullet lists, numbered lists, line breaks
 */
function renderMarkdown(raw) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // bold + italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // headings (# ## ###)
    .replace(/^### (.+)$/gm, '<h4 style="color:var(--accent);margin:10px 0 4px;font-size:13px;">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 style="color:var(--accent);margin:12px 0 6px;font-size:15px;">$1</h3>')
    .replace(/^# (.+)$/gm,   '<h2 style="color:var(--accent);margin:14px 0 6px;font-size:17px;">$1</h2>')
    // hr
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">')
    // bullet list items
    .replace(/^[-•*]\s+(.+)$/gm, '<li>$1</li>')
    // numbered list
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // wrap consecutive <li> elements
    .replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`)
    // line breaks
    .replace(/\n/g, '<br>');
}

/**
 * Append a chat message bubble to the chat area.
 * @param {'bot'|'user'} role
 * @param {string} content
 */
function appendMessage(role, content) {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = `msg ${role}`;

  const isBot = role === 'bot';
  const time  = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const htmlContent = isBot ? renderMarkdown(content) : renderMarkdown(content);

  div.innerHTML = `
    <div class="msg-avatar">${isBot ? '🌿' : '👤'}</div>
    <div class="msg-content">
      <div class="msg-bubble">${htmlContent}</div>
      <div class="msg-time">${time}</div>
    </div>`;

  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

/** Show the typing/loading indicator. */
function showTyping() {
  const area = document.getElementById('chat-area');
  const div  = document.createElement('div');
  div.className = 'msg bot';
  div.id        = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar">🌿</div>
    <div class="msg-content">
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function hideTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

/** Send a chat message to /api/chat */
async function sendMessage() {
  const input  = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const message = input.value.trim();
  if (!message) return;

  // Reset input
  input.value = '';
  input.style.height = '';
  sendBtn.disabled = true;

  // Remove welcome card if still present
  const welcomeCard = document.querySelector('.chat-welcome');
  if (welcomeCard) welcomeCard.remove();

  // Hide chips bar after first message
  const chipsBar = document.getElementById('quick-chips-bar');
  if (chipsBar) chipsBar.style.display = 'none';

  appendMessage('user', message);
  AppState.chatHistory.push({ role: 'user', content: message });
  showTyping();

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history:        AppState.chatHistory.slice(-10),
        family_profile: AppState.activeMember ? [AppState.activeMember] : null,
      }),
    });

    const data  = await res.json();
    hideTyping();
    const reply = data.reply || data.error || 'Sorry, something went wrong. Please try again.';
    appendMessage('bot', reply);
    AppState.chatHistory.push({ role: 'assistant', content: reply });

  } catch (err) {
    hideTyping();
    appendMessage('bot', '⚠️ Network error — please check your connection and try again.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

/** Handle Enter key in chat textarea */
function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

/** Auto-resize the chat textarea */
function autoResize(el) {
  el.style.height = '';
  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
}

/** Send a quick-chip query */
function sendChip(btn) {
  const input = document.getElementById('chat-input');
  input.value = btn.textContent.trim();
  sendMessage();
}

/** Clear the chat history */
function clearChat() {
  AppState.chatHistory = [];
  const area = document.getElementById('chat-area');
  area.innerHTML = '';
  // Re-show chips
  const chipsBar = document.getElementById('quick-chips-bar');
  if (chipsBar) chipsBar.style.display = '';
  appendMessage('bot', '**Chat cleared!** How can I help you with your nutrition today? 🌿');
  showToast('Chat cleared', 'info');
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Refresh all dashboard stats from AppState */
function refreshDashboard() {
  const bmi    = AppState.bmiData;
  const target = bmi ? bmi.target_calories : 2000;
  const proteinGoal = Math.round(target * 0.20 / 4);
  const carbGoal    = Math.round(target * 0.55 / 4);

  let calConsumed  = 0;
  let proteinTotal = 0;
  let carbsTotal   = 0;

  for (const m of AppState.macroLog) {
    calConsumed  += m.calories || 0;
    proteinTotal += m.protein  || 0;
    carbsTotal   += m.carbs    || 0;
  }

  const calPct  = Math.min(Math.round(calConsumed  / target       * 100), 100);
  const proPct  = Math.min(Math.round(proteinTotal  / proteinGoal  * 100), 100);
  const carbPct = Math.min(Math.round(carbsTotal    / carbGoal     * 100), 100);
  const watPct  = Math.min(Math.round(AppState.waterGlasses / 8   * 100), 100);

  document.getElementById('d-calories').textContent = `${calConsumed} / ${target}`;
  document.getElementById('d-protein').textContent  = `${proteinTotal} / ${proteinGoal}`;
  document.getElementById('d-carbs').textContent    = `${carbsTotal} / ${carbGoal}`;
  document.getElementById('d-water').textContent    = AppState.waterGlasses;

  setProgressBar('d-cal-bar',  'd-cal-pct',  calPct);
  setProgressBar('d-pro-bar',  'd-pro-pct',  proPct);
  setProgressBar('d-carb-bar', 'd-carb-pct', carbPct);
  setProgressBar('d-water-bar','d-water-pct', watPct);

  renderWaterGlasses();
  renderMacroLog();
}

function setProgressBar(barId, pctId, pct) {
  const bar = document.getElementById(barId);
  const lbl = document.getElementById(pctId);
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent  = pct + '%';
}

/* ── Water Tracker ───────────────────────────────────────────────────────── */
function renderWaterGlasses() {
  const wrap = document.getElementById('water-glasses');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const btn = document.createElement('button');
    btn.className = `water-glass ${i < AppState.waterGlasses ? '' : 'empty'}`;
    btn.textContent = '💧';
    btn.title = `${i + 1} glass${i > 0 ? 'es' : ''}`;
    btn.onclick = () => { AppState.waterGlasses = i + 1; AppState.saveWater(); refreshDashboard(); };
    wrap.appendChild(btn);
  }
}

function addWater() {
  if (AppState.waterGlasses < 8) {
    AppState.waterGlasses++;
    AppState.saveWater();
    refreshDashboard();
    if (AppState.waterGlasses === 8) showToast('Daily water goal reached! 🎉');
  } else {
    showToast('Daily water goal already reached! 🎉');
  }
}

function resetWater() {
  AppState.waterGlasses = 0;
  AppState.saveWater();
  refreshDashboard();
}

/* ── Macro Log ───────────────────────────────────────────────────────────── */
function renderMacroLog() {
  const el = document.getElementById('macro-log');
  if (!el) return;
  if (!AppState.macroLog.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No meals logged yet.<br>Use Nutrition Analyzer to log meals.</p></div>`;
    return;
  }
  el.innerHTML = AppState.macroLog.map((m, i) => `
    <div class="macro-log-item">
      <div>
        <div class="macro-log-item-name">${escapeHtml(m.name)}</div>
        <div class="macro-log-item-macros">
          ${m.calories || 0} kcal · ${m.protein || 0}g protein · ${m.carbs || 0}g carbs
        </div>
      </div>
      <button onclick="removeMacroLog(${i})" title="Remove" style="color:var(--muted-dark);font-size:16px;padding:4px 8px;border-radius:6px;transition:color 0.2s">✕</button>
    </div>`).join('');
}

function removeMacroLog(i) {
  AppState.macroLog.splice(i, 1);
  AppState.saveMacros();
  refreshDashboard();
  showToast('Meal removed from log', 'info');
}

/* ═══════════════════════════════════════════════════════════════════════════
   NUTRITION ANALYZER MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

function setMealInput(value) {
  document.getElementById('meal-input').value = value;
}

/** Analyse a meal via /api/nutrition */
async function analyseMeal() {
  const mealInput  = document.getElementById('meal-input');
  const analyseBtn = document.getElementById('analyse-btn');
  const loader     = document.getElementById('analyse-loader');
  const resultDiv  = document.getElementById('nutrition-result');
  const resultText = document.getElementById('nutrition-text');
  const logBtn     = document.getElementById('log-meal-btn');

  const meal = mealInput.value.trim();
  if (!meal) { showToast('Please describe your meal first', 'error'); return; }

  analyseBtn.disabled = true;
  loader.style.display = 'inline-block';
  resultDiv.style.display = 'none';

  try {
    const res  = await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal }),
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    AppState.lastNutrition = { meal, analysis: data.analysis };
    resultText.innerHTML   = renderMarkdown(data.analysis || '');
    resultDiv.style.display = 'block';
    logBtn.style.display    = 'inline-flex';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    showToast(err.message || 'Analysis failed', 'error');
  } finally {
    analyseBtn.disabled  = false;
    loader.style.display = 'none';
  }
}

/** Parse rough nutrition numbers from AI response text */
function parseNutritionNumbers(text) {
  const extract = (re) => {
    const m = text.match(re);
    return m ? parseInt(m[1]) : 0;
  };
  return {
    calories: extract(/calories[:\s]+(\d+)/i),
    protein:  extract(/protein[:\s]+(\d+)/i),
    carbs:    extract(/carb\w*[:\s]+(\d+)/i),
    fat:      extract(/fat[:\s]+(\d+)/i),
    fibre:    extract(/fi(?:b|bre|ber)[:\s]+(\d+)/i),
  };
}

/** Log the last analysed meal to the Dashboard */
function logMeal() {
  if (!AppState.lastNutrition) return;
  const nums    = parseNutritionNumbers(AppState.lastNutrition.analysis || '');
  const entry   = { name: AppState.lastNutrition.meal, ...nums, time: new Date().toISOString() };
  AppState.macroLog.push(entry);
  AppState.saveMacros();
  showToast('Meal logged to Dashboard ✅');
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEAL PLANNER MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Generate a meal plan via /api/meal-plan */
async function generateMealPlan() {
  const btn    = document.getElementById('gen-plan-btn');
  const loader = document.getElementById('plan-loader');
  const result = document.getElementById('meal-plan-result');
  const text   = document.getElementById('meal-plan-text');

  btn.disabled    = true;
  loader.style.display = 'inline-block';

  const payload = {
    days:           parseInt(document.getElementById('plan-days').value),
    goal:           document.getElementById('plan-goal').value,
    diet:           document.getElementById('plan-diet').value,
    region:         document.getElementById('plan-region').value,
    tdee:           parseInt(document.getElementById('plan-tdee').value) || 2000,
    family_profile: AppState.activeMember ? [AppState.activeMember] : null,
  };

  try {
    const res  = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    AppState.lastMealPlan = data.meal_plan || '';
    text.innerHTML        = renderMarkdown(AppState.lastMealPlan);
    result.style.display  = 'block';
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('Meal plan generated!');

  } catch (err) {
    showToast(err.message || 'Failed to generate meal plan', 'error');
  } finally {
    btn.disabled    = false;
    loader.style.display = 'none';
  }
}

function copyPlan() {
  if (!AppState.lastMealPlan) return;
  navigator.clipboard.writeText(AppState.lastMealPlan)
    .then(() => showToast('Meal plan copied!'))
    .catch(() => showToast('Copy failed', 'error'));
}

function downloadPlan() {
  if (!AppState.lastMealPlan) return;
  const blob = new Blob([AppState.lastMealPlan], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `DynoNutriAI_MealPlan_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Meal plan downloaded!');
}

/* ═══════════════════════════════════════════════════════════════════════════
   BMI CALCULATOR MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Animate the SVG gauge needle.
 * BMI range modelled as 10–40 (clamped), mapped to -90° → +90° arc.
 */
function animateGauge(bmi) {
  const needle  = document.getElementById('gauge-needle');
  if (!needle) return;

  // Map BMI 10–40 → angle -90° to +90°
  const clamped = Math.max(10, Math.min(40, bmi));
  const pct     = (clamped - 10) / 30;   // 0 → 1
  const angle   = -90 + pct * 180;       // -90° → +90°

  // Needle pivot at (100, 100) pointing upward by default
  const rad   = (angle - 90) * (Math.PI / 180);
  const len   = 58;
  const x2    = 100 + len * Math.cos(rad);
  const y2    = 100 + len * Math.sin(rad);

  needle.setAttribute('x2', x2.toFixed(1));
  needle.setAttribute('y2', y2.toFixed(1));
}

/** Calculate BMI + TDEE via /api/bmi */
async function calculateBMI() {
  const btn    = document.getElementById('calc-btn');
  const loader = document.getElementById('bmi-loader');

  const weight   = parseFloat(document.getElementById('bmi-weight').value);
  const height   = parseFloat(document.getElementById('bmi-height').value);
  const age      = parseInt(document.getElementById('bmi-age').value);
  const gender   = document.getElementById('bmi-gender').value;
  const activity = document.getElementById('bmi-activity').value;
  const goal     = document.getElementById('bmi-goal').value;

  if (!weight || !height || !age) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  btn.disabled    = true;
  loader.style.display = 'inline-block';

  try {
    const res  = await fetch('/api/bmi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight, height, age, gender, activity, goal }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    AppState.bmiData = data;
    displayBMIResult(data);

  } catch (err) {
    showToast(err.message || 'BMI calculation failed', 'error');
  } finally {
    btn.disabled    = false;
    loader.style.display = 'none';
  }
}

/** Render the BMI result panel */
function displayBMIResult(data) {
  document.getElementById('bmi-placeholder').style.display    = 'none';
  document.getElementById('bmi-result-content').style.display = 'flex';
  document.getElementById('bmi-result-content').style.flexDirection = 'column';
  document.getElementById('bmi-result-content').style.alignItems = 'center';
  document.getElementById('bmi-result-content').style.width = '100%';

  const numEl  = document.getElementById('bmi-number');
  const catEl  = document.getElementById('bmi-category');
  numEl.textContent = data.bmi;
  catEl.textContent = data.category;

  // Colour the number by category
  const colours = {
    'Underweight':    '#60A5FA',
    'Normal weight':  '#3DDC84',
    'Overweight':     '#FBBF24',
    'Obese':          '#F87171',
  };
  numEl.style.color = colours[data.category] || '#FFFFFF';

  document.getElementById('bmi-tdee').textContent   = data.tdee;
  document.getElementById('bmi-target').textContent = data.target_calories;

  // Healthy weight range (BMI 18.5–25) for given height
  const hm = data.height / 100;
  const lo = Math.round(18.5 * hm * hm);
  const hi = Math.round(25.0 * hm * hm);
  document.getElementById('bmi-range').textContent = `${lo}–${hi} kg`;

  // Animate gauge
  animateGauge(data.bmi);

  // AI advice
  const adviceEl = document.getElementById('bmi-advice');
  adviceEl.innerHTML = data.ai_advice
    ? renderMarkdown(data.ai_advice)
    : '<em>AI advice unavailable — check IBM watsonx.ai configuration.</em>';

  showToast(`BMI ${data.bmi} — ${data.category}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAMILY PROFILES MODULE
   ═══════════════════════════════════════════════════════════════════════════ */
const MEMBER_AVATARS = {
  male:   ['👦', '👨', '👴'],
  female: ['👧', '👩', '👵'],
  other:  ['🧒', '🧑', '🧓'],
};

function getMemberAvatar(member) {
  const gender = (member.gender || 'other').toLowerCase();
  const arr    = MEMBER_AVATARS[gender] || MEMBER_AVATARS.other;
  const age    = parseInt(member.age) || 25;
  return age < 18 ? arr[0] : age > 60 ? arr[2] : arr[1];
}

function getMemberType(age) {
  const a = parseInt(age) || 25;
  if (a < 18) return { label: 'Child',         color: '#60A5FA' };
  if (a > 60) return { label: 'Senior Citizen', color: '#A78BFA' };
  return              { label: 'Adult',          color: '#3DDC84' };
}

/** Render all family member cards */
function renderFamilyGrid() {
  const grid = document.getElementById('family-grid');
  if (!grid) return;

  if (!AppState.familyMembers.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👨‍👩‍👧‍👦</div><p>No family members added yet.<br>Add a member below to get started.</p></div>`;
    updateActiveFamilyInfo();
    return;
  }

  grid.innerHTML = AppState.familyMembers.map((m, i) => {
    const avatar  = getMemberAvatar(m);
    const mtype   = getMemberType(m.age);
    const isActive = AppState.activeMember && AppState.activeMember.name === m.name;
    const avatarBg = m.gender === 'male' ? '#1A2D50' : m.gender === 'female' ? '#2D1A50' : '#1A3020';
    return `
    <div class="member-card ${isActive ? 'active-member' : ''}" id="member-card-${i}">
      <button class="del-member-btn" onclick="deleteMember(${i})" title="Delete">✕</button>
      <div class="member-avatar" style="background:${avatarBg}">${avatar}</div>
      <div class="member-name">${escapeHtml(m.name)}</div>
      <div class="member-detail">${m.age} yrs · ${escapeHtml(m.gender || '')} · ${escapeHtml(m.diet || '')}</div>
      <div>
        <span class="member-tag" style="color:${mtype.color};border-color:${mtype.color}33">${mtype.label}</span>
        ${m.goal ? `<span class="member-tag">${escapeHtml(m.goal)}</span>` : ''}
        ${m.conditions ? `<span class="member-tag" style="color:var(--warn);border-color:#fbbf2440">${escapeHtml(m.conditions)}</span>` : ''}
      </div>
      <div class="member-actions">
        <button class="btn btn-primary" style="font-size:12px;padding:6px 14px"
          onclick="activateMember(${i})">${isActive ? '✓ Active' : 'Activate'}</button>
        ${isActive ? `<button class="btn btn-ghost" style="font-size:12px;padding:6px 14px" onclick="deactivateMember()">Deactivate</button>` : ''}
      </div>
    </div>`;
  }).join('');

  updateActiveFamilyInfo();
}

function addFamilyMember() {
  const name       = document.getElementById('fm-name').value.trim();
  const age        = document.getElementById('fm-age').value;
  const gender     = document.getElementById('fm-gender').value;
  const diet       = document.getElementById('fm-diet').value;
  const goal       = document.getElementById('fm-goal').value;
  const conditions = document.getElementById('fm-conditions').value.trim();

  if (!name || !age) { showToast('Name and Age are required', 'error'); return; }

  AppState.familyMembers.push({ name, age: parseInt(age), gender, diet, goal, conditions });
  AppState.saveFamily();
  renderFamilyGrid();

  // Clear form
  ['fm-name', 'fm-age', 'fm-conditions'].forEach(id => document.getElementById(id).value = '');
  showToast(`${name} added to family!`);
}

function deleteMember(i) {
  const name = AppState.familyMembers[i].name;
  if (AppState.activeMember && AppState.activeMember.name === name) {
    deactivateMember();
  }
  AppState.familyMembers.splice(i, 1);
  AppState.saveFamily();
  renderFamilyGrid();
  showToast(`${name} removed`, 'info');
}

function activateMember(i) {
  AppState.activeMember = AppState.familyMembers[i];
  renderFamilyGrid();
  updateActiveFamilyBadge();
  showToast(`${AppState.activeMember.name}'s profile is now active 👤`);
}

function deactivateMember() {
  AppState.activeMember = null;
  renderFamilyGrid();
  updateActiveFamilyBadge();
  showToast('Family profile deactivated', 'info');
}

function updateActiveFamilyBadge() {
  const badge = document.getElementById('active-member-badge');
  if (AppState.activeMember) {
    badge.textContent    = `👤 ${AppState.activeMember.name}`;
    badge.style.display  = 'inline-flex';
  } else {
    badge.style.display  = 'none';
  }
}

function updateActiveFamilyInfo() {
  const el = document.getElementById('active-family-info');
  if (!el) return;
  if (AppState.activeMember) {
    const m = AppState.activeMember;
    el.innerHTML = `
      <strong style="color:var(--accent)">${escapeHtml(m.name)}</strong>
      · ${m.age} yrs · ${escapeHtml(m.gender || '')} · ${escapeHtml(m.diet || '')}
      ${m.goal       ? `· <em>${escapeHtml(m.goal)}</em>` : ''}
      ${m.conditions ? `· <span style="color:var(--warn)">⚠ ${escapeHtml(m.conditions)}</span>` : ''}
      <br><span class="text-muted text-xs">All chat responses are personalised for this profile.</span>`;
    el.style.color = '';
  } else {
    el.textContent = 'No active family profile. Click "Activate" on a member card to personalise chat advice.';
    el.style.color = 'var(--muted)';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEALTH CHECK
   ═══════════════════════════════════════════════════════════════════════════ */

/** Poll /api/health to show connection status */
async function checkHealth() {
  const dot   = document.getElementById('status-dot');
  const text  = document.getElementById('status-text');
  const model = document.getElementById('sidebar-model');

  try {
    const res  = await fetch('/api/health');
    const data = await res.json();

    if (data.status === 'ok') {
      dot.className   = 'status-dot';
      text.textContent = 'Connected';
      model.textContent = `Model: ${(data.model || '—').replace('ibm/', '')}`;
    } else {
      dot.className   = 'status-dot red';
      text.textContent = 'Config missing';
      model.textContent = 'Check .env file';
    }
  } catch {
    dot.className   = 'status-dot red';
    text.textContent = 'Offline';
    model.textContent = 'Server unreachable';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Restore active member badge
  updateActiveFamilyBadge();

  // Run health check
  checkHealth();
  setInterval(checkHealth, 60_000);   // re-check every 60s

  // Initialise dashboard data
  refreshDashboard();

  // Focus chat input
  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.focus();
});
