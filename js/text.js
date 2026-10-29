// code/text.py — built from the current key names, since keys are
// rebindable on the web (the original's names come from code/settings.py).

import { key_name } from "./settings.js";

export function TEXT_TAGS() {
  const name = key_name;
  return {
    intro: {
      movement: `Move with ${name("RIGHT_KEY")} and ${name("LEFT_KEY")}.`,
      jump: `Jumping (${name("JUMP_KEY")}) \ncan be used to travel vertically.`,
      dash: `Dashing (${name("DASH_KEY")}) can be \nused to travel long distances \nand gain damage invulnerability. \n\nA dash consumes a token \nthat regenerates over time.`,
      attack: `Attack with '${name("ATTACK_KEY")}'.`,
      air_attack: `Attacking in the air can \nprovide a vertical boost.`,
      heal: `When damage is taken, '${name("HEAL_KEY")}' can heal you \nand consume a heal charge.`,
      level_end: "To end the level, all enemies must be defeated...",
    },
  };
}
