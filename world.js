// js/world.js — shared virtual-coordinate constants. The whole game is simulated in
// this fixed "stage" coordinate space, then the stage is scaled to fit whatever real
// screen size the device has (see main.js#fitStage). This keeps physics, camera math,
// and rig geometry independent of actual device pixels.
export const STAGE_W = 960;   // virtual width of the visible letterboxed arena window
export const STAGE_H = 480;   // virtual height
export const GROUND_Y = 392;  // virtual y of the floor line fighters stand on
export const WORLD_W = 2200;  // total width of the fight world fighters can roam
export const ARENA_MIN_X = 70;
export const ARENA_MAX_X = WORLD_W - 70;
