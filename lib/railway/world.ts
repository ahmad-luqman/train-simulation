import {
  railwayGround,
  groundHeight,
  TERRAIN_COLUMNS,
  TERRAIN_ROWS,
} from './rail-earthworks';
import { FollowCamera, trainCameraTarget } from './follow-camera';
import { MAP, MAP_SCALE } from './map';
import { vehicles } from './safety';
import { sample } from './topology';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cities, locomotives } from './data';
import { Simulation } from './simulation';
import { TrackCurve } from './network-view';
import type { TrackEdge, Service } from './network';
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
  onMapPoint?: (x: number, z: number) => void;
  following = false;
  labelsVisible = true;
  fps = 60;
  private clearancePoints = new Map<TrackCurve, THREE.Vector3[]>();
  curves = new Map<string, TrackCurve>();
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
  private followCamera = new FollowCamera();
  private routeHighlight = new THREE.Group();
  private highlighted = -1;
  private networkRevision = -1;
  private railGroup = new THREE.Group();
  private sceneryGroup = new THREE.Group();
  private constructionPreview = new THREE.Group();
  private constructionPreviewKey = '';
  private networkOverlay = new THREE.Group();
  private previewService: Service | undefined;
  private overlay: 'off' | 'connectivity' | 'gradient' | 'cost' = 'off';
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
  private groundGeometry!: THREE.PlaneGeometry;
  private groundHeights = new Float32Array();
  private sunlight: THREE.DirectionalLight;
  private signalLights: { key: string; reverse: boolean; mesh: THREE.Mesh }[] =
    [];
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
    sh.camera.left = -MAP.halfWidth;
    sh.camera.right = MAP.halfWidth;
    sh.camera.top = MAP.halfDepth;
    sh.camera.bottom = -MAP.halfDepth;
    sh.camera.far = 1200;
    sh.normalBias = 0.2;
    sh.bias = -0.0002;
    this.scene.add(this.sunlight);
    this.atmosphere = new Atmosphere(this.scene, this.sunlight, this.renderer);
    this.camera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 1800);
    this.camera.position.set(140 * MAP_SCALE, 155 * MAP_SCALE, 175 * MAP_SCALE);
    this.controls = this.makeControls();
    this.controls.target.set(0, 0, -7);
    this.controls.update();
    this.terrain();
    this.water = createRiver();
    this.scene.add(this.water);
    this.scene.add(
      this.railGroup,
      this.sceneryGroup,
      this.constructionPreview,
      this.networkOverlay,
    );
    this.rebuildNetwork();
    this.rememberResources(this.scene);
    batchScenery(
      this.scene,
      new Set([
        this.water,
        ...this.signalLights.map((s) => s.mesh),
        ...this.dynamicMeshes(),
      ]),
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
      g.visible = this.sim.visible(this.sim.trains[i]);
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
    c.maxDistance = 1000;
    c.minZoom = 0.55;
    c.maxZoom = 48;
    c.maxPolarAngle = Math.PI * 0.47;
    c.screenSpacePanning = false;
    c.enableRotate = this.mode === '3d';
    c.mouseButtons.LEFT =
      this.mode === 'iso' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    c.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    return c;
  }
  private terrain() {
    const geo = new THREE.PlaneGeometry(
      MAP.halfWidth * 2,
      MAP.halfDepth * 2,
      TERRAIN_COLUMNS,
      TERRAIN_ROWS,
    );
    geo.rotateX(-Math.PI / 2);
    this.groundGeometry = geo;
    this.groundHeights = railwayGround(this.sim.topology.sections.values());
    const pos = geo.attributes.position;
    const colors = [];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        y = this.groundHeights[i];
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
    box(
      this.scene,
      '#ac9976',
      0,
      -3.1,
      0,
      MAP.halfWidth * 2,
      3,
      MAP.halfDepth * 2,
    );
    box(
      this.scene,
      '#d5ccb7',
      0,
      -5,
      0,
      MAP.halfWidth * 2,
      0.8,
      MAP.halfDepth * 2,
    );
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      material('#cbd5d4'),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -6;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }
  private dynamicMeshes() {
    const meshes: THREE.Object3D[] = [];
    [this.railGroup, this.sceneryGroup].forEach((g) =>
      g.traverse((o) => meshes.push(o)),
    );
    return meshes;
  }
  private releaseGroup(group: THREE.Group) {
    // Shared procedural materials/geometries may still be used by the terrain,
    // fleet or detached LODs. Dispose only resources unique to this removed group.
    const keepGeometry = new Set<THREE.BufferGeometry>(),
      keepMaterial = new Set<THREE.Material>();
    const collect = (o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        keepGeometry.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          keepMaterial.add(m),
        );
      }
    };
    const parent = group.parent;
    group.removeFromParent();
    this.scene.traverse(collect);
    this.showcase?.engines.forEach((o) => o.traverse(collect));
    this.showcase?.tenders.forEach((o) => o.traverse(collect));
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        if (!keepGeometry.has(o.geometry)) {
          o.geometry.dispose();
          this.resources.delete(o.geometry);
        }
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (!keepMaterial.has(m)) {
            m.dispose();
            this.materials.delete(m);
          }
        });
      }
    });
    group.clear();
    parent?.add(group);
  }
  private rebuildNetwork() {
    // Recompute from natural terrain so demolition/undo can restore unused cuts.
    this.groundHeights = railwayGround(this.sim.topology.sections.values());
    const groundPositions = this.groundGeometry.attributes.position;
    for (let i = 0; i < groundPositions.count; i++)
      groundPositions.setY(i, this.groundHeights[i]);
    groundPositions.needsUpdate = true;
    this.groundGeometry.computeVertexNormals();
    this.groundGeometry.computeBoundingBox();
    this.groundGeometry.computeBoundingSphere();
    this.releaseGroup(this.railGroup);
    this.releaseGroup(this.sceneryGroup);
    this.curves.clear();
    this.clearancePoints.clear();
    this.signalLights = [];
    this.labels.forEach((l) => l.element.remove());
    this.labels = [];
    this.railways();
    this.towns();
    this.nature();
    for (const station of this.sim.network.stations) {
      const node = this.sim.network.nodes.find((n) => n.id === station.node)!;
      const angle = station.yardAngle!,
        lead = station.yardLead ?? 17;
      const hall = new THREE.Group();
      hall.position.set(
        node.x + Math.cos(angle) * (lead + 25) - Math.sin(angle) * 28,
        node.y - 0.36,
        node.z + Math.sin(angle) * (lead + 25) + Math.cos(angle) * 28,
      );
      hall.rotation.y = -angle;
      stationKit(
        hall,
        {
          id: station.id,
          name: station.name,
          cargo: node.cargo,
          x: 0,
          z: 4,
          color: cities[station.node]?.color ?? '#b78065',
        },
        station.node === 4,
      );
      this.sceneryGroup.add(hall);
      if (station.built) {
        const el = document.createElement('div');
        el.className = 'city-label';
        const title = document.createElement('strong');
        title.textContent = station.name;
        const detail = document.createElement('span');
        detail.textContent = 'Station';
        el.appendChild(title);
        el.appendChild(detail);
        this.host.appendChild(el);
        this.labels.push({
          element: el,
          position: new THREE.Vector3(node.x, node.y + 5, node.z - 3),
        });
      }
      for (const platform of station.platforms) {
        const path = this.sim.topology.sections.get(platform)!;
        const pose = sample(path, path.length / 2),
          g = new THREE.Group();
        g.position.set(pose.p.x, pose.p.y, pose.p.z);
        g.rotation.y = pose.angle;
        box(g, '#c4b99b', 3, -0.1, 0, 1.5, 0.5, path.length);
        // Open at both ends: the exit leads into a physical return loop.
        box(g, '#526962', 3, 2.8, 0, 1.9, 0.16, 20);
        for (const z of [-9, 0, 9])
          box(g, '#43564f', 3.4, 1.3, z, 0.12, 2.6, 0.12);
        this.railGroup.add(g);
      }
    }
    for (const edge of this.sim.network.edges.filter(
      (e) => e.kind === 'siding',
    )) {
      const p = edge.points[edge.points.length - 1];
      box(this.railGroup, '#b66745', p.x, p.y + 0.5, p.z, 2, 0.3, 0.3);
    }
    for (const group of [this.railGroup, this.sceneryGroup]) {
      const before = new Set<THREE.BufferGeometry>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line)
          before.add(o.geometry);
      });
      batchScenery(group, new Set(this.signalLights.map((s) => s.mesh)));
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line)
          before.delete(o.geometry);
      });
      // These two procedural geometries are shared globally by the existing kits.
      before.forEach((g) => {
        if (
          !(
            g.type === 'BoxGeometry' &&
            (g as THREE.BoxGeometry).parameters.width === 1
          ) &&
          g.type !== 'ExtrudeGeometry'
        )
          g.dispose();
      });
    }
    this.networkRevision = this.sim.revision;
    this.highlighted = -1;
    this.setNetworkOverlay(this.overlay);
  }
  setConstructionPreview(edge?: TrackEdge, valid = true) {
    const key = edge
      ? JSON.stringify([
          edge.a,
          edge.b,
          edge.points[0],
          edge.points[Math.floor(edge.points.length / 2)],
          edge.points.at(-1),
          edge.length,
          valid,
        ])
      : '';
    if (key === this.constructionPreviewKey) return;
    this.constructionPreviewKey = key;
    this.releaseGroup(this.constructionPreview);
    if (!edge) return;
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(
        new TrackCurve(edge),
        Math.ceil(edge.length * 2),
        0.35,
        5,
        false,
      ),
      new THREE.MeshBasicMaterial({
        color: valid ? '#70e6ab' : '#ff795e',
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    line.position.y = 0.4;
    line.renderOrder = 10;
    this.constructionPreview.add(line);
  }
  setServicePreview(service?: Service) {
    this.previewService = service;
    this.highlighted = -1;
  }
  setNetworkOverlay(mode: 'off' | 'connectivity' | 'gradient' | 'cost') {
    this.overlay = mode;
    this.releaseGroup(this.networkOverlay);
    if (mode === 'off') return;
    for (const edge of this.sim.network.edges) {
      const color =
        mode === 'gradient'
          ? edge.grade > 0.025
            ? '#ffae67'
            : '#71dbc2'
          : mode === 'cost'
            ? edge.cost.total > 35000
              ? '#ffbc61'
              : '#96c8ff'
            : edge.built
              ? '#70e6ab'
              : '#b8d8e7';
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          edge.points.map((p) => new THREE.Vector3(p.x, p.y + 0.5, p.z)),
        ),
        new THREE.LineBasicMaterial({ color, depthTest: false }),
      );
      line.renderOrder = 5;
      this.networkOverlay.add(line);
    }
  }
  private railways() {
    const ties: { p: THREE.Vector3; angle: number }[] = [];
    const bridges: { p: THREE.Vector3; angle: number }[] = [];
    for (const edge of this.sim.topology.asEdges()) {
      const curve = new TrackCurve(edge),
        key = edge.id,
        length = edge.length;
      this.curves.set(key, curve);
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
        this.railGroup.add(mesh);
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
        box(this.railGroup, '#515e4b', p.x, p.y + 1, p.z, 0.13, 2.6, 0.13);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6),
          new THREE.MeshBasicMaterial({ color: '#79a867' }),
        );
        lamp.position.set(p.x, p.y + 2.3, p.z);
        this.railGroup.add(lamp);
        this.signalLights.push({ key: edge.id, reverse: t > 0.5, mesh: lamp });
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
    this.railGroup.add(inst);
    for (let i = 0; i < bridges.length; i++) {
      const { p, angle } = bridges[i];
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = angle;
      box(g, '#746d58', 0, -0.23, 0, 3.6, 0.35, 1);
      for (const x of [-1.8, 1.8]) {
        box(g, '#495e54', x, 0.65, 0, 0.11, 0.11, 1.05);
        if (i % 2 === 0) {
          box(g, '#495e54', x, 0.3, 0, 0.12, 0.8, 0.12);
          const brace = box(g, '#495e54', x, 0.35, 0, 0.1, 0.1, 2);
          brace.rotation.x = 0.42;
        }
      }
      if (i % 5 === 0) box(g, '#aaa48b', 0, -1.6, 0, 1.7, 2.8, 1);
      this.railGroup.add(g);
    }
  }
  private towns() {
    const random = rng(903);
    cities.forEach((city, index) => {
      const urban = new THREE.Group();
      this.sceneryGroup.add(urban);
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
          box(this.sceneryGroup, '#a49160', px, 0.06, pz, 0.69, 0.1, 0.79);
          box(
            this.sceneryGroup,
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
      cylinder(this.sceneryGroup, '#847a61', x, 2.3, z, 1.1, 4);
      cylinder(this.sceneryGroup, '#697467', x, 4.7, z, 1.7, 1.7);
    }
  }
  private nature() {
    const random = rng(731);
    const positions: { x: number; y: number; z: number; s: number }[] = [];
    for (let i = 0; i < 3600; i++) {
      const x = (random() * 184 - 92) * MAP_SCALE,
        z = (random() * 174 - 87) * MAP_SCALE;
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
      positions.push({
        x,
        z,
        y: groundHeight(this.groundHeights, x, z),
        s: 0.65 + random() * 0.9,
      });
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
    this.sceneryGroup.add(trunk, foliage);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, material('#939789'), 100);
    for (let i = 0; i < 100; i++) {
      const x = (random() * 180 - 90) * MAP_SCALE,
        z = (-68 - random() * 19) * MAP_SCALE;
      o.position.set(x, groundHeight(this.groundHeights, x, z), z);
      o.scale.set(1 + random() * 1.5, 0.8 + random(), 1 + random());
      o.rotation.set(random(), random(), random());
      o.updateMatrix();
      rocks.setMatrixAt(i, o.matrix);
    }
    rocks.castShadow = true;
    this.sceneryGroup.add(rocks);
  }
  private syncCars(id: number) {
    const wagon = this.sim.economy.services[id].wagon;
    if (this.cars[id][1] && this.cars[id][1].userData.wagon !== wagon) {
      for (const removed of this.cars[id].splice(1)) {
        removed.removeFromParent();
        removed.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry.type !== 'BoxGeometry')
            o.geometry.dispose();
        });
      }
    }
    const count = this.sim.trains[id].cars + 1;
    while (this.cars[id].length < count) {
      const c = carriage(locomotives[id].color, this.cars[id].length, wagon);
      c.userData.trainId = id;
      batchScenery(c, new Set());
      c.visible = this.sim.visible(this.sim.trains[id]);
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
    const { p, angle } = this.sim.vehiclePosition(
      train,
      train.distance - distance,
    );
    return { p: new THREE.Vector3(p.x, p.y, p.z), angle };
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
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
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
  private highlightedPath = '';
  private updateRouteHighlight() {
    const active = this.sim.trains[this.selected].motion.physical.route;
    const signature = active?.sections.map((s) => s.section).join() ?? '';
    if (
      this.highlighted === this.selected &&
      signature === this.highlightedPath
    )
      return;
    this.highlightedPath = signature;
    this.highlighted = this.selected;
    for (const child of this.routeHighlight.children) disposeModel(child);
    this.routeHighlight.clear();
    const route = (this.previewService ?? this.sim.services[this.selected])
      .legs;
    const mat = new THREE.MeshBasicMaterial({
      color: '#f4cd75',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const paths =
      !this.previewService && active
        ? active.sections.map((s) => s.section)
        : route.flatMap(
            (l) =>
              this.sim.topology.running.get(l.edge)?.map((s) => s.section) ??
              [],
          );
    paths.forEach((id) => {
      const curve = this.curves.get(id);
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
    if (this.networkRevision !== this.sim.revision) this.rebuildNetwork();
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
      this.trains[i].visible = this.sim.visible(train);
      this.cars[i].forEach((car) => (car.visible = this.sim.visible(train)));
      const { p, angle } = this.positionOnRoute(i, train.distance);
      const engine = this.trains[i];
      engine.position.copy(p);
      engine.rotation.y = angle;
      const running = train.motion.velocity > 0 && !train.held;
      const phase =
        train.motion.travelled * 2.5 * (train.motion.reversed ? -1 : 1);
      for (const wheel of engine.userData.wheels as THREE.Object3D[])
        wheel.rotation.x = -phase;
      for (const rod of (engine.userData.rods ?? []) as THREE.Object3D[]) {
        rod.position.y = rod.userData.baseY + Math.sin(phase) * 0.12;
        rod.position.z = rod.userData.baseZ + Math.cos(phase) * 0.12;
      }
      this.cars[i].forEach((car, j) => {
        const at = this.positionOnRoute(
          i,
          train.distance - vehicles(train.cars)[j + 1].offset,
        );
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
    this.selectionRing.visible =
      !this.photoMode && this.sim.visible(this.sim.trains[this.selected]);
    this.routeHighlight.visible = !this.photoMode;
    this.updateRouteHighlight();
    const subject =
      this.following || this.trackside
        ? trainCameraTarget(this.sim, this.selected)
        : null;
    if (this.trackside) {
      if (subject) {
        if (this.camera.position.distanceTo(subject) > 65)
          this.placeTrackside();
        this.controls.target.lerp(subject, 1 - Math.exp(-delta * 4));
      }
    } else if (this.following) {
      this.followCamera.update(
        this.camera,
        this.controls.target,
        subject,
        delta,
      );
    }
    this.controls.update();
    this.camera.position.y = Math.max(
      this.camera.position.y,
      groundHeight(
        this.groundHeights,
        THREE.MathUtils.clamp(
          this.camera.position.x,
          -MAP.halfWidth,
          MAP.halfWidth,
        ),
        THREE.MathUtils.clamp(
          this.camera.position.z,
          -MAP.halfDepth,
          MAP.halfDepth,
        ),
      ) + 2.5,
    );
    this.updateShowcase();
    for (const signal of this.signalLights)
      (signal.mesh.material as THREE.MeshBasicMaterial).color.set(
        this.sim.traffic.signal(signal.key, signal.reverse)
          ? '#9be987'
          : '#ff725a',
      );
    this.audio.update(
      this.camera,
      this.sim.trains.map((t, i) => ({
        position: this.trains[i].position,
        running: t.motion.velocity > 0 && !t.held,
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
    if (!this.sim.visible(this.sim.trains[this.selected])) return;
    const { p, angle } = this.sim.vehiclePosition(
      this.sim.trains[this.selected],
      0,
    );
    const offset = new THREE.Vector3(8, 3, -12).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      angle,
    );
    this.camera.position.set(p.x, p.y, p.z).add(offset);
  }
  setTrackside() {
    const subject = trainCameraTarget(this.sim, this.selected);
    if (!subject) return false;
    this.setMode('3d');
    this.following = false;
    this.trackside = true;
    this.followCamera.preserveView();
    this.placeTrackside();
    this.controls.target.copy(subject);
    return true;
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
        ? this.camera.top / this.camera.zoom
        : position.distanceTo(target) *
          Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.controls.dispose();
    this.mode = mode;
    this.trackside = false;
    this.followCamera.preserveView();
    if (mode === 'iso') {
      this.camera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 1800);
      this.camera.position
        .copy(target)
        .add(
          new THREE.Vector3(140 * MAP_SCALE, 155 * MAP_SCALE, 175 * MAP_SCALE),
        );
      this.camera.zoom = THREE.MathUtils.clamp(
        MAP.overviewHalf / halfHeight,
        0.55,
        48,
      );
    } else {
      this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 1800);
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
    if (!this.sim.trains[id]) return;
    this.selected = id;
    this.following = true;
    this.trackside = false;
    this.followCamera.request();
  }
  overview() {
    this.trackside = false;
    this.followCamera.preserveView();
    this.following = false;
    this.controls.target.set(0, 0, -7);
    this.camera.position.set(140 * MAP_SCALE, 155 * MAP_SCALE, 175 * MAP_SCALE);
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
        48,
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
      const half = MAP.overviewHalf * Math.max(1, 1.65 / (w / h));
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
    if (this.onMapPoint) {
      const point = this.raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.36),
        new THREE.Vector3(),
      );
      if (point) this.onMapPoint(point.x, point.z);
      return;
    }
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
