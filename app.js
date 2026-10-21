/* =========================================================
   淘淘飞船 · 凑十 / 破十 星际任务
   Vanilla JS. All artwork is CSS + inline SVG.
   ========================================================= */

"use strict";

/* ---------- tiny helpers ---------- */

const $ = (selector, root = document) => root.querySelector(selector);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo") === "1";
const STORAGE_KEY = `shishi-space-v1${DEMO ? "-demo" : ""}`;

/* ---------- system color scheme ---------- */

const lightScheme = window.matchMedia("(prefers-color-scheme: light)");
const forcedTheme = params.get("theme");

function applyColorScheme() {
  const light = forcedTheme ? forcedTheme === "light" : lightScheme.matches;
  document.documentElement.dataset.theme = light ? "light" : "dark";
  document.documentElement.style.colorScheme = light ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#eef5ff" : "#070d24");
}

applyColorScheme();
if (!forcedTheme && lightScheme.addEventListener) {
  lightScheme.addEventListener("change", applyColorScheme);
}

/* ---------- dates ---------- */

const WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"];
const TODAY = startOfDay(new Date());
const TODAY_KEY = toKey(TODAY);

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function startOfWeek(date) {
  const copy = startOfDay(date);
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function monthLabel(year, monthIndex) {
  return `${year}年${monthIndex + 1}月`;
}

/* ---------- state ---------- */

let bootLessonStep = params.has("step")
  ? clamp(Number(params.get("step")) || 0, 0, 3)
  : null;

const state = loadState();
let currentRoute = null;
let calendarCursor = { year: TODAY.getFullYear(), month: TODAY.getMonth() };
let lessonState = { kind: "make-ten", step: 0, index: 0, questions: [], courseId: null, stepSolved: false, stepWrong: [], dragged: 0 };
let practiceState = {
  index: 0,
  correct: 0,
  answered: false,
  wrongAnswers: [],
  questions: [],
  mode: "free",
  lessonId: null,
  title: "星际小挑战",
  crumb: "MISSION 03 · 自己算一算",
  planet: "自由练习",
  color: "#54e6b4",
};
let practiceSignature = "";
let lessonSignature = "";
let lastPracticePromptKey = "";
let passCheckState = { values: [], wrong: [] };
let toastTimer = 0;
let audioCtx = null;
let lastConfettiAt = 0;
let lastLaserAt = 0;
let rocketSeq = 0;
let launching = false;
let transitioning = false;
let lastSpokenKey = "";
let lastCelebrateKey = "";
let speechVoices = [];
let narrationAudio = null;
let lastBorrowSfxKey = "";
let traveling = false;
const AUDIO_VERSION = "22";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.checkins)) {
        return {
          checkins: [...new Set(parsed.checkins)],
          sound: parsed.sound !== false,
          lessonDone:
            parsed.lessonDone && typeof parsed.lessonDone === "object"
              ? parsed.lessonDone
              : DEMO
                ? demoLessonDone()
                : {},
          records: Array.isArray(parsed.records)
            ? parsed.records.slice(-600)
            : DEMO
              ? demoRecords()
              : [],
          wrong:
            parsed.wrong && typeof parsed.wrong === "object"
              ? parsed.wrong
              : DEMO
                ? demoWrong()
                : {},
        };
      }
    }
  } catch (error) {
    /* private modes can block storage; the app still works for this visit */
  }

  const fresh = { checkins: [], sound: true, lessonDone: {}, records: [], wrong: {} };
  if (DEMO) {
    fresh.checkins = demoCheckins();
    fresh.lessonDone = demoLessonDone();
    fresh.records = demoRecords();
    fresh.wrong = demoWrong();
  }
  return fresh;
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        checkins: state.checkins,
        sound: state.sound,
        lessonDone: state.lessonDone,
        records: state.records,
        wrong: state.wrong,
      }),
    );
  } catch (error) {
    /* keep playing even if persistence is unavailable */
  }
}

function demoCheckins() {
  const keys = new Set();
  for (let i = 7; i >= 1; i -= 1) keys.add(toKey(addDays(TODAY, -i)));
  for (let day = 1; day <= 5; day += 1) {
    const candidate = new Date(TODAY.getFullYear(), TODAY.getMonth(), day);
    if (candidate < TODAY) keys.add(toKey(candidate));
  }
  return [...keys].sort();
}

function demoLessonDone() {
  return {
    1: { completedAt: toKey(addDays(TODAY, -6)), score: 5 },
    2: { completedAt: toKey(addDays(TODAY, -5)), score: 5 },
    3: { completedAt: toKey(addDays(TODAY, -4)), score: 3 },
    4: { completedAt: toKey(addDays(TODAY, -3)), score: 3 },
  };
}

function demoRecords() {
  const rows = [
    ["make", 9, 5, true],
    ["make", 9, 3, true],
    ["break", 13, 9, true],
    ["break", 12, 9, true],
    ["break", 15, 9, false],
    ["make", 8, 4, true],
    ["break", 14, 8, true],
    ["break", 16, 7, true],
  ];
  return rows.map(([kind, a, b, correct], index) => ({
    date: toKey(addDays(TODAY, -3 + Math.floor(index / 3))),
    ts: Date.now() - (8 - index) * 3600 * 1000,
    lessonId: index < 3 ? 3 : 4,
    qid: `${kind}-${a}-${b}`,
    kind,
    a,
    b,
    correct,
    mode: "lesson",
  }));
}

function demoWrong() {
  return {
    "break-15-9": {
      kind: "break",
      a: 15,
      b: 9,
      count: 1,
      lastAt: Date.now() - 8 * 3600 * 1000,
    },
  };
}

function isChecked(key) {
  return state.checkins.includes(key);
}

function todayChecked() {
  return isChecked(TODAY_KEY);
}

function calcStreak() {
  const set = new Set(state.checkins);
  let cursor = new Date(TODAY);
  if (!set.has(toKey(cursor))) cursor = addDays(cursor, -1);

  let count = 0;
  while (set.has(toKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function totalStars() {
  return state.checkins.length;
}

const MILESTONES = [
  { days: 3, name: "星星徽章", icon: "star" },
  { days: 7, name: "火箭涂装", icon: "sparkle" },
  { days: 14, name: "星际望远镜", icon: "telescope" },
  { days: 30, name: "银河勋章", icon: "medal" },
];

function nextMilestone(streak = calcStreak()) {
  return MILESTONES.find((item) => item.days > streak) || null;
}

function unlockedMilestones(streak = calcStreak()) {
  return MILESTONES.filter((item) => item.days <= streak);
}

/* ---------- icons ---------- */

const ICON_BODIES = {
  star: '<path d="M12 2.4l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.2 6.1 20.3l1.2-6.6L2.4 9.4l6.7-.9L12 2.4z" fill="currentColor" stroke="none"/>',
  flame:
    '<path d="M12.6 2.2c.4 3.2-2.1 4.4-2.9 6.7-.5 1.5.2 2.8 1.3 3.4.1-1.7 1.1-2.7 2.1-3.4 1.4 2 3.3 3.4 3.3 6A5.5 5.5 0 0 1 11 20.4a5.6 5.6 0 0 1-5.6-5.6c0-4.6 3.4-6.6 7.2-12.6z" fill="currentColor" stroke="none"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M7.5 13.2h2M12 13.2h2M16.5 13.2h.01M7.5 17h2M12 17h2"/>',
  volume:
    '<path d="M4 9.5h3.4L13 5v14L7.4 14.5H4z" fill="currentColor" stroke="none"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute:
    '<path d="M4 9.5h3.4L13 5v14L7.4 14.5H4z" fill="currentColor" stroke="none"/><path d="m16.5 9.5 5 5M21.5 9.5l-5 5"/>',
  arrowRight: '<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
  arrowLeft: '<path d="M20 12H5M10.5 6.5 5 12l5.5 5.5"/>',
  check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
  home:
    '<path d="m3.5 10.8 8.5-7.6 8.5 7.6"/><path d="M5.5 9.5V20h5v-6h3v6h5V9.5"/>',
  sparkle:
    '<path d="M12 2.5c.8 5.2 2.8 7.2 8 8-5.2.8-7.2 2.8-8 8-.8-5.2-2.8-7.2-8-8 5.2-.8 7.2-2.8 8-8z" fill="currentColor" stroke="none"/>',
  heart:
    '<path d="M12 20.5S3.5 15.2 3.5 9.3A4.8 4.8 0 0 1 12 5.6a4.8 4.8 0 0 1 8.5 3.7c0 5.9-8.5 11.2-8.5 11.2z"/>',
  gift:
    '<path d="M4 10h16v10H4zM3 6.5h18V10H3zM12 6.5V20"/><path d="M12 6.5S9 3 7 4.2s1.2 2.3 5 2.3zM12 6.5S15 3 17 4.2s-1.2 2.3-5 2.3z"/>',
  eye:
    '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  refresh:
    '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  lightbulb:
    '<path d="M9 18h6M10 21h4M8.2 14.5a6 6 0 1 1 7.6 0c-.8.7-1.3 1.5-1.3 2.5h-5c0-1-.5-1.8-1.3-2.5z"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  rocket:
    '<path d="M12 2.5c3.2 3.5 4.8 7.2 4.8 11.2V19H7.2v-5.3c0-4 1.6-7.7 4.8-11.2z"/><circle cx="12" cy="10" r="2.1"/><path d="M7.2 14.8 3.5 19.5l4.1-.6M16.8 14.8l3.7 4.7-4.1-.6M9.8 21h4.4"/>',
  rocketFill:
    '<path d="M12 2.5c3.2 3.5 4.8 7.2 4.8 11.2V19H7.2v-5.3c0-4 1.6-7.7 4.8-11.2z" fill="currentColor" stroke="none"/><path d="M7.2 14.8 3.5 19.5l4.1-.6M16.8 14.8l3.7 4.7-4.1-.6" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1.9" fill="#FFF6E4" stroke="none"/>',
  orbit:
    '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-27 12 12)"/><circle cx="20" cy="7.8" r="1.4" fill="currentColor" stroke="none"/>',
  planet:
    '<circle cx="12" cy="12" r="6.6"/><ellipse cx="12" cy="12" rx="10.8" ry="3.4" transform="rotate(-18 12 12)"/>',
  comet:
    '<circle cx="7.8" cy="16.2" r="3.2" fill="currentColor" stroke="none"/><path d="M10.6 13.8 21 4M12.1 16.4l7.4-5.3M9.4 12.5l8.2-5.1"/>',
  telescope:
    '<path d="m3.5 13.4 10.7-6.2 3 5.9-10.7 6.2zM14.2 7.2l3.3-1.9 4.1 6.8-3.4 1.9M7.5 17.5 5 22M5 22h9"/>',
  medal:
    '<circle cx="12" cy="14" r="4.8"/><path d="m9 9.5-2-7h3.6L12 6l1.4-3.5H17l-2 7"/><path d="m12 12 .9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor" stroke="none"/>',
};

function icon(name, extraClass = "") {
  const body = ICON_BODIES[name] || ICON_BODIES.sparkle;
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/* ---------- rocket mascot ---------- */

function rocketSvg() {
  rocketSeq += 1;
  const id = `ship-${rocketSeq}`;
  return `
  <svg viewBox="0 0 260 300" class="rocket-svg" role="img" aria-label="淘淘小火箭">
    <defs>
      <linearGradient id="body-${id}" x1="88" y1="30" x2="176" y2="236" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#FFFDF5"/>
        <stop offset="0.58" stop-color="#FFF6E4"/>
        <stop offset="1" stop-color="#EBD8B5"/>
      </linearGradient>
      <radialGradient id="window-${id}" cx="0.35" cy="0.28" r="0.8">
        <stop offset="0" stop-color="#D8FAFF"/>
        <stop offset="0.55" stop-color="#8BE8FF"/>
        <stop offset="1" stop-color="#39A8D8"/>
      </radialGradient>
      <radialGradient id="glow-${id}" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#FFC94D" stop-opacity="0.65"/>
        <stop offset="1" stop-color="#FF7A59" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <ellipse cx="130" cy="290" rx="52" ry="8" fill="#020612" opacity="0.5"/>

    <g class="rocket-flames">
      <path class="flame flame-outer" d="M106 228C98 252 118 262 130 292C142 262 162 252 154 228Z" fill="#FF7A59"/>
      <path class="flame flame-mid" d="M114 230C109 248 123 259 130 277C137 259 151 248 146 230Z" fill="#FFC94D"/>
      <path class="flame flame-inner" d="M121 232C119 243 127 250 130 259C133 250 141 243 139 232Z" fill="#FFF6D8"/>
    </g>

    <g stroke="#07102B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M88 186C62 196 52 222 58 246L88 222Z" fill="#FF7A59"/>
      <path d="M172 186c26 10 36 36 30 60l-30-24z" fill="#55E0FF"/>
      <rect x="112" y="216" width="36" height="18" rx="8" fill="#A9B6DD"/>

      <path d="M130 24c28 32 44 68 44 104v76c0 20-18 32-44 32s-44-12-44-32v-76c0-36 16-72 44-104z" fill="url(#body-${id})"/>
      <path d="M130 24c21 24 35 54 39 81H91c4-27 18-57 39-81z" fill="#FF7A59"/>
      <path d="M91 105h78" fill="none" stroke-width="4"/>

      <circle cx="130" cy="136" r="40" fill="#07102B" stroke="#FFC94D" stroke-width="6"/>
      <circle cx="130" cy="136" r="31" fill="url(#window-${id})" stroke="none"/>
      <ellipse cx="116" cy="122" rx="11" ry="5.5" fill="#FFFFFF" opacity="0.55" stroke="none" transform="rotate(-28 116 122)"/>
      <ellipse cx="117" cy="136" rx="4.3" ry="6" fill="#07102B" stroke="none"/>
      <ellipse cx="143" cy="136" rx="4.3" ry="6" fill="#07102B" stroke="none"/>
      <circle cx="118.5" cy="134" r="1.4" fill="#FFFFFF" stroke="none"/>
      <circle cx="144.5" cy="134" r="1.4" fill="#FFFFFF" stroke="none"/>
      <path d="M120 149q10 8 20 0" fill="none" stroke-width="4"/>
      <ellipse cx="108" cy="151" rx="7" ry="4" fill="#FF7A59" opacity="0.5" stroke="none"/>
      <ellipse cx="152" cy="151" rx="7" ry="4" fill="#FF7A59" opacity="0.5" stroke="none"/>

      <circle cx="130" cy="194" r="18" fill="#FFC94D"/>
      <text x="130" y="200" text-anchor="middle" fill="#07102B" stroke="none" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="16" font-weight="800">10</text>

      <path d="M130 27c10-9 20-12 28-17" fill="none" stroke-width="4"/>
      <path d="M164 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" fill="#FFC94D" stroke-width="3"/>
    </g>

    <g class="rocket-sparkles" fill="#FFF6E4" stroke="none">
      <path d="M42 92c.7 4.5 2.5 6.3 7 7-4.5.7-6.3 2.5-7 7-.7-4.5-2.5-6.3-7-7 4.5-.7 6.3-2.5 7-7z" opacity=".9"/>
      <path d="M216 74c.6 3.8 2.1 5.3 5.9 5.9-3.8.6-5.3 2.1-5.9 5.9-.6-3.8-2.1-5.3-5.9-5.9 3.8-.6 5.3-2.1 5.9-5.9z" opacity=".8"/>
      <circle cx="58" cy="196" r="2.2" opacity=".7"/>
      <circle cx="205" cy="170" r="1.8" opacity=".65"/>
    </g>
    <circle cx="130" cy="258" r="58" fill="url(#glow-${id})" opacity=".55" pointer-events="none"/>
  </svg>`;
}

/* ---------- audio ---------- */

function audioContext() {
  if (!state.sound) return null;
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function note(frequency, delay, duration, volume = 0.035, type = "triangle") {
  const ctx = audioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.06);
}

function noiseBurst(duration, volume, from, to, type = "lowpass", q = 1) {
  const ctx = audioContext();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  source.buffer = buffer;
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, now);
  filter.frequency.exponentialRampToValueAtTime(to, now + duration * 0.82);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
}

function sfx(kind) {
  if (!state.sound) return;
  if (kind === "tap") {
    note(660, 0, 0.07, 0.022);
  } else if (kind === "step") {
    [523.25, 659.25, 783.99].forEach((f, i) => note(f, i * 0.065, 0.16, 0.036));
  } else if (kind === "checkin") {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.085, 0.28, 0.045));
  } else if (kind === "win") {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => note(f, i * 0.09, 0.35, 0.05));
  } else if (kind === "whoosh") {
    noiseBurst(0.42, 0.035, 340, 2800, "bandpass", 1.4);
    note(320, 0.02, 0.3, 0.022, "sine");
  } else if (kind === "warp") {
    noiseBurst(0.55, 0.04, 180, 3800, "bandpass", 1.6);
    [220, 330, 440, 660].forEach((f, i) => note(f, i * 0.08, 0.28, 0.025, "sawtooth"));
  } else if (kind === "sparkle") {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(f, i * 0.045, 0.2, 0.026, "sine"));
  } else if (kind === "crystal") {
    [2093, 2637, 3136].forEach((f, i) => note(f, i * 0.055, 0.24, 0.018, "sine"));
    noiseBurst(0.18, 0.016, 2400, 5200, "highpass", 1.2);
  } else if (kind === "fanfare") {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      note(f, i * 0.1, 0.42, 0.055, "triangle"),
    );
    [1046.5, 1318.5, 1568].forEach((f, i) => note(f, 0.5 + i * 0.045, 0.45, 0.032, "sine"));
  } else if (kind === "boom") {
    note(72, 0, 0.38, 0.07, "sine");
    noiseBurst(0.35, 0.045, 140, 380, "lowpass", 0.8);
  } else if (kind === "pop") {
    note(880, 0, 0.06, 0.02, "sine");
    note(440, 0.045, 0.1, 0.018, "sine");
  } else if (kind === "launch") {
    noiseBurst(0.68, 0.075, 180, 1500, "lowpass", 0.9);
    note(72, 0, 0.45, 0.085, "sine");
    [196, 392, 783.99].forEach((f, i) => note(f, i * 0.1, 0.36, 0.04, "sawtooth"));
  } else if (kind === "laser") {
    note(1500, 0, 0.1, 0.018, "sawtooth");
    note(760, 0.07, 0.16, 0.018, "sawtooth");
  }
}

