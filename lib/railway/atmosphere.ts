import { MAP, MAP_SCALE } from './map';
import * as THREE from 'three';
import { riverX } from './scenery';
export type Quality = 'low' | 'balanced' | 'high';
export const qualitySettings = {
  low: { pixels: 1, particles: 64, shadows: 0, water: 0 },
  balanced: { pixels: 1.5, particles: 144, shadows: 2048, water: 1 },
  high: { pixels: 2, particles: 240, shadows: 4096, water: 1 },
} as const;
export function daylight(hour: number) {
  const sun = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const day = THREE.MathUtils.smoothstep(sun, -0.15, 0.35);
  const sunset =
    (1 - THREE.MathUtils.smoothstep(Math.abs(sun), 0.05, 0.5)) * day;
  return { sun, day, sunset };
}
export class Atmosphere {
  hour = 15;
  cycling = true;
  time = 0;
  hemisphere = new THREE.HemisphereLight('#f8f0d9', '#43513c', 2);
  moon = new THREE.DirectionalLight('#a4c8ff', 0.3);
  constructor(
    private scene: THREE.Scene,
    private sun: THREE.DirectionalLight,
    private renderer: THREE.WebGLRenderer,
  ) {
    scene.add(this.hemisphere, this.moon);
    this.moon.position.set(65, 85, -40);
  }
  update(delta: number, weather: 'clear' | 'fog' | 'rain' | 'snow' = 'clear') {
    this.time += delta;
    if (this.cycling) this.hour = (this.hour + delta / 30) % 24;
    const { day, sunset } = daylight(this.hour);
    const sky = new THREE.Color('#101e38')
      .lerp(new THREE.Color('#b8cfd5'), day)
      .lerp(new THREE.Color('#d5a18e'), sunset * 0.5);
    if (weather !== 'clear')
      sky.lerp(
        new THREE.Color(weather === 'snow' ? '#ced8df' : '#7f979f'),
        day * 0.35,
      );
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = (weather === 'fog' ? 100 : 180) * MAP_SCALE;
    fog.far = (weather === 'fog' ? 320 : 440) * MAP_SCALE;
    this.sun.color.set('#fff2d3').lerp(new THREE.Color('#ffad6a'), sunset);
    this.sun.intensity = day * (2.8 - sunset * 0.8);
    const angle = ((this.hour - 6) / 24) * Math.PI * 2;
    this.sun.position.set(
      -Math.cos(angle) * 100 * MAP_SCALE,
      Math.max(12, Math.sin(angle) * 125) * MAP_SCALE,
      40,
    );
    this.hemisphere.intensity = 0.65 + day * 1.25;
    this.hemisphere.color.set('#91b4ed').lerp(new THREE.Color('#f8efda'), day);
    this.moon.intensity = (1 - day) * 0.65;
    this.renderer.toneMappingExposure = 1.12 + (1 - day) * 0.22;
    return day;
  }
}
export function createRiver() {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 240; i++) {
    const z = -MAP.halfDepth + (i * MAP.halfDepth) / 120;
    for (let j = 0; j <= 8; j++) {
      positions.push(riverX(z) + (j / 8 - 0.5) * 9.5, -0.95, z);
      uvs.push(j / 8, i / 240);
      if (i < 240 && j < 8) {
        const n = i * 9 + j;
        indices.push(n, n + 9, n + 1, n + 1, n + 9, n + 10);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      detail: { value: 1 },
      day: { value: 1 },
      fogColor: { value: new THREE.Color('#b8cfd5') },
      fogNear: { value: 180 * MAP_SCALE },
      fogFar: { value: 440 * MAP_SCALE },
    },
    vertexShader: `uniform float time; uniform float detail; varying vec2 vUv; varying vec3 vWorld; varying float vDepth;
      void main() { vUv = uv; vec3 p = position; p.y += sin(p.z * 1.8 + time * 1.4) * sin(uv.x * 3.14159) * 0.035 * detail;
      vWorld = (modelMatrix * vec4(p,1.0)).xyz; vec4 mv = modelViewMatrix * vec4(p,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time; uniform float detail; uniform float day; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec2 vUv; varying vec3 vWorld; varying float vDepth;
      void main() {
        float shore = smoothstep(0.31, 0.5, abs(vUv.x - 0.5));
        vec3 deep = mix(vec3(0.035,0.09,0.16), vec3(0.08,0.32,0.34), day);
        vec3 shallow = mix(vec3(0.08,0.18,0.22), vec3(0.36,0.56,0.45), day);
        vec2 wave = vec2(cos(vWorld.z * 2.3 + time * 1.8), sin(vWorld.x * 3.5 + vWorld.z + time)) * 0.14 * detail;
        vec3 normal = normalize(vec3(wave.x,1.0,wave.y));
        float fresnel = pow(1.0 - max(dot(normalize(cameraPosition-vWorld),normal),0.0),3.0);
        vec3 color = mix(mix(deep,shallow,shore), fogColor, fresnel * 0.48);
        float glint = pow(max(0.0,sin(vWorld.z*4.0-time*2.0)*cos(vWorld.x*5.0+time)),18.0);
        color += glint * 0.14 * detail * (0.3 + day * 0.7);
        float foam = smoothstep(0.86,1.0,shore) * (0.55+0.45*sin(vWorld.z*5.0-time*1.5));
        color = mix(color,vec3(0.68,0.78,0.73)*(0.4+day*0.6),foam*0.55*detail);
        gl_FragColor = vec4(mix(color,fogColor,smoothstep(fogNear,fogFar,vDepth)),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, mat);
}
