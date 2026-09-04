// Web port of code/settings.py of Eason-F/Blade-Hymn.
//
// The original hardcodes pygame key constants. This port makes the six binds
// rebindable: they live here, persist to localStorage, and (when the player is
// signed in to games.andrenijman.com) sync to their account profile.

const STORAGE_KEY = "bladehymn_keybinds_v1";

export const ACTIONS = ["RIGHT_KEY", "LEFT_KEY", "JUMP_KEY", "DASH_KEY", "ATTACK_KEY", "HEAL_KEY"];

export const ACTION_LABELS = {
  RIGHT_KEY: "Move right",
  LEFT_KEY: "Move left",
  JUMP_KEY: "Jump",
  DASH_KEY: "Dash",
  ATTACK_KEY: "Attack",
  HEAL_KEY: "Heal",
};

export const DEFAULT_BINDS = {
  RIGHT_KEY: "ArrowRight",
  LEFT_KEY: "ArrowLeft",
  JUMP_KEY: "Space",
  DASH_KEY: "ShiftLeft",
  ATTACK_KEY: "KeyX",
  HEAL_KEY: "KeyR",
};

export const binds = { ...DEFAULT_BINDS };

let saveHooks = [];
export function onBindingsSaved(hook) {
  saveHooks.push(hook);
}

export function loadBinds() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    stored = null;
  }
  if (stored && typeof stored === "object") {
    for (const action of ACTIONS) {
      if (typeof stored[action] === "string") binds[action] = stored[action];
    }
  }
}

export function setBind(action, code) {
  if (!ACTIONS.includes(action)) return false;
  // One key can only do one job: clear it from any other action.
  for (const other of ACTIONS) {
    if (other !== action && binds[other] === code) binds[other] = DEFAULT_BINDS[other];
  }
  binds[action] = code;
  persistLocal();
  return true;
}

export function resetBinds() {
  for (const action of ACTIONS) binds[action] = DEFAULT_BINDS[action];
  persistLocal();
}

function persistLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
    localStorage.setItem("bladehymn_keybinds_ts", String(Date.now()));
  } catch {
    /* storage unavailable — binds simply won't persist */
  }
  for (const hook of saveHooks) {
    try { hook({ ...binds }); } catch { /* hook errors must not break input */ }
  }
}

export function isBound(code) {
  return ACTIONS.some((a) => binds[a] === code);
}

// pygame.key.name() equivalents for the tutorial text (code/text.py renders
// e.g. "Move with RIGHT and LEFT.").
const KEY_NAMES = {
  ArrowRight: "RIGHT", ArrowLeft: "LEFT", ArrowUp: "UP", ArrowDown: "DOWN",
  Space: "SPACE", Enter: "RETURN", Escape: "ESCAPE", Tab: "TAB",
  ShiftLeft: "LSHIFT", ShiftRight: "RSHIFT",
  ControlLeft: "LCTRL", ControlRight: "RCTRL",
  AltLeft: "LALT", AltRight: "RALT",
  Backspace: "BACKSPACE", CapsLock: "CAPS LOCK",
};

export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "KP_" + code.slice(6);
  return code.toUpperCase();
}

export function keyDisplayName(code) {
  const name = keyName(code);
  return name.length === 1 ? name.toUpperCase() : name;
}