/* ---------- topbar ---------- */

function renderTopbar(route) {
  const streak = calcStreak();
  const stars = totalStars();
  const missionActive = ["home", "make-ten", "break-ten", "practice"].includes(route) && !(route === "practice" && practiceState.mode === "lesson");
  const courseActive = route === "course" || route === "report" || route === "lesson" || (route === "practice" && practiceState.mode === "lesson");
  const navItem = (target, label, active) =>
    `<button class="nav-link ${active ? "active" : ""}" data-nav="${target}">${label}</button>`;

  return `
  <header class="topbar">
    <button class="brand" data-nav="home" aria-label="回到淘淘飞船首页">
      <span class="brand-badge">10</span>
      <span class="brand-copy">
        <span class="brand-name">淘淘飞船</span>
        <span class="brand-sub">凑十 · 破十 星际任务</span>
      </span>
    </button>
    <nav class="main-nav" aria-label="主导航">
      ${navItem("home", "星际任务", missionActive)}
      ${navItem("course", "课程表", courseActive)}
      ${navItem("calendar", "打卡日志", route === "calendar")}
    </nav>
    <div class="top-actions">
      <button class="stat-pill streak-pill" data-nav="calendar" aria-label="连续航行 ${streak} 天">
        ${icon("planet")}<span>航行</span><b>${streak}</b><span>天</span>
      </button>
      <button class="stat-pill star-pill" data-nav="calendar" aria-label="共有 ${stars} 颗航行星">
        ${icon("star")}<b>${stars}</b>
      </button>
      <button class="icon-btn" data-action="sound" aria-label="${state.sound ? "关闭声音" : "开启声音"}">
        ${icon(state.sound ? "volume" : "mute")}
      </button>
    </div>
  </header>`;
}

/* ---------- home ---------- */

function renderHome() {
  const streak = calcStreak();
  const stars = totalStars();
  const checked = todayChecked();
  const next = nextMilestone(streak);
  const weekStart = startOfWeek(TODAY);
  const unlocked = unlockedMilestones(streak);

  const weekDays = WEEKDAY_CN.map((label, index) => {
    const date = addDays(weekStart, index);
    const key = toKey(date);
    const dayChecked = isChecked(key);
    const isToday = key === TODAY_KEY;
    const future = date > TODAY;
    return `
      <div class="week-day ${dayChecked ? "checked" : ""} ${isToday ? "today" : ""} ${future ? "future" : ""}">
        <span class="wd">${label}</span>
        <span class="wd-num">${date.getDate()}</span>
      </div>`;
  }).join("");

  const speech = checked
    ? "今天已盖章，<strong>明天再出发</strong>！"
    : "点亮<strong>一颗航行星</strong>，出发！";

  const streakSub = checked
    ? next
      ? `再飞 ${next.days - streak} 天，解锁「${next.name}」`
      : "全部星际装备都解锁啦，太厉害了！"
    : streak === 0
      ? "今天发射，开启第 1 天"
      : `今天再出发，就连续 ${streak + 1} 天啦`;

  const checkinButton = checked
    ? `<button class="btn btn-checkin is-done" disabled>${icon("check")} 今天已盖章</button>`
    : `<button class="btn btn-checkin" data-action="checkin">
         今日发射打卡 <span class="plus-star">+1 ${icon("star")}</span>
       </button>`;

  return `
  <main class="page home-page view">
    <section class="home-left">
      <div class="eyebrow">
        <span class="eyebrow-mark">${icon("orbit")}</span>
        5 岁 · 每天 5 分钟 · 星际数学
      </div>

      <h1 class="hero-title">
        <span class="line">把数字，</span>
        <span class="line">变成<span class="marker">星际燃料</span></span>
      </h1>

      <p class="hero-lede">
        和淘淘一起，在十格燃料舱里玩会 <b>凑十</b> 和 <b>破十</b>。<br>
        不用死记硬背，看着能量星，自己就能想明白。
      </p>

      <div class="hero-actions">
        <button class="btn btn-primary" data-nav="make-ten" data-launch>
          ${icon("play")} 启动今日任务
        </button>
        <button class="btn btn-ghost" data-action="how-to">
          ${icon("eye")} 看看怎么玩
        </button>
      </div>

      <ul class="hero-note">
        <li>${icon("check")} 十格燃料舱，一看就懂</li>
        <li>${icon("clock")} 每天只要 5 分钟</li>
        <li>${icon("star")} 孩子自己打卡</li>
      </ul>

      <div class="mode-stack">
        <div class="section-minihead">
          <h2>选择今天的星际任务</h2>
          <div class="section-side">
            <span>点一下就出发</span>
            <button class="practice-chip" data-nav="course">14天航线 · 14课 →</button>
          </div>
        </div>

        <div class="mode-grid">
          <button class="mode-card make" data-nav="make-ten" data-launch>
            <span class="mode-visual" aria-hidden="true">
              <span class="mini-frame">${miniFrame(9)}</span>
              <span class="mini-caption">补满 10 格</span>
              <span class="mini-badge">+1</span>
            </span>
            <span class="mode-copy">
              <span class="mode-kicker"><span class="line"></span>补给任务 · 加法</span>
              <span class="mode-title">凑十补给站</span>
              <span class="mode-desc">9 号舱差 1 格，借 1 颗能量星。</span>
              <span class="mode-eq">9 + 5 = <em>14</em></span>
            </span>
            <span class="mode-go">${icon("arrowRight")}</span>
          </button>

          <button class="mode-card break" data-nav="break-ten" data-launch>
            <span class="mode-visual" aria-hidden="true">
              <span class="mini-frame">${miniFrame(10)}</span>
              <span class="mini-caption">破开 10 号舱</span>
              <span class="mini-badge">−9</span>
            </span>
            <span class="mode-copy">
              <span class="mode-kicker"><span class="line"></span>探险任务 · 减法</span>
              <span class="mode-title">破十陨石带</span>
              <span class="mode-desc">13 颗星矿，先破开 10 号货舱。</span>
              <span class="mode-eq">13 − 9 = <em>4</em></span>
            </span>
            <span class="mode-go">${icon("arrowRight")}</span>
          </button>
        </div>
      </div>
    </section>

    <aside class="home-right" aria-label="今日发射打卡">
      <section class="cockpit-card">
        <div class="cockpit-view">
          <div class="cockpit-stars" aria-hidden="true"></div>
          <div class="orbit-ring" aria-hidden="true"></div>
          <span class="cockpit-planet" aria-hidden="true"></span>
          <div class="cockpit-tag">${icon("orbit")} 淘淘 · ${checked ? "已归航" : "待命中"}</div>
          <div class="mascot-wrap rocket">${rocketSvg()}</div>
          <div class="speech">${speech}</div>
        </div>

        <div class="log-body">
          <div class="log-head">
            <h2>今日发射日志</h2>
            <span class="month-chip">${TODAY.getMonth() + 1} 月</span>
          </div>

          <div class="streak-banner">
            <span class="flame-badge">${icon("planet")}</span>
            <span class="streak-copy">
              <b>连续航行</b>
              <span>${streakSub}</span>
            </span>
            <span class="streak-number">${streak}<small>天</small></span>
          </div>

          <div class="week-strip" aria-label="本周打卡">${weekDays}</div>

          ${checkinButton}
          <p class="self-checkin">${checked ? "今天的章已经盖好啦，明天见！" : "自己点一下，给今天盖个航行章。"}</p>

          <div class="checkin-foot">
            <button class="text-link" data-nav="calendar">打开星际日志 ${icon("arrowRight")}</button>
            <span class="reward-mini">${icon("gift")} 已解锁 ${unlocked.length}/${MILESTONES.length}</span>
          </div>
        </div>
      </section>

      <div class="parent-note">
        <div class="parent-eyebrow">${icon("heart")} 给爸爸妈妈</div>
        <p>今天可以问问他：<strong>9 号燃料舱还差几格才满十？</strong><br>不用急着算对，先让他指着十格舱说一说。</p>
        <button class="text-link parent-report-link" data-nav="report">看家长报告 →</button>
      </div>
    </aside>
  </main>`;
}

function miniFrame(filled) {
  return Array.from({ length: 10 }, (_, i) => {
    return `<span class="mini-cell ${i < filled ? "filled" : ""}"></span>`;
  }).join("");
}

/* ---------- lessons ---------- */

const LESSONS = {
  "make-ten": {
    kind: "make-ten",
    method: "凑十补给站",
    tagline: "加法任务",
    title: "凑十补给站",
    mission: "MISSION 01",
    a: 9,
    b: 5,
    op: "+",
    result: 14,
    theme: "make",
    steps: [
      {
        speech: "9 号燃料舱还差 <strong>1 格</strong>就满啦！去 5 号补给舱借 1 颗<strong>能量星</strong>吧。",
        short: "9 号舱差 1 格",
        hint: "先看 9 号舱：十格里还空着 1 格，这就是凑十的入口。",
        formula: "9 + ? = 10",
        noteA: "还差 1 格",
        noteB: "5 颗能量星",
      },
      {
        speech: "1 颗<strong>能量星</strong>飞进 9 号舱，9 + 1 = 10，燃料舱满格！",
        short: "借 1 颗能量星",
        hint: "把 5 号舱的 5 颗，分成 1 和 4。",
        formula: "9 + 1 = 10",
        noteA: "满格啦！",
        noteB: "借出 1 颗",
        hotA: true,
        hotB: true,
      },
      {
        speech: "5 号舱借走 1 颗，还剩 <strong>4 颗</strong>。现在 10 和 4 都在手边啦。",
        short: "5 号舱剩 4 颗",
        hint: "借走的 1 颗已经变成满格燃料，剩下的 4 颗要记得加回来。",
        formula: "5 − 1 = 4",
        noteA: "10 格满燃料",
        noteB: "还剩 4 颗",
        hotB: true,
      },
      {
        speech: "10 + 4 = 14！你把 9 + 5 变成了 <strong>10 + 4</strong>，补给任务完成。",
        short: "10 + 4 = 14",
        hint: "凑十成功！满十的 10，加上剩下的 4。",
        formula: "10 + 4 = 14",
        noteA: "满十燃料舱",
        noteB: "剩下的 4 颗",
      },
    ],
  },
  "break-ten": {
    kind: "break-ten",
    method: "破十陨石带",
    tagline: "减法探险",
    title: "破十陨石带",
    mission: "MISSION 02",
    a: 13,
    b: 9,
    op: "−",
    result: 4,
    theme: "break",
    steps: [
      {
        speech: "13 颗星矿，装在 <strong>10 号货舱</strong>和 <strong>3 个散装格</strong>里。",
        short: "13 = 10 + 3",
        hint: "先看 13：10 号货舱装满，外面还有 3 颗星矿。",
        formula: "13 = 10 + 3",
        noteA: "满舱星矿",
        noteB: "散装 3 颗",
      },
      {
        speech: "要减 9，先把 10 号货舱<strong>破开</strong>：10 可以分成 1 和 9。",
        short: "10 破成 1 和 9",
        hint: "破十法：把 10 分成要减掉的 9，和剩下的 1。",
        formula: "10 = 1 + 9",
        noteA: "10 破成 1 和 9",
        noteB: "3 颗先记住",
        hotA: true,
      },
      {
        speech: "9 颗星矿被吸走，货舱里只剩 <strong>1 颗</strong>。",
        short: "10 − 9 = 1",
        hint: "先算货舱里的：10 − 9 = 1。",
        formula: "10 − 9 = 1",
        noteA: "吸走 9 颗，剩 1 颗",
        noteB: "3 颗还在",
        hotA: true,
      },
      {
        speech: "剩下的 1 颗，加上外面的 3 颗，一共 <strong>4 颗</strong>！",
        short: "1 + 3 = 4",
        hint: "最后合起来：1 + 3 = 4，破十任务完成！",
        formula: "1 + 3 = 4",
        noteA: "剩下的 1 颗",
        noteB: "加上 3 颗",
      },
    ],
  },
};

const MAKE_QUESTIONS = [
  { a: 9, b: 5 },
  { a: 9, b: 3 },
  { a: 8, b: 4 },
  { a: 9, b: 7 },
  { a: 7, b: 5 },
];

const BREAK_QUESTIONS = [
  { a: 13, b: 9 },
  { a: 12, b: 9 },
  { a: 14, b: 8 },
  { a: 15, b: 9 },
  { a: 16, b: 7 },
];

const MAKE_BANK = [];
for (let a = 2; a <= 9; a += 1) {
  for (let b = 2; b <= 9; b += 1) {
    if (a + b > 10) MAKE_BANK.push({ kind: "make", a, b });
  }
}

const BREAK_BANK = [];
for (let a = 11; a <= 18; a += 1) {
  for (let b = 2; b <= 9; b += 1) {
    if (b > a - 10 && a - b < 10) BREAK_BANK.push({ kind: "break", a, b });
  }
}

const makeUsed = new Set(MAKE_QUESTIONS.map((q) => `${q.a}-${q.b}`));
const breakUsed = new Set(BREAK_QUESTIONS.map((q) => `${q.a}-${q.b}`));
const MAKE_EXTRA = MAKE_BANK.filter((q) => !makeUsed.has(`${q.a}-${q.b}`));
const BREAK_EXTRA = BREAK_BANK.filter((q) => !breakUsed.has(`${q.a}-${q.b}`));

