import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cities, corridors, locomotives } from './data';
import { Simulation, edgeKey } from './simulation';
import { box, cylinder, material, house, locomotive, carriage } from './models';
import {
  riverX,
  height,
  rng,
  fields,
  terrainMaterial,
  batchScenery,
} from './scenery';
import {
  Atmosphere,
  createRiver,
  qualitySettings,
  type Quality,
} from './atmosphere';
import { SteamEffects } from './effects';
import { RailwayAudio } from './audio';
import { loadShowcase, disposeModel } from './assets';
import { stationKit, industryKit } from './town-kits';
export type CameraMode = 'iso' | '3d';
export class RailwayWorld {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  sim: Simulation;
  mode: CameraMode = 'iso';
  selected = 10;
  following = false;
  labelsVisible = true;
  fps = 60;
  private clearancePoints = new Map<THREE.CatmullRomCurve3, THREE.Vector3[]>();
  curves = new Map<string, THREE.CatmullRomCurve3>();
  trains: THREE.Group[] = [];
  cars: THREE.Group[][] = [];
  labels: { element: HTMLDivElement; position: THREE.Vector3 }[] = [];
  atmosphere: Atmosphere;
  audio = new RailwayAudio();
  effects: SteamEffects;
  quality: Quality = 'balanced';
  photoMode = false;
  trackside = false;
  assetStatus: 'loading' | 'ready' | 'fallback' = 'loading';
  private showcase?: { engines: THREE.Object3D[]; tenders: THREE.Object3D[] };
  private detailLevel = -1;
  private emission = new Float32Array(12);
  private previousRunning = Array.from({ length: 12 }, () => false);
  private followTransition = false;
  private routeHighlight = new THREE.Group();
  private highlighted = -1;
  private windowMaterials: THREE.MeshStandardMaterial[] = [];
  private resources = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private frame = 0;
  private previous = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private down = { x: 0, y: 0 };
  private onSelect: (id: number) => void;
  private selectionRing: THREE.Mesh;
  private water: THREE.Mesh;
  private sunlight: THREE.DirectionalLight;
  private signalLights: { key: string; mesh: THREE.Mesh }[] = [];
  constructor(
    public host: HTMLDivElement,
    sim: Simulation,
    onSelect: (id: number) => void,
  ) {
    this.sim = sim;
    this.onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D railway map. Drag to move the camera, scroll to zoom, or click a train to select it.',
    );
    this.scene.background = new THREE.Color('#cbd5d4');
    this.scene.fog = new THREE.Fog('#cbd5d4', 250, 540);

