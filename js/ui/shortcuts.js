/**
 * Keyboard shortcuts listed in the Controls tab of the settings menu.
 * `dev` shortcuts only work, and are only listed, in developer mode (?dev=1).
 */
export const SHORTCUTS = [
  {
    group: 'Flying',
    items: [
      { keys: ['Click'], action: 'Take control of the aircraft with the mouse' },
      { keys: ['Mouse'], action: 'Aim: the aircraft turns towards the circle' },
      { keys: ['↑', '↓'], action: 'Push or pull the stick' },
      { keys: ['A', '←', 'D', '→'], action: 'Roll left or right' },
      { keys: ['Q', 'E'], action: 'Rudder left or right' },
      { keys: ['W', 'S'], action: 'Throttle up or down; W again past full power for the afterburner' },
      { keys: ['Space'], action: 'Airbrake; on the ground, also the wheel brakes' },
      { keys: ['G'], action: 'Landing gear down or up' },
      { keys: ['Enter'], action: 'After a crash: restart in flight' },
      { keys: ['Space'], action: 'After a crash: restart on the ground, where the flight started' },
      { keys: ['F'], action: 'Simulation or Exploration flight' },
      { keys: ['O'], action: 'Anti-collision lights on or off' },
      { keys: ['Esc'], action: 'Pause and open this menu' },
    ],
  },
  {
    group: 'Exploration flight',
    items: [
      { keys: ['Mouse'], action: 'Steer' },
      { keys: ['W', '↑'], action: 'Fly forward' },
      { keys: ['S', '↓'], action: 'Fly backward' },
      { keys: ['A', '←', 'D', '→'], action: 'Slide sideways' },
    ],
  },
  {
    group: 'Gamepad',
    items: [
      { keys: ['Left stick'], action: 'Steer (pitch and roll)' },
      { keys: ['RT', 'LT'], action: 'Throttle up or down (Exploration: forward or backward)' },
      { keys: ['Right stick', 'LB', 'RB'], action: 'Rudder (Exploration: slide sideways)' },
      { keys: ['B'], action: 'Airbrake and wheel brakes' },
      { keys: ['X'], action: 'Landing gear down or up' },
      { keys: ['A', 'B'], action: 'After a crash: restart in flight or on the ground' },
      { keys: ['Y'], action: 'Chase or cockpit view' },
      { keys: ['Menu'], action: 'Pause and open this menu, or resume' },
    ],
  },
  {
    group: 'Display',
    items: [
      { keys: ['V'], action: 'Chase or cockpit view' },
      { keys: ['H'], action: 'Show or hide the head-up display' },
      { keys: ['M'], action: 'Show or hide the map' },
      { keys: ['T'], action: 'Next ground map' },
      { keys: ['I'], action: 'Show or hide performance figures' },
      { keys: ['R'], action: 'Zoom 18 ground imagery, for close-up static views' },
    ],
  },
  {
    group: 'Flight plans',
    items: [
      { keys: ['N'], action: 'Start or stop recording waypoints' },
      { keys: ['P'], action: 'Add a waypoint while recording' },
      { keys: ['Shift', 'N'], action: 'Clear the flight plan', chord: true },
      { keys: ['L'], action: 'Load a saved flight plan' },
      { keys: ['U'], action: 'Engage or disengage the autopilot' },
    ],
  },
  {
    group: 'Developer',
    dev: true,
    items: [
      { keys: ['K'], action: 'Next reference view' },
      { keys: ['X'], action: 'Tile debug overlay' },
      { keys: ['B'], action: 'Start or stop the benchmark' },
      { keys: ['Shift', 'B'], action: 'Store the last benchmark as the baseline', chord: true },
    ],
  },
];