const DRILL_BANK = [
  { kind: "make", a: 9, b: 5 },
  { kind: "make", a: 9, b: 3 },
  { kind: "make", a: 8, b: 4 },
  { kind: "make", a: 9, b: 7 },
  { kind: "make", a: 7, b: 5 },
  { kind: "make", a: 9, b: 4 },
  { kind: "make", a: 8, b: 6 },
  { kind: "break", a: 13, b: 9 },
  { kind: "break", a: 12, b: 9 },
  { kind: "break", a: 14, b: 8 },
  { kind: "break", a: 15, b: 9 },
  { kind: "break", a: 16, b: 7 },
  { kind: "break", a: 16, b: 9 },
];

const COURSE_LESSONS = [
  { id: 1, week: 1, slot: 0, planet: "地球轨道", badge: "EARTH", title: "凑十补给站", focus: "9 加几", mode: "guided", route: "make-ten", color: "#55e0ff" },
  { id: 2, week: 1, slot: 1, planet: "月球背面", badge: "MOON", title: "破十陨石带", focus: "十几减 9", mode: "guided", route: "break-ten", color: "#c9d4ea" },
  { id: 3, week: 1, slot: 2, planet: "火星", badge: "MARS", title: "积木小车", focus: "凑十", mode: "scene", scene: "truck", spec: { kind: "make", a: 9, b: 4 }, color: "#ff7a59" },
  { id: 4, week: 1, slot: 3, planet: "金星", badge: "VENUS", title: "天平", focus: "破十", mode: "scene", scene: "balance", spec: { kind: "break", a: 14, b: 9 }, color: "#f5b51b" },
  { id: 5, week: 1, slot: 4, planet: "水星", badge: "MERCURY", title: "小火车", focus: "凑十", mode: "scene", scene: "train", spec: { kind: "make", a: 8, b: 6 }, color: "#ffb36b" },
  { id: 6, week: 2, slot: 0, planet: "木星", badge: "JUPITER", title: "吊车", focus: "凑十", mode: "scene", scene: "crane", spec: { kind: "make", a: 9, b: 6 }, color: "#d8a46a" },
  { id: 7, week: 2, slot: 1, planet: "土星", badge: "SATURN", title: "水管", focus: "破十", mode: "scene", scene: "water", spec: { kind: "break", a: 15, b: 8 }, color: "#f0d27a" },
  { id: 8, week: 2, slot: 2, planet: "天王星", badge: "URANUS", title: "糖果罐", focus: "破十", mode: "scene", scene: "candy", spec: { kind: "break", a: 16, b: 9 }, color: "#8fe8e0" },
  { id: 9, week: 2, slot: 3, planet: "海王星", badge: "NEPTUNE", title: "电梯", focus: "凑十", mode: "scene", scene: "elevator", spec: { kind: "make", a: 7, b: 6 }, color: "#6f9cff" },
  { id: 10, week: 2, slot: 4, planet: "柯伊伯带", badge: "KUIPER", title: "太空邮袋", focus: "破十", mode: "scene", scene: "mail", spec: { kind: "break", a: 13, b: 8 }, color: "#b9d7ff" },
  { id: 11, week: 3, slot: 0, planet: "织女星", badge: "VEGA", title: "星星桥", focus: "凑十", mode: "scene", scene: "bridge", spec: { kind: "make", a: 8, b: 7 }, color: "#a78bfa" },
  { id: 12, week: 3, slot: 1, planet: "猎户座", badge: "ORION", title: "太空花园", focus: "破十", mode: "scene", scene: "garden", spec: { kind: "break", a: 16, b: 6 }, color: "#ff9ac4" },
  { id: 13, week: 3, slot: 2, planet: "银河中心", badge: "GALAXY", title: "齿轮站", focus: "凑十", mode: "scene", scene: "gear", spec: { kind: "make", a: 9, b: 8 }, color: "#c7a6ff" },
  { id: 14, week: 3, slot: 3, planet: "返回地球", badge: "HOME", title: "返回舱", focus: "破十", mode: "scene", scene: "home", spec: { kind: "break", a: 17, b: 9 }, color: "#54e6b4" },
];

const FREE_PRACTICE_SPECS = [
  { kind: "make", a: 9, b: 4 },
  { kind: "break", a: 14, b: 8 },
  { kind: "make", a: 8, b: 6 },
];

let makeCursor = 0;
let breakCursor = 0;
COURSE_LESSONS.forEach((lesson) => {
  if (lesson.mode !== "scene") return;
  const kind = lesson.spec.kind;
  const bank = kind === "make" ? MAKE_EXTRA : BREAK_EXTRA;
  const cursor = kind === "make" ? makeCursor : breakCursor;
  lesson.kind = kind;
  lesson.specs = bank.slice(cursor, cursor + 5);
  if (kind === "make") makeCursor += 5;
  else breakCursor += 5;
});

const SCENE_META = {
  truck: { unit: "块", aLabel: "块积木", bLabel: "块材料", aName: "小车", bName: "材料堆", move: "搬", take: "拿走", full: "车厢装满了" },
  balance: { unit: "块", aLabel: "块积木", bLabel: "块积木", aName: "左盘", bName: "右盘", move: "放", take: "拿走", full: "左盘满 10 啦" },
  train: { unit: "位", aLabel: "位乘客", bLabel: "位候车", aName: "小火车", bName: "站台", move: "接", take: "下车", full: "座位坐满了" },
  crane: { unit: "件", aLabel: "件货物", bLabel: "件货物", aName: "吊车", bName: "货堆", move: "吊", take: "卸下", full: "吊车装满了" },
  water: { unit: "格", aLabel: "格水", bLabel: "格水", aName: "水箱", bName: "水管", move: "灌", take: "放掉", full: "水箱满了" },
  candy: { unit: "颗", aLabel: "颗糖", bLabel: "颗糖", aName: "糖果罐", bName: "糖盒", move: "放", take: "拿走", full: "糖果罐满了" },
  elevator: { unit: "位", aLabel: "位乘客", bLabel: "位乘客", aName: "电梯", bName: "楼层", move: "进", take: "出", full: "电梯满了" },
  mail: { unit: "件", aLabel: "件包裹", bLabel: "件包裹", aName: "太空邮袋", bName: "包裹堆", move: "装", take: "取走", full: "邮袋满了" },
  bridge: { unit: "块", aLabel: "块桥板", bLabel: "块石料", aName: "星星桥", bName: "石料堆", move: "铺", take: "拆下", full: "桥面铺满了" },
  garden: { unit: "颗", aLabel: "颗种子", bLabel: "颗种子", aName: "太空花园", bName: "种子袋", move: "种", take: "拔掉", full: "花园种满了" },
  gear: { unit: "齿", aLabel: "齿", bLabel: "齿", aName: "齿轮站", bName: "齿条", move: "转", take: "退", full: "齿轮咬合了" },
  home: { unit: "件", aLabel: "件行李", bLabel: "件行李", aName: "返回舱", bName: "行李堆", move: "装", take: "取出", full: "返回舱装满了" },
};

function buildQuizQuestion(spec) {
  const result = spec.kind === "make" ? spec.a + spec.b : spec.a - spec.b;
  const seen = new Set();
  const choices = [];
  [result, result - 1, result + 1, result + 2].forEach((value) => {
    if (value > 0 && !seen.has(value) && choices.length < 3) {
      seen.add(value);
      choices.push(value);
    }
  });
  return {
    ...spec,
    op: spec.kind === "make" ? "+" : "−",
    result,
    choices: shuffle(choices),
    qid: `${spec.kind}-${spec.a}-${spec.b}`,
  };
}

function lessonQuestions(lesson) {
  return (lesson.drill || []).map((index) => buildQuizQuestion(DRILL_BANK[index]));
}

function freePracticeQuestions() {
  return FREE_PRACTICE_SPECS.map(buildQuizQuestion);
}

function findCourseLesson(id) {
  return COURSE_LESSONS.find((lesson) => lesson.id === Number(id)) || null;
}

function nextCourseLesson() {
  return COURSE_LESSONS.find((lesson) => !state.lessonDone[lesson.id]) || COURSE_LESSONS[COURSE_LESSONS.length - 1];
}

function markLessonDone(lessonId, score) {
  if (!lessonId) return;
  state.lessonDone[lessonId] = {
    completedAt: TODAY_KEY,
    score,
  };
  saveState();
}

