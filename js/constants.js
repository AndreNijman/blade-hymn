// code/constants.py

import { Surface } from "./surface.js";

export const GAME_WIDTH = 426, GAME_HEIGHT = 240;

export const MASTER_DISPLAY = new Surface(GAME_WIDTH, GAME_HEIGHT);

// game
export const FPS = 60;
export const ANIMATION_SPEED = 10;
export const TILE_SIZE = 16;

export const GRAVITY = 800;
export const PlAYER_HEALTH = 70;

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
