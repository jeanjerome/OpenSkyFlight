/**
 * Keyboard shortcuts listed in the Controls tab of the settings menu.
 * `dev` shortcuts only work, and are only listed, in developer mode (?dev=1).
 */
export const SHORTCUTS = [
  {
    group: 'Flying',
    items: [
      { keys: ['Click'], action: 'Take control of the aircraft with the mouse' },
      { keys: ['Mouse'], action: 'Steer' },
      { keys: ['W', '↑'], action: 'Fly forward' },
      { keys: ['S', '↓'], action: 'Fly backward' },
      { keys: ['A', '←', 'D', '→'], action: 'Slide sideways' },
      { keys: ['O'], action: 'Anti-collision lights on or off' },
      { keys: ['Esc'], action: 'Pause and open this menu' },
    ],
  },
  {
    group: 'Gamepad',
    items: [
      { keys: ['Left stick'], action: 'Steer' },
      { keys: ['RT'], action: 'Fly forward' },
      { keys: ['LT'], action: 'Fly backward' },
      { keys: ['Right stick'], action: 'Slide sideways' },
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
      { keys: ['G'], action: 'Engage or disengage the autopilot' },
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