function recordPracticeAnswer(question, correct) {
  const lessonId = practiceState.mode === "lesson" ? practiceState.lessonId : null;
  state.records.push({
    date: TODAY_KEY,
    ts: Date.now(),
    lessonId,
    qid: question.qid,
    kind: question.kind,
    a: question.a,
    b: question.b,
    correct,
    mode: practiceState.mode,
  });
  if (state.records.length > 600) state.records = state.records.slice(-600);

  if (correct) {
    delete state.wrong[question.qid];
  } else {
    const previous = state.wrong[question.qid];
    state.wrong[question.qid] = {
      kind: question.kind,
      a: question.a,
      b: question.b,
      count: (previous && previous.count ? previous.count : 0) + 1,
      lastAt: Date.now(),
    };
  }
  saveState();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function levelQuestions(base) {
  return [base[0], ...shuffle(base.slice(1))];
}

function buildMakeLesson(a, b) {
  const need = 10 - a;
  const rest = b - need;
  const result = a + b;
  return {
    kind: "make-ten",
    method: "凑十补给站",
    tagline: "加法任务",
    title: "凑十补给站",
    mission: "MISSION 01",
    a,
    b,
    op: "+",
    result,
    theme: "make",
    steps: [
      {
        speech: `看，${a} 号燃料舱还差 <strong>${need} 格</strong>就满啦！我们去 ${b} 号补给舱，借 ${need} 颗<strong>能量星</strong>吧。`,
        short: `${a} 号舱差 ${need} 格`,
        hint: `先看 ${a} 号舱：十格里还空着 ${need} 格，这就是凑十的入口。`,
        formula: `${a} + ? = 10`,
        noteA: `还差 ${need} 格`,
        noteB: `${b} 颗能量星`,
      },
      {
        speech: `哇，${need} 颗<strong>能量星</strong>飞进 ${a} 号舱！${a} + ${need} = 10，燃料舱满格！`,
        short: `借 ${need} 颗能量星`,
        hint: `把 ${b} 号舱的 ${b} 颗，分成 ${need} 和 ${rest}。`,
        formula: `${a} + ${need} = 10`,
        noteA: "满格啦！",
        noteB: `借出 ${need} 颗`,
        hotA: true,
        hotB: true,
      },
      {
        speech: `${b} 号舱借走 ${need} 颗，还剩 <strong>${rest} 颗</strong>。现在 10 和 ${rest} 都在手边啦。`,
        short: `${b} 号舱剩 ${rest} 颗`,
        hint: `借走的 ${need} 颗已经变成满格燃料，剩下的 ${rest} 颗要记得加回来。`,
        formula: `${b} − ${need} = ${rest}`,
        noteA: "10 格满燃料",
        noteB: `还剩 ${rest} 颗`,
        hotB: true,
      },
      {
        speech: `10 + ${rest} = ${result}！你把 ${a} + ${b} 变成了 <strong>10 + ${rest}</strong>，太棒啦，本题完成！`,
        short: `10 + ${rest} = ${result}`,
        hint: `凑十成功！满十的 10，加上剩下的 ${rest}。`,
        formula: `10 + ${rest} = ${result}`,
        noteA: "满十燃料舱",
        noteB: `剩下的 ${rest} 颗`,
      },
    ],
  };
}

function buildBreakLesson(a, b) {
  const ones = a - 10;
  const left = 10 - b;
  const result = left + ones;
  return {
    kind: "break-ten",
    method: "破十陨石带",
    tagline: "减法探险",
    title: "破十陨石带",
    mission: "MISSION 02",
    a,
    b,
    op: "−",
    result,
    theme: "break",
    steps: [
      {
        speech: `看，${a} 颗星矿，装在 <strong>10 号货舱</strong>和 <strong>${ones} 个散装格</strong>里。`,
        short: `${a} = 10 + ${ones}`,
        hint: `先看 ${a}：10 号货舱装满，外面还有 ${ones} 颗星矿。`,
        formula: `${a} = 10 + ${ones}`,
        noteA: "满舱星矿",
        noteB: `散装 ${ones} 颗`,
      },
      {
        speech: `要减 ${b}，我们先把 10 号货舱<strong>破开</strong>：10 可以分成 ${left} 和 ${b}。`,
        short: `10 破成 ${left} 和 ${b}`,
        hint: `破十法：把 10 分成要减掉的 ${b}，和剩下的 ${left}。`,
        formula: `10 = ${left} + ${b}`,
        noteA: `10 破成 ${left} 和 ${b}`,
        noteB: `${ones} 颗先记住`,
        hotA: true,
      },
      {
        speech: `${b} 颗星矿被吸走啦，货舱里只剩 <strong>${left} 颗</strong>。`,
        short: `10 − ${b} = ${left}`,
        hint: `先算货舱里的：10 − ${b} = ${left}。`,
        formula: `10 − ${b} = ${left}`,
        noteA: `吸走 ${b} 颗，剩 ${left} 颗`,
        noteB: `${ones} 颗还在`,
        hotA: true,
      },
      {
        speech: `剩下的 ${left} 颗，加上外面的 ${ones} 颗，一共 <strong>${result} 颗</strong>！`,
        short: `${left} + ${ones} = ${result}`,
        hint: `最后合起来：${left} + ${ones} = ${result}，本题完成！`,
        formula: `${left} + ${ones} = ${result}`,
        noteA: `剩下的 ${left} 颗`,
        noteB: `加上 ${ones} 颗`,
      },
    ],
  };
}

function buildSceneLesson(lesson, spec = lesson.specs?.[0] || lesson.spec) {
  const { kind, a, b } = spec;
  const result = kind === "make" ? a + b : a - b;
  const scene = lesson.scene || "truck";
  const labels = SCENE_META[scene] || SCENE_META.truck;

  const steps = [];
  if (kind === "make") {
    const need = 10 - a;
    const rest = b - need;
    steps.push(
      {
        speech:
          scene === "truck"
            ? `小车的车厢要装 10 块积木，已经装了 <strong>${a} 块</strong>，还差 ${need} 块。去材料堆搬 ${need} 块吧。`
            : scene === "balance"
              ? `左盘要凑到 10 块，已经有 <strong>${a} 块</strong>，还差 ${need} 块。把右盘的 ${need} 块放过来吧。`
              : scene === "train"
                ? `小火车有 10 个座位，已经坐了 <strong>${a} 位</strong>，还差 ${need} 位。去站台接 ${need} 位乘客吧。`
                : `${labels.aName}要凑到 10 ${labels.unit}，已经有 <strong>${a} ${labels.unit}</strong>，还差 ${need} ${labels.unit}。${labels.move} ${need} ${labels.unit}吧。`,
        short: `${a} + ? = 10`,
        hint: `先看还差 ${need} 格才到 10。`,
        formula: `${a} + ? = 10`,
        noteA: `还差 ${need} 格`,
        noteB: `${b} ${labels.bLabel}`,
      },
      {
        speech:
          scene === "truck"
            ? `搬来 <strong>${need} 块</strong>，小车装满 10 块啦！${a} + ${need} = 10。`
            : scene === "balance"
              ? `放进 <strong>${need} 块</strong>，左盘满 10 啦！${a} + ${need} = 10。`
              : scene === "train"
                ? `接来 <strong>${need} 位</strong>，小火车坐满啦！${a} + ${need} = 10。`
                : `${labels.move}来 <strong>${need} ${labels.unit}</strong>，${labels.full}！${a} + ${need} = 10。`,
        short: `${a} + ${need} = 10`,
        hint: `${labels.full}，${a} + ${need} = 10。`,
        formula: `${a} + ${need} = 10`,
        noteA: "满 10 啦",
        noteB: `借出 ${need} ${labels.aLabel}`,
        hotA: true,
        hotB: true,
      },
      {
        speech:
          scene === "truck"
            ? `材料堆搬走 ${need} 块，还剩 <strong>${rest} 块</strong>。现在 10 和 ${rest} 都在手边啦。`
            : scene === "balance"
              ? `材料堆搬走 ${need} 块，还剩 <strong>${rest} 块</strong>。现在 10 和 ${rest} 都在手边啦。`
              : scene === "train"
                ? `站台接走 ${need} 位，还剩 <strong>${rest} 位</strong>。现在 10 和 ${rest} 都在手边啦。`
                : `${labels.bName}${labels.take} ${need} ${labels.unit}，还剩 <strong>${rest} ${labels.unit}</strong>。现在 10 和 ${rest} 都在手边啦。`,
        short: `${b} − ${need} = ${rest}`,
        hint: `搬走 ${need} 块，剩下的 ${rest} 块要记得加回来。`,
        formula: `${b} − ${need} = ${rest}`,
        noteA: "10 格满啦",
        noteB: `还剩 ${rest} ${labels.bLabel}`,
        hotB: true,
      },
      {
        speech: `10 + ${rest} = <strong>${result}</strong>！本课通过，${labels.full}，又多了 ${rest} 块。`,
        short: `10 + ${rest} = ${result}`,
        hint: `满十的 10，加上剩下的 ${rest}。`,
        formula: `10 + ${rest} = ${result}`,
        noteA: "满 10",
        noteB: `剩下 ${rest} 块`,
      },
    );
  } else {
    const ones = a - 10;
    const left = 10 - b;
    steps.push(
      {
        speech:
          scene === "truck"
            ? `车上有 <strong>${a} 块积木</strong>，先卸下 ${b} 块。把 10 块那一摞拆开吧。`
            : scene === "balance"
              ? `左盘有 <strong>${a} 块积木</strong>，要拿走 ${b} 块。先把 10 块那一摞分开。`
              : scene === "train"
                ? `小火车上有 <strong>${a} 位乘客</strong>，要到站下车 ${b} 位。先把 10 位那一节拆开。`
                : `${labels.aName}有 <strong>${a} ${labels.unit}</strong>，要${labels.take} ${b} ${labels.unit}。先把 10 ${labels.unit}那一份拆开。`,
        short: `${a} = 10 + ${ones}`,
        hint: `先看 ${a} 里有 10 和 ${ones}。`,
        formula: `${a} = 10 + ${ones}`,
        noteA: `10 块一摞`,
        noteB: `${ones} 块散着`,
      },
      {
        speech: `把 10 块拆成 <strong>${left}</strong> 和 <strong>${b}</strong>。`,
        short: `10 = ${left} + ${b}`,
        hint: `要减掉 ${b}，就从 10 里分出 ${b}。`,
        formula: `10 = ${left} + ${b}`,
        noteA: `10 拆成 ${left} 和 ${b}`,
        noteB: `${ones} 块先记住`,
        hotA: true,
      },
      {
        speech: `${b} ${labels.aLabel}被${labels.take}，只剩 <strong>${left} ${labels.unit}</strong>。`,
        short: `10 − ${b} = ${left}`,
        hint: `先算 10 减 ${b}。`,
        formula: `10 − ${b} = ${left}`,
        noteA: `拿走 ${b}，剩 ${left}`,
        noteB: `${ones} 还在`,
        hotA: true,
      },
      {
        speech: `剩下的 ${left} ${labels.unit}，加上外面的 ${ones} ${labels.unit}，一共 <strong>${result} ${labels.unit}</strong>！本课通过。`,
        short: `${left} + ${ones} = ${result}`,
        hint: `最后合起来：${left} + ${ones} = ${result}。`,
        formula: `${left} + ${ones} = ${result}`,
        noteA: `剩下 ${left}`,
        noteB: `加上 ${ones}`,
      },
    );
  }

  return {
    kind: kind === "make" ? "make-ten" : "break-ten",
    method: lesson.title,
    tagline: labels.aName,
    title: lesson.title,
    mission: `MISSION ${String(lesson.id).padStart(2, "0")}`,
    a,
    b,
    op: kind === "make" ? "+" : "−",
    result,
    theme: kind === "make" ? "make" : "break",
    scene,
    sceneLabel: labels.aName,
    planet: lesson.planet,
    color: lesson.color,
    courseId: lesson.id,
    labelA: labels.aLabel,
    labelB: labels.bLabel,
    steps,
  };
}

function currentLessonConfig() {
  if (lessonState.courseId) {
    const courseLesson = findCourseLesson(lessonState.courseId);
    if (courseLesson) {
      const spec = lessonState.questions[lessonState.index] || courseLesson.specs?.[0] || courseLesson.spec;
      return buildSceneLesson(courseLesson, spec);
    }
  }
  if (lessonState.kind === "make-ten") {
    const question = lessonState.questions[lessonState.index] || MAKE_QUESTIONS[0];
    return buildMakeLesson(question.a, question.b);
  }
  const question = lessonState.questions[lessonState.index] || BREAK_QUESTIONS[0];
  return buildBreakLesson(question.a, question.b);
}


function resetStepTask() {
  lessonState.stepSolved = false;
  lessonState.stepWrong = [];
  lessonState.dragged = 0;
}

function dragStepFor(config) {
  return 0;
}

function pageStageStep(config, page = lessonState.step) {
  if (config.kind === "make-ten") return [1, 2, 3][page] ?? 3;
  return [2, 1, 3][page] ?? 3;
}

function dragNeedFor(config) {
  return config.kind === "make-ten" ? 10 - config.a : config.b;
}

function dragPromptFor(config) {
  return config.kind === "make-ten"
    ? "把补给舱的星星拖进小车，装满 10 格"
    : "把要拿走的星星拖进黑洞";
}

function stepSpeechFor(config) {
  if (lessonState.step === 0 && !lessonState.stepSolved) {
    return config.kind === "make-ten"
      ? "把补给舱的星星拖进空位，一颗一颗装满 10 格。"
      : "把要拿走的星星，一颗一颗拖进黑洞。";
  }
  return config.steps[pageStageStep(config)].speech;
}

function renderDragTask(step, config) {
  if (step !== dragStepFor(config)) return "";
  const need = dragNeedFor(config);
  const dragged = Math.min(lessonState.dragged, need);
  const solved = lessonState.stepSolved;
  return `<div class="drag-task ${solved ? "is-solved" : ""}">
    <div class="drag-task-top">
      <span class="drag-task-kicker">${solved ? "成功啦" : "用手拖一拖"}</span>
      <button class="step-task-voice" data-action="task-voice" aria-label="听题目">${icon("volume")} 听</button>
    </div>
    <p>${solved ? (config.kind === "make-ten" ? "装满 10 格啦" : "拿走啦") : dragPromptFor(config)}</p>
    <div class="drag-progress">
      <span>${dragged} / ${need}</span>
      <div class="drag-bar"><i style="width:${Math.round((dragged / need) * 100)}%"></i></div>
    </div>
    ${solved ? `<button class="btn btn-coral drag-task-next" data-action="next-step">继续航行 ${icon("arrowRight")}</button>` : ""}
  </div>`;
}

function stepTaskChoices(expected) {
  const distractors = shuffle(
    [...new Set([expected - 1, expected + 1, expected + 2])].filter(
      (value) => value > 0 && value !== expected,
    ),
  ).slice(0, 2);
  return shuffle([expected, ...distractors]);
}

function stepTaskFor(step, config) {
  if (step >= 3) return null;
  const isMake = config.kind === "make-ten";
  const need = 10 - config.a;
  const rest = config.b - need;
  const left = 10 - config.b;
  let expected = 0;
  let prompt = "";
  if (step === 0) {
    expected = isMake ? need : config.a - 10;
    prompt = isMake ? "还差几格才到 10？" : `10 和几合起来是 ${config.a}？`;
  } else if (step === 1) {
    expected = isMake ? need : left;
    prompt = isMake ? "要借几颗能量星？" : `10 可以分成几和 ${config.b}？`;
  } else {
    expected = isMake ? rest : left;
    prompt = isMake ? "补给舱还剩几颗？" : `拿走 ${config.b} 颗，还剩几颗？`;
  }
  return { expected, prompt, values: stepTaskChoices(expected) };
}

function renderStepTask(step, config) {
  const task = stepTaskFor(step, config);
  if (!task) return "";
  const solved = lessonState.stepSolved;
  const wrong = lessonState.stepWrong || [];
  const buttons = task.values
    .map((value) => {
      const isWrong = wrong.includes(value);
      return `<button class="step-task-choice ${isWrong ? "is-wrong" : ""}"
        data-action="step-answer" data-value="${value}" ${solved || isWrong ? "disabled" : ""}>${value}</button>`;
    })
    .join("");
  return `<div class="step-task ${solved ? "is-solved" : ""}">
    <div class="step-task-top">
      <span class="step-task-kicker">${solved ? "答对啦" : "点一点"}</span>
      <button class="step-task-voice" data-action="task-voice" aria-label="听题目">${icon("volume")} 听</button>
    </div>
    <p>${task.prompt}</p>
    <div class="step-task-choices">${buttons}</div>
    <div class="step-task-feedback">${
      solved ? "继续航行吧" : wrong.length ? "再想一想，换一个答案" : "选一个答案，才能继续"
    }</div>
    ${
      solved
        ? `<button class="btn btn-coral step-task-next" data-action="${step === 2 ? "next-step" : "next-step"}">继续航行 ${icon("arrowRight")}</button>`
        : ""
    }
  </div>`;
}

function renderLesson(kind) {
  const config = currentLessonConfig();
  const step = lessonState.step;
  const stageStep = pageStageStep(config, step);
  const data = config.steps[stageStep];
  const final = step === 2;
  const isMake = config.kind === "make-ten";
  const total = lessonState.questions.length || 1;
  const questionNo = lessonState.index + 1;
  const isLast = lessonState.index === total - 1;
  const nextLabel = final ? (isLast ? "完成关卡" : "下一题") : "继续航行";
  const nextAction = final ? (isLast ? "complete-level" : "next-question") : "next-step";
  const stepLocked = step === 0 && !lessonState.stepSolved;
  const displayHint =
    step === 0 && !lessonState.stepSolved
      ? config.kind === "make-ten"
        ? "把补给舱的星星拖进空位，装满 10 格。"
        : "把要拿走的星星拖进黑洞。"
      : data.hint;

  const stage =
    config.kind === "make-ten" ? renderMakeStage(stageStep, config) : renderBreakStage(stageStep, config);

  const dotMarkup = [0, 1, 2]
    .map((i) => {
      const dotClass = i < step ? "done" : i === step ? "active" : "";
      return `<span class="step-dot ${dotClass}"></span>`;
    })
    .join("");

  const stepList = [0, 1, 2]
    .map((i) => {
      const item = config.steps[pageStageStep(config, i)];
      const itemClass = i < step ? "done" : i === step ? "active" : "";
      return `
        <li class="mini-step ${itemClass}">
          <span class="num">${i + 1}</span>
          <span>${item.short}</span>
        </li>`;
    })
    .join("");

  return `
  <main class="page lesson-page view">
    <div class="lesson-top">
      <button class="round-back" data-nav="home" aria-label="返回基地">${icon("arrowLeft")}</button>
      <div class="lesson-heading ${config.kind === "break-ten" ? "break" : ""}">
        <div class="crumb">
          <span>${config.mission}</span><span class="sep">·</span><span>${config.tagline}</span>
          <span class="sep">·</span><span class="level-crumb">第 ${questionNo}/${total} 题</span>
        </div>
        <h1>${config.title}</h1>
      </div>
      <div class="step-dots" aria-label="航行进度 ${step + 1} / 3">
        <span class="step-count">${step + 1}/3</span>${dotMarkup}
      </div>
    </div>

    <div class="lesson-grid">
      <section class="stage-card ${config.theme} ${config.scene ? `scene-${config.scene}` : ""}"
        style="--scene:${config.color || "#55e0ff"}" aria-label="${config.method}动画演示">
        ${final ? `<div class="mission-complete">${icon("star")} ${isLast ? "任务完成" : "本题完成"}</div>` : ""}
        <div class="equation-row">
          <span class="eq-num a ${config.a > 9 ? "wide" : ""}">${config.a}</span>
          <span class="eq-op">${config.op}</span>
          <span class="eq-num b">${config.b}</span>
          <span class="eq-op eq-equals">=</span>
          <span class="eq-num result ${final ? "is-revealed" : "is-unknown"}">${final ? config.result : "?"}</span>
        </div>

        ${stage}

        <div class="formula-strip ${step === 0 && lessonState.stepSolved ? "is-success" : ""}" aria-label="当前算式">${formulaMarkup(data.formula)}</div>

        ${renderDragTask(step, config)}

        <div class="stage-hint">
          <span class="bulb">${icon("lightbulb")}</span>
          <span>${displayHint}</span>
        </div>
      </section>

      <aside class="coach-card">
        <div class="coach-top">
          <div class="mascot-wrap mini">${rocketSvg()}</div>
          <div class="coach-bubble ${config.kind === "break-ten" ? "break" : ""}">${stepSpeechFor(config)}</div>
        </div>

        <div class="level-pips" aria-label="第 ${questionNo} / ${total} 题">
          <span class="pips-label">第 ${questionNo} / ${total} 题</span>
          <span class="pips">
            ${Array.from({ length: total }, (_, i) => {
              const pipClass =
                i < lessonState.index ? "done" : i === lessonState.index ? "active" : "off";
              return `<span class="level-star ${pipClass}">${icon("star")}</span>`;
            }).join("")}
          </span>
        </div>

        <div class="coach-section-title">
          <span>淘淘的航行口诀</span>
          <span>${step + 1} / 3</span>
        </div>
        <ol class="mini-steps">${stepList}</ol>

        <div class="coach-actions">
          <button class="btn ${config.kind === "break-ten" ? "btn-mint" : "btn-coral"} btn-wide"
            data-action="${stepLocked ? "step-locked" : nextAction}" ${stepLocked ? "disabled" : ""}>
            ${stepLocked ? "先把星星拖到位" : nextLabel} ${icon(stepLocked ? "lightbulb" : nextAction === "complete-level" ? "star" : nextAction === "finish" ? "calendar" : "arrowRight")}
          </button>
          <div class="coach-subactions">
            <button class="link-action" data-action="prev-step" ${step === 0 ? "disabled" : ""}>
              ${icon("arrowLeft")} 上一步
            </button>
            <button class="link-action" data-action="repeat-voice">
              ${icon("volume")} 再听一遍
            </button>
            ${
              final
                ? `<button class="link-action" data-action="restart">${icon("refresh")} 再飞一次</button>`
                : `<button class="link-action" data-nav="home">${icon("home")} 返回基地</button>`
            }
          </div>
        </div>
      </aside>
    </div>
  </main>`;
}

function renderMakeStage(step, config) {
  const data = config.steps[step];
  const { a, b } = config;
  const need = 10 - a;
  const rest = b - need;
  const dragged = step === 1 ? Math.min(lessonState.dragged, need) : 0;
  const aFilled = step === 1 ? a + dragged : step >= 2 ? 10 : a;
  const aCells = [];
  for (let i = 0; i < 10; i += 1) {
    if (i < aFilled) {
      const added = i >= a ? " cyan" : "";
      aCells.push(`<div class="cell filled" data-index="${i}"><span class="orb${added}"></span></div>`);
    } else if (step === 0) {
      aCells.push(`<div class="cell is-hot" data-index="${i}" aria-label="还空一格"></div>`);
    } else if (step === 1) {
      aCells.push(`<div class="cell drop-cell" data-index="${i}" aria-label="拖到这里"></div>`);
    } else {
      aCells.push(`<div class="cell" data-index="${i}"></div>`);
    }
  }

  const bCount = step >= 2 ? rest : step === 1 ? b - dragged : b;
  const bCells = [];
  for (let i = 0; i < 10; i += 1) {
    if (i < bCount) {
      const draggable = step === 1;
      bCells.push(
        `<div class="cell filled${draggable ? " donor draggable-cell" : ""}" data-index="${i}" ${
          draggable ? 'data-drag-orb="make"' : ""
        }><span class="orb cyan"></span></div>`,
      );
    } else {
      bCells.push(`<div class="cell" data-index="${i}"></div>`);
    }
  }

  const aFull = step >= 2 || aFilled === 10;
  const dropZone = step === 1 && !lessonState.stepSolved ? ' data-drop-zone="make"' : "";
  const noteA = step === 1 ? (aFilled === 10 ? "装满 10 格" : `还差 ${10 - aFilled} 格`) : data.noteA;
  const noteB = step === 1 ? `还剩 ${bCount} 颗` : data.noteB;
  const sceneBorrowTop =
    config.scene === "truck"
      ? ["装车", `搬 ${need}`, "搬走", "合起来"]
      : config.scene === "balance"
        ? ["放上", `放 ${need}`, "拿走", "合起来"]
        : config.scene === "train"
          ? ["上车", `接 ${need}`, "接走", "合起来"]
          : config.scene === "crane"
            ? ["吊货", `吊 ${need}`, "吊走", "合起来"]
            : config.scene === "water"
              ? ["注水", `灌 ${need}`, "放掉", "合起来"]
              : config.scene === "candy"
                ? ["装糖", `放 ${need}`, "拿走", "合起来"]
                : config.scene === "elevator"
                  ? ["进梯", `进 ${need}`, "出梯", "合起来"]
                  : config.scene === "mail"
                    ? ["装袋", `装 ${need}`, "取走", "合起来"]
                    : config.scene === "bridge"
                      ? ["铺桥", `铺 ${need}`, "拆下", "合起来"]
                      : config.scene === "garden"
                        ? ["种下", `种 ${need}`, "拔掉", "合起来"]
                        : config.scene === "gear"
                          ? ["转动", `转 ${need}`, "退齿", "合起来"]
                          : config.scene === "home"
                            ? ["装舱", `装 ${need}`, "取出", "合起来"]
                            : null;
  const borrowTop = sceneBorrowTop ? sceneBorrowTop[step] : ["补给", `借 ${need}`, "借走", "合起来"][step];
  const borrowBottom = [`差 ${need}`, "满 10", `剩 ${rest}`, `10 + ${rest}`][step];

  return `
    <div class="frame-area">
      <div class="frame-block frame-a"${dropZone}>
        <div class="frame-label"><b>${aFilled}</b><span>${config.labelA || "号燃料舱"}</span></div>
        <div class="ten-frame ${aFull ? "full-ten" : ""}">${aCells.join("")}</div>
        <div class="frame-note ${data.hotA ? "hot" : ""}">${noteA}</div>
      </div>

      <div class="frame-borrow" aria-hidden="true">
        <span>${borrowTop}</span>
        <div class="borrow-arrow"></div>
        <span>${borrowBottom}</span>
      </div>

      <div class="frame-block frame-b">
        <div class="frame-label"><b>${bCount}</b><span>${config.labelB || "号补给舱"}</span></div>
        <div class="ten-frame">${bCells.join("")}</div>
        <div class="frame-note ${data.hotB ? "hot" : ""}">${noteB}</div>
      </div>
    </div>`;
}

function renderBreakStage(step, config) {
  const data = config.steps[step];
  const { a, b } = config;
  const ones = a - 10;
  const left = 10 - b;
  const result = left + ones;
  const dragged = step === 2 ? Math.min(lessonState.dragged, b) : 0;
  const aCells = [];
  for (let i = 0; i < 10; i += 1) {
    let cls = "cell filled";
    let showStar = true;
    let dragAttrs = "";
    if (step === 0) {
      cls = "cell filled";
    } else if (i < left) {
      cls = "cell filled remain";
    } else if (step === 1) {
      cls = "cell filled doomed";
    } else if (step === 2) {
      if (i < left + dragged) {
        cls = "cell eaten";
        showStar = false;
      } else {
        cls = "cell filled doomed draggable-cell";
        dragAttrs = ` data-drag-orb="break" data-index="${i}"`;
      }
    } else {
      cls = "cell eaten";
      showStar = false;
    }
    aCells.push(
      `<div class="${cls}" data-index="${i}"${dragAttrs}>${
        showStar ? '<span class="star-ore"></span>' : ""
      }</div>`,
    );
  }

  const bCells = Array.from({ length: 10 }, (_, i) => {
    return i < ones
      ? `<div class="cell filled" data-index="${i}"><span class="star-ore"></span></div>`
      : `<div class="cell" data-index="${i}"></div>`;
  }).join("");

  const joinCaption = step === 0 ? "合起来" : step === 1 ? "破开" : step === 2 ? "还剩" : "合起来";
  const joinValue =
    step === 0
      ? `10 + ${ones}`
      : step === 1
        ? `${left} + ${b}`
        : step === 2
          ? `${left} + ${ones}`
          : `= ${result}`;
  const minusBadge = step === 2 ? `<span class="frame-minus">− ${b}</span>` : "";
  const laser = step === 2 ? '<span class="laser-sweep" aria-hidden="true"></span>' : "";
  const breakBin =
    step === 2
      ? `<div class="break-bin ${dragged >= b ? "is-full" : ""}" data-drop-zone="break">
          <span class="break-bin-mark">− ${b}</span>
          <b>${dragged} / ${b}</b>
          <small>拖到这里拿走</small>
        </div>`
      : "";
  const noteA = step === 2 ? (dragged >= b ? "拿够啦" : `还差 ${b - dragged} 颗`) : data.noteA;

  return `
    <div class="frame-area">
      <div class="frame-block frame-a">
        ${minusBadge}
        ${laser}
        <div class="frame-label"><b>${step >= 2 ? left : 10}</b><span>${config.labelA || (step >= 2 ? "颗剩下" : "号货舱")}</span></div>
        <div class="ten-frame full-ten">${aCells.join("")}</div>
        ${breakBin}
        <div class="frame-note ${data.hotA ? "hot" : ""}">${noteA}</div>
      </div>

      <div class="frame-borrow break-join" aria-hidden="true">
        <span class="join-caption">${joinCaption}</span>
        <div class="join-symbol">+</div>
        <span class="join-caption">${joinValue}</span>
      </div>

      <div class="frame-block frame-b">
        <div class="frame-label"><b>${ones}</b><span>${config.labelB || "散装星矿"}</span></div>
        <div class="ten-frame">${bCells}</div>
        <div class="frame-note ${data.hotB ? "hot" : ""}">${data.noteB}</div>
      </div>
    </div>
    ${
      step === 3
        ? `<div class="result-tray" aria-label="剩下 ${result} 颗星矿">
            ${Array.from({ length: result }, () => '<span class="mini-ore"></span>').join("")}
            <span class="tray-eq">${left} + ${ones} = ${result}</span>
          </div>`
        : ""
    }`;
}

function formulaMarkup(formula) {
  return formula
    .split(" ")
    .map((token) => {
      if (token === "?") return '<span class="f-num hot">?</span>';
      if (/^\d+$/.test(token)) return `<span class="f-num">${token}</span>`;
      return `<span class="f-op">${token}</span>`;
    })
    .join("");
}

/* ---------- calendar ---------- */

function practicePromptText() {
  const q = practiceState.questions[practiceState.index];
  if (!q) return "";
  return `${q.a} ${q.op === "+" ? "加" : "减"} ${q.b} 等于几？`;
}

function practiceBackTarget() {
  if (practiceState.mode === "lesson") return "course";
  if (practiceState.mode === "mistakes") return "report";
  return "home";
}

function renderPractice() {
  const questions = practiceState.questions;
  if (!questions.length) {
    return `
    <main class="page lesson-page practice-page view">
      <div class="lesson-top">
        <button class="round-back" data-nav="report" aria-label="返回家长报告">${icon("arrowLeft")}</button>
        <div class="lesson-heading">
          <div class="crumb"><span>MISSION · 错题返航</span></div>
          <h1>错题返航</h1>
        </div>
      </div>
      <section class="stage-card practice-card practice-empty">
        <div class="practice-empty-icon">${icon("star")}</div>
        <h2>暂时没有错题</h2>
        <p>去航线里上课，答错的题会自动收进这里。</p>
        <button class="btn btn-primary" data-nav="course">去看课程表 ${icon("arrowRight")}</button>
      </section>
    </main>`;
  }

  const q = questions[practiceState.index];
  const total = questions.length;
  const isLast = practiceState.index === total - 1;
  const answered = practiceState.answered;
  const wrong = practiceState.wrongAnswers;
  const backTarget = practiceBackTarget();
  const feedback = answered
    ? `答对啦！${q.a} ${q.op} ${q.b} = ${q.result}。`
    : wrong.length
      ? "没关系，再想一想，换个答案试试。"
      : "先在心里算，再选一个答案。";
  const bubble = answered
    ? `答对啦！${q.a} ${q.op} ${q.b} 就是 ${q.result}。`
    : wrong.length
      ? "没关系，再试一次就好。"
      : `${practicePromptText()}`;

  const choices = q.choices
    .map((value) => {
      const isWrong = wrong.includes(value);
      const isCorrect = answered && value === q.result;
      return `<button class="practice-choice ${isCorrect ? "is-correct" : ""} ${
        isWrong ? "is-wrong" : ""
      }" data-action="practice-answer" data-answer="${value}" ${
        answered || isWrong ? "disabled" : ""
      }>${value}</button>`;
    })
    .join("");

  const pips = Array.from({ length: total }, (_, i) => {
    const cls = i < practiceState.correct ? "done" : i === practiceState.index && !answered ? "active" : "off";
    return `<span class="level-star ${cls}">${icon("star")}</span>`;
  }).join("");

  return `
  <main class="page lesson-page practice-page view">
    <div class="lesson-top">
      <button class="round-back" data-nav="${backTarget}" aria-label="返回">${icon("arrowLeft")}</button>
      <div class="lesson-heading">
        <div class="crumb">
          <span>${practiceState.crumb}</span><span class="sep">·</span>
          <span class="level-crumb">第 ${practiceState.index + 1}/${total} 题</span>
        </div>
        <h1>${practiceState.title}</h1>
      </div>
      <div class="practice-round">${icon("star")} ${practiceState.correct}/${total}</div>
    </div>

    <div class="lesson-grid">
      <section class="stage-card practice-card" style="--planet:${practiceState.color}" aria-label="题目">
        <div class="planet-chip" style="--planet:${practiceState.color}">
          <span class="planet-dot"></span>${practiceState.planet}
        </div>
        <div class="practice-eyebrow">${q.kind === "make" ? "加法" : "减法"} · 选一个答案</div>
        <div class="practice-equation">
          <span class="practice-num">${q.a}</span>
          <span class="practice-op">${q.op}</span>
          <span class="practice-num">${q.b}</span>
          <span class="practice-op">=</span>
          <span class="practice-num result ${answered ? "is-revealed" : ""}">${answered ? q.result : "?"}</span>
        </div>
        <div class="practice-choices">${choices}</div>
        <div class="practice-feedback ${answered ? "ok" : wrong.length ? "try" : ""}">${feedback}</div>
        ${
          answered
            ? `<button class="btn btn-primary practice-next" data-action="practice-next">${
                isLast ? (practiceState.mode === "mistakes" ? "完成错题练习" : "完成挑战") : "下一题"
              } ${icon(isLast ? "star" : "arrowRight")}</button>`
            : ""
        }
      </section>

      <aside class="coach-card practice-coach">
        <div class="coach-top">
          <div class="mascot-wrap mini">${rocketSvg()}</div>
          <div class="coach-bubble">${bubble}</div>
        </div>
        <div class="level-pips practice-pips" aria-label="进度 ${practiceState.correct} / ${total}">
          <span class="pips-label">${practiceState.planet} · ${practiceState.correct}/${total}</span>
          <span class="pips">${pips}</span>
        </div>
        <div class="practice-hint">
          ${icon("lightbulb")}
          <span>想不出来就点“再听一遍”，或者在纸上画十格帮自己。</span>
        </div>
        <div class="coach-subactions practice-subactions">
          <button class="link-action" data-action="practice-repeat">${icon("volume")} 再听一遍</button>
          <button class="link-action" data-nav="${backTarget}">${icon("home")} ${
            practiceState.mode === "lesson" ? "返回航线" : practiceState.mode === "mistakes" ? "看报告" : "返回基地"
          }</button>
        </div>
      </aside>
    </div>
  </main>`;
}

function maybePracticePrompt() {
  const q = practiceState.questions[practiceState.index];
  if (!state.sound || practiceState.answered || !q) return;
  const key = `${q.qid}-${practiceState.index}`;
  if (key === lastPracticePromptKey) return;
  lastPracticePromptKey = key;
  playNarration(`audio/q-${q.qid}.mp3?v=${AUDIO_VERSION}`, practicePromptText());
}

function openPracticeCompleteModal() {
  const total = practiceState.questions.length;
  const isLesson = practiceState.mode === "lesson";
  const isMistakes = practiceState.mode === "mistakes";
  const badge = isLesson
    ? `${practiceState.planet}任务完成`
    : isMistakes
      ? "错题返航完成"
      : "小挑战完成";
  const title = isMistakes ? "错题全搞定！" : `${total} 颗星，全部点亮！`;
  const lede = isMistakes
    ? `你把 ${total} 道错题重新做对了。<br>错题本已经清空。`
    : isLesson
      ? `第 ${practiceState.lessonId} 课完成。<br>去打卡，收下今天的航行星。`
      : `你自己算对了 ${total} 道题。<br>去打卡，收下今天的航行星。`;
  const back = isLesson
    ? `<button class="text-link" data-nav="course">返回航线</button>`
    : isMistakes
      ? `<button class="text-link" data-nav="report">看家长报告</button>`
      : `<button class="text-link" data-nav="home">返回基地</button>`;

  if (isLesson) markLessonDone(practiceState.lessonId, total);

  openModal(`
    <button class="modal-close" data-action="close-modal" aria-label="关闭">${icon("close")}</button>
    <div class="modal-badge">${icon("star")} ${badge}</div>
    <div class="modal-mascot">${rocketSvg()}</div>
    <h2>${title}</h2>
    <p class="modal-lede">${lede}</p>
    <div class="level-complete-stars">
      ${Array.from({ length: total }, () => `<span class="level-star">${icon("star")}</span>`).join("")}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-wide" data-nav="calendar">去打卡，收星星</button>
      <button class="text-link" data-action="restart-practice">再来一次</button>
      ${back}
    </div>
  `);

  launchConfetti();
  sfx("fanfare");
  window.setTimeout(() => sfx("sparkle"), 420);
  const text = isMistakes
    ? `太棒啦，${total} 道错题全部搞定！`
    : `太棒啦，${total} 道题全部完成！去打卡，收下今天的星星吧。`;
  window.setTimeout(() => playNarration(`audio/practice-complete.mp3?v=${AUDIO_VERSION}`, text), 380);
}

function renderCourse() {
  const next = nextCourseLesson();
  const doneCount = Object.keys(state.lessonDone).length;
  const weekLabels = ["第 1 周 · 起飞", "第 2 周 · 远航", "第 3 周 · 返航"];

  const weeks = [1, 2, 3]
    .map((week) => {
      const cards = [0, 1, 2, 3, 4]
        .map((slot) => {
          const lesson = COURSE_LESSONS.find((item) => item.week === week && item.slot === slot);
          if (!lesson) {
            return `<div class="course-card course-rest">
              <span class="course-no">毕业</span>
              <strong>自由飞</strong>
              <span class="course-focus">休息 / 复习</span>
            </div>`;
          }
          const done = Boolean(state.lessonDone[lesson.id]);
          const current = !done && next && next.id === lesson.id;
          const unlocked = isLessonUnlocked(lesson.id) || done;
          return `<button class="course-card ${done ? "done" : current ? "current" : ""} ${unlocked ? "" : "locked"}"
            style="--planet:${lesson.color}" data-action="start-lesson" data-lesson="${lesson.id}" ${unlocked ? "" : "disabled"}>
            <span class="course-no">第 ${lesson.id} 课</span>
            <span class="course-planet"><i class="planet-dot"></i>${lesson.planet}</span>
            <strong>${lesson.title}</strong>
            <span class="course-focus">${
              lesson.specs
                ? `${lesson.specs.length} 题动画`
                : `${lesson.focus} · ${lesson.mode === "guided" ? "5 题" : "动画 1 题"}`
            }</span>
            <span class="course-state">${done ? "已完成" : current ? "现在出发" : unlocked ? "去复习" : "待解锁"}</span>
          </button>`;
        })
        .join("");

      return `<section class="course-week">
        <div class="course-week-head"><span>${weekLabels[week - 1]}</span><span>${week === 3 ? "第 11—14 课" : `第 ${(week - 1) * 5 + 1}—${week * 5} 课`}</span></div>
        <div class="course-days">${cards}</div>
        <div class="course-weekend"><span>周六</span><span>周日</span><b>休息，不上课</b></div>
      </section>`;
    })
    .join("");

  return `
  <main class="page course-page view">
    <div class="course-head">
      <div>
        <div class="crumb"><span>MISSION MAP</span><span class="sep">·</span><span>14 个学习日</span></div>
        <h1>14 天星际航线</h1>
        <p>周一到周五出发，周六周日休息。第 14 课返航地球，周五自由飞。</p>
      </div>
      <div class="course-head-side">
        <div class="course-progress"><b>${doneCount}</b><span>/ 14 课完成</span></div>
        <div class="course-head-actions">
          <button class="btn btn-primary btn-sm" data-action="start-lesson" data-lesson="${next.id}">
            ${doneCount >= 14 ? "再飞一次" : `继续第 ${next.id} 课`} ${icon("arrowRight")}
          </button>
          <button class="text-link" data-nav="report">家长报告</button>
          <button class="text-link" data-nav="practice">自由练习</button>
        </div>
      </div>
    </div>

    <div class="course-map">
      ${weeks}
    </div>
  </main>`;
}

function questionLabel(question) {
  if (!question) return "";
  const op = question.kind === "make" ? "+" : "−";
  return `${question.a} ${op} ${question.b}`;
}

function renderReport() {
  const doneCount = Object.keys(state.lessonDone).length;
  const attempts = state.records || [];
  const correct = attempts.filter((item) => item.correct).length;
  const accuracy = attempts.length ? Math.round((correct / attempts.length) * 100) : 0;
  const wrongList = Object.entries(state.wrong || {});
  const next = nextCourseLesson();

  const days = new Map();
  attempts.forEach((item) => {
    if (!days.has(item.date)) days.set(item.date, { total: 0, correct: 0 });
    const day = days.get(item.date);
    day.total += 1;
    if (item.correct) day.correct += 1;
  });
  const recent = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);

  return `
  <main class="page report-page view">
    <div class="report-top">
      <button class="round-back" data-nav="course" aria-label="返回航线">${icon("arrowLeft")}</button>
      <div class="lesson-heading">
        <div class="crumb"><span>PARENT LOG</span><span class="sep">·</span><span>家长报告</span></div>
        <h1>淘淘的航行记录</h1>
      </div>
      <button class="btn btn-primary btn-sm" data-nav="practice?mode=mistakes">练错题 ${icon("arrowRight")}</button>
    </div>

    <div class="report-stats">
      <div class="report-stat"><span>打卡天数</span><b>${state.checkins.length}</b><small>每天一颗星</small></div>
      <div class="report-stat"><span>完成课程</span><b>${doneCount}<em>/14</em></b><small>${doneCount >= 14 ? "全部完成" : `下一课：第 ${next.id} 课`}</small></div>
      <div class="report-stat"><span>答题次数</span><b>${attempts.length}</b><small>小挑战 / 航线练习</small></div>
      <div class="report-stat"><span>正确率</span><b>${accuracy}<em>%</em></b><small>${correct} 对 / ${attempts.length - correct} 错</small></div>
    </div>

    <div class="report-grid">
      <section class="report-card">
        <div class="report-card-head"><h2>最近 7 天</h2><span>每天做了几道</span></div>
        ${
          recent.length
            ? `<div class="report-days">${recent
                .map(([date, value]) => {
                  const d = fromKey(date);
                  return `<div class="report-day">
                    <span>${d.getMonth() + 1}/${d.getDate()}</span>
                    <div class="report-bar"><i style="width:${Math.min(100, Math.max(12, (value.total / 6) * 100))}%"></i></div>
                    <b>${value.total} 题</b>
                    <small>对 ${value.correct}</small>
                  </div>`;
                })
                .join("")}</div>`
            : `<p class="report-empty">还没有答题记录。去航线里上一课，这里就会长出来。</p>`
        }
      </section>

      <section class="report-card">
        <div class="report-card-head"><h2>错题本</h2><span>${wrongList.length} 道待复习</span></div>
        ${
          wrongList.length
            ? `<div class="wrong-list">${wrongList
                .slice(0, 6)
                .map(
                  ([qid, item]) => `<div class="wrong-row">
                    <span class="wrong-eq">${questionLabel(item)}</span>
                    <small>错 ${item.count || 1} 次</small>
                  </div>`,
                )
                .join("")}</div>
                <button class="btn btn-coral btn-sm" data-nav="practice?mode=mistakes">去练错题 ${icon("arrowRight")}</button>`
            : `<p class="report-empty">暂时没有错题，继续保持。</p>`
        }
      </section>
    </div>

    <div class="report-note">
      <span>${icon("lightbulb")}</span>
      <p>家长看这里：先看“最近 7 天”有没有坚持，再看“错题本”里反复出现的题。不要催速度，让孩子自己点答案。</p>
      <button class="text-link" data-nav="course">返回航线</button>
    </div>
  </main>`;
}