    this.sunlight = new THREE.DirectionalLight('#fff2cb', 3.2);
    this.sunlight.position.set(-65, 110, 35);
    this.sunlight.castShadow = true;
    const sh = this.sunlight.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = -130;
    sh.camera.right = 130;
    sh.camera.top = 130;
    sh.camera.bottom = -130;
    sh.camera.far = 300;
    sh.normalBias = 0.2;
    sh.bias = -0.0002;
    this.scene.add(this.sunlight);
    this.atmosphere = new Atmosphere(this.scene, this.sunlight, this.renderer);
    this.camera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 800);
    this.camera.position.set(140, 155, 175);
    this.controls = this.makeControls();
    this.controls.target.set(0, 0, -7);
    this.controls.update();
    this.terrain();
    this.water = createRiver();
    this.scene.add(this.water);
    this.railways();
    this.towns();
    this.nature();
    this.rememberResources(this.scene);
    batchScenery(
      this.scene,
      new Set([this.water, ...this.signalLights.map((s) => s.mesh)]),
    );
    this.effects = new SteamEffects(this.scene);
    this.scene.add(this.routeHighlight);
    for (let i = 0; i < locomotives.length; i++) {
      const g = locomotive(locomotives[i].color, i);
      this.rememberResources(g);
      const moving = new Set<THREE.Object3D>();
      (g.userData.wheels as THREE.Object3D[]).forEach((w) =>
        w.traverse((o) => moving.add(o)),
      );
      batchScenery(g, moving);
      this.scene.add(g);
      this.trains.push(g);
      this.cars.push([]);
      this.syncCars(i);
    }
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 2.82, 48),
      new THREE.MeshBasicMaterial({
        color: '#f5dfaa',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    this.rememberResources(this.scene);
    for (const mat of this.materials) {
      if (
        mat instanceof THREE.MeshStandardMaterial &&
        ['e5d8ad', 'c7d7d1', 'e5d6b0', 'd9c99b'].includes(
          mat.color.getHexString(),
        )
      ) {
        mat.emissive.set('#ffd394');
        this.windowMaterials.push(mat);
      }
    }
    void loadShowcase()
      .then((asset) => {
        if (this.disposed) {
          [...asset.engines, ...asset.tenders].forEach(disposeModel);
          return;
        }
        this.showcase = asset;
        this.assetStatus = 'ready';
        [...asset.engines, ...asset.tenders].forEach((model) =>
          this.rememberResources(model),
        );
        this.updateShowcase();
      })
      .catch(() => {
        if (!this.disposed) this.assetStatus = 'fallback';
      });
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.selectionRing);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.setQuality('balanced');
    document.addEventListener('visibilitychange', this.visibilityChanged);
    host.addEventListener('pointerdown', this.pointerDown);
    host.addEventListener('pointerup', this.pointerUp);
    this.frame = requestAnimationFrame(this.animate);
  }
  private makeControls() {
    const c = new OrbitControls(this.camera, this.renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 10;
    c.maxDistance = 320;
    c.minZoom = 0.55;
    c.maxZoom = 9;
    c.maxPolarAngle = Math.PI * 0.47;
    c.screenSpacePanning = false;
    c.enableRotate = this.mode === '3d';
    c.mouseButtons.LEFT =
      this.mode === 'iso' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    c.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    return c;
  }
  private terrain() {
    const geo = new THREE.PlaneGeometry(190, 180, 140, 140);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        y = height(x, z);
      pos.setY(i, y);
      const shore = Math.abs(x - riverX(z));
      const slope = Math.hypot(
        height(x + 0.5, z) - height(x - 0.5, z),
        height(x, z + 0.5) - height(x, z - 0.5),
      );
      const col = new THREE.Color('#78914d');
      col.lerp(
        new THREE.Color('#a49168'),
        1 - THREE.MathUtils.smoothstep(shore, 5, 9),
      );
      col.lerp(
        new THREE.Color('#767e75'),
        THREE.MathUtils.smoothstep(Math.max(y / 9, slope), 0.4, 1.5),
      );
      col.lerp(
        new THREE.Color('#bbc0b5'),
        THREE.MathUtils.smoothstep(y, 24, 36),
      );
      colors.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, terrainMaterial());
    ground.receiveShadow = true;
    this.scene.add(ground);
    box(this.scene, '#ac9976', 0, -3.1, 0, 190, 3, 180);
    box(this.scene, '#d5ccb7', 0, -5, 0, 190, 0.8, 180);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      material('#cbd5d4'),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -6;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }
  private railways() {
    const ties: { p: THREE.Vector3; angle: number }[] = [];
    const bridges: { p: THREE.Vector3; angle: number }[] = [];
    for (const [a, b] of corridors) {
      const start = new THREE.Vector3(cities[a].x, 0.36, cities[a].z),
        end = new THREE.Vector3(cities[b].x, 0.36, cities[b].z);
      const d = end.clone().sub(start),
        normal = new THREE.Vector3(-d.z, 0, d.x).normalize();
      const curve = new THREE.CatmullRomCurve3([
        start,
        start.clone().lerp(end, 0.22).addScaledVector(normal, 2.2),
        start.clone().lerp(end, 0.78).addScaledVector(normal, 2.2),
        end,
      ]);
      const key = edgeKey(a, b);
      this.curves.set(key, curve);
      const length = curve.getLength();
      this.sim.lengths.set(key, length);
      const points = curve.getSpacedPoints(Math.ceil(length * 2));
      // A broad ballast strip beneath the sleepers, and two continuous steel rails.
      for (const side of [-1, 0, 1]) {
        const vs: number[] = [],
          ix: number[] = [];
        const width = side === 0 ? 1.35 : 0.07;
        points.forEach((p, i) => {
          const tangent = curve.getTangentAt(i / (points.length - 1)),
            n = new THREE.Vector3(-tangent.z, 0, tangent.x);
          const offset = side * 0.58;
          const center = p.clone().addScaledVector(n, offset);
          center.y += side === 0 ? -0.17 : 0.13;
          vs.push(
            center.x + n.x * width,
            center.y,
            center.z + n.z * width,
            center.x - n.x * width,
            center.y,
            center.z - n.z * width,
          );
          if (i < points.length - 1) {
            const j = i * 2;
            ix.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
          }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3));
        geo.setIndex(ix);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(
          geo,
          side === 0
            ? terrainMaterial(true)
            : new THREE.MeshStandardMaterial({
                color: '#d4d2bd',
                roughness: 0.42,
                metalness: 0.45,
                side: THREE.DoubleSide,
              }),
        );
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
      for (let n = 0; n < length; n += 0.85) {
        const p = curve.getPointAt(n / length),
          t = curve.getTangentAt(n / length),
          angle = Math.atan2(t.x, t.z);
        ties.push({ p, angle });
        if (Math.abs(p.x - riverX(p.z)) < 6.1) bridges.push({ p, angle });
      }
      for (const t of [0.09, 0.91]) {
        const p = curve.getPointAt(t),
          tan = curve.getTangentAt(t);
        p.x += tan.z * 2;
        p.z -= tan.x * 2;
        box(this.scene, '#515e4b', p.x, 1.3, p.z, 0.13, 2.6, 0.13);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6),
          new THREE.MeshBasicMaterial({ color: '#79a867' }),
        );
        lamp.position.set(p.x, 2.6, p.z);
        this.scene.add(lamp);
        this.signalLights.push({ key, mesh: lamp });
      }
    }
    const inst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.8, 0.13, 0.23),
      material('#716451'),
      ties.length,
    );
    const obj = new THREE.Object3D();
    ties.forEach(({ p, angle }, i) => {
      obj.position.copy(p);
      obj.rotation.set(0, angle, 0);
      obj.updateMatrix();
      inst.setMatrixAt(i, obj.matrix);
    });
    inst.receiveShadow = true;
    this.scene.add(inst);
    for (let i = 0; i < bridges.length; i++) {
      const { p, angle } = bridges[i];
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = angle;
      box(g, '#746d58', 0, -0.23, 0, 2.7, 0.35, 1);
      for (const x of [-1.35, 1.35]) {
        box(g, '#495e54', x, 0.65, 0, 0.11, 0.11, 1.05);
        if (i % 2 === 0) {
          box(g, '#495e54', x, 0.3, 0, 0.12, 0.8, 0.12);
          const brace = box(g, '#495e54', x, 0.35, 0, 0.1, 0.1, 2);
          brace.rotation.x = 0.42;
        }
      }
      if (i % 5 === 0) box(g, '#aaa48b', 0, -1.6, 0, 1.7, 2.8, 1);
      this.scene.add(g);
    }
  }
  private towns() {
    const random = rng(903);
    cities.forEach((city, index) => {
      const urban = new THREE.Group();
      this.scene.add(urban);
      for (let i = 0; i < (index === 4 ? 22 : 12); i++) {
        const col = i % 4,
          row = Math.floor(i / 4);
        const x = city.x - 10 + col * 3.4,
          z = city.z + 5 + row * 4;
        if (!this.sceneryClear(x, z, 2)) continue;
        const s = 0.68 + random() * 0.4;
        house(urban, x, z, city.color, s, random() > 0.6 ? Math.PI : 0);
      }
      box(urban, '#b7b39a', city.x, 0, city.z + 4, 20, 0.07, 1.25);
      box(urban, '#b7b39a', city.x - 2, 0.01, city.z + 10, 1.2, 0.08, 13);
      stationKit(
        urban,
        index === 6 ? { ...city, x: city.x + 8 } : city,
        index === 4,
      );
      industryKit(
        urban,
        index === 6 ? { ...city, x: city.x + 18 } : city,
        index,
      );
      const el = document.createElement('div');
      el.className = 'city-label';
      el.innerHTML = `<strong>${city.name}</strong><span>${city.cargo}</span>`;
      this.host.appendChild(el);
      this.labels.push({
        element: el,
        position: new THREE.Vector3(city.x, 5, city.z - 3),
      });
    });
    // Golden fields and neatly spaced planted rows around agricultural towns.
    for (const [x, z] of fields) {
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 15; col++) {
          const px = x - 5 + col * 0.7,
            pz = z - 3 + row * 0.8;
          if (!this.sceneryClear(px, pz, 2.3)) continue;
          box(this.scene, '#a49160', px, 0.06, pz, 0.69, 0.1, 0.79);
          box(
            this.scene,
            col % 2 ? '#c7b379' : '#9f925c',
            px,
            0.17,
            pz,
            0.2,
            0.16,
            0.78,
          );
        }
    }
    for (const [x, z] of [
      [-77, -30],
      [5, -58],
    ]) {
      cylinder(this.scene, '#847a61', x, 2.3, z, 1.1, 4);
      cylinder(this.scene, '#697467', x, 4.7, z, 1.7, 1.7);
    }
  }
  private nature() {
    const random = rng(731);
    const positions: { x: number; y: number; z: number; s: number }[] = [];
    for (let i = 0; i < 1600; i++) {
      const x = random() * 184 - 92,
        z = random() * 174 - 87;
      if (
        !this.sceneryClear(x, z, 3) ||
        cities.some((c) => Math.hypot(x - c.x, z - c.z) < 17) ||
        fields.some(([fx, fz]) => Math.abs(x - fx) < 8 && Math.abs(z - fz) < 6)
      )
        continue;
      // Variable density creates groves and open meadow rather than uniform scatter.
      const cluster =
        Math.sin(x * 0.075) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.045);
      if (cluster < -0.25 && random() > 0.12) continue;
      positions.push({ x, z, y: height(x, z), s: 0.65 + random() * 0.9 });
    }
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.23, 1.6, 5),
      material('#685c40'),
      positions.length,
    );
    const foliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 3.5, 6),
      material('#45694b'),
      positions.length * 2,
    );
    const o = new THREE.Object3D();
    positions.forEach((p, i) => {
      o.position.set(p.x, p.y + 0.8 * p.s, p.z);
      o.scale.setScalar(p.s);
      o.updateMatrix();
      trunk.setMatrixAt(i, o.matrix);
      for (let j = 0; j < 2; j++) {
        o.position.y = p.y + (2.2 + j * 0.85) * p.s;
        o.scale.set(
          p.s * (1 - j * 0.26),
          p.s * (1 - j * 0.2),
          p.s * (1 - j * 0.26),
        );
        o.updateMatrix();
        foliage.setMatrixAt(i * 2 + j, o.matrix);
        foliage.setColorAt(
          i * 2 + j,
          new THREE.Color().setHSL(
            0.27 + random() * 0.055,
            0.21 + random() * 0.13,
            0.23 + random() * 0.12,
          ),
        );
      }
    });
    trunk.castShadow = true;
    foliage.castShadow = true;
    this.scene.add(trunk, foliage);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, material('#939789'), 100);
    for (let i = 0; i < 100; i++) {
      const x = random() * 180 - 90,
        z = -68 - random() * 19;
      o.position.set(x, height(x, z), z);
      o.scale.set(1 + random() * 1.5, 0.8 + random(), 1 + random());
      o.rotation.set(random(), random(), random());
      o.updateMatrix();
      rocks.setMatrixAt(i, o.matrix);
    }
    rocks.castShadow = true;
    this.scene.add(rocks);
  }
  private syncCars(id: number) {
    const count = this.sim.trains[id].cars + 1;
    while (this.cars[id].length < count) {
      const c = carriage(locomotives[id].color, this.cars[id].length);
      c.userData.trainId = id;
      batchScenery(c, new Set());
      this.scene.add(c);
      this.cars[id].push(c);
    }
    while (this.cars[id].length > count) {
      const removed = this.cars[id].pop()!;
      removed.removeFromParent();
      removed.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry.type !== 'BoxGeometry')
          o.geometry.dispose();
      });
    }
  }
  private positionOnRoute(id: number, distance: number) {
    const train = this.sim.trains[id];
    let [a, b] = this.sim.endpoints(train);
    let key = edgeKey(a, b),
      length = this.sim.lengths.get(key)!;
    if (distance < 0) {
      [a, b] = this.sim.endpoints(train, -1);
      key = edgeKey(a, b);
      length = this.sim.lengths.get(key)!;
      distance += length;
    }
    const curve = this.curves.get(key)!;
    const forward = a < b;
    const t = THREE.MathUtils.clamp(distance / length, 0, 1);
    const u = forward ? t : 1 - t;
    const p = curve.getPointAt(u),
      tangent = curve.getTangentAt(u).multiplyScalar(forward ? 1 : -1);
    return { p, angle: Math.atan2(-tangent.x, -tangent.z) };
  }
  private sceneryClear(x: number, z: number, clearance: number) {
    if (Math.abs(x - riverX(z)) < 6.8) return false;
    for (const curve of this.curves.values()) {
      const points =
        this.clearancePoints.get(curve) ??
        curve.getSpacedPoints(Math.ceil(curve.getLength()));
      this.clearancePoints.set(curve, points);
      if (points.some((p) => Math.hypot(p.x - x, p.z - z) < clearance))
        return false;
    }
    return true;
  }
  private rememberResources(root: THREE.Object3D) {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        this.resources.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          this.materials.add(m),
        );
      }
    });
  }
  private updateShowcase() {
    if (!this.showcase) return;
    const distance =
      this.camera.position.distanceTo(this.trains[10].position) /
      (this.camera instanceof THREE.OrthographicCamera ? this.camera.zoom : 1);
    const level =
      this.quality === 'low' ? 2 : distance < 55 ? 0 : distance < 120 ? 1 : 2;
    if (level === this.detailLevel) return;
    this.detailLevel = level;
    const engine = this.trains[10],
      tender = this.cars[10][0];
    engine.clear();
    tender.clear();
    engine.add(this.showcase.engines[level]);
    tender.add(this.showcase.tenders[level]);
    engine.userData.wheels = this.showcase.engines[level].userData.wheels;
    engine.userData.rods = this.showcase.engines[level].userData.rods;
    tender.userData.wheels = this.showcase.tenders[level].userData.wheels;
  }
  private updateRouteHighlight() {
    if (this.highlighted === this.selected) return;
    this.highlighted = this.selected;
    for (const child of this.routeHighlight.children) disposeModel(child);
    this.routeHighlight.clear();
    const route = locomotives[this.selected].route;
    const mat = new THREE.MeshBasicMaterial({
      color: '#f4cd75',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    route.forEach((a, i) => {
      const curve = this.curves.get(edgeKey(a, route[(i + 1) % route.length]));
      if (!curve) return;
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(
          curve,
          Math.ceil(curve.getLength()),
          0.12,
          4,
          false,
        ),
        mat,
      );
      line.position.y = 0.27;
      this.routeHighlight.add(line);
    });
  }
  private animate = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = this.previous
      ? Math.min((now - this.previous) / 1000, 0.1)
      : 0.016;
    this.previous = now;
    this.fps = this.fps * 0.95 + Math.min(120, 1 / delta) * 0.05;
    const frozen = this.sim.paused || this.photoMode || document.hidden;
    const motionDelta = frozen ? 0 : delta * this.sim.speed;
    if (!this.photoMode && !document.hidden) this.sim.step(delta);
    const day = this.atmosphere.update(motionDelta);
    this.host.dataset.night = day < 0.25 ? 'true' : 'false';
    this.windowMaterials.forEach((m) => {
      m.emissiveIntensity = (1 - day) * 1.5;
    });
    const water = this.water.material as THREE.ShaderMaterial;
    water.uniforms.time.value = this.atmosphere.time;
    water.uniforms.day.value = day;
    water.uniforms.fogColor.value.copy((this.scene.fog as THREE.Fog).color);
    this.sim.trains.forEach((train, i) => {
      this.syncCars(i);
      const { p, angle } = this.positionOnRoute(i, train.distance);
      const engine = this.trains[i];
      engine.position.copy(p);
      engine.rotation.y = angle;
      const running = train.status === 'Running' && !train.held;
      const phase = train.distance * 2.5;
      for (const wheel of engine.userData.wheels as THREE.Object3D[])
        wheel.rotation.x = -phase;
      for (const rod of (engine.userData.rods ?? []) as THREE.Object3D[]) {
        rod.position.y = rod.userData.baseY + Math.sin(phase) * 0.12;
        rod.position.z = rod.userData.baseZ + Math.cos(phase) * 0.12;
      }
      this.cars[i].forEach((car, j) => {
        const at = this.positionOnRoute(i, train.distance - 3.8 - j * 3);
        car.position.copy(at.p);
        car.rotation.set(0, at.angle, 0);
        if (running) {
          car.rotation.z = Math.sin(train.distance * 2 + j * 0.8) * 0.008;
          car.position.y += Math.sin(train.distance * 4 + j) * 0.009;
        }
        for (const wheel of (car.userData.wheels ?? []) as THREE.Object3D[])
          wheel.rotation.x = -phase;
      });
      if (!frozen) {
        const effort = THREE.MathUtils.clamp(0.45 + train.cars * 0.07, 0, 1);
        this.emission[i] += motionDelta;
        if (running && this.emission[i] > 0.26 / effort) {
          this.emission[i] = 0;
          this.effects.emit(
            engine.localToWorld(new THREE.Vector3(0, 2.55, -1.18)),
            effort,
          );
        }
        if (running && !this.previousRunning[i])
          for (const side of [-1, 1])
            this.effects.emit(
              engine.localToWorld(new THREE.Vector3(side * 0.85, 0.6, -1.5)),
              effort,
              true,
            );
        this.previousRunning[i] = running;
      }
    });
    this.effects.update(motionDelta);
    const target = this.trains[this.selected].position;
    this.selectionRing.position.set(target.x, 0.55, target.z);
    this.selectionRing.visible = !this.photoMode;
    this.routeHighlight.visible = !this.photoMode;
    this.updateRouteHighlight();
    if (this.trackside) {
      if (this.camera.position.distanceTo(target) > 65) this.placeTrackside();
      this.controls.target.lerp(target, 1 - Math.exp(-delta * 4));
    } else if (this.following) {
      const movement = target
        .clone()
        .sub(this.controls.target)
        .multiplyScalar(1 - Math.exp(-delta * 5));
      this.controls.target.add(movement);
      if (this.followTransition) {
        const offset =
          this.mode === 'iso'
            ? new THREE.Vector3(100, 110, 125)
            : new THREE.Vector3(15, 10, 19);
        const goal = target.clone().add(offset);
        this.camera.position.lerp(goal, 1 - Math.exp(-delta * 4));
        if (this.camera.position.distanceTo(goal) < 0.25)
          this.followTransition = false;
      } else this.camera.position.add(movement);
    }
    this.controls.update();
    this.camera.position.y = Math.max(
      this.camera.position.y,
      height(
        THREE.MathUtils.clamp(this.camera.position.x, -95, 95),
        THREE.MathUtils.clamp(this.camera.position.z, -90, 90),
      ) + 2.5,
    );
    this.updateShowcase();
    for (const signal of this.signalLights)
      (signal.mesh.material as THREE.MeshBasicMaterial).color.set(
        this.sim.occupied.has(signal.key) ? '#ff725a' : '#9be987',
      );
    this.audio.update(
      this.camera,
      this.sim.trains.map((t, i) => ({
        position: this.trains[i].position,
        running: t.status === 'Running' && !t.held,
        bridge:
          Math.abs(
            this.trains[i].position.x - riverX(this.trains[i].position.z),
          ) < 6,
        effort: 0.5 + t.cars * 0.07,
        speed: this.sim.speed,
      })),
      delta,
      frozen,
    );
    this.renderer.render(this.scene, this.camera);
    const width = this.host.clientWidth,
      h = this.host.clientHeight;
    const occupied: { x: number; y: number }[] = [];
    const sorted = [...this.labels].sort(
      (a, b) =>
        a.position.distanceToSquared(this.camera.position) -
        b.position.distanceToSquared(this.camera.position),
    );
    for (const label of sorted) {
      const p = label.position.clone().project(this.camera),
        x = (p.x * 0.5 + 0.5) * width,
        y = (-p.y * 0.5 + 0.5) * h;
      const overlap = occupied.some(
        (r) => Math.abs(r.x - x) < 130 && Math.abs(r.y - y) < 50,
      );
      const visible =
        this.labelsVisible &&
        !this.photoMode &&
        p.z > -1 &&
        p.z < 1 &&
        x > 70 &&
        x < width - 70 &&
        y > 55 &&
        y < h - 35 &&
        !overlap;
      label.element.style.display = visible ? '' : 'none';
      if (visible) occupied.push({ x, y });
      label.element.style.transform = `translate(-50%, -100%) translate(${x}px,${y}px)`;
    }
  };
  get diagnostics() {
    return {
      fps: Math.round(this.fps),
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      particles: this.effects.activeCount,
      quality: this.quality,
      showcase: this.assetStatus,
    };
  }
  private placeTrackside() {
    const train = this.trains[this.selected];
    const offset = new THREE.Vector3(8, 3, -12).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      train.rotation.y,
    );
    this.camera.position.copy(train.position).add(offset);
  }
  setTrackside() {
    this.setMode('3d');
    this.following = false;
    this.trackside = true;
    this.followTransition = false;
    this.placeTrackside();
    this.controls.target.copy(this.trains[this.selected].position);
  }
  capturePhoto() {
    this.renderer.render(this.scene, this.camera);
    const a = document.createElement('a');
    a.download = 'steam-atlas.png';
    a.href = this.renderer.domElement.toDataURL('image/png');
    a.click();
  }
  setMode(mode: CameraMode) {
    if (this.mode === mode) return;
    const target = this.controls.target.clone(),
      position = this.camera.position.clone();
    // Preserve the apparent scale when switching projection, including a close follow view.
    const halfHeight =
      this.camera instanceof THREE.OrthographicCamera
        ? 86 / this.camera.zoom
        : position.distanceTo(target) *
          Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.controls.dispose();
    this.mode = mode;
    this.trackside = false;
    this.followTransition = false;
    if (mode === 'iso') {
      this.camera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 800);
      this.camera.position.copy(target).add(new THREE.Vector3(140, 155, 175));
      this.camera.zoom = THREE.MathUtils.clamp(86 / halfHeight, 0.55, 9);
    } else {
      this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 800);
      this.camera.position.copy(
        position
          .sub(target)
          .normalize()
          .multiplyScalar(
            halfHeight / Math.tan(THREE.MathUtils.degToRad(43 / 2)),
          )
          .add(target),
      );
    }
    this.controls = this.makeControls();
    this.controls.target.copy(target);
    this.controls.update();
    this.resize();
  }
  follow(id: number) {
    this.selected = id;
    this.following = true;
    this.trackside = false;
    this.followTransition = true;
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = 5;
      this.camera.updateProjectionMatrix();
    }
  }
  overview() {
    this.trackside = false;
    this.followTransition = false;
    this.following = false;
    this.controls.target.set(0, 0, -7);
    this.camera.position.set(140, 155, 175);
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }
  zoom(direction: number) {
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = THREE.MathUtils.clamp(
        this.camera.zoom * (direction > 0 ? 1.25 : 0.8),
        0.55,
        9,
      );
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.position
        .sub(this.controls.target)
        .multiplyScalar(direction > 0 ? 0.8 : 1.25)
        .add(this.controls.target);
    }
    this.controls.update();
  }
  setQuality(quality: string) {
    this.quality = Object.hasOwn(qualitySettings, quality)
      ? (quality as Quality)
      : 'balanced';
    const settings = qualitySettings[this.quality];
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, settings.pixels),
    );
    const shadowsChanged =
      this.renderer.shadowMap.enabled !== settings.shadows > 0;
    this.renderer.shadowMap.enabled = settings.shadows > 0;
    if (shadowsChanged) {
      this.materials.forEach((mat) => {
        mat.needsUpdate = true;
      });
      this.scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(
            (mat) => {
              mat.needsUpdate = true;
            },
          );
      });
    }
    if (!settings.shadows) {
      this.sunlight.shadow.map?.dispose();
      this.sunlight.shadow.map = null;
    }
    if (
      settings.shadows &&
      this.sunlight.shadow.mapSize.x !== settings.shadows
    ) {
      this.sunlight.shadow.map?.dispose();
      this.sunlight.shadow.map = null;
      this.sunlight.shadow.mapSize.setScalar(settings.shadows);
    }
    (this.water.material as THREE.ShaderMaterial).uniforms.detail.value =
      settings.water;
    this.effects.setQuality(this.quality);
    this.resize();
  }
  setTime(hour: number) {
    if (Number.isFinite(hour)) {
      this.atmosphere.hour = ((hour % 24) + 24) % 24;
      this.atmosphere.update(0);
    }
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    if (this.camera instanceof THREE.PerspectiveCamera)
      this.camera.aspect = w / h;
    else {
      const half = 86;
      this.camera.left = (-half * w) / h;
      this.camera.right = (half * w) / h;
      this.camera.top = half;
      this.camera.bottom = -half;
    }
    this.camera.updateProjectionMatrix();
  }
  private visibilityChanged = () => {
    this.previous = 0;
    if (document.hidden) this.audio.silence();
  };
  private pointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };
  private pointerUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5)
      return;
    const r = this.host.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.trains, ...this.cars.flat()],
      true,
    );
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && o.userData.trainId === undefined) o = o.parent;
      if (o) {
        this.selected = o.userData.trainId;
        this.onSelect(this.selected);
      }
    }
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.host.removeEventListener('pointerdown', this.pointerDown);
    this.host.removeEventListener('pointerup', this.pointerUp);
    this.labels.forEach((l) => l.element.remove());
    this.audio.dispose();
    this.rememberResources(this.scene);
    this.resources.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.resources.clear();
    this.materials.clear();
    this.sunlight.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
