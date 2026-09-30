/** Keyboard, mouse (pointer lock) and gamepad input, merged into one snapshot per frame. */
export interface InputSnapshot {
  moveX: number; moveY: number;   // -1..1 (strafe, forward)
  lookDX: number; lookDY: number; // accumulated mouse/stick deltas since last frame (radians)
  use: boolean; useHeld: boolean;
  build: boolean; research: boolean; plan: boolean; pause: boolean; back: boolean;
  next: boolean; prev: boolean;   // tab through options / tool wheel
  confirm: boolean; cancel: boolean;
  up: boolean; down: boolean; left: boolean; right: boolean; // menu navigation (edge)
  click: boolean; rightClick: boolean;
  mouseX: number; mouseY: number;
  scroll: number;
  typed: string; backspace: boolean;
  drop: boolean;
  sprint: boolean;
  gamepad: boolean;
}

export class Input {
  private keys = new Set<string>();
  private edge = new Set<string>();
  private dx = 0; private dy = 0;
  private clicked = false; private rightClicked = false;
  private scrollAcc = 0;
  private typedBuf = '';
  mouseX = 0; mouseY = 0;
  locked = false;
  sensitivity = 1;
  invertY = false;
  private padPrev: Record<string, boolean> = {};
  private pendingDigit: string | null = null;
  private padHeld: Record<string, boolean> = {};
  wantLock = false;
  textMode = false;
  /** digit key pressed this frame ('0'..'9') */
  edgeDigit: string | null = null;

  constructor(private el: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (this.textMode) {
        if (e.key === 'Backspace') { this.edge.add('Backspace'); e.preventDefault(); return; }
        if (e.key.length === 1) { this.typedBuf += e.key; e.preventDefault(); }
        if (e.key === 'Enter') this.edge.add('Enter');
        if (e.key === 'Escape') this.edge.add('Escape');
        if (e.key === 'Tab') { this.edge.add('Tab'); e.preventDefault(); }
        return;
      }
      if (!this.keys.has(e.code)) this.edge.add(e.code);
      this.keys.add(e.code);
      if (/^Digit[0-9]$/.test(e.code)) this.pendingDigit = e.code.slice(5);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (document.pointerLockElement === el) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.clicked = true;
      if (e.button === 2) this.rightClicked = true;
      if (this.wantLock && document.pointerLockElement !== el && e.button === 0) el.requestPointerLock?.();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.scrollAcc += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
  }

  unlock(): void { if (document.pointerLockElement === this.el) document.exitPointerLock(); }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  poll(): InputSnapshot {
    const k = this.keys, e = this.edge;
    let moveX = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let moveY = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let lookDX = this.dx * 0.0022 * this.sensitivity;
    let lookDY = this.dy * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1);
    this.dx = 0; this.dy = 0;
    const snap: InputSnapshot = {
      moveX, moveY, lookDX, lookDY,
      use: e.has('KeyE') || e.has('Enter'), useHeld: k.has('KeyE'),
      build: e.has('KeyB'), research: e.has('KeyR'), plan: e.has('Tab'), pause: e.has('Escape'), back: e.has('Escape'),
      next: e.has('KeyQ') || this.scrollAcc > 0, prev: e.has('KeyZ') || e.has('KeyY') || this.scrollAcc < 0,
      confirm: e.has('Enter') || e.has('Space') || e.has('KeyE'), cancel: e.has('Escape'),
      up: e.has('ArrowUp') || e.has('KeyW'), down: e.has('ArrowDown') || e.has('KeyS'), left: e.has('ArrowLeft') || e.has('KeyA'), right: e.has('ArrowRight') || e.has('KeyD'),
      click: this.clicked, rightClick: this.rightClicked, mouseX: this.mouseX, mouseY: this.mouseY, scroll: this.scrollAcc,
      typed: this.typedBuf, backspace: e.has('Backspace'), drop: e.has('KeyG'), sprint: k.has('ShiftLeft'), gamepad: false,
    };
    const p = this.pad();
    if (p) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const ax = dz(p.axes[0] ?? 0), ay = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      if (ax || ay) { snap.moveX = ax; snap.moveY = -ay; snap.gamepad = true; }
      if (rx || ry) { snap.lookDX += rx * 0.045 * this.sensitivity; snap.lookDY += ry * 0.045 * this.sensitivity * (this.invertY ? -1 : 1); snap.gamepad = true; }
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const edgeBtn = (name: string, pressed: boolean) => { const was = this.padPrev[name] ?? false; this.padHeld[name] = pressed; return pressed && !was; };
      const names: [string, number][] = [['a', 0], ['b', 1], ['x', 2], ['y', 3], ['lb', 4], ['rb', 5], ['back', 8], ['start', 9], ['du', 12], ['dd', 13], ['dl', 14], ['dr', 15]];
      const ed: Record<string, boolean> = {};
      for (const [n, i] of names) ed[n] = edgeBtn(n, b(i));
      for (const [n, i] of names) this.padPrev[n] = b(i);
      if (ed.a) { snap.use = true; snap.confirm = true; snap.gamepad = true; }
      if (b(0)) snap.useHeld = true;
      if (ed.b) { snap.cancel = true; snap.back = true; snap.gamepad = true; }
      if (ed.x) { snap.build = true; snap.gamepad = true; }
      if (ed.y) { snap.research = true; snap.gamepad = true; }
      if (ed.back) { snap.plan = true; snap.gamepad = true; }
      if (ed.start) { snap.pause = true; snap.gamepad = true; }
      if (ed.lb) snap.prev = true; if (ed.rb) snap.next = true;
      if (ed.du) snap.up = true; if (ed.dd) snap.down = true; if (ed.dl) snap.left = true; if (ed.dr) snap.right = true;
      const stickUp = ay < -0.6, stickDown = ay > 0.6;
      if (stickUp && !this.padPrev.su) snap.up = true; if (stickDown && !this.padPrev.sd) snap.down = true;
      this.padPrev.su = stickUp; this.padPrev.sd = stickDown;
    }
    this.edgeDigit = this.pendingDigit; this.pendingDigit = null;
    this.edge.clear();
    this.clicked = false; this.rightClicked = false; this.scrollAcc = 0; this.typedBuf = '';
    return snap;
  }
}