function renderCalendar() {
  const { year, month } = calendarCursor;
  const firstDay = new Date(year, month, 1);
  const gridStart = startOfWeek(firstDay);
  const streak = calcStreak();
  const stars = totalStars();
  const checkedToday = todayChecked();
  const next = nextMilestone(streak);
  const unlocked = unlockedMilestones(streak);

  const sorted = [...state.checkins].sort();
  const orderMap = new Map(sorted.map((key, index) => [key, index]));
  const monthKeys = sorted.filter((key) => {
    const date = fromKey(key);
    return date.getFullYear() === year && date.getMonth() === month;
  });

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const key = toKey(date);
    const checked = isChecked(key);
    const isToday = key === TODAY_KEY;
    const future = date > TODAY;
    const other = date.getMonth() !== month;
    const order = orderMap.get(key);
    const milestone = checked && order !== undefined && (order + 1) % 7 === 0;
    const classes = [
      "cal-day",
      other ? "other-month" : "",
      future ? "future" : "",
      checked ? "checked" : "",
      isToday ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const sticker =
      checked && !isToday
        ? icon(milestone ? "medal" : "star", `cal-sticker${milestone ? " milestone" : ""}`)
        : "";
    const todayLabel = isToday
      ? `<span class="today-label">${checked ? "✓ 今天" : "今天"}</span>`
      : "";
    const inner = `<span class="date-num">${date.getDate()}</span>${sticker}${todayLabel}`;

    if (isToday && !checked) {
      days.push(
        `<button type="button" class="${classes}" data-action="checkin" aria-label="今天 ${date.getDate()} 日，点击盖章">${inner}</button>`,
      );
    } else {
      days.push(
        `<div class="${classes}" aria-label="${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${checked ? "，已打卡" : ""}">${inner}</div>`,
      );
    }
  }

  const summaryButton = checkedToday
    ? `<button class="btn btn-mint btn-wide" disabled>${icon("check")} 今天已盖章</button>`
    : `<button class="btn btn-coral btn-wide" data-action="checkin">今日发射打卡 +1 ${icon("star")}</button>`;

  const rewardNodes = MILESTONES.map((item) => {
    const isUnlocked = streak >= item.days;
    const isNext = !isUnlocked && next && next.days === item.days;
    const nodeClass = isUnlocked ? "unlocked" : isNext ? "next" : "locked";
    const status = isUnlocked
      ? "已解锁"
      : isNext
        ? `还差 ${item.days - streak} 天`
        : `连续 ${item.days} 天解锁`;
    return `
      <div class="reward-node ${nodeClass}">
        <span class="reward-icon">${icon(item.icon)}</span>
        <span class="reward-copy">
          <b>${item.name}</b>
          <span>${status}</span>
        </span>
        ${isUnlocked ? `<span class="reward-check">${icon("check")}</span>` : ""}
      </div>`;
  }).join("");

  return `
  <main class="page calendar-page view">
    <div class="calendar-top">
      <div class="calendar-title-row">
        <button class="round-back" data-nav="home" aria-label="返回基地">${icon("arrowLeft")}</button>
        <div>
          <div class="tag" style="margin-bottom:8px"><span class="dot"></span>每天 5 分钟</div>
          <h1>星际航行日志</h1>
          <p>每一颗星，都是今天认真航行过的证据。</p>
        </div>
      </div>
      <div class="month-switch" aria-label="切换月份">
        <button data-action="month-prev" aria-label="上个月">${icon("arrowLeft")}</button>
        <span>${monthLabel(year, month)}</span>
        <button data-action="month-next" aria-label="下个月">${icon("arrowRight")}</button>
      </div>
    </div>

    <div class="calendar-grid">
      <section class="month-card" aria-label="${monthLabel(year, month)}航行日志">
        <div class="weekday-row">
          ${WEEKDAY_CN.map(
            (day, index) =>
              `<span class="${index >= 5 ? "weekend" : ""}">${day}</span>`,
          ).join("")}
        </div>
        <div class="days-grid">${days.join("")}</div>
      </section>

      <aside class="calendar-side">
        <section class="summary-card">
          <div class="summary-top">
            <span class="flame-big">${icon("planet")}</span>
            <div>
              <b>连续航行 ${streak} 天</b>
              <small>${next ? `下一站：${next.name}` : "全部星际装备已解锁"}</small>
            </div>
          </div>

          <div class="summary-stats">
            <div class="summary-stat">
              <span>累计星星</span>
              <strong>${stars}<small>颗</small></strong>
            </div>
            <div class="summary-stat">
              <span>本月打卡</span>
              <strong>${monthKeys.length}<small>天</small></strong>
            </div>
          </div>

          ${summaryButton}

          <p class="summary-note">
            ${icon("heart")} 忘记一天也没关系，重新出发就算数。
          </p>
        </section>

        <section class="reward-card">
          <h3>${icon("gift")} 星际装备</h3>
          <p>连续航行，解锁淘淘的新装备。</p>
          <div class="reward-path">${rewardNodes}</div>
        </section>
      </aside>
    </div>
  </main>`;
}

