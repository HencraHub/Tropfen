import * as THREE from 'three';
import { PALETTE, paperMaterial, cottonTexture, inkOutline, wobbleEdges } from '../materials/paper';

/**
 * The desk: a warm lamp from the upper left, a paper sky, the sun on a stick, the moon on a stick,
 * cotton clouds hanging on threads.
 */
export class Sky {
  group = new THREE.Group();
  lamp: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  sunDisc: THREE.Mesh;
  sunStick: THREE.Mesh;
  moonDisc: THREE.Mesh;
  moonStick: THREE.Mesh;
  clouds: THREE.Group[] = [];
  outlines: THREE.LineSegments[] = [];
  private bg = new THREE.Color();

  constructor(scene: THREE.Scene, shadows: boolean, cloudCount = 6) {
    this.lamp = new THREE.DirectionalLight(0xffd9a8, 2.4);
    this.lamp.position.set(-70, 110, -60);
    this.lamp.castShadow = shadows;
    this.lamp.shadow.mapSize.set(2048, 2048);
    const cam = this.lamp.shadow.camera as THREE.OrthographicCamera;
    cam.left = -90; cam.right = 90; cam.top = 90; cam.bottom = -90; cam.near = 10; cam.far = 260;
    this.lamp.shadow.bias = -0.0008;
    scene.add(this.lamp);
    scene.add(this.lamp.target);
    this.ambient = new THREE.HemisphereLight(0xdde8ff, 0x8a7a5a, 0.9);
    scene.add(this.ambient);
    // sun on a stick
    const sunGeo = new THREE.CircleGeometry(6, 18);
    this.sunDisc = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ color: '#ffd54a', side: THREE.DoubleSide, map: paperMaterial('#ffffff', { seed: 21 }).map }));
    const sunOutline = inkOutline(sunGeo, 1); sunOutline.userData.wobbleAmp = 0.12; this.sunDisc.add(sunOutline); this.outlines.push(sunOutline);
    this.sunStick = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 6), new THREE.MeshBasicMaterial({ color: '#b08a5a' }));
    this.group.add(this.sunDisc, this.sunStick);
    const moonGeo = new THREE.CircleGeometry(4, 18);
    this.moonDisc = new THREE.Mesh(moonGeo, new THREE.MeshBasicMaterial({ color: PALETTE.papier, side: THREE.DoubleSide, map: paperMaterial('#ffffff', { seed: 23 }).map }));
    const moonOutline = inkOutline(moonGeo, 1); moonOutline.userData.wobbleAmp = 0.1; this.moonDisc.add(moonOutline); this.outlines.push(moonOutline);
    this.moonStick = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 6), new THREE.MeshBasicMaterial({ color: '#b08a5a' }));
    this.group.add(this.moonDisc, this.moonStick);
    // clouds on threads
    const cotton = cottonTexture(7);
    for (let i = 0; i < cloudCount; i++) {
      const c = new THREE.Group();
      const puffs = 5 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cotton, transparent: true, opacity: 0.95, depthWrite: false }));
        s.position.set((k - puffs / 2) * 5 + ((i * 7 + k * 3) % 5) - 2, ((i + k) % 3) * 2, 0);
        s.scale.set(11 + (k % 3) * 3, 8 + (k % 2) * 3, 1);
        c.add(s);
      }
      const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 60, 0)]), new THREE.LineBasicMaterial({ color: PALETTE.tinte, transparent: true, opacity: 0.5 }));
      c.add(thread);
      c.position.set(-120 + i * 45 + (i % 2) * 20, 55 + (i % 3) * 6, -60 + ((i * 37) % 120));
      c.userData.speed = 0.6 + (i % 3) * 0.3;
      this.clouds.push(c);
      this.group.add(c);
    }
    scene.add(this.group);
  }

  /** hour 0..24, weather cloud 0..1, sun 0..1 */
  update(hour: number, cloud: number, sun: number, frame: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, timeSec: number): void {
    const dayT = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12)); // 0 at night, 1 at noon
    const dusk = Math.max(0, 1 - Math.abs(hour - 6) / 1.5) + Math.max(0, 1 - Math.abs(hour - 18) / 1.5);
    const day = new THREE.Color(PALETTE.himmelTag), evening = new THREE.Color(PALETTE.himmelAbend), night = new THREE.Color(PALETTE.nacht);
    this.bg.copy(night).lerp(day, dayT).lerp(evening, Math.min(1, dusk) * 0.7);
    this.bg.multiplyScalar(1 - cloud * 0.25);
    renderer.setClearColor(this.bg);
    scene.fog = scene.fog ?? new THREE.Fog(this.bg.getHex(), 120, 320);
    (scene.fog as THREE.Fog).color.copy(this.bg);
    // lamp: warm by day, dim and blue at night
    this.lamp.intensity = 0.4 + 2.6 * dayT * (1 - cloud * 0.4);
    this.lamp.color.setHex(dayT > 0.05 ? 0xffd9a8 : 0x9db4ff);
    this.ambient.intensity = 0.35 + 0.7 * dayT;
    // sun: arc from east (+x) to west (-x)
    const a = ((hour - 6) / 12) * Math.PI;
    const sunVisible = hour > 5.5 && hour < 18.5;
    const r = 140;
    const sx = Math.cos(a) * r, sy = Math.sin(a) * 90 + 6, sz = -40;
    this.sunDisc.visible = sunVisible; this.sunStick.visible = sunVisible;
    this.sunDisc.position.set(sx, sy, sz);
    this.sunDisc.lookAt(0, 20, 0);
    this.sunStick.position.set(sx, sy / 2 - 10, sz);
    this.sunStick.scale.y = Math.max(1, sy + 20);
    // moon opposite
    const ma = ((hour + 6) % 24 / 12) * Math.PI;
    const mVisible = !sunVisible;
    const mx = Math.cos(ma) * r, my = Math.sin(ma) * 80 + 6;
    this.moonDisc.visible = mVisible; this.moonStick.visible = mVisible;
    this.moonDisc.position.set(mx, my, sz);
    this.moonDisc.lookAt(0, 20, 0);
    this.moonStick.position.set(mx, my / 2 - 10, sz);
    this.moonStick.scale.y = Math.max(1, my + 20);
    // clouds drift (stop motion), density from weather
    const step = Math.floor(timeSec * 8) / 8;
    this.clouds.forEach((c, i) => {
      c.position.x = -160 + (((i * 45 + step * c.userData.speed * 2) % 320) + 320) % 320;
      c.visible = i < Math.max(1, Math.round(cloud * this.clouds.length + 1));
    });
    for (const o of this.outlines) wobbleEdges(o, frame);
    void sun;
  }
}
