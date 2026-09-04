// Ported from code/constants.py of Eason-F/Blade-Hymn.
// https://github.com/Eason-F/Blade-Hymn

export const GAME_WIDTH = 426;
export const GAME_HEIGHT = 240;

export const FPS = 60;
export const ANIMATION_SPEED = 10;
export const TILE_SIZE = 16;

export const GRAVITY = 800;
export const PlAYER_HEALTH = 70; // sic — name kept from the original

export const BG_FILL = {
  spring: "#112218",
  desert: "#0F0F2B",
  winter: "#160804",
};

export const Z_VALUES = {
  bg: 0,
  ground: 1,
  fg: 2,
  enemies: 3,
  player: 4,
  ui: 99,
};