/* ---------- modals ---------- */

function openModal(html) {
  const root = $("#modal-root");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card" role="dialog" aria-modal="true">
        ${html}
      </div>
    </div>`;
  document.body.classList.add("modal-open");
  const backdrop = $(".modal-backdrop", root);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });
  const focusTarget = $("button", root);
  if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
}

function closeModal() {
  $("#modal-root").innerHTML = "";
  document.body.classList.remove("modal-open");
}

function openCheckinModal() {
  const streak = calcStreak();
  const next = nextMilestone(streak);

  openModal(`
    <button class="modal-close" data-action="close-modal" aria-label="关闭">${icon("close")}</button>
    <div class="modal-badge">${icon("check")} 发射打卡成功</div>
    <div class="modal-mascot">${rocketSvg()}</div>
    <h2>${streak <= 1 ? "第一颗航行星，点亮！" : "航行日志，盖章！"}</h2>
    <p class="modal-lede">
      连续航行 <strong>${streak}</strong> 天${
        next
          ? `，离「${next.name}」还差 <strong>${next.days - streak}</strong> 天`
          : "，全部星际装备都解锁啦"
      }。
    </p>
    <div class="modal-star">${icon("star")}</div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-wide" data-action="close-modal">收下星星</button>
      <button class="text-link" data-nav="calendar">看看我的星际日志</button>
    </div>
  `);

  window.setTimeout(launchConfetti, 180);
  sfx("checkin");
}

function openHowTo() {
  openModal(`
    <button class="modal-close" data-action="close-modal" aria-label="关闭">${icon("close")}</button>
    <div class="modal-mascot">${rocketSvg()}</div>
    <h2>三步，出发！</h2>
    <p class="modal-lede">不用先认字，看十格燃料舱就能明白。</p>
    <div class="how-grid">
      <div class="how-row">
        <span class="how-icon">${icon("eye")}</span>
        <span><b>看一看</b><span>能量星会告诉你，数字还差多少。</span></span>
      </div>
      <div class="how-row">
        <span class="how-icon">${icon("play")}</span>
        <span><b>点一点</b><span>跟着淘淘，一步一步完成航行。</span></span>
      </div>
      <div class="how-row">
        <span class="how-icon">${icon("star")}</span>
        <span><b>盖个章</b><span>每天自己点一下，攒出星际航行日志。</span></span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-wide" data-nav="make-ten" data-launch>知道啦，去补给站</button>
      <button class="text-link" data-action="close-modal">先随便看看</button>
    </div>
  `);
}

/* ---------- navigation and actions ---------- */

function isLessonUnlocked(lessonId) {
  const index = COURSE_LESSONS.findIndex((lesson) => lesson.id === Number(lessonId));
  if (index <= 0) return true;
  const previous = COURSE_LESSONS[index - 1];
  return Boolean(state.lessonDone[previous.id]);
}

function setupCourseLessonFromHash() {
  const hash = window.location.hash;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const lessonId = Number(new URLSearchParams(query).get("n")) || 1;
  const lesson = findCourseLesson(lessonId);
  if (!lesson) {
    window.location.hash = "#/course";
    return;
  }
  if (lesson.mode === "guided") {
    window.location.hash = `#/${lesson.route}`;
    return;
  }
  if (!isLessonUnlocked(lesson.id) && !state.lessonDone[lesson.id]) {
    toast(`先通过第 ${lesson.id - 1} 课，才能飞往${lesson.planet}。`);
    window.location.hash = "#/course";
    return;
  }
  lessonState.courseId = lesson.id;
  lessonState.kind = lesson.mode === "guided" ? (lesson.id === 1 ? "make-ten" : "break-ten") : lesson.spec.kind === "make" ? "make-ten" : "break-ten";
  lessonState.questions = lesson.mode === "scene" ? lesson.specs || [lesson.spec] : lessonState.questions;
  lessonState.index = 0;
  lessonState.step = 0;
  resetStepTask();
  lessonSignature = hash;
  lastSpokenKey = "";
  lastCelebrateKey = "";
  lastBorrowSfxKey = "";
}

function ensureCourseLesson() {
  if (lessonSignature !== window.location.hash) setupCourseLessonFromHash();
}

function setupPracticeContext() {
  const hash = window.location.hash;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const queryParams = new URLSearchParams(query);
  const lessonId = Number(queryParams.get("lesson")) || null;
  const routeMode = queryParams.get("mode") || "free";
  const lesson = lessonId ? findCourseLesson(lessonId) : null;

  let questions = [];
  let mode = "free";
  let title = "星际小挑战";
  let crumb = "MISSION 03 · 自己算一算";
  let planet = "自由练习";
  let color = "#54e6b4";

  if (lesson) {
    questions = lessonQuestions(lesson);
    mode = "lesson";
    title = lesson.title;
    crumb = `MISSION ${String(lesson.id).padStart(2, "0")} · ${lesson.planet}`;
    planet = lesson.planet;
    color = lesson.color;
  } else if (routeMode === "mistakes") {
    questions = Object.values(state.wrong)
      .slice(0, 5)
      .map((spec) => buildQuizQuestion(spec));
    mode = "mistakes";
    title = "错题返航";
    crumb = "MISSION · 错题练习";
    planet = "错题返航";
    color = "#ff7a59";
  } else {
    questions = freePracticeQuestions();
  }

  practiceState = {
    index: 0,
    correct: 0,
    answered: false,
    wrongAnswers: [],
    questions,
    mode,
    lessonId: lesson ? lesson.id : null,
    title,
    crumb,
    planet,
    color,
  };
  practiceSignature = hash;
  lastPracticePromptKey = "";
}

