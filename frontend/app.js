// ================== CONFIG / URL PARAMS ==================
const qs = new URLSearchParams(location.search);
const workerId     = qs.get("workerId")     || "local-worker";
const assignmentId = qs.get("assignmentId") || "local-assignment";
const conditionRaw = (qs.get("condition") || "baseline").toLowerCase();
const condition    = (conditionRaw === "with-ai" || conditionRaw === "withai") ? "withAI" : "baseline";
const nTrials      = parseInt(qs.get("n") || "12", 10);
const isWithAI     = condition === "withAI";

// OPTIONAL: Google Form prefill support
// Replace GOOGLE_FORM_URL with your form; set entry IDs if/when you have them.
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc2EMNvnpzBZ-TAt8OD-64-hyP-245tEExQBH7pSuTFY2HKtw/viewform?usp=header";
const FORM_PREFILL = {
  uniqname: null,      // e.g., "entry.123456789"
  survey_code: null    // e.g., "entry.987654321"
};

// ================== DOM HELPERS ==================
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

// ================== DOM HOOKS ==================
// Header / theme
const htmlEl          = document.documentElement;
const btnTheme        = $("#btnTheme");
const btnExit         = $("#btnExit");
const sessionTimerEl  = $("#sessionTimer");

// Screens
const screenIntro     = $("#screen-intro");
const screenTask      = $("#screen-task");
const screenDone      = $("#screen-done");

// Intro
const nLabel          = $("#nTrialsLabel");
const uniqInput       = $("#uniqInput");
const btnStart        = $("#btnStart");
const aiIntroBlock    = $("#aiIntroBlock");

// Example modal (if you added it)
const btnOpenExample  = $("#btnOpenExample");
const exampleModal    = $("#exampleModal");
const btnCloseExample = $("#btnCloseExample");
const btnCloseExample2= $("#btnCloseExample2");
const exampleModalImg = $("#exampleModalImg");

// Help modal
const btnOpenHelp     = $("#btnOpenHelp");
const helpModal       = $("#helpModal");
const btnCloseHelp    = $("#btnCloseHelp");
const btnCloseHelp2   = $("#btnCloseHelp2");
const aiHelpBlock     = $("#aiHelpBlock");

// Task area
const trialCounter    = $("#trialCounter");
const memeImg         = $("#memeImg");
const imgErr          = $("#imgErr");
const memeText        = $("#memeText");
const confGroup       = $("#confGroup");
const reasonBox       = $("#reasonBox");
const btnSkip         = $("#btnSkip");
const btnNext         = $("#btnNext");

// AI section (task-time)
const aiRow           = $("#aiRow");
const btnAI           = $("#btnAI");
const aiBox           = $("#aiBox");
const aiTopk          = $("#aiTopk");
const aiRationale     = $("#aiRationale");

// Radios
const sentRadios      = $$('input[name="sent"]');
const confRadios      = $$('input[name="conf"]');

// Done screen
const surveyCodeEl    = $("#surveyCode");
const btnSurvey       = $("#btnSurvey");

// ================== THEME PERSIST ==================
(function initTheme(){
  const saved = localStorage.getItem("theme");
  const current = saved === "light" ? "light" : "dark";
  htmlEl.setAttribute("data-theme", current);
  btnTheme?.setAttribute("aria-pressed", current === "light" ? "true" : "false");
})();
btnTheme?.addEventListener("click", () => {
  const now = htmlEl.getAttribute("data-theme") === "light" ? "dark" : "light";
  htmlEl.setAttribute("data-theme", now);
  localStorage.setItem("theme", now);
  btnTheme?.setAttribute("aria-pressed", now === "light" ? "true" : "false");
});

// ================== STATE ==================
let trials = [];
let idx = 0;
let startedAt = null;    // ms
let trialStart = null;   // per-trial ms
let results = [];

let aiOpenCount = 0;
let aiFirstOpenMs = null;

// timer state
let timerId = null;

// ================== INTRO INIT ==================
if (nLabel) nLabel.textContent = nTrials;

if (isWithAI) {
  aiIntroBlock?.classList.remove("hidden");
  aiHelpBlock?.classList.remove("hidden");
} else {
  aiIntroBlock?.classList.add("hidden");
  aiHelpBlock?.classList.add("hidden");
}

screenIntro?.classList.remove("hidden");
screenTask?.classList.add("hidden");
screenDone?.classList.add("hidden");

// gate Start on uniqname
function toggleStartButton() {
  const v = (uniqInput?.value || "").trim();
  if (btnStart) btnStart.disabled = v.length === 0;
}
uniqInput?.addEventListener("input", toggleStartButton);
toggleStartButton();

