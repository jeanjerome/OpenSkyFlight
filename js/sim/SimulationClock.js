/**
 * Fixed-step clock of the simulation.
 *
 * The simulation advances in steps of a fixed duration, as many as the elapsed
 * time holds, whatever the frame rate: its behaviour does not depend on the
 * display. What is left of the elapsed time carries over to the next frame,
 * and its fraction of a step (`alpha`) interpolates the rendered state between
 * the last two steps, so that motion stays smooth when a frame holds 2 steps
 * and the next one 3.
 */
export default class SimulationClock {
  /**
   * @param {number} rate - steps per second
   * @param {number} maxSteps - most steps run in one frame: after a long stall
   *   the simulation slows down instead of running hundreds of steps at once
   */
  constructor(rate, maxSteps) {
    this.step = 1 / rate;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
    /** Simulated time (s) */
    this.time = 0;
    /** Fraction of a step between the last step and the frame, in [0, 1[ */
    this.alpha = 0;
  }

  /**
   * Run the steps the elapsed time holds.
   * @param {number} dt - elapsed time since the last frame (s), 0 while paused
   * @param {(step: number) => void} stepFn - advances the simulation by one step
   * @returns {number} steps run
   */
  advance(dt, stepFn) {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      stepFn(this.step);
      this.accumulator -= this.step;
      this.time += this.step;
      steps++;
    }
    // Time beyond the last allowed step is dropped
    if (this.accumulator >= this.step) this.accumulator = 0;
    this.alpha = this.accumulator / this.step;
    return steps;
  }
}