function resetPracticeProgress() {
  practiceState.index = 0;
  practiceState.correct = 0;
  practiceState.answered = false;
  practiceState.wrongAnswers = [];
  lastPracticePromptKey = "";
}

function ensurePracticeContext() {
  if (practiceSignature !== window.location.hash) setupPracticeContext();
}

function startLesson(lessonId) {
  const lesson = findCourseLesson(lessonId);
  if (!lesson) return;
  if (!isLessonUnlocked(lesson.id) && !state.lessonDone[lesson.id]) {
    toast(`先通过第 ${lesson.id - 1} 课，才能飞往${lesson.planet}。`);
    return;
  }
  if (lesson.mode === "guided") {
    navigate(lesson.route);
    return;
  }
  travelToLesson(lesson);
}

function travelToLesson(lesson) {
  if (traveling) return;
  traveling = true;
  pauseNarration();
  const overlay = document.createElement("div");
  overlay.className = "planet-flight";
  overlay.style.setProperty("--planet", lesson.color);
  overlay.innerHTML = `
    <div class="planet-flight-stars"></div>
    <div class="planet-flight-card">
      <div class="planet-flight-rocket">${rocketSvg()}</div>
      <span class="planet-flight-kicker">第 ${lesson.id} 课 · ${lesson.badge}</span>
      <strong>飞往${lesson.planet}</strong>
      <span class="planet-flight-title">${lesson.title}</span>
      <div class="planet-flight-orb"><i></i></div>
    </div>`;
  document.body.appendChild(overlay);
  sfx("warp");
  window.setTimeout(() => sfx("launch"), 120);

  window.setTimeout(() => {
    navigate(`lesson?n=${lesson.id}`);
    overlay.classList.add("is-done");
  }, 760);
  window.setTimeout(() => overlay.remove(), 1400);
  window.setTimeout(() => {
    traveling = false;
  }, 900);
}

function navigate(route) {
  if (!route) return;
  if (route === "make-ten") {
    lessonState.kind = "make-ten";
    lessonState.courseId = null;
    lessonState.questions = levelQuestions(MAKE_QUESTIONS);
    lessonState.index = 0;
    lessonState.step = 0;
    resetStepTask();
    lastSpokenKey = "";
    lastCelebrateKey = "";
    lastBorrowSfxKey = "";
  } else if (route === "break-ten") {
    lessonState.kind = "break-ten";
    lessonState.courseId = null;
    lessonState.questions = levelQuestions(BREAK_QUESTIONS);
    lessonState.index = 0;
    lessonState.step = 0;
    resetStepTask();
    lastSpokenKey = "";
    lastCelebrateKey = "";
    lastBorrowSfxKey = "";
  }
  if (route === "calendar") {
    calendarCursor = { year: TODAY.getFullYear(), month: TODAY.getMonth() };
  }
  if (getRoute() === route) {
    render();
  } else {
    window.location.hash = `#/${route}`;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return ["home", "make-ten", "break-ten", "calendar", "practice", "course", "report", "lesson"].includes(raw) ? raw : "home";
}

function checkIn() {
  if (todayChecked()) {
    toast("今天已经盖过章啦，明天再来收一颗～");
    return;
  }
  state.checkins.push(TODAY_KEY);
  state.checkins = [...new Set(state.checkins)].sort();
  saveState();
  render();
  openCheckinModal();
}

function toggleSound() {
  state.sound = !state.sound;
  if (!state.sound) pauseNarration();
  lastSpokenKey = "";
  lastPracticePromptKey = "";
  saveState();
  render();
  toast(state.sound ? "声音已开启" : "声音已关闭");
  if (state.sound) sfx("tap");
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("show"), 2600);
}

/* ---------- launch transition ---------- */

function launchTo(route) {
  if (launching) return;
  launching = true;
  closeModal();
  pauseNarration();

  const overlay = document.createElement("div");
  overlay.className = "launch-overlay";
  overlay.innerHTML = `
    <div class="launch-warp"></div>
    <div class="launch-stars"></div>
    <div class="launch-rocket">${rocketSvg()}</div>
    <div class="launch-copy">
      <span>准备发射</span>
      <strong>淘淘，出发！</strong>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("launching");
  sfx("launch");

  requestAnimationFrame(() => overlay.classList.add("is-firing"));

  window.setTimeout(() => {
    navigate(route);
    overlay.classList.add("is-done");
  }, 820);

  window.setTimeout(() => {
    overlay.remove();
    document.body.classList.remove("launching");
    launching = false;
  }, 1250);
}

/* ---------- particle helpers ---------- */

function burstAt(x, y, colors = ["#FFC94D", "#55E0FF", "#FF7A59"]) {
  const layer = document.createElement("div");
  layer.className = "spark-layer";
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;

  for (let i = 0; i < 12; i += 1) {
    const spark = document.createElement("span");
    const color = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
    const distance = 26 + Math.random() * 38;
    spark.className = "spark";
    spark.style.background = color;
    spark.style.color = color;
    layer.appendChild(spark);
    spark.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * distance - 50}%, ${
            Math.sin(angle) * distance - 50
          }%) scale(0)`,
          opacity: 0,
        },
      ],
      { duration: 540 + Math.random() * 260, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 900);
}

function animateBorrow() {
  const config = currentLessonConfig();
  if (!config || config.kind !== "make-ten") return;

  const need = 10 - config.a;
  const sfxKey = `borrow-${config.a}-${config.b}-${lessonState.index}`;
  if (sfxKey !== lastBorrowSfxKey) {
    lastBorrowSfxKey = sfxKey;
    sfx("whoosh");
  }
  for (let j = 0; j < need; j += 1) {
    const sourceIndex = config.b - need + j;
    const targetIndex = config.a + j;
    const source = $(`.frame-b .cell[data-index="${sourceIndex}"] .orb`);
    const target = $(`.frame-a .cell[data-index="${targetIndex}"] .orb`);
    if (!source || !target) continue;

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "flying-orb";
    ghost.style.left = `${sourceRect.left + sourceRect.width / 2 - 12}px`;
    ghost.style.top = `${sourceRect.top + sourceRect.height / 2 - 12}px`;
    document.body.appendChild(ghost);

    const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
    const delay = j * 90;

    const animation = ghost.animate(
      [
        { transform: "translate(0,0) scale(0.65)", opacity: 0 },
        { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0.08 },
        {
          transform: `translate(${dx * 0.48}px, ${dy * 0.48 - 46}px) scale(1.18)`,
          opacity: 1,
          offset: 0.54,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0 },
      ],
      {
        duration: 680,
        delay,
        fill: "backwards",
        easing: "cubic-bezier(.3,.9,.4,1)",
      },
    );
    animation.onfinish = () => {
      ghost.remove();
      sfx("sparkle");
      burstAt(
        targetRect.left + targetRect.width / 2,
        targetRect.top + targetRect.height / 2,
        ["#FFC94D", "#FFF6E4", "#55E0FF"],
      );
    };
  }
}

function launchConfetti() {
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  const colors = ["#FF7A59", "#FFC94D", "#55E0FF", "#A78BFA", "#54E6B4", "#FFF6E4"];
  for (let i = 0; i < 42; i += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--delay", `${Math.random() * 0.55}s`);
    piece.style.setProperty("--dur", `${1.9 + Math.random() * 1.5}s`);
    piece.style.setProperty("--drift", `${-100 + Math.random() * 200}px`);
    piece.style.setProperty("--spin", `${120 + Math.random() * 520}deg`);
    piece.style.width = `${6 + Math.random() * 7}px`;
    piece.style.height = `${9 + Math.random() * 10}px`;
    if (Math.random() > 0.55) piece.style.borderRadius = "50%";
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 4200);
}

/* ---------- stars ---------- */

function seedStarfield() {
  const field = $("#starfield");
  if (!field || field.childElementCount > 0) return;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 96; i += 1) {
    const star = document.createElement("span");
    const size = 1 + Math.random() * 2.4;
    const bright = Math.random() > 0.82;
    star.className = `star${bright ? " bright" : ""}`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.setProperty("--o", `${0.28 + Math.random() * 0.62}`);
    star.style.setProperty("--d", `${2.6 + Math.random() * 4.5}s`);
    star.style.setProperty("--delay", `${-Math.random() * 8}s`);
    fragment.appendChild(star);
  }
  field.appendChild(fragment);
}

/* ---------- render shell ---------- */

function render() {
  const route = getRoute();
  const routeChanged = route !== currentRoute;

  if (routeChanged) {
    currentRoute = route;
    pauseNarration();
    if (route === "make-ten") {
      lessonState.kind = "make-ten";
      lessonState.questions = levelQuestions(MAKE_QUESTIONS);
      lessonState.index = 0;
      lessonState.step = bootLessonStep === null ? 0 : bootLessonStep;
      resetStepTask();
    } else if (route === "break-ten") {
      lessonState.kind = "break-ten";
      lessonState.questions = levelQuestions(BREAK_QUESTIONS);
      lessonState.index = 0;
      lessonState.step = bootLessonStep === null ? 0 : bootLessonStep;
      resetStepTask();
    }
    if (route === "calendar") {
      calendarCursor = { year: TODAY.getFullYear(), month: TODAY.getMonth() };
    }
    lastSpokenKey = "";
    lastCelebrateKey = "";
    lastBorrowSfxKey = "";
    bootLessonStep = null;
  }

  if (route === "practice") ensurePracticeContext();
  if (route === "lesson") ensureCourseLesson();

  const content =
    route === "home"
      ? renderHome()
      : route === "calendar"
        ? renderCalendar()
        : route === "course"
          ? renderCourse()
          : route === "report"
            ? renderReport()
            : route === "practice"
              ? renderPractice()
              : renderLesson(route);

  $("#app").innerHTML = renderTopbar(route) + content;
  document.body.dataset.route = route;

  if (routeChanged) window.scrollTo({ top: 0, behavior: "auto" });

  if (route === "make-ten" && lessonState.step === 1) {
    requestAnimationFrame(animateBorrow);
  }

  if (route === "break-ten" && lessonState.step === 2) {
    const now = Date.now();
    if (now - lastLaserAt > 1200) {
      lastLaserAt = now;
      window.setTimeout(() => sfx("laser"), 160);
      window.setTimeout(() => sfx("crystal"), 420);
      window.setTimeout(() => sfx("sparkle"), 700);
    }
  }

  if ((route === "make-ten" || route === "break-ten") && lessonState.step === 3) {
    const total = lessonState.questions.length || 1;
    const isLast = lessonState.index === total - 1;
    const celebrateKey = `${route}-${lessonState.index}-${lessonState.step}`;
    if (celebrateKey !== lastCelebrateKey) {
      lastCelebrateKey = celebrateKey;
      if (isLast) {
        window.setTimeout(launchConfetti, 280);
      } else {
        window.setTimeout(() => {
          const resultEl = $(".eq-num.result");
          if (!resultEl) return;
          const rect = resultEl.getBoundingClientRect();
          burstAt(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            ["#FFC94D", "#55E0FF", "#FF7A59"],
          );
        }, 420);
      }
    }
  }

  maybeSpeak();
  if (route === "practice") maybePracticePrompt();
}

/* ---------- level flow ---------- */

function nextQuestion() {
  if (transitioning) return;
  const total = lessonState.questions.length;
  const next = lessonState.index + 1;
  if (next >= total) {
    openLevelCompleteModal();
    return;
  }

  showQuestionWarp(next + 1, total, () => {
    lessonState.index = next;
    lessonState.step = 0;
    resetStepTask();
    lastSpokenKey = "";
    lastCelebrateKey = "";
    render();
  });
}

function showQuestionWarp(number, total, callback) {
  if (transitioning) return;
  transitioning = true;
  pauseNarration();
  const overlay = document.createElement("div");
  overlay.className = "question-warp";
  overlay.innerHTML = `
    <span>准备下一题</span>
    <strong>第 ${number} / ${total} 题</strong>
    <div class="warp-star"></div>`;
  document.body.appendChild(overlay);
  sfx("warp");

  window.setTimeout(() => {
    callback();
    overlay.classList.add("is-done");
  }, 420);

  window.setTimeout(() => {
    overlay.remove();
    transitioning = false;
  }, 820);
}

function nextLessonAfter(lessonId) {
  const index = COURSE_LESSONS.findIndex((lesson) => lesson.id === Number(lessonId));
  return index >= 0 ? COURSE_LESSONS[index + 1] || null : null;
}

function recordPassAnswer(config, correct) {
  const lessonId = config.courseId || (config.kind === "make-ten" ? 1 : 2);
  const qid = `${config.kind === "make-ten" ? "make" : "break"}-${config.a}-${config.b}`;
  state.records.push({
    date: TODAY_KEY,
    ts: Date.now(),
    lessonId,
    qid,
    kind: config.kind === "make-ten" ? "make" : "break",
    a: config.a,
    b: config.b,
    correct,
    mode: "pass",
  });
  if (state.records.length > 600) state.records = state.records.slice(-600);
  if (correct) {
    delete state.wrong[qid];
  } else {
    const previous = state.wrong[qid];
    state.wrong[qid] = {
      kind: config.kind === "make-ten" ? "make" : "break",
      a: config.a,
      b: config.b,
      count: (previous && previous.count ? previous.count : 0) + 1,
      lastAt: Date.now(),
    };
  }
  saveState();
}

function renderPassCheck() {
  const config = currentLessonConfig();
  const wrong = passCheckState.wrong;
  const buttons = passCheckState.values
    .map(
      (value) => `<button class="pass-choice ${wrong.includes(value) ? "is-wrong" : ""}"
        data-action="pass-answer" data-value="${value}" ${wrong.includes(value) ? "disabled" : ""}>${value}</button>`,
    )
    .join("");

  openModal(`
    <button class="modal-close" data-action="close-modal" aria-label="关闭">${icon("close")}</button>
    <div class="modal-badge">${icon("star")} 通关检查</div>
    <h2>最后一关</h2>
    <p class="modal-lede">选对答案，才能飞往下一站。</p>
    <div class="pass-equation">${config.a} <span>${config.op}</span> ${config.b} <span>=</span> ?</div>
    <div class="pass-choices">${buttons}</div>
    <p class="pass-feedback ${wrong.length ? "try" : ""}">${
      wrong.length ? "再想一想，换一个答案试试。" : "选一个你觉得对的答案。"
    }</p>
  `);
}

function openPassCheck() {
  const config = currentLessonConfig();
  if (!config) return;
  const values = shuffle(
    [config.result].concat(
      shuffle(
        [...new Set([config.result - 1, config.result + 1, config.result + 2])].filter(
          (value) => value > 0 && value !== config.result,
        ),
      ).slice(0, 2),
    ),
  );
  passCheckState = { values, wrong: [] };
  renderPassCheck();
}

