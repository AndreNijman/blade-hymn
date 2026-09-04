// Keyboard + mouse input for the web port. Keyboard state is tracked by
// KeyboardEvent.code; game actions resolve through the rebindable binds.

import { binds } from "./settings.js";
import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";

export const input = {
  keys: new Set(),
  mousePos: [0, 0],      // in game coordinates (426x240 space)
  mouseStates: [false, false, false],

  isDown(code) {
    return this.keys.has(code);
  },

  // pygame.key.get_pressed()[KEY] equivalent for a game action
  down(action) {
    return this.keys.has(binds[action]);
  },

  consumeAll() {
    this.keys.clear();
  },
};

export function attachInput(canvas) {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) {
      // keep held keys registered, but don't re-trigger browser quirks
      if (input.keys.has(e.code)) e.preventDefault();
      return;
    }
    input.keys.add(e.code);
    // stop the page scrolling / quick-find while playing
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => input.keys.delete(e.code));
  window.addEventListener("blur", () => input.consumeAll());

  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = GAME_WIDTH / rect.width;
    const sy = GAME_HEIGHT / rect.height;
    input.mousePos = [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  }

  canvas.addEventListener("mousemove", updateMouse);
  canvas.addEventListener("mousedown", (e) => {
    updateMouse(e);
    input.mouseStates[e.button] = true;
  });
  window.addEventListener("mouseup", (e) => {
    input.mouseStates[e.button] = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}
