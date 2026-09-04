// Ported from code/text.py of Eason-F/Blade-Hymn.
// Tutorial strings are built at level load so they always show the player's
// current key binds.

import { keyName, binds } from "./settings.js";

export function buildTextTags() {
  return {
    intro: {
      movement: `Move with ${keyName(binds.RIGHT_KEY)} and ${keyName(binds.LEFT_KEY)}.`,
      jump: `Jumping (${keyName(binds.JUMP_KEY)}) \ncan be used to travel vertically.`,
      dash: `Dashing (${keyName(binds.DASH_KEY)}) can be \nused to travel long distances \nand gain damage invulnerability. \n\nA dash consumes a token \nthat regenerates over time.`,
      attack: `Attack with '${keyName(binds.ATTACK_KEY)}'.`,
      air_attack: "Attacking in the air can \nprovide a vertical boost.",
      heal: `When damage is taken, '${keyName(binds.HEAL_KEY)}' can heal you \nand consume a heal charge.`,
      level_end: "To end the level, all enemies must be defeated...",
    },
  };
}