function openLevelCompleteModal() {
  const config = currentLessonConfig();
  const total = lessonState.questions.length || 1;
  const isCourse = Boolean(config && config.courseId);
  const isMake = config && config.kind === "make-ten";
  const courseId = isCourse ? config.courseId : isMake ? 1 : 2;
  const courseLesson = findCourseLesson(courseId);
  const nextLesson = nextLessonAfter(courseId);
  const badge = isCourse ? `${courseLesson.planet} · 本课通过` : isMake ? "补给站任务完成" : "陨石带任务完成";
  const title = isCourse ? "本课通过！" : `${total} 颗${isMake ? "能量星" : "星矿"}，全部归位！`;
  const lede = isCourse
    ? `你完成了第 ${courseId} 课《${courseLesson.title}》。<br>${nextLesson ? "现在可以飞往下一站了。" : "14 天航线完成，准备返航。"}`
    : `你完成了 ${total} 道${isMake ? "凑十" : "破十"}任务。<br>去打卡，收下今天的航行星。`;

  markLessonDone(courseId, total);

  openModal(`
    <button class="modal-close" data-action="close-modal" aria-label="关闭">${icon("close")}</button>
    <div class="modal-badge">${icon("star")} ${badge}</div>
    <div class="modal-mascot">${rocketSvg()}</div>
    <h2>${title}</h2>
    <p class="modal-lede">${lede}</p>
    <div class="level-complete-stars">
      ${Array.from({ length: Math.min(total, 5) }, () => `<span class="level-star">${icon("star")}</span>`).join("")}
    </div>
    <div class="modal-actions">
      ${
        nextLesson
          ? `<button class="btn btn-primary btn-wide" data-action="next-lesson" data-next="${nextLesson.id}">飞往第 ${nextLesson.id} 课 · ${nextLesson.planet} ${icon("arrowRight")}</button>`
          : `<button class="btn btn-primary btn-wide" data-nav="course">完成航线，返回地球 ${icon("star")}</button>`
      }
      <button class="text-link" data-nav="calendar">去打卡，收星星</button>
      <button class="text-link" data-nav="course">返回航线</button>
    </div>
  `);

  launchConfetti();
  sfx("fanfare");
  window.setTimeout(() => sfx("sparkle"), 420);
  const completeText = isCourse
    ? `太棒啦，第 ${courseId} 课通过！${nextLesson ? `飞往第 ${nextLesson.id} 课吧。` : "14 天航线完成！"}`
    : `太棒啦，${total} 道${isMake ? "凑十" : "破十"}任务全部完成！去打卡，收下今天的星星。`;
  window.setTimeout(
    () => playNarration(`audio/${isCourse ? "lesson-complete" : `complete-${isMake ? "make" : "break"}`}.mp3?v=${AUDIO_VERSION}`, completeText),
    380,
  );
}

/* ---------- voice ---------- */

const speechSupported = "speechSynthesis" in window;

function refreshVoices() {
  if (!speechSupported) return;
  const all = window.speechSynthesis.getVoices();
  const femaleHints =
    /Xiaoxiao|Xiaoyi|Xiaohan|Xiaomo|Xiaorui|Xiaoshuang|Xiaoyan|Xiaozhen|Ting-Ting|Mei-Jia|Sin-Ji|Huihui|Yaoyao|Female|女/i;
  const childHints =
    /Xiaoxiao|Xiaoyi|Xiaohan|Xiaomo|Xiaorui|Xiaoshuang|Xiaoyan|Xiaozhen|Ting-Ting|Mei-Jia|Sin-Ji/i;
  const maleHints = /Yunxi|Yunyang|Yunjian|Kangkang|Li-Mu|Male|男/i;

  const score = (voice) => {
    let value = 0;
    if (/^zh/i.test(voice.lang)) value += 40;
    if (childHints.test(voice.name)) value += 55;
    if (/Xiaoxiao/i.test(voice.name)) value += 35;
    if (/Xiaoyi|Xiaohan|Xiaomo|Xiaorui/i.test(voice.name)) value += 25;
    if (/Natural|Online/i.test(voice.name)) value += 30;
    if (femaleHints.test(voice.name)) value += 15;
    if (/Desktop|Compact/i.test(voice.name)) value -= 8;
    if (!voice.localService) value += 8;
    if (maleHints.test(voice.name)) value -= 90;
    return value;
  };

  speechVoices = all
    .filter((voice) => /^zh/i.test(voice.lang) || /Chinese|Huihui|Xiaoxiao|Ting|Mei/i.test(voice.name))
    .sort((a, b) => score(b) - score(a));
}

function plainText(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function currentStepAudio() {
  const config = currentLessonConfig();
  if (!config) return "";
  if (lessonState.step === 0 && !lessonState.stepSolved) return "";
  const stage = pageStageStep(config);
  if (config.courseId) return `audio/lesson-${config.courseId}-${lessonState.index + 1}-${stage}.mp3?v=${AUDIO_VERSION}`;
  const prefix = config.kind === "make-ten" ? "make" : "break";
  return `audio/${prefix}-${config.a}-${config.b}-${stage}.mp3?v=${AUDIO_VERSION}`;
}

function pauseNarration() {
  if (narrationAudio) {
    narrationAudio.pause();
    narrationAudio.currentTime = 0;
    narrationAudio = null;
  }
  if (speechSupported) window.speechSynthesis.cancel();
}

function playNarration(src, fallbackText) {
  if (!state.sound || !src) return;
  pauseNarration();

  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = 1;
  narrationAudio = audio;

  let fellBack = false;
  const fallback = () => {
    if (fellBack || !state.sound) return;
    fellBack = true;
    speak(fallbackText);
  };

  audio.addEventListener("error", fallback, { once: true });
  const playing = audio.play();
  if (playing && typeof playing.catch === "function") {
    playing.catch((error) => {
      if (error && error.name === "NotAllowedError") return;
      fallback();
    });
  }
}

function speak(text) {
  if (!state.sound || !speechSupported || !text) return;
  const voice = speechVoices[0];
  const natural = voice && /Natural|Online|Xiaoxiao|Xiaoyi|Ting-Ting|Mei-Jia/i.test(voice.name);
  const spoken = text.replace(/能量/g, "能亮");
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = "zh-CN";
  utterance.rate = natural ? 0.95 : 0.9;
  utterance.pitch = natural ? 1.38 : 1.55;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function speakCurrentStep() {
  if (!state.sound) {
    toast("先打开右上角的声音，再听淘淘说。");
    return;
  }
  const config = currentLessonConfig();
  if (!config) return;
  playStepNarration(config);
}

function playStepNarration(config) {
  const text = plainText(stepSpeechFor(config));
  const src = currentStepAudio();
  if (!src) {
    speak(text);
    return;
  }
  playNarration(src, text);
}

function maybeSpeak() {
  if (!state.sound) return;
  const route = getRoute();
  if (route !== "make-ten" && route !== "break-ten" && route !== "lesson") return;
  const config = currentLessonConfig();
  if (!config) return;
  const key = `${route}-${lessonState.index}-${lessonState.step}`;
  if (key === lastSpokenKey) return;
  lastSpokenKey = key;
  playStepNarration(config);
}

if (speechSupported) {
  refreshVoices();
  if (window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  }
}

/* ---------- events ---------- */

document.addEventListener("click", (event) => {
  const navTarget = event.target.closest("[data-nav]");
  if (navTarget) {
    event.preventDefault();
    if (navTarget.disabled) return;
    if (navTarget.hasAttribute("data-launch")) {
      launchTo(navTarget.dataset.nav);
      return;
    }
    sfx("tap");
    closeModal();
    navigate(navTarget.dataset.nav);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget || actionTarget.disabled) return;

  const action = actionTarget.dataset.action;

  if (action === "sound") {
    toggleSound();
  } else if (action === "start-lesson") {
    startLesson(Number(actionTarget.dataset.lesson));
  } else if (action === "next-lesson") {
    closeModal();
    startLesson(Number(actionTarget.dataset.next));
  } else if (action === "practice-answer") {
    const value = Number(actionTarget.dataset.answer);
    const question = practiceState.questions[practiceState.index];
    if (!question || practiceState.answered || !question.choices.includes(value)) return;
    if (value === question.result) {
      practiceState.answered = true;
      practiceState.correct += 1;
      recordPracticeAnswer(question, true);
      sfx("win");
      window.setTimeout(() => sfx("sparkle"), 150);
      playNarration(
        `audio/practice-correct.mp3?v=${AUDIO_VERSION}`,
        "答对啦，真棒！",
      );
    } else {
      if (!practiceState.wrongAnswers.includes(value)) practiceState.wrongAnswers.push(value);
      recordPracticeAnswer(question, false);
      sfx("pop");
      playNarration(
        `audio/practice-wrong.mp3?v=${AUDIO_VERSION}`,
        "再想一想，你可以的。",
      );
    }
    render();
  } else if (action === "practice-next") {
    if (!practiceState.answered) return;
    if (practiceState.index < practiceState.questions.length - 1) {
      practiceState.index += 1;
      practiceState.answered = false;
      practiceState.wrongAnswers = [];
      lastPracticePromptKey = "";
      sfx("step");
      render();
    } else {
      openPracticeCompleteModal();
    }
  } else if (action === "practice-repeat") {
    if (!state.sound) {
      toast("先打开右上角的声音，再听淘淘说。");
      return;
    }
    const question = practiceState.questions[practiceState.index];
    if (!question) return;
    playNarration(
      `audio/q-${question.qid}.mp3?v=${AUDIO_VERSION}`,
      practicePromptText(),
    );
  } else if (action === "restart-practice") {
    closeModal();
    resetPracticeProgress();
    sfx("tap");
    render();
  } else if (action === "next-step") {
    const config = currentLessonConfig();
    if (lessonState.step === dragStepFor(config) && !lessonState.stepSolved) {
      toast("把星星拖到正确的位置，再继续。");
      return;
    }
    if (lessonState.step < 2) {
      lessonState.step += 1;
      resetStepTask();
      if (lessonState.step === 2) {
        sfx("win");
        window.setTimeout(() => sfx("sparkle"), 220);
      } else {
        sfx("step");
      }
      render();
    }
  } else if (action === "step-locked") {
    toast("把星星拖到正确的位置，再继续。");
  } else if (action === "task-voice") {
    const config = currentLessonConfig();
    speak(dragPromptFor(config));
  } else if (action === "prev-step") {
    if (lessonState.step > 0) {
      lessonState.step -= 1;
      resetStepTask();
      lastCelebrateKey = "";
      lastBorrowSfxKey = "";
      sfx("tap");
      render();
    }
  } else if (action === "next-question") {
    nextQuestion();
  } else if (action === "complete-level") {
    openLevelCompleteModal();
  } else if (action === "pass-answer") {
    const value = Number(actionTarget.dataset.value);
    const config = currentLessonConfig();
    if (!config || passCheckState.wrong.includes(value)) return;
    if (value === config.result) {
      recordPassAnswer(config, true);
      closeModal();
      sfx("win");
      window.setTimeout(() => openLevelCompleteModal(), 180);
    } else {
      passCheckState.wrong.push(value);
      recordPassAnswer(config, false);
      sfx("pop");
      playNarration(`audio/practice-wrong.mp3?v=${AUDIO_VERSION}`, "再想一想，你可以的。");
      renderPassCheck();
    }
  } else if (action === "restart-level") {
    closeModal();
    lessonState.index = 0;
    lessonState.step = 0;
    resetStepTask();
    lessonState.questions = levelQuestions(
      lessonState.kind === "make-ten" ? MAKE_QUESTIONS : BREAK_QUESTIONS,
    );
    lastSpokenKey = "";
    lastCelebrateKey = "";
    lastBorrowSfxKey = "";
    sfx("tap");
    render();
  } else if (action === "repeat-voice") {
    speakCurrentStep(true);
  } else if (action === "restart") {
    lessonState.step = 0;
    resetStepTask();
    lastSpokenKey = "";
    lastCelebrateKey = "";
    lastBorrowSfxKey = "";
    sfx("tap");
    render();
  } else if (action === "finish") {
    sfx("win");
    if (!todayChecked()) toast("任务完成！点「今日发射打卡」，把今天的星星收下。");
    navigate("calendar");
  } else if (action === "checkin") {
    checkIn();
  } else if (action === "close-modal") {
    closeModal();
  } else if (action === "how-to") {
    sfx("tap");
    openHowTo();
  } else if (action === "month-prev") {
    calendarCursor = previousMonth(calendarCursor);
    sfx("tap");
    render();
  } else if (action === "month-next") {
    calendarCursor = nextMonth(calendarCursor);
    sfx("tap");
    render();
  }
});

function previousMonth(cursor) {
  const date = new Date(cursor.year, cursor.month - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function nextMonth(cursor) {
  const date = new Date(cursor.year, cursor.month + 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#modal-root").innerHTML) closeModal();
});

window.addEventListener("hashchange", () => {
  closeModal();
  render();
});

let activeDrag = null;

function dropDraggedStar() {
  const config = currentLessonConfig();
  if (!config || lessonState.stepSolved) return;
  const need = dragNeedFor(config);
  lessonState.dragged = Math.min(lessonState.dragged + 1, need);
  if (lessonState.dragged >= need) {
    lessonState.stepSolved = true;
    haptic([12, 30, 20]);
    sfx("win");
    window.setTimeout(() => sfx("sparkle"), 120);
  } else {
    haptic(16);
    sfx("tap");
  }
  render();
}

function haptic(pattern = 12) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
    return;
  }
  const stage = document.querySelector(".stage-card");
  if (!stage) return;
  stage.classList.remove("haptic-pulse");
  void stage.offsetWidth;
  stage.classList.add("haptic-pulse");
  window.setTimeout(() => stage.classList.remove("haptic-pulse"), 220);
}

function beginStarDrag(event) {
  const handle = event.target.closest("[data-drag-orb]");
  if (!handle || lessonState.stepSolved) return;
  const config = currentLessonConfig();
  if (!config || lessonState.step !== dragStepFor(config)) return;
  event.preventDefault();
  const source = handle.querySelector(".orb, .star-ore") || handle;
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  ghost.className += " drag-ghost";
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
  document.body.appendChild(ghost);
  document.querySelectorAll("[data-drop-zone]").forEach((zone) => zone.classList.add("drop-active"));
  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    /* pointer capture is optional */
  }
  haptic(8);
  activeDrag = {
    type: handle.dataset.dragOrb,
    ghost,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
}

function moveStarDrag(event) {
  if (!activeDrag) return;
  event.preventDefault();
  activeDrag.ghost.style.left = `${event.clientX}px`;
  activeDrag.ghost.style.top = `${event.clientY}px`;
  if (
    Math.abs(event.clientX - activeDrag.startX) > 4 ||
    Math.abs(event.clientY - activeDrag.startY) > 4
  ) {
    activeDrag.moved = true;
  }
}

function endStarDrag(event) {
  if (!activeDrag) return;
  const { type, ghost, moved } = activeDrag;
  ghost.remove();
  document.querySelectorAll("[data-drop-zone]").forEach((zone) => zone.classList.remove("drop-active"));
  const under = document.elementFromPoint(event.clientX, event.clientY);
  let zone = under && under.closest("[data-drop-zone]");
  if (!zone) {
    zone = [...document.querySelectorAll("[data-drop-zone]")].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return (
        event.clientX >= rect.left - 24 &&
        event.clientX <= rect.right + 24 &&
        event.clientY >= rect.top - 24 &&
        event.clientY <= rect.bottom + 24
      );
    });
  }
  const hit = zone && zone.dataset.dropZone === type;
  activeDrag = null;
  if (hit || !moved) {
    dropDraggedStar();
  } else if (moved) {
    haptic([8, 24, 8]);
    toast("把星星拖到亮起来的地方。");
  }
}

/* ---------- boot ---------- */

document.addEventListener("pointerdown", beginStarDrag, { passive: false });
document.addEventListener("pointermove", moveStarDrag, { passive: false });
document.addEventListener("pointerup", endStarDrag);
document.addEventListener("pointercancel", () => {
  if (!activeDrag) return;
  activeDrag.ghost.remove();
  document.querySelectorAll("[data-drop-zone]").forEach((zone) => zone.classList.remove("drop-active"));
  activeDrag = null;
});

seedStarfield();
render();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* PWA is optional; file:// and private modes still work online */
    });
  });
}
