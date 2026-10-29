// Browser shell around the Blade Hymn canvas: speedrun leaderboard, run
// submission, and the key-bind settings screen. The game itself (js/main.js)
// stays a faithful port; everything web-native lives here.

import { ACTIONS, ACTION_LABELS, binds, setBind, resetBinds, restoreBinds, savedAt, keyLabel, onBindsChanged } from "./settings.js";
import { gameHooks, formatMs } from "./main.js";

const LEVEL_NAMES = {
  spring: "Verdant Beginnings",
  winter: "Frosted Path",
  desert: "Crimson Desolation",
};

let account = null; // { signedIn, username }
let currentSubmit = null; // { level, ms }

// ---------------------------------------------------------------------------
// session + profile
// ---------------------------------------------------------------------------

async function loadStatus() {
  try {
    const res = await fetch("/_guard/status", { headers: { Accept: "application/json" } });
    const data = await res.json();
    account = data.signedIn ? { username: data.username } : null;
  } catch {
    account = null;
  }
  document.querySelectorAll(".account-name").forEach((el) => {
    el.textContent = account ? account.username : "guest";
  });
}

function guestName() {
  return localStorage.getItem("bladehymn_guest_name") || "";
}

// ---------------------------------------------------------------------------
// run submission
// ---------------------------------------------------------------------------

function showSubmit(level, ms) {
  currentSubmit = { level, ms };
  document.getElementById("submit-level").textContent = LEVEL_NAMES[level] || level;
  document.getElementById("submit-time").textContent = formatMs(ms);
  const nameInput = document.getElementById("submit-name");
  const nameField = document.getElementById("submit-name-field");
  if (account) {
    document.getElementById("submit-as").textContent = `Submitting as ${account.username}`;
    nameField.hidden = true;
  } else {
    nameInput.value = guestName();
    document.getElementById("submit-as").textContent = "Signed out — enter a name for the leaderboard";
    nameField.hidden = false;
  }
  openModal("submit-modal");
}

async function submitRun() {
  if (!currentSubmit) return;
  const body = { level: currentSubmit.level, ms: currentSubmit.ms };
  if (!account) {
    const name = document.getElementById("submit-name").value.trim().slice(0, 16);
    if (!name) {
      document.getElementById("submit-status").textContent = "Enter a name first.";
      return;
    }
    localStorage.setItem("bladehymn_guest_name", name);
    body.name = name;
  }
  const status = document.getElementById("submit-status");
  status.textContent = "Submitting…";
  try {
    const res = await fetch("/_guard/bladehymn-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      status.textContent = data.error || "Could not submit the run.";
      return;
    }
    status.textContent = data.improved === false
      ? `Saved. Your best for this stage is still ${formatMs(data.best)}.`
      : `New personal best — rank #${data.rank}.`;
    closeModal("submit-modal");
    showLeaderboard(currentSubmit.level, currentSubmit.ms);
  } catch {
    status.textContent = "Could not reach the leaderboard.";
  }
}

// ---------------------------------------------------------------------------
// leaderboard
// ---------------------------------------------------------------------------

