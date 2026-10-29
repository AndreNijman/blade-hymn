// code/settings.py. The original hardcodes pygame key constants; on the web
// the six binds are rebindable, saved to localStorage and, when signed in to
// games.andrenijman.com, to the account profile (see shell.js).

const STORAGE_KEY = "bladehymn_keybinds_v1";
const STORAGE_TS = "bladehymn_keybinds_ts";

export const ACTIONS = ["RIGHT_KEY", "LEFT_KEY", "JUMP_KEY", "DASH_KEY", "ATTACK_KEY", "HEAL_KEY"];

export const ACTION_LABELS = {
  RIGHT_KEY: "Move right",
  LEFT_KEY: "Move left",
  JUMP_KEY: "Jump",
  DASH_KEY: "Dash",
  ATTACK_KEY: "Attack",
  HEAL_KEY: "Heal",
};

// the original's bindings, as KeyboardEvent.code
export const DEFAULT_BINDS = {
  RIGHT_KEY: "ArrowRight",
  LEFT_KEY: "ArrowLeft",
  JUMP_KEY: "Space",
  DASH_KEY: "ShiftLeft",
  ATTACK_KEY: "KeyX",
  HEAL_KEY: "KeyR",
};

export const binds = { ...DEFAULT_BINDS };

const listeners = [];
export function onBindsChanged(listener) {
  listeners.push(listener);
}

export function loadBinds() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    stored = null;
  }
  if (stored && typeof stored === "object") applyBinds(stored);
}

function applyBinds(source) {
  for (const action of ACTIONS) {
    if (typeof source[action] === "string") binds[action] = source[action];
  }
}

export function savedAt() {
  try {
    return +(localStorage.getItem(STORAGE_TS) || 0);
  } catch {
    return 0;
  }
}

// one key does one job: taking a key from another action restores that
// action's default
export function setBind(action, code) {
  if (!ACTIONS.includes(action)) return;
  for (const other of ACTIONS) {
    if (other !== action && binds[other] === code) binds[other] = DEFAULT_BINDS[other];
  }
  binds[action] = code;
  persist(true);
}

export function resetBinds() {
  Object.assign(binds, DEFAULT_BINDS);
  persist(true);
}

// binds restored from the account profile: apply without re-uploading
export function restoreBinds(source, timestamp) {
  applyBinds(source);
  persist(false, timestamp);
}

function persist(changedHere, timestamp = Date.now()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
    localStorage.setItem(STORAGE_TS, String(timestamp));
  } catch {
    /* storage unavailable: binds last for this session only */
  }
  for (const listener of listeners) listener({ ...binds, savedAt: timestamp }, changedHere);
}

// pygame.key.name() for KeyboardEvent.code (measured from pygame-ce)
const KEY_NAMES = {
  ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down",
  Space: "space", Enter: "return", Escape: "escape", Tab: "tab", Backspace: "backspace",
  ShiftLeft: "left shift", ShiftRight: "right shift", ControlLeft: "left ctrl", ControlRight: "right ctrl",
  AltLeft: "left alt", AltRight: "right alt", MetaLeft: "left meta", MetaRight: "right meta",
  CapsLock: "caps lock", Insert: "insert", Delete: "delete", Home: "home", End: "end",
  PageUp: "page up", PageDown: "page down", Minus: "-", Equal: "=", BracketLeft: "[",
  BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Backquote: "`", Comma: ",",
  Period: ".", Slash: "/", NumpadEnter: "enter", NumpadAdd: "[+]", NumpadSubtract: "[-]",
  NumpadMultiply: "[*]", NumpadDivide: "[/]", NumpadDecimal: "[.]", ContextMenu: "menu",
};

export function codeName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `[${code.slice(6)}]`;
  if (/^F\d+$/.test(code)) return code.toLowerCase();
  return code.toLowerCase();
}

export function key_name(action) {
  return codeName(binds[action]);
}

export function keyLabel(code) {
  const name = codeName(code);
  return name.length === 1 ? name.toUpperCase() : name;
}
