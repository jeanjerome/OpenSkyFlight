/** Vertical speed beyond which any impact reads as flying into the ground (m/s) */
const IMPACT_SINK = 6;

const KNOT = 0.514444;

/**
 * What went wrong, in the player's terms
 * @param {{part: string, sink: number, speed: number, gearDown: boolean}} crash
 * @returns {{title: string, detail: string}}
 */
export function describeCrash(crash) {
  const kt = Math.round(crash.speed / KNOT);
  const sink = crash.sink.toFixed(1);
  if (crash.part === 'wheels') {
    return {
      title: 'Hard landing',
      detail: `Touched down at ${sink} m/s of vertical speed; the gear takes 3 m/s. Flare before touchdown.`,
    };
  }
  if (crash.sink > IMPACT_SINK || crash.part === 'top') {
    return { title: 'Flew into the ground', detail: `Hit the ground at ${kt} kt.` };
  }
  if (!crash.gearDown) {
    return { title: 'Landed with the gear up', detail: 'Lower the landing gear with G before landing.' };
  }
  switch (crash.part) {
    case 'belly':
      return { title: 'Belly strike', detail: 'The underside hit the ground.' };
    case 'tail':
      return {
        title: 'Tail strike',
        detail: 'The tail hit the ground: raise the nose less steeply on takeoff and landing.',
      };
    case 'wingtip':
      return { title: 'Wingtip strike', detail: 'A wing touched the ground: keep the wings level near the ground.' };
    default:
      return { title: 'Nose strike', detail: 'The nose hit the ground.' };
  }
}

/**
 * Screen shown over the stopped flight after a crash: what happened, and the
 * ways to fly again, by key, gamepad button or click.
 */
export default class CrashScreen {
  /**
   * @param {{inFlight: () => void, onGround: () => void}} restart
   */
  constructor(restart) {
    this.restart = restart;
    this.isOpen = false;
    this._canRestartOnGround = false;

    const root = (this.root = document.createElement('div'));
    root.id = 'crash-screen';
    root.hidden = true;
    root.innerHTML = `
      <div class="cs-card">
        <div class="cs-label">Crashed</div>
        <div class="cs-title"></div>
        <div class="cs-detail"></div>
        <div class="cs-actions">
          <button class="sm-btn sm-btn-primary cs-flight"><kbd>Enter</kbd> Restart in flight</button>
          <button class="sm-btn cs-ground"><kbd>Space</kbd> Restart on the ground</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this._title = root.querySelector('.cs-title');
    this._detail = root.querySelector('.cs-detail');
    this._ground = root.querySelector('.cs-ground');
    root.querySelector('.cs-flight').addEventListener('click', () => this.choose('flight'));
    this._ground.addEventListener('click', () => this.choose('ground'));

    // Before the flight's own keys: Space would otherwise open the airbrake
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen) return;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') this.choose('flight');
        else if (e.code === 'Space') this.choose('ground');
        else return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
  }

  /**
   * @param {{part: string, sink: number, speed: number, gearDown: boolean}} crash
   * @param {boolean} canRestartOnGround - whether the flight started on the ground
   */
  show(crash, canRestartOnGround) {
    const { title, detail } = describeCrash(crash);
    this._title.textContent = title;
    this._detail.textContent = detail;
    this._canRestartOnGround = canRestartOnGround;
    this._ground.hidden = !canRestartOnGround;
    this.root.hidden = false;
    this.isOpen = true;
  }

  hide() {
    this.root.hidden = true;
    this.isOpen = false;
  }

  /** @param {'flight'|'ground'} where */
  choose(where) {
    if (!this.isOpen) return;
    if (where === 'ground' && !this._canRestartOnGround) return;
    this.hide();
    if (where === 'ground') this.restart.onGround();
    else this.restart.inFlight();
  }
}