async function showLeaderboard(level, highlightMs) {
  openModal("leaderboard-modal");
  for (const tab of document.querySelectorAll(".lb-tab")) {
    tab.classList.toggle("active", tab.dataset.level === level);
  }
  const list = document.getElementById("leaderboard-list");
  list.innerHTML = '<p class="lb-loading">Loading…</p>';
  try {
    const res = await fetch(`/_guard/bladehymn-runs?level=${encodeURIComponent(level)}`);
    const data = await res.json();
    const rows = data.runs || [];
    if (rows.length === 0) {
      list.innerHTML = '<p class="lb-loading">No runs yet. Set the first time!</p>';
      return;
    }
    const table = document.createElement("table");
    table.className = "lb-table";
    table.innerHTML = "<thead><tr><th>#</th><th>Name</th><th>Time</th></tr></thead>";
    const tbody = document.createElement("tbody");
    rows.forEach((run, i) => {
      const tr = document.createElement("tr");
      if (highlightMs != null && run.ms === highlightMs) tr.className = "highlight";
      tr.innerHTML = `<td>${i + 1}</td><td></td><td>${formatMs(run.ms)}</td>`;
      tr.children[1].textContent = run.name;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    list.innerHTML = "";
    list.appendChild(table);
  } catch {
    list.innerHTML = '<p class="lb-loading">Could not load the leaderboard.</p>';
  }
}

// ---------------------------------------------------------------------------
// keybinds
// ---------------------------------------------------------------------------

let capturing = null; // action name while waiting for a key

function renderBinds() {
  const list = document.getElementById("binds-list");
  list.innerHTML = "";
  for (const action of ACTIONS) {
    const row = document.createElement("div");
    row.className = "bind-row";
    const label = document.createElement("span");
    label.textContent = ACTION_LABELS[action];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "bind-key" + (capturing === action ? " capturing" : "");
    key.textContent = capturing === action ? "press a key…" : keyLabel(binds[action]);
    key.addEventListener("click", () => {
      capturing = capturing === action ? null : action;
      renderBinds();
      if (capturing) key.focus();
    });
    row.appendChild(label);
    row.appendChild(key);
    list.appendChild(row);
  }
}

window.addEventListener("keydown", (e) => {
  if (!capturing) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.code !== "Escape") setBind(capturing, e.code);
  capturing = null;
  renderBinds();
}, true);

onBindsChanged((saved, changedHere) => {
  if (changedHere) syncProfile(saved);
});

async function syncProfile(keybinds) {
  if (!account) return;
  try {
    const res = await fetch("/_guard/profile");
    const data = await res.json();
    const profile = data.profile && typeof data.profile === "object" ? data.profile : {};
    profile.keybinds = keybinds;
    await fetch("/_guard/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
  } catch {
    /* offline or signed out mid-session — local binds still apply */
  }
}

async function restoreProfile() {
  if (!account) return;
  try {
    const res = await fetch("/_guard/profile");
    const data = await res.json();
    if (data.profile && data.profile.keybinds) {
      // account profile wins over a fresh device, unless the local binds were
      // changed on this device after the profile was last written
      const profileTs = +(data.profile.keybinds.savedAt || 0);
      if (profileTs >= savedAt()) {
        restoreBinds(data.profile.keybinds, profileTs);
        renderBinds();
      }
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// modal plumbing
// ---------------------------------------------------------------------------

function openModal(id) {
  for (const modal of document.querySelectorAll(".modal")) modal.hidden = true;
  document.getElementById(id).hidden = false;
  document.getElementById("overlay").hidden = false;
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
  document.getElementById("overlay").hidden = true;
  capturing = null;
}

function wire() {
  document.getElementById("btn-leaderboard").addEventListener("click", () => showLeaderboard("spring"));
  document.getElementById("btn-keybinds").addEventListener("click", () => {
    capturing = null;
    renderBinds();
    openModal("keybinds-modal");
  });
  document.getElementById("submit-confirm").addEventListener("click", submitRun);
  document.getElementById("submit-close").addEventListener("click", () => {
    closeModal("submit-modal"); // the game already returned to the menu
  });
  document.getElementById("submit-retry").addEventListener("click", () => {
    closeModal("submit-modal");
    if (currentSubmit) gameHooks.startLevel?.(currentSubmit.level);
  });
  document.getElementById("leaderboard-close").addEventListener("click", () => closeModal("leaderboard-modal"));
  document.getElementById("keybinds-close").addEventListener("click", () => closeModal("keybinds-modal"));
  document.getElementById("binds-reset").addEventListener("click", () => {
    resetBinds();
    renderBinds();
  });
  for (const tab of document.querySelectorAll(".lb-tab")) {
    tab.addEventListener("click", () => showLeaderboard(tab.dataset.level));
  }
  document.getElementById("overlay").addEventListener("click", (e) => {
    if (e.target.id === "overlay") {
      for (const modal of document.querySelectorAll(".modal")) modal.hidden = true;
      e.target.hidden = true;
      capturing = null;
    }
  });
  document.getElementById("btn-credits").addEventListener("click", () => openModal("credits-modal"));
  document.getElementById("credits-close").addEventListener("click", () => closeModal("credits-modal"));
  document.getElementById("lb-play").addEventListener("click", () => {
    const tab = document.querySelector(".lb-tab.active");
    closeModal("leaderboard-modal");
    gameHooks.startLevel?.(tab ? tab.dataset.level : "spring");
  });
  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.getElementById("screen").requestFullscreen?.().catch(() => {});
  });
  document.getElementById("closed-restart").addEventListener("click", () => location.reload());
}

gameHooks.onRunComplete = (level, ms) => {
  showSubmit(level, ms);
};

// the menu's quit button: pygame.quit() closes the window
gameHooks.onQuit = () => {
  document.getElementById("closed").hidden = false;
};

(async function init() {
  wire();
  await loadStatus();
  await restoreProfile();
  renderBinds();
})();