// ================== TIMER ==================
function fmtMMSS(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function startTimer() {
  if (!sessionTimerEl) return;
  sessionTimerEl.classList.remove("hidden");
  sessionTimerEl.textContent = "00:00";
  if (timerId) { clearInterval(timerId); timerId = null; }
  timerId = setInterval(() => {
    if (!startedAt) return;
    const elapsed = Date.now() - startedAt;
    sessionTimerEl.textContent = fmtMMSS(elapsed);
  }, 1000);
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  sessionTimerEl?.classList.add("hidden");
}

// ================== EXAMPLE MODAL (optional) ==================
function openExample()  { exampleModal?.classList.remove("hidden"); }
function closeExample() { exampleModal?.classList.add("hidden"); }
btnOpenExample?.addEventListener("click", openExample);
btnCloseExample?.addEventListener("click", closeExample);
btnCloseExample2?.addEventListener("click", closeExample);

if (exampleModalImg) {
  let triedPlaceholder = false;
  exampleModalImg.addEventListener("error", () => {
    if (!triedPlaceholder) {
      triedPlaceholder = true;
      exampleModalImg.src = "/static/images/placeholder_example.png";
      return;
    }
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="420">
        <rect width="100%" height="100%" fill="#e9edf3"/>
        <rect x="20" y="20" width="760" height="380" rx="14" ry="14" fill="#f5f7fb" stroke="#cfd6e3"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
              font-family="Segoe UI, Roboto, Helvetica, Arial" font-size="20" fill="#63708a">
          Example unavailable
        </text>
      </svg>`;
    exampleModalImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

// ================== HELP MODAL ==================
function openHelp()  { helpModal?.classList.remove("hidden"); }
function closeHelp() { helpModal?.classList.add("hidden"); }
btnOpenHelp?.addEventListener("click", openHelp);
btnCloseHelp?.addEventListener("click", closeHelp);
btnCloseHelp2?.addEventListener("click", closeHelp);

// ================== LOAD TRIALS ==================
btnStart?.addEventListener("click", async () => {
  const uniq = (uniqInput?.value || "").trim();
  if (!uniq) {
    alert("Please enter your UM uniqname.");
    uniqInput?.focus();
    return;
  }
  btnStart.disabled = true;
  try {
    const url = new URL("/trials", location.origin);
    url.searchParams.set("workerId", workerId);
    url.searchParams.set("assignmentId", assignmentId);
    url.searchParams.set("condition", condition);
    url.searchParams.set("n", String(nTrials));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!Array.isArray(data.trials)) throw new Error("Bad response");
    trials = data.trials;
    startedAt = Date.now();
    idx = 0; results = [];

    // show task + start session timer
    screenIntro?.classList.add("hidden");
    screenTask?.classList.remove("hidden");
    startTimer();

    renderTrial();
  } catch (e) {
    alert("Failed to load trials: " + (e.message || e));
    btnStart.disabled = false;
  }
});

// ================== RENDER ONE TRIAL ==================
function renderTrial() {
  const t = trials[idx];

  if (trialCounter) trialCounter.textContent = `Trial ${idx+1} of ${trials.length}`;

  aiOpenCount = 0;
  aiFirstOpenMs = null;
  if (btnNext) btnNext.disabled = true;
  sentRadios.forEach(r => (r.checked = false));
  confRadios.forEach(r => (r.checked = false));
  if (reasonBox) reasonBox.value = "";

  imgErr?.classList.add("hidden");
  if (btnSkip) btnSkip.disabled = true;

  if (memeImg) {
    memeImg.onload = () => { if (btnSkip) btnSkip.disabled = true; };
    memeImg.onerror = () => {
      imgErr?.classList.remove("hidden");
      if (btnSkip) btnSkip.disabled = false;
    };
    memeImg.src = t.img_url || "";
  }

  if (memeText) memeText.textContent = t.meme_text || "(no overlaid text)";

  confGroup?.classList.remove("disabled");

  if (isWithAI) {
    aiRow?.classList.remove("hidden");
    aiBox?.classList.add("hidden");
    if (btnAI) btnAI.textContent = "Show AI suggestion";
    buildTopk(t);
    if (aiRationale) aiRationale.textContent = t.text_rationale || "—";
    $$('input[name="ai_helpful"]').forEach(r => r.checked = false);
  } else {
    aiRow?.classList.add("hidden");
  }

  trialStart = Date.now();
}

function buildTopk(t) {
  if (!aiTopk) return;
  aiTopk.innerHTML = "";
  const triples = [];
  if (t.mm_top1 && t.mm_p1 != null) {
    triples.push([t.mm_top1, Number(t.mm_p1)]);
    if (t.mm_top2) triples.push([t.mm_top2, Number(t.mm_p2 || 0)]);
    if (t.mm_top3) triples.push([t.mm_top3, Number(t.mm_p3 || 0)]);
  } else if (t.mm_p_neg != null && t.mm_p_neu != null && t.mm_p_pos != null) {
    const arr = [
      ["negative", Number(t.mm_p_neg)],
      ["neutral",  Number(t.mm_p_neu)],
      ["positive", Number(t.mm_p_pos)],
    ].sort((a,b) => b[1]-a[1]);
    triples.push(...arr);
  }
  if (!triples.length) {
    aiTopk.textContent = "(no AI scores available)";
    return;
  }
  for (const [lab, p] of triples) {
    const k = document.createElement("div");
    const v = document.createElement("div");
    k.textContent = lab;
    v.textContent = (p*100).toFixed(1) + "%";
    aiTopk.appendChild(k);
    aiTopk.appendChild(v);
  }
}

// ================== INTERACTIONS ==================
btnAI?.addEventListener("click", () => {
  if (!isWithAI || !aiBox || !btnAI) return;
  const hidden = aiBox.classList.contains("hidden");
  if (hidden) {
    aiBox.classList.remove("hidden");
    btnAI.textContent = "Hide AI suggestion";
    aiOpenCount += 1;
    if (!aiFirstOpenMs) aiFirstOpenMs = Date.now() - trialStart;
  } else {
    aiBox.classList.add("hidden");
    btnAI.textContent = "Show AI suggestion";
  }
});

sentRadios.forEach(r => {
  r.addEventListener("change", () => {
    if (r.value === "unsure" && r.checked) {
      confRadios.forEach(x => (x.checked = false));
      confGroup?.classList.add("disabled");
    } else if (r.checked) {
      confGroup?.classList.remove("disabled");
    }
    validateEnableNext();
  });
});

confRadios.forEach(r => r.addEventListener("change", validateEnableNext));
reasonBox?.addEventListener("input", validateEnableNext);

btnSkip?.addEventListener("click", () => {
  const broken = !memeImg?.complete || (memeImg?.naturalWidth === 0);
  if (!broken) {
    const ok = confirm("The image appears to have loaded. Skip anyway?");
    if (!ok) return;
  }
  finalizeTrial({ skipped: true, load_error: !!broken });
});

btnNext?.addEventListener("click", () => finalizeTrial({}));

btnExit?.addEventListener("click", () => {
  if (!confirm("Exit & submit now? Your progress so far will be saved.")) return;
  submitAll({ exitEarly: true });
});

// ================== SHORTCUTS ==================
// Confidence: 1..5 ; Sentiments: A=Neg, B=Neu, C=Pos, D=Unsure ; Enter=Next
window.addEventListener("keydown", (e) => {
  const inReason = document.activeElement === reasonBox;
  const modalOpen = (helpModal && !helpModal.classList.contains("hidden")) ||
                    (exampleModal && !exampleModal.classList.contains("hidden"));
  if (inReason || modalOpen || screenTask?.classList.contains("hidden")) return;

  if (["1","2","3","4","5"].includes(e.key)) {
    if (!confGroup?.classList.contains("disabled")) {
      const target = $$('input[name="conf"]').find(r => r.value === e.key);
      if (target) target.checked = true;
      validateEnableNext();
    }
  } else if (["a","b","c","d","A","B","C","D"].includes(e.key)) {
    const map = {
      "a":"negative", "b":"neutral", "c":"positive", "d":"unsure",
      "A":"negative", "B":"neutral", "C":"positive", "D":"unsure"
    };
    const target = $$('input[name="sent"]').find(r => r.value === map[e.key]);
    if (target) {
      target.checked = true;
      if (target.value === "unsure") {
        confRadios.forEach(x => (x.checked = false));
        confGroup?.classList.add("disabled");
      } else {
        confGroup?.classList.remove("disabled");
      }
      validateEnableNext();
    }
  } else if (e.key === "Enter") {
    if (!btnNext?.disabled) btnNext.click();
  }
});

function validateEnableNext() {
  const sent   = $$('input[name="sent"]').find(r => r.checked)?.value || null;
  const conf   = $$('input[name="conf"]').find(r => r.checked)?.value || null;
  const reason = (reasonBox?.value || "").trim();

  let ok = false;
  if (sent === "unsure") {
    ok = reason.length > 0;
  } else if (sent) {
    ok = !!conf;
  }
  if (btnNext) btnNext.disabled = !ok;
}

// ================== FINALIZE & SUBMIT ==================
function summarizeTopkForLog(t) {
  const rows = [];
  if (t.mm_top1 && t.mm_p1 != null) {
    rows.push(`${t.mm_top1}:${Number(t.mm_p1).toFixed(3)}`);
    if (t.mm_top2) rows.push(`${t.mm_top2}:${Number(t.mm_p2||0).toFixed(3)}`);
    if (t.mm_top3) rows.push(`${t.mm_top3}:${Number(t.mm_p3||0).toFixed(3)}`);
  } else if (t.mm_p_neg != null && t.mm_p_neu != null && t.mm_p_pos != null) {
    rows.push(`negative:${Number(t.mm_p_neg).toFixed(3)}`);
    rows.push(`neutral:${Number(t.mm_p_neu).toFixed(3)}`);
    rows.push(`positive:${Number(t.mm_p_pos).toFixed(3)}`);
  }
  return rows.join("|");
}

function finalizeTrial({ skipped=false, load_error=false }) {
  const t = trials[idx];
  const sent   = $$('input[name="sent"]').find(r => r.checked)?.value || null;
  const conf   = $$('input[name="conf"]').find(r => r.checked)?.value || null;
  const reason = (reasonBox?.value || "").trim();
  const rt_ms  = Date.now() - trialStart;

  const aiHelpful = isWithAI ? ($$('input[name="ai_helpful"]').find(r => r.checked)?.value || null) : null;

  results.push({
    trial_id: t.id,
    order: idx + 1,
    img_url: t.img_url || null,
    meme_text: t.meme_text || null,
    chosen: sent,
    confidence: conf ? Number(conf) : null,
    reasoning: reason || null,
    rt_ms,
    skipped,
    load_error,
    condition,
    ai_opened: isWithAI ? (aiOpenCount > 0) : null,
    ai_open_count: isWithAI ? aiOpenCount : null,
    ai_first_open_ms: isWithAI ? (aiFirstOpenMs ?? null) : null,
    ai_seen_topk: isWithAI ? summarizeTopkForLog(t) : null,
    ai_helpful: isWithAI ? aiHelpful : null,
    timestamp: new Date().toISOString()
  });

  idx += 1;
  if (idx < trials.length) {
    renderTrial();
  } else {
    submitAll({ exitEarly: false });
  }
}

function buildSurveyURL(uniq, code) {
  // If you later find your Google Form "entry" IDs, set FORM_PREFILL above.
  // This will prefill. If not, we just return the base URL.
  const params = new URLSearchParams();
  params.set("usp", "pp_url");
  if (FORM_PREFILL.uniqname)   params.set(FORM_PREFILL.uniqname, uniq || "");
  if (FORM_PREFILL.survey_code)params.set(FORM_PREFILL.survey_code, code || "");
  const hasPrefill = [...params.keys()].some(k => k.startsWith("entry."));
  return hasPrefill ? GOOGLE_FORM_URL.replace(/\/viewform.*/,"/viewform") + "?" + params.toString()
                    : GOOGLE_FORM_URL;
}

async function submitAll({ exitEarly }) {
  screenTask?.classList.add("hidden");

  const ended = Date.now();
  const payload = {
    workerId,
    assignmentId,
    condition,
    startedAt,
    endedAt: ended,
    total_ms: startedAt ? (ended - startedAt) : null,  // total session time
    exit_early: !!exitEarly,
    uniqname: (uniqInput?.value || "").trim() || null,
    clientMeta: {
      userAgent: navigator.userAgent,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      lang: navigator.language || null,
      viewport: { w: window.innerWidth, h: window.innerHeight }
    },
    trials: results
  };

  let code = null;
  try {
    const res = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    code = data?.survey_code || null;
  } catch (e) {
    console.warn("Submit failed; generating local code.", e);
  }
  if (!code) code = localSurveyCode(workerId, startedAt);

  // stop timer and show Done screen + survey link
  stopTimer();
  if (surveyCodeEl) surveyCodeEl.textContent = code;
  const uniq = (uniqInput?.value || "").trim();
  if (btnSurvey) btnSurvey.href = buildSurveyURL(uniq, code);

  screenDone?.classList.remove("hidden");
}

function localSurveyCode(wid, t0) {
  const raw = (wid + ":" + String(t0 || Date.now()));
  let h = 0; for (let i=0;i<raw.length;i++){ h = (h*31 + raw.charCodeAt(i)) >>> 0; }
  return (h.toString(36).toUpperCase()).slice(-8);
}
