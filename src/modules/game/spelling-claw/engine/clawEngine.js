/* eslint-disable */
/*
 * 인형뽑기 3D 엔진 (2026-10-01, 1단계 시제품).
 *
 * 원본: `~/Downloads/인형뽑기_에셋/게임/10만들기_인형뽑기.html` 의 기계·집게·인형 물리(three.js + Rapier)를
 * 거의 그대로 옮겼다. 바꾼 것은 화면과 맞닿는 부분뿐이다.
 *   - CDN 대신 앱에 묶은 `three@0.170.0`·`@dimforge/rapier3d-compat@0.14.0` (학교망에서 jsdelivr 가 막혀도 뜬다)
 *   - 인형은 파일에 박지 않고 `/assets/claw/plush/*.glb` 를 게임을 열 때만 받는다(동물 8종, 포켓몬은 저작권 때문에 뺐다)
 *   - 문제·코인·도감·시작/결과 화면은 엔진 밖(React, 나중에는 서버)으로 — 엔진은 `emit` 으로 알리기만 한다
 *   - `quality: 'low'` 는 그림자·말랑 변형을 끄고 해상도를 낮춘다(학교 태블릿 점검용)
 * 물리 계산·기계 치수·집게 힘은 원본 그대로다. 손대면 잡히는 느낌이 바뀐다.
 * 원본이 한 파일짜리 게임 코드라 이 파일은 린트에서 뺀다(eslint-disable). 고칠 때는 위 원칙만 지킨다.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import RAPIER from '@dimforge/rapier3d-compat';

const CANVAS_FONT = '"Pretendard", "Noto Sans KR", sans-serif';

/**
 * @param {{ container: HTMLElement, plushes: {id:string,name:string,color:string,file:string,size:number}[],
 *   difficulty?: 'easy'|'normal'|'hard', sound?: boolean, quality?: 'auto'|'low',
 *   onEvent?: (event: object) => void, onProgress?: (message: string) => void }} options
 */
export async function createClawEngine({ container, plushes, difficulty = 'easy', sound = true, quality = 'auto', onEvent, onProgress }) {
  const LOW = quality === 'low';
  let disposed = false;
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const emit = (event) => { if (!disposed) onEvent?.(event); };
  const setLoading = (message) => onProgress?.(message);

  const deg = THREE.MathUtils.degToRad;
  const rand = (a, b) => a + Math.random() * (b - a);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);

  // ------------------------------------------------------------------ 기계 치수 (미터)
  const W = 0.9, D = 0.66, H = 0.8;
  const X0 = -W / 2, X1 = W / 2, Z0 = -D / 2, Z1 = D / 2;
  const CHUTE = { x0: X0, x1: -0.22, z0: 0.09, z1: Z1 };
  const HOME = { x: (CHUTE.x0 + CHUTE.x1) / 2 + 0.01, z: (CHUTE.z0 + CHUTE.z1) / 2 };
  const RAIL_Y = 0.745;
  const TOP_Y = 0.55;
  const MIN_Y = 0.15;
  const LIM = { x0: X0 + 0.075, x1: X1 - 0.075, z0: Z0 + 0.075, z1: Z1 - 0.075 };
  const MOVE_SPEED = 0.2, DROP_SPEED = 0.19, RISE_SPEED = 0.15, RETURN_SPEED = 0.17;
  const PLAY_TIME = 20;
  // grip: 집을 때 발 관절 모터의 비틀림 강성(N·m/rad)
  // hold/weak: 꼭대기에서 전압이 떨어지면 발이 hold(도)까지 풀리며 강성이 weak로 약해진다 — 실제 기계의 '집게 힘' 설정.
  // 인형이 넓어진 발끝 사이로 빠지거나 마찰로 못 버티고 미끄러지는지는 물리가 결정한다
  const DIFF = {
    easy: { grip: 0.4, hold: -16, weak: 0.4 },
    normal: { grip: 0.32, hold: 11, weak: 0.13 },
    hard: { grip: 0.25, hold: 17, weak: 0.07 },
  };
  // 집게발
  const PR = { rh: 0.022, hy: -0.024, L1: 0.085, L2: 0.042, beta: deg(35), r1: 0.0065, r2: 0.0085, tip: 0.0105 };
  const OPEN = deg(40), CLOSED = deg(-3);

  // ------------------------------------------------------------------ 저장 상태
  // 코인·도감·문제는 이 엔진 밖(화면·서버)이 가진다. 엔진은 기계와 집게만 안다.
  const state = { diff: difficulty in DIFF ? difficulty : 'easy', sound, view: 'front' };

  // ------------------------------------------------------------------ 렌더러
  const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
  // 터치 기기(휴대폰·태블릿)는 해상도·그림자 품질을 조금 낮춰 프레임을 지킨다. `low` 는 학교 태블릿용으로 더 낮춘다.
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : IS_TOUCH ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1426);
  scene.fog = new THREE.Fog(0x1b1426, 2.6, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 20);
  // 궤도 카메라: 드래그로 회전, 휠/핀치로 확대. az=방위각(0=정면), pol=천정에서 내려온 각
  const VIEWS = {
    front: { az: 0, pol: deg(68), r: 1.72 },
    side: { az: deg(90), pol: deg(68), r: 1.72 },
    top: { az: 0, pol: deg(6), r: 1.45 },
  };
  const orbit = { az: 0, pol: deg(68), r: 1.72, goal: { ...VIEWS.front }, target: new THREE.Vector3(0, 0.28, 0.02) };
  const POL_MIN = deg(3), POL_MAX = deg(86), R_MIN = 0.9, R_MAX = 2.6;
  const camPos = new THREE.Vector3(0, 0.8, 1.66), camTarget = orbit.target.clone();

  // ------------------------------------------------------------------ 조명
  scene.add(new THREE.HemisphereLight(0xffe9f2, 0x2a2140, 0.5));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
  key.position.set(0.9, 2.2, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -0.8, right: 0.8, top: 0.9, bottom: -0.7, near: 0.5, far: 5 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
  scene.add(key);
  const inner = new THREE.PointLight(0xfff6ea, 0.9, 1.6, 2);
  inner.position.set(0, 0.76, 0.1);
  scene.add(inner);
  const neonA = new THREE.PointLight(0xff4f8a, 3, 4, 2); neonA.position.set(-1.2, 1.3, -0.9); scene.add(neonA);
  const neonB = new THREE.PointLight(0x4fd9ff, 2.2, 4, 2); neonB.position.set(1.4, 1.1, -0.6); scene.add(neonB);
  // 집게 위 스포트라이트 → 인형 더미 위에 집게 그림자가 생겨 깊이감을 준다
  const clawSpot = new THREE.SpotLight(0xffffff, 2.2, 1.4, deg(24), 0.7, 1.2);
  clawSpot.castShadow = true;
  clawSpot.shadow.mapSize.set(IS_TOUCH ? 512 : 1024, IS_TOUCH ? 512 : 1024);
  clawSpot.shadow.bias = -0.0005;
  clawSpot.shadow.camera.near = 0.05;
  scene.add(clawSpot, clawSpot.target);

  // ------------------------------------------------------------------ 캔버스 텍스처 유틸
  function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  }
  // 인형 원단 결(노멀맵)
  function fabricNormal() {
    const N = 256, hgt = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) hgt[i] = Math.random();
    for (let pass = 0; pass < 2; pass++) {
      const src = hgt.slice();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy + N) % N) * N + ((x + dx + N) % N)];
        hgt[y * N + x] = s / 9;
      }
    }
    return canvasTex(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const hx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)];
        const hy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
        const v = new THREE.Vector3(-hx * 6, -hy * 6, 1).normalize();
        const o = (y * N + x) * 4;
        img.data[o] = (v.x * 0.5 + 0.5) * 255; img.data[o + 1] = (v.y * 0.5 + 0.5) * 255; img.data[o + 2] = (v.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, { repeat: [7, 7], srgb: false });
  }
  const FABRIC_NORMAL = fabricNormal();

  // ------------------------------------------------------------------ 물리 세계
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.lengthUnit = 0.15;
  world.numSolverIterations = 8;
  world.timestep = 1 / 60;
  const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  function staticBox(cx, cy, cz, hx, hy, hz, rot) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setFriction(0.8);
    if (rot) d.setRotation(rot);
    world.createCollider(d, fixedBody);
  }

  // ------------------------------------------------------------------ 기계 만들기
  const M = {
    body: new THREE.MeshPhysicalMaterial({ color: 0x7ed9c4, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    trim: new THREE.MeshPhysicalMaterial({ color: 0xf0455a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.18 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf2c75c, metalness: 1, roughness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x19141f, roughness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    acrylic: new THREE.MeshPhysicalMaterial({ color: 0xd9fff6, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2a2530, roughness: 0.7 }),
  };
  function add(geo, mat, x, y, z, { shadow = true, receive = true, parent = scene } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = receive;
    parent.add(m); return m;
  }

  function buildRoom() {
    // 오락실 카펫
    const carpet = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#231a33'; g.fillRect(0, 0, w, h);
      const cols = ['#f0455a', '#7ed9c4', '#ffc940', '#9b7cff', '#ff8fc8'];
      for (let i = 0; i < 90; i++) {
        g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate(Math.random() * 6.3);
        g.strokeStyle = cols[i % cols.length]; g.lineWidth = 5; g.globalAlpha = 0.55;
        const t = i % 3;
        g.beginPath();
        if (t === 0) { g.arc(0, 0, 14, 0, Math.PI * 1.3); }
        else if (t === 1) { g.moveTo(-18, 0); g.lineTo(-6, -12); g.lineTo(6, 0); g.lineTo(18, -12); }
        else { for (let k = 0; k < 5; k++) { const a = k * 2.513; g.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); } g.closePath(); }
        g.stroke(); g.restore();
      }
    }, { repeat: [6, 6] });
    const floor = add(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }), 0, -0.64, 0, { shadow: false });
    floor.rotation.x = -Math.PI / 2;
    const wall = add(new THREE.PlaneGeometry(12, 5), new THREE.MeshStandardMaterial({ color: 0x2a1f3c, roughness: 0.9 }), 0, 1.5, -1.5, { shadow: false });
    wall.receiveShadow = true;
    // 네온 간판
    const neon = canvasTex(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '800 150px ' + CANVAS_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff4f8a'; g.shadowBlur = 40; g.fillStyle = '#ffd1e3';
      g.fillText('뽑기천국', w / 2, h / 2 + 8); g.shadowBlur = 16; g.fillText('뽑기천국', w / 2, h / 2 + 8);
    });
    const sign = add(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false }), -0.2, 1.55, -1.48, { shadow: false, receive: false });
    sign.renderOrder = -1;
    // 옆 기계 실루엣
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      add(new RoundedBoxGeometry(1.0, 1.65, 0.8, 4, 0.04), new THREE.MeshStandardMaterial({ color: s < 0 ? 0x3b2a58 : 0x2b3f58, roughness: 0.6 }), 0, 0.2, 0, { parent: g });
      add(new THREE.BoxGeometry(0.9, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff7eb6 : 0x6ee7ff, toneMapped: false }), 0, 0.9, 0.41, { parent: g, shadow: false });
      g.position.set(s * 1.25, -0.2, -0.25);
      scene.add(g);
    }
  }

  const bulbs = [];
  let roofMat = null;
  function buildMachine() {
    const CW = W + 0.14, CD = D + 0.14;
    // 하단 캐비닛
    add(new RoundedBoxGeometry(CW, 0.62, CD, 5, 0.035), M.body, 0, -0.33, 0);
    add(new RoundedBoxGeometry(CW + 0.01, 0.05, CD + 0.01, 4, 0.02), M.trim, 0, -0.036, 0);
    add(new RoundedBoxGeometry(CW + 0.01, 0.04, CD + 0.01, 4, 0.02), M.trim, 0, -0.62, 0);
    // 상품 꺼내는 문
    const doorZ = CD / 2 + 0.002;
    add(new RoundedBoxGeometry(0.2, 0.17, 0.02, 4, 0.02), M.dark, HOME.x + 0.005, -0.3, doorZ);
    const flap = add(new THREE.PlaneGeometry(0.17, 0.13), new THREE.MeshPhysicalMaterial({ color: 0x3a3144, roughness: 0.2, transparent: true, opacity: 0.75 }), HOME.x + 0.005, -0.3, doorZ + 0.012);
    flap.rotation.x = -0.05;
    const lbl = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffc940'; g.font = '800 38px ' + CANVAS_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('상품 나오는 곳', w / 2, h / 2); });
    add(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial({ map: lbl, transparent: true }), HOME.x + 0.005, -0.18, doorZ + 0.001, { shadow: false });
    // 동전 투입구
    const coin = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#231a33'; g.beginPath(); g.roundRect(0, 0, w, h, 18); g.fill();
      g.fillStyle = '#ffc940'; g.font = '800 44px ' + CANVAS_FONT; g.textAlign = 'center'; g.fillText('코인 1개 · 1회', w / 2, 58);
      g.fillStyle = '#0c0a10'; g.beginPath(); g.roundRect(w / 2 - 36, 80, 72, 12, 6); g.fill();
    });
    add(new THREE.PlaneGeometry(0.13, 0.065), new THREE.MeshStandardMaterial({ map: coin, roughness: 0.4, emissive: 0xffffff, emissiveMap: coin, emissiveIntensity: 0.25 }), 0.26, -0.3, doorZ + 0.001, { shadow: false });

    // 조작 패널
    const panel = new THREE.Group();
    add(new RoundedBoxGeometry(CW - 0.1, 0.07, 0.17, 4, 0.025), M.trim, 0, 0, 0, { parent: panel });
    panel.position.set(0, -0.09, CD / 2 + 0.07); panel.rotation.x = 0.22;
    scene.add(panel);
    const stick = new THREE.Group();
    add(new THREE.CylinderGeometry(0.03, 0.034, 0.01, 24), M.dark, 0, 0.038, 0, { parent: panel });
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 12), M.chrome, 0, 0.035, 0, { parent: stick });
    add(new THREE.SphereGeometry(0.02, 24, 16), M.trim, 0, 0.075, 0, { parent: stick });
    stick.position.set(-0.2, 0.035, 0.01); panel.add(stick);
    add(new THREE.CylinderGeometry(0.04, 0.042, 0.014, 32), M.chrome, 0.2, 0.04, 0.01, { parent: panel });
    const btn = add(new THREE.SphereGeometry(0.034, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xffc940, roughness: 0.2, clearcoat: 1, emissive: 0xff9900, emissiveIntensity: 0.2 }), 0.2, 0.046, 0.01, { parent: panel });
    btn.scale.y = 0.6;

    // 내부 바닥 (배출구 구멍 포함)
    const felt = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#bfe9dc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#aadfcf';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 9, 0, 7); g.fill(); }
    }, { repeat: [1.5, 1.1] });
    const shape = new THREE.Shape();
    shape.moveTo(X0, -Z1); shape.lineTo(X1, -Z1); shape.lineTo(X1, -Z0); shape.lineTo(X0, -Z0); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(CHUTE.x0 + 0.004, -CHUTE.z1 + 0.004); hole.lineTo(CHUTE.x1, -CHUTE.z1 + 0.004); hole.lineTo(CHUTE.x1, -CHUTE.z0); hole.lineTo(CHUTE.x0 + 0.004, -CHUTE.z0); hole.closePath();
    shape.holes.push(hole);
    const fg = new THREE.ShapeGeometry(shape);
    const pos = fg.attributes.position, uv = fg.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - X0) / W, (pos.getY(i) + Z1) / D);
    const floorMesh = add(fg, new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 }), 0, 0, 0, { shadow: false });
    floorMesh.rotation.x = -Math.PI / 2;
    // 배출구 안쪽 어두운 통로
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x120e18, roughness: 1, side: THREE.DoubleSide });
    const cw = CHUTE.x1 - CHUTE.x0, cd = CHUTE.z1 - CHUTE.z0, cx = (CHUTE.x0 + CHUTE.x1) / 2, cz = (CHUTE.z0 + CHUTE.z1) / 2;
    add(new THREE.BoxGeometry(cw, 0.3, cd), shaftMat, cx, -0.16, cz, { shadow: false });
    // 아크릴 가림막
    add(new THREE.BoxGeometry(0.02, 0.1, cd), M.acrylic, CHUTE.x1, 0.05, cz, { shadow: false });
    add(new THREE.BoxGeometry(cw, 0.1, 0.02), M.acrylic, cx, 0.05, CHUTE.z0, { shadow: false });
    add(new THREE.BoxGeometry(0.026, 0.012, cd), M.trim, CHUTE.x1, 0.1, cz);
    add(new THREE.BoxGeometry(cw, 0.012, 0.026), M.trim, cx, 0.1, CHUTE.z0);
    // 배출구 표시
    const tag = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#f0455a'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.fill(); g.fillStyle = '#fff'; g.font = '800 52px ' + CANVAS_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GOAL', w / 2, h / 2 + 2); });
    add(new THREE.PlaneGeometry(0.1, 0.0375), new THREE.MeshBasicMaterial({ map: tag, transparent: true }), cx, 0.072, CHUTE.z0 - 0.011, { shadow: false }).rotation.y = Math.PI;

    // 뒷벽 그림
    const back = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = '#ffe7c9'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#ffd5a8' : '#ffe7c9'; g.fillRect(i * w / 14, 0, w / 14, h); }
      g.fillStyle = '#f0455a'; g.font = '800 46px ' + CANVAS_FONT; g.textAlign = 'center';
      const words = ['말랑', '폭신', '뽑아줘!', '냥', '멍'];
      for (let i = 0; i < 16; i++) { g.save(); g.translate((i % 8) * 128 + 64, 120 + Math.floor(i / 8) * 220 + (i % 2) * 40); g.rotate(rand(-0.2, 0.2)); g.globalAlpha = 0.18; g.fillText(words[i % words.length], 0, 0); g.restore(); }
    });
    add(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: back, roughness: 0.8 }), 0, H / 2, Z0 + 0.001, { shadow: false });
    // 기둥
    for (const [x, z] of [[X0 - 0.03, Z0 - 0.03], [X1 + 0.03, Z0 - 0.03], [X0 - 0.03, Z1 + 0.03], [X1 + 0.03, Z1 + 0.03]]) {
      add(new RoundedBoxGeometry(0.06, H + 0.02, 0.06, 3, 0.012), M.trim, x, H / 2, z);
    }
    // 유리
    add(new THREE.PlaneGeometry(W + 0.02, H), M.glass, 0, H / 2, Z1 + 0.02, { shadow: false, receive: false });
    const gl = add(new THREE.PlaneGeometry(D + 0.02, H), M.glass, X0 - 0.02, H / 2, 0, { shadow: false, receive: false }); gl.rotation.y = Math.PI / 2;
    const gr = add(new THREE.PlaneGeometry(D + 0.02, H), M.glass, X1 + 0.02, H / 2, 0, { shadow: false, receive: false }); gr.rotation.y = Math.PI / 2;
    // 상단 간판
    roofMat = M.body.clone(); roofMat.transparent = true;
    add(new RoundedBoxGeometry(CW, 0.22, CD, 5, 0.035), roofMat, 0, H + 0.11, 0);
    const marquee = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#fff3e3'; g.beginPath(); g.roundRect(0, 0, w, h, 40); g.fill();
      g.font = '800 150px ' + CANVAS_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 18; g.strokeStyle = '#b92a42'; g.lineJoin = 'round'; g.strokeText('인형뽑기', w / 2, h / 2 + 10);
      g.fillStyle = '#f0455a'; g.fillText('인형뽑기', w / 2, h / 2 + 10);
    });
    add(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshStandardMaterial({ map: marquee, emissive: 0xffffff, emissiveMap: marquee, emissiveIntensity: 0.45, roughness: 0.5 }), 0, H + 0.11, CD / 2 + 0.002, { shadow: false });
    // 전구
    const bulbGeo = new THREE.SphereGeometry(0.009, 12, 8);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      for (const y of [H + 0.022, H + 0.198]) {
        const mat = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc940, emissiveIntensity: 1 });
        const b = add(bulbGeo, mat, X0 - 0.03 + t * (W + 0.06), y, CD / 2 + 0.006, { shadow: false, receive: false });
        bulbs.push({ mat, i: i + (y > H + 0.1 ? n : 0) });
      }
    }
    // 천장 레일
    for (const z of [Z0 + 0.02, Z1 - 0.02]) add(new THREE.BoxGeometry(W, 0.016, 0.02), M.chrome, 0, RAIL_Y + 0.02, z);

    // ---- 물리 충돌체 ----
    const T = 0.025;
    staticBox((CHUTE.x1 + X1) / 2, -T, 0, (X1 - CHUTE.x1) / 2, T, D / 2);                     // 바닥 (오른쪽)
    staticBox(cx, -T, (Z0 + CHUTE.z0) / 2, cw / 2, T, (CHUTE.z0 - Z0) / 2);                 // 바닥 (배출구 뒤쪽)
    staticBox(X0 - T, 0.15, 0, T, 0.6, D / 2 + 0.05);                                        // 왼벽
    staticBox(X1 + T, 0.15, 0, T, 0.6, D / 2 + 0.05);                                        // 오른벽
    staticBox(0, 0.15, Z0 - T, W / 2 + 0.05, 0.6, T);                                        // 뒷벽
    staticBox(0, H / 2, Z1 + T, W / 2 + 0.05, H / 2, T);                                     // 앞 유리
    staticBox(cx, -0.09, Z1 + T, cw / 2, 0.09, T);                                           // 배출구 앞 (위쪽)
    staticBox(0, H + T, 0, W / 2, T, D / 2);                                                 // 천장
    staticBox(CHUTE.x1, 0.05, cz, 0.012, 0.05, cd / 2);                                      // 가림막 (두껍게: 인형이 파고들지 않도록)
    staticBox(cx, 0.05, CHUTE.z0, cw / 2, 0.05, 0.012);
    staticBox(CHUTE.x1 + 0.003, -0.17, cz, 0.003, 0.17, cd / 2);                             // 통로 벽
    staticBox(cx, -0.17, CHUTE.z0 - 0.003, cw / 2, 0.17, 0.003);
    staticBox(cx, -0.37, cz + 0.02, cw / 2, 0.01, cd / 2 + 0.04,
      new THREE.Quaternion().setFromAxisAngle(X_AXIS, 0.3));                                   // 경사 바닥
    staticBox(cx, -0.43, Z1 + 0.08, cw / 2, 0.01, 0.08);                                     // 상품 받는 곳
    staticBox(cx, -0.39, Z1 + 0.16, cw / 2, 0.05, 0.005);

    return { stick, btn };
  }

  buildRoom();
  const machine = buildMachine();

  // ------------------------------------------------------------------ 집게
  const clawVis = { hub: new THREE.Group(), prongs: [], trolley: new THREE.Group(), bridge: null, cable: null };
  {
    const h = clawVis.hub;
    const gun = new THREE.MeshStandardMaterial({ color: 0x3a3d45, metalness: 0.85, roughness: 0.35 });
    // 솔레노이드 하우징 + 크롬 링
    add(new THREE.CylinderGeometry(0.026, 0.03, 0.046, 32), gun, 0, 0.006, 0, { parent: h });
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 32), M.chrome, 0, -0.019, 0, { parent: h });
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.005, 32), M.chrome, 0, 0.03, 0, { parent: h });
    add(new THREE.CylinderGeometry(0.008, 0.012, 0.012, 16), M.chrome, 0, 0.038, 0, { parent: h });
    // 케이블 쪽 코일 스프링
    const helix = [];
    for (let k = 0; k <= 80; k++) { const a = k / 80 * Math.PI * 2 * 6; helix.push(new THREE.Vector3(Math.cos(a) * 0.006, 0.044 + k / 80 * 0.028, Math.sin(a) * 0.006)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 160, 0.0012, 6, false), M.chrome, 0, 0, 0, { parent: h });
    // 발을 움직이는 플런저 (닫힐수록 내려감)
    clawVis.plunger = add(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 16), M.chrome, 0, -0.03, 0, { parent: h });
    scene.add(h);
    // 휘어진 금속 띠 모양 발
    const sb = Math.sin(PR.beta), cb = Math.cos(PR.beta);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.004, -PR.L1 * 0.35, 0), new THREE.Vector3(0.003, -PR.L1 * 0.75, 0),
      new THREE.Vector3(0, -PR.L1, 0), new THREE.Vector3(-sb * PR.L2 * 0.55, -PR.L1 - cb * PR.L2 * 0.55, 0),
      new THREE.Vector3(-sb * PR.L2, -PR.L1 - cb * PR.L2, 0),
    ]);
    const strip = new THREE.TubeGeometry(path, 48, PR.r1, 10, false);
    strip.scale(0.75, 1, 1.7); // 납작한 띠
    clawVis.links = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.016, 12), M.chrome, 0, 0, 0, { parent: g }).rotation.x = Math.PI / 2; // 경첩
      add(strip, M.chrome, 0, 0, 0, { parent: g });
      add(new THREE.SphereGeometry(PR.tip * 0.85, 14, 10), M.rubber, -sb * PR.L2, -PR.L1 - cb * PR.L2, 0, { parent: g });
      scene.add(g); clawVis.prongs.push(g);
      clawVis.links.push(add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 8), M.chrome, 0, 0, 0));
    }
    const t = clawVis.trolley;
    add(new RoundedBoxGeometry(0.07, 0.035, 0.07, 3, 0.008), M.trim, 0, 0, 0, { parent: t });
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.04, 16), M.dark, 0, -0.01, 0, { parent: t }).rotation.x = Math.PI / 2;
    scene.add(t);
    clawVis.bridge = add(new THREE.BoxGeometry(0.03, 0.014, D), M.chrome, 0, RAIL_Y + 0.02, 0);
    clawVis.cable = add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6), M.dark, 0, 0, 0, { shadow: true });
  }

  // 물리 집게: 레일 도르래(키네마틱) → 밧줄 관절(최대 길이만 제한 = 실제 줄) → 몸체 → 발 3개(회전 관절+모터)
  // 집게는 벽·가림막·인형과 실제로 부딪히고, 인형은 발의 마찰력만으로 들린다.
  const REEL_Y = RAIL_Y - 0.01;
  const HUB_TOP = 0.05;                  // 몸체 중심에서 줄이 묶인 곳까지
  const S_TOP = REEL_Y - TOP_Y - HUB_TOP; // 꼭대기에서 줄 길이
  const S_MAX = REEL_Y - 0.1 - HUB_TOP;   // 최대로 풀 수 있는 길이
  const CLOSE_TARGET = deg(-16), CLOSE_LIMIT = deg(-9), OPEN_LIMIT = deg(44);
  const PRONG_FRICTION = 0.5;  // 금속 발과 천 사이 (고무 발끝은 조금 더 높게)
  const clawColliders = new Set();
  const reelBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(HOME.x, REEL_Y, HOME.z));
  const hubBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(HOME.x, TOP_Y, HOME.z)
    .setLinearDamping(0.4).setAngularDamping(1.5).setCanSleep(false).setCcdEnabled(true));
  const hubCol = world.createCollider(RAPIER.ColliderDesc.cylinder(0.028, 0.032).setDensity(1600).setFriction(0.6), hubBody);
  clawColliders.add(hubCol.handle);
  // 줄: 길이를 바꿀 때마다 밧줄 관절을 새로 건다 (윈치)
  let rope = null, ropeLen = -1;
  function setRope(len) {
    if (Math.abs(len - ropeLen) < 0.0004) return;
    if (rope) world.removeImpulseJoint(rope, true);
    rope = world.createImpulseJoint(RAPIER.JointData.rope(len, { x: 0, y: 0, z: 0 }, { x: 0, y: HUB_TOP, z: 0 }), reelBody, hubBody, true);
    rope.setContactsEnabled(false);
    ropeLen = len;
  }
  setRope(S_TOP);

  const prongs = [];
  for (let i = 0; i < 3; i++) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, i * (Math.PI * 2 / 3) + Math.PI / 2);
    const tangent = Z_AXIS.clone().applyQuaternion(yaw);
    const hinge = new THREE.Vector3(PR.rh, PR.hy, 0).applyQuaternion(yaw);
    const q0 = new THREE.Quaternion().setFromAxisAngle(tangent, OPEN);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(HOME.x + hinge.x, TOP_Y + hinge.y, HOME.z + hinge.z).setRotation(q0)
      .setAngularDamping(0.5).setCanSleep(false).setCcdEnabled(true));
    const sb = Math.sin(PR.beta), cb = Math.cos(PR.beta);
    const place = (desc, t, r) => {
      const tt = new THREE.Vector3(...t).applyQuaternion(yaw);
      const rr = yaw.clone().multiply(r || new THREE.Quaternion());
      return desc.setTranslation(tt.x, tt.y, tt.z).setRotation(rr).setDensity(2500);
    };
    const cols = [
      world.createCollider(place(RAPIER.ColliderDesc.capsule(PR.L1 / 2, PR.r1), [0, -PR.L1 / 2, 0]).setFriction(PRONG_FRICTION).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body),
      world.createCollider(place(RAPIER.ColliderDesc.capsule(PR.L2 / 2, PR.r2), [-sb * PR.L2 / 2, -PR.L1 - cb * PR.L2 / 2, 0],
        new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -PR.beta)).setFriction(PRONG_FRICTION).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body),
      world.createCollider(place(RAPIER.ColliderDesc.ball(PR.tip), [-sb * PR.L2, -PR.L1 - cb * PR.L2, 0]).setFriction(PRONG_FRICTION + 0.1).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body),
    ];
    cols.forEach((c) => clawColliders.add(c.handle));
    const joint = world.createImpulseJoint(RAPIER.JointData.revolute(hinge, { x: 0, y: 0, z: 0 }, tangent), hubBody, body, true);
    joint.setContactsEnabled(false);
    joint.setLimits(CLOSE_LIMIT, OPEN_LIMIT);
    joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    prongs.push({ body, cols, joint, yaw, tangent });
  }
  function setProngMotor(target, stiffness) {
    for (const p of prongs) p.joint.configureMotorPosition(target, stiffness, stiffness * 0.08);
  }
  setProngMotor(OPEN, 1.0);

  const claw = {
    x: HOME.x, z: HOME.z, vx: 0, vz: 0, s: S_TOP,
    mode: 'ready', t: 0, timer: PLAY_TIME,
    hubPos: new THREE.Vector3(HOME.x, TOP_Y, HOME.z), hubQ: new THREE.Quaternion(),
  };
  const _q1 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function readClaw() {
    const t = hubBody.translation(), r = hubBody.rotation();
    claw.hubPos.set(t.x, t.y, t.z); claw.hubQ.set(r.x, r.y, r.z, r.w);
  }
  // 실제 줄 길이 (도르래 → 몸체의 줄 묶인 곳). 설정 길이보다 짧으면 줄이 느슨한 것
  function cableLength() {
    const rp = reelBody.translation();
    const top = _v1.set(0, HUB_TOP, 0).applyQuaternion(claw.hubQ).add(claw.hubPos);
    return Math.hypot(top.x - rp.x, top.y - rp.y, top.z - rp.z);
  }
  // 발이 몸체 기준으로 벌어진 각도 (화면 연출용)
  function prongAngle(p) {
    const hr = hubBody.rotation(), pr = p.body.rotation();
    const rel = new THREE.Quaternion(hr.x, hr.y, hr.z, hr.w).invert().multiply(new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w));
    const s = new THREE.Vector3(rel.x, rel.y, rel.z).dot(p.tangent);
    return 2 * Math.atan2(s, rel.w);
  }
  function pushClawKinematics() {
    reelBody.setNextKinematicTranslation({ x: claw.x, y: REEL_Y, z: claw.z });
    setRope(claw.s);
  }

  // ------------------------------------------------------------------ 인형
  const loader = new GLTFLoader();
  // 텍스처를 fetch(ImageBitmapLoader) 대신 <img>로 읽는다.
  // 공유 페이지처럼 fetch가 제한된 환경에서도 내장 텍스처(blob: URL)를 안전하게 불러오기 위함.
  loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'img-textures' }; });
  function withTimeout(promise, ms, label) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: ${ms / 1000}초 안에 로드되지 않음`)), ms))]);
  }
  // 메시 정점을 높이 3구간(겹침 포함)으로 나눠 구간마다 볼록 껍질을 만든다.
  // 목처럼 오목한 부분을 살리고, 집게 발이 실제 인형 표면에 닿게 된다. 표면보다 1.5mm 안쪽으로 줄여 천이 살짝 눌리는 느낌.
  function buildHulls(root) {
    const pts = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 6000));
      for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(v.clone()); }
    });
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const bands = 3, hgt = y1 - y0, overlap = hgt * 0.08;
    const sets = [];
    for (let b = 0; b < bands; b++) {
      const lo = y0 + hgt * b / bands - overlap, hi = y0 + hgt * (b + 1) / bands + overlap;
      const band = pts.filter((p) => p.y >= lo && p.y <= hi);
      if (band.length < 8) continue;
      const c = band.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(band.length);
      const arr = new Float32Array(band.length * 3);
      band.forEach((p, i) => {
        const d = p.clone().sub(c), len = d.length();
        if (len > 0.002) d.multiplyScalar((len - 0.0015) / len);
        arr[i * 3] = c.x + d.x; arr[i * 3 + 1] = c.y + d.y; arr[i * 3 + 2] = c.z + d.z;
      });
      sets.push(arr);
    }
    const fallbackR = Math.max(0.02, hgt * 0.35);
    return () => {
      const out = sets.map((arr) => RAPIER.ColliderDesc.convexHull(arr)).filter(Boolean);
      return out.length ? out : [RAPIER.ColliderDesc.ball(fallbackR).setTranslation(0, fallbackR, 0)];
    };
  }
  setLoading('인형 모델 불러오는 중…');
  // 한 파일짜리 index.html은 모델을 페이지 안에 담아 두고(window.EMBEDDED_MANIFEST), 그 외에는 파일에서 읽는다
  const manifest = plushes;
  let loadedCount = 0;
  const TYPES = {};
  await Promise.all(manifest.map(async (m) => {
    let gltf;
    gltf = await withTimeout(loader.loadAsync(m.file), 25000, m.id);
    if (disposed) return;
    setLoading(`인형 모델 불러오는 중… ${++loadedCount} / ${manifest.length}`);
    const root = gltf.scene.children.find((c) => c.userData?.plush) || gltf.scene;
    root.updateMatrixWorld(true);
    if (!root.userData?.plush) {
      // 외부 GLB(예: Tripo 생성 모델) → 가장 긴 변을 목표 크기로 맞추고 바닥 중앙을 원점으로
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      root.scale.multiplyScalar((m.size || 0.15) / Math.max(size.x, size.y, size.z)); root.updateMatrixWorld(true);
      box.setFromObject(root);
      root.position.x -= (box.min.x + box.max.x) / 2; root.position.y -= box.min.y; root.position.z -= (box.min.z + box.max.z) / 2;
      root.updateMatrixWorld(true);
    }
    const hulls = buildHulls(root);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mat = o.material;
      if (!root.userData?.plush) {
        // 스캔/생성형 모델: 천 느낌이 나도록 광택을 죽이고 원단 결을 더한다
        mat.metalness = 0; mat.roughness = Math.max(mat.roughness ?? 1, 0.8);
        if (!mat.normalMap) { mat.normalMap = FABRIC_NORMAL; mat.normalScale = new THREE.Vector2(0.3, 0.3); }
        mat.needsUpdate = true;
      } else if (mat.userData?.fabric || (mat.sheen > 0 && !mat.clearcoat)) {
        mat.normalMap = FABRIC_NORMAL; mat.normalScale = new THREE.Vector2(0.45, 0.45); mat.needsUpdate = true;
      }
    });
    const wrap = new THREE.Group(); wrap.add(root);
    const bb = new THREE.Box3().setFromObject(wrap).getSize(new THREE.Vector3());
    TYPES[m.id] = { ...m, proto: wrap, hulls, reach: Math.max(bb.x, bb.y, bb.z) * 0.9 };
  }));
  performance.mark('models-loaded');
  const TYPE_IDS = manifest.map((m) => m.id);

  // ------------------------------------------------------------------ 말랑 변형 (소프트 바디 느낌)
  // 강체 물리는 그대로 두고, 화면에서만 메시를 변형한다.
  //  - 처짐: 집히면 잡힌 지점에서 멀수록 중력 방향으로 늘어짐
  //  - 출렁임: 가감속에 반응하는 스프링 변위 (잡힌 지점/중심에서 멀수록 크게)
  //  - 눌림: 바닥에 부딪히면 중력 축으로 납작해졌다 복원
  const SOFT_CHUNK = `
    vec3 sd = position - uAnchor;
    float sw = clamp(length(sd) * uScale / uReach, 0.0, 1.4);
    sw *= sw;
    transformed += (uSag + uWobble) * sw;
    vec3 sc = position - uCenter;
    float sal = dot(sc, uGravN);
    transformed += uGravN * (sal * -uSquash) + (sc - uGravN * sal) * (uSquash * 0.5);
  `;
  function makeSoft(root) {
    const list = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      const u = {
        uAnchor: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() },
        uSag: { value: new THREE.Vector3() }, uWobble: { value: new THREE.Vector3() },
        uGravN: { value: new THREE.Vector3(0, -1, 0) }, uSquash: { value: 0 },
        uScale: { value: 1 }, uReach: { value: 0.1 },
      };
      o.material.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uAnchor, uCenter, uSag, uWobble, uGravN; uniform float uSquash, uScale, uReach;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>' + SOFT_CHUNK);
      };
      o.material.customProgramCacheKey = () => 'soft-plush';
      list.push({ mesh: o, u });
    });
    return list;
  }
  function newSoftState() {
    return { prev: null, vel: new THREE.Vector3(), wob: new THREE.Vector3(), wobV: new THREE.Vector3(), sq: 0, sqV: 0, sag: 0, anchor: null };
  }
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3(), _sInv = new THREE.Matrix4(), _sN = new THREE.Matrix3();
  const GRAV = new THREE.Vector3(0, -1, 0);
  function updateSoft(p, dt) {
    const S = p.soft;
    const t = p.body.translation();
    const pos = _sa.set(t.x, t.y, t.z);
    if (!S.prev) { S.prev = pos.clone(); return; }
    // 속도/가속도 (순간이동 등 튀는 값은 잘라낸다)
    const v = _sb.copy(pos).sub(S.prev).divideScalar(dt);
    if (v.length() > 3) v.set(0, 0, 0);
    const acc = _sc.copy(v).sub(S.vel).divideScalar(dt).clampLength(0, 40);
    S.vel.copy(v); S.prev.copy(pos);
    // 출렁임 스프링 (가속 반대 방향으로 늦게 따라옴)
    S.wobV.addScaledVector(S.wob, -170 * dt).addScaledVector(S.wobV, -8 * dt).addScaledVector(acc, -0.9 * dt);
    S.wob.addScaledVector(S.wobV, dt).clampLength(0, 0.016);
    // 눌림 스프링 (위로 향하는 가속 = 바닥 충돌 → 납작)
    const up = -acc.dot(GRAV);
    S.sqV += (-320 * S.sq - 13 * S.sqV + Math.max(0, up) * 0.012) * dt;
    S.sq = THREE.MathUtils.clamp(S.sq + S.sqV * dt, -0.12, 0.22);
    // 처짐
    const held = !!p.lifted;
    // 쥐어진 순간 집게가 잡은 위치를 인형 기준 좌표로 기억
    if (held && !S.anchor) S.anchor = new THREE.Vector3(0, -0.05, 0).applyQuaternion(claw.hubQ).add(claw.hubPos).applyMatrix4(new THREE.Matrix4().copy(p.mesh.matrixWorld).invert());
    if (!held && S.sag < 0.02) S.anchor = null;
    S.sag = THREE.MathUtils.lerp(S.sag, held ? 1 : 0, Math.min(1, dt * (held ? 5 : 8)));
    const idle = S.wob.lengthSq() < 1e-9 && Math.abs(S.sq) < 1e-4 && S.sag < 1e-3;
    if (idle && p.softIdle) return;
    p.softIdle = idle;
    // 기준점: 잡혔으면 집게가 쥔 곳, 아니면 무게중심
    const com = p.body.worldCom?.() ?? t;
    const anchorW = held && S.anchor ? S.anchor.clone().applyMatrix4(p.mesh.matrixWorld) : new THREE.Vector3(com.x, com.y, com.z);
    const comW = new THREE.Vector3(com.x, com.y, com.z);
    const sagW = GRAV.clone().multiplyScalar(0.02 * S.sag);
    const reach = TYPES[p.type].reach;
    for (const { mesh, u } of p.softMeshes) {
      _sInv.copy(mesh.matrixWorld).invert();
      _sN.setFromMatrix4(_sInv);
      u.uAnchor.value.copy(anchorW).applyMatrix4(_sInv);
      u.uCenter.value.copy(comW).applyMatrix4(_sInv);
      u.uSag.value.copy(sagW).applyMatrix3(_sN);
      u.uWobble.value.copy(S.wob).applyMatrix3(_sN);
      u.uGravN.value.copy(GRAV).applyMatrix3(_sN).normalize();
      u.uSquash.value = S.sq;
      u.uScale.value = mesh.matrixWorld.getMaxScaleOnAxis();
      u.uReach.value = reach;
    }
  }

  const plushBodies = [];
  const byCollider = new Map();
  function spawnPlush(typeId, x, y, z) {
    const T = TYPES[typeId];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.4, 0.4), rand(0, Math.PI * 2), rand(-0.4, 0.4)));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q)
      .setLinearDamping(0.35).setAngularDamping(1.6).setCanSleep(true).setCcdEnabled(true));
    const mesh = T.proto.clone(true);
    const softMeshes = LOW ? [] : makeSoft(mesh);
    const p = { type: typeId, body, mesh, softMeshes, cols: [], won: false, wonAt: 0, stuck: 0, soft: newSoftState() };
    for (const desc of T.hulls()) {
      const col = world.createCollider(desc.setDensity(90).setFriction(1.0).setRestitution(0.08), body);
      p.cols.push(col); byCollider.set(col.handle, p);
    }
    scene.add(mesh);
    plushBodies.push(p);
    return p;
  }
  function removePlush(p) {
    p.cols.forEach((c) => byCollider.delete(c.handle));
    world.removeRigidBody(p.body);
    scene.remove(p.mesh);
    plushBodies.splice(plushBodies.indexOf(p), 1);
  }
  function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function randomSpot() {
    for (;;) {
      const x = rand(X0 + 0.07, X1 - 0.07), z = rand(Z0 + 0.07, Z1 - 0.07);
      if (x < CHUTE.x1 + 0.07 && z > CHUTE.z0 - 0.07) continue;
      return [x, z];
    }
  }
  function fillMachine(count, y0 = 0.12, dy = 0.14) {
    let bag = [];
    for (let i = 0; i < count; i++) {
      if (!bag.length) bag = shuffled(TYPE_IDS);
      const [x, z] = randomSpot();
      spawnPlush(bag.pop(), x, y0 + Math.floor(i / 7) * dy + rand(0, 0.04), z);
    }
  }
  performance.mark('hulls-start');
  fillMachine(26);
  performance.mark('spawned');
  // 처음 화면이 열리기 전에 더미가 자리를 잡게 미리 시뮬레이션
  pushClawKinematics();
  for (let i = 0; i < 360; i++) { pushClawKinematics(); world.step(); }
  readClaw();
  performance.mark('presim-done');

  // ------------------------------------------------------------------ 썸네일 (도감용)
  const THUMBS = {};
  {
    const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    tr.setSize(160, 160); tr.outputColorSpace = THREE.SRGBColorSpace; tr.toneMapping = THREE.ACESFilmicToneMapping;
    const ts = new THREE.Scene();
    ts.environment = new THREE.PMREMGenerator(tr).fromScene(new RoomEnvironment(), 0.04).texture;
    ts.environmentIntensity = 0.7;
    const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 3); ts.add(dl, new THREE.AmbientLight(0xffffff, 0.4));
    const tc = new THREE.PerspectiveCamera(30, 1, 0.01, 5);
    for (const id of TYPE_IDS) {
      const m = TYPES[id].proto.clone(true);
      m.rotation.y = -0.45;
      ts.add(m);
      const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const r = Math.max(s.x, s.y, s.z);
      tc.position.set(c.x, c.y + r * 0.35, c.z + r * 2.1); tc.lookAt(c);
      tr.render(ts, tc);
      THUMBS[id] = tr.domElement.toDataURL('image/png');
      ts.remove(m);
    }
    tr.dispose();
  }

  // ------------------------------------------------------------------ 화면에 알리기
  // 예전에는 여기서 DOM 을 직접 고쳤다. 이제 화면(React)이 이 알림을 받아 그린다.
  const renderHud = () => emit({ type: 'state', mode: claw.mode, timer: claw.mode === 'play' ? Math.ceil(claw.timer) : PLAY_TIME, view: state.view, difficulty: state.diff });
  const toast = (msg) => emit({ type: 'toast', message: msg });

  // ------------------------------------------------------------------ 사운드 (WebAudio 합성)
  let actx = null;
  function tone(freq, dur = 0.12, { type = 'square', vol = 0.05, slide = 0, delay = 0 } = {}) {
    if (!state.sound) return;
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();  // iOS: 터치 후에만 소리가 난다
      const t = actx.currentTime + delay;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch { /* 오디오 불가 */ }
  }
  const sfx = {
    coin: () => { tone(988, 0.08, { type: 'square' }); tone(1319, 0.2, { type: 'square', delay: 0.08 }); },
    drop: () => tone(660, 0.9, { type: 'triangle', slide: -380, vol: 0.06 }),
    grab: () => { tone(140, 0.08, { type: 'square', vol: 0.08 }); tone(220, 0.06, { delay: 0.05, vol: 0.05 }); },
    rise: () => tone(260, 1.2, { type: 'triangle', slide: 260, vol: 0.04 }),
    slip: () => { tone(520, 0.25, { type: 'sawtooth', slide: -260, vol: 0.04 }); tone(390, 0.4, { type: 'sawtooth', slide: -250, vol: 0.04, delay: 0.25 }); },
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.05, delay: i * 0.09 })),
    tick: () => tone(1200, 0.04, { type: 'square', vol: 0.025 }),
    right: () => { tone(784, 0.1, { type: 'triangle', vol: 0.08 }); tone(1175, 0.18, { type: 'triangle', vol: 0.08, delay: 0.09 }); },
    wrong: () => tone(220, 0.22, { type: 'sawtooth', slide: -60, vol: 0.035 }),
    fanfare: () => [523, 659, 784, 1047, 1319, 1568, 1319, 1568].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.05, delay: i * 0.11 })),
    end: () => [784, 659, 523, 659, 784].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.07, delay: i * 0.14 })),
  };

  // ------------------------------------------------------------------ 입력
  const input = { l: false, r: false, u: false, d: false };
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  const isTyping = (target) => target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  listen(window, 'keydown', (e) => {
    // 문제를 풀거나 글을 쓰는 중에는 게임 조작을 받지 않는다
    if (isTyping(e.target) || claw.mode === 'ready') return;
    if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
    else if (e.code === 'Space') { pressDrop(); e.preventDefault(); }
    else if (e.code === 'KeyC') toggleView();
  });
  listen(window, 'keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
  listen(window, 'blur', () => { for (const k in input) input[k] = false; });
  // iOS 사파리: 두 손가락 핀치가 페이지 확대로 새지 않게
  listen(container, 'gesturestart', (e) => e.preventDefault());
  const VIEW_ORDER = ['front', 'side', 'top'];
  function setView(name) {
    if (!VIEWS[name]) return;
    state.view = name;
    Object.assign(orbit.goal, VIEWS[name]);
    // 가까운 방향으로 돌도록 방위각을 현재 값 근처로 맞춘다
    orbit.goal.az += Math.round((orbit.az - orbit.goal.az) / (Math.PI * 2)) * Math.PI * 2;
    renderHud();
  }
  function toggleView() { setView(VIEW_ORDER[(VIEW_ORDER.indexOf(state.view) + 1) % VIEW_ORDER.length]); }

  // 드래그 회전 / 휠·핀치 확대
  {
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map();
    let pinch0 = 0, r0 = 0;
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); r0 = orbit.goal.r; }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        orbit.goal.az -= (e.clientX - p.x) * 0.0065;
        orbit.goal.pol = THREE.MathUtils.clamp(orbit.goal.pol - (e.clientY - p.y) * 0.0065, POL_MIN, POL_MAX);
        state.view = 'free'; renderHud();
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) orbit.goal.r = THREE.MathUtils.clamp(r0 * pinch0 / d, R_MIN, R_MAX);
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.goal.r = THREE.MathUtils.clamp(orbit.goal.r * Math.exp(e.deltaY * 0.001), R_MIN, R_MAX);
    }, { passive: false });
    el.addEventListener('dblclick', () => setView('front'));
  }

  // 코인을 넣은 뒤 화면이 부른다. 코인이 있는지는 엔진이 아니라 부르는 쪽(나중에는 서버)이 판단한다.
  let roundWins = [];
  // 코인을 넣은 판 안에서 떨어진 인형만 상품이 된다. 더미가 자리 잡거나 보충될 때 저절로 굴러 떨어진 것은
  // 상품이 아니다(원본 게임은 이것도 셌다 — 2026-10-01 시제품에서 코인 없이 상품이 나왔다).
  let roundActive = false;
  function startRound() {
    if (claw.mode !== 'ready') return false;
    roundWins = [];
    roundActive = true;
    claw.mode = 'play'; claw.timer = PLAY_TIME;
    sfx.coin(); renderHud();
    return true;
  }
  function pressDrop() {
    if (claw.mode === 'play') startDrop();
  }
  function startDrop() {
    claw.mode = 'down'; claw.t = 0;
    sfx.drop(); renderHud();
  }

  // ------------------------------------------------------------------ 접촉 판정
  function touching(col, maxDist = 0.003) {
    const hits = new Set();
    world.contactPairsWith(col, (other) => {
      const p = byCollider.get(other.handle);
      if (!p || p.won) return;
      world.contactPair(col, other, (m) => {
        for (let k = 0; k < m.numContacts(); k++) if (m.contactDist(k) < maxDist) { hits.add(p); break; }
      });
    });
    return hits;
  }
  function plushCenter(p) { const c = p.body.worldCom?.() ?? p.body.translation(); return new THREE.Vector3(c.x, c.y, c.z); }
  // 발 두 개 이상에 닿아 있고 바닥에서 떠 있는 인형 = 지금 집게에 쥐어진 인형 (연출·통계용일 뿐 물리에는 개입하지 않음)
  function gripped() {
    const counts = new Map();
    for (const pr of prongs) {
      const set = new Set();
      pr.cols.forEach((c) => touching(c, 0.004).forEach((p) => set.add(p)));
      set.forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
    }
    const out = [];
    for (const [p, n] of counts) if (n >= 2) out.push(p);
    return out;
  }

  // ------------------------------------------------------------------ 게임 로직 (고정 스텝)
  function moveToward(tx, tz, speed, dt) {
    const dx = tx - claw.x, dz = tz - claw.z, d = Math.hypot(dx, dz);
    const tvx = d > 0.002 ? dx / d * Math.min(speed, d * 5) : 0, tvz = d > 0.002 ? dz / d * Math.min(speed, d * 5) : 0;
    return [tvx, tvz, d];
  }
  function step(dt) {
    let tvx = 0, tvz = 0;
    const diff = DIFF[state.diff];

    switch (claw.mode) {
      case 'play': {
        claw.timer -= dt;
        const ix = (input.r ? 1 : 0) - (input.l ? 1 : 0), iy = (input.u ? 1 : 0) - (input.d ? 1 : 0);
        if (ix || iy) {
          // 카메라 기준 방향으로 이동
          const fwd = new THREE.Vector3(-Math.sin(orbit.az), 0, -Math.cos(orbit.az));
          const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
          const v = right.multiplyScalar(ix).addScaledVector(fwd, iy);
          if (v.lengthSq() > 1) v.normalize();
          tvx = v.x * MOVE_SPEED; tvz = v.z * MOVE_SPEED;
        }
        if (claw.timer <= 0) { claw.timer = 0; startDrop(); }
        break;
      }
      case 'down': {
        // 윈치로 줄을 푼다. 몸체나 발이 인형·벽·바닥에 걸려 줄이 느슨해지면 멈춘다 (실제 기계의 줄 감지 방식)
        claw.t += dt;
        claw.s = Math.min(S_MAX, claw.s + DROP_SPEED * dt);
        const slack = claw.s - cableLength();
        if ((claw.t > 0.3 && slack > 0.018) || (claw.s >= S_MAX && slack > -0.01) || claw.t > 5) {
          claw.s = cableLength() + 0.004;
          claw.mode = 'close'; claw.t = 0;
          setProngMotor(CLOSE_TARGET, diff.grip);
          sfx.grab();
        }
        break;
      }
      case 'close': {
        claw.t += dt;
        if (claw.t > 0.8) { claw.mode = 'up'; claw.t = 0; sfx.rise(); }
        break;
      }
      case 'up': {
        claw.s = Math.max(S_TOP, claw.s - RISE_SPEED * dt);
        if (claw.s <= S_TOP) {
          claw.t += dt;
          // 꼭대기에서 전압이 떨어지며 집게 힘이 약해진다
          if (claw.t > 0.3 && !claw.weak) { claw.weak = true; setProngMotor(deg(diff.hold), diff.weak); }
          if (claw.t > 0.7) { claw.mode = 'return'; claw.t = 0; }
        }
        break;
      }
      case 'return': {
        claw.t += dt;
        const [vx, vz, d] = moveToward(HOME.x, HOME.z, RETURN_SPEED, dt);
        tvx = vx; tvz = vz;
        if (d < 0.004 && Math.hypot(claw.vx, claw.vz) < 0.02 && claw.t > 0.5) { claw.mode = 'release'; claw.t = 0; setProngMotor(OPEN, 1.0); }
        break;
      }
      case 'release': {
        claw.t += dt;
        if (claw.t > 1.3) {
          claw.mode = 'ready'; claw.weak = false; renderHud(); maybeRefill();
          roundActive = false;
          emit({ type: 'roundEnd', won: roundWins.slice() });
        }
        break;
      }
      default: break; // ready
    }

    // 레일 도르래 이동 (가감속) — 흔들림은 물리 엔진이 만든다
    const k = Math.min(1, dt * 7);
    claw.vx += (tvx - claw.vx) * k; claw.vz += (tvz - claw.vz) * k;
    claw.x = THREE.MathUtils.clamp(claw.x + claw.vx * dt, LIM.x0, LIM.x1);
    claw.z = THREE.MathUtils.clamp(claw.z + claw.vz * dt, LIM.z0, LIM.z1);

    pushClawKinematics();
    world.step();
    readClaw();

    if (++stepCount % 20 === 0) unstick();
    if (spawnQueue.length && stepCount % 9 === 0) { const [x, z] = randomSpot(); spawnPlush(spawnQueue.pop(), x, 0.52, z); }
    if (stepCount % 4 === 0) { const g = new Set(claw.mode === 'up' || claw.mode === 'return' || claw.mode === 'close' ? gripped() : []); for (const p of plushBodies) p.lifted = g.has(p); }

    // 배출구 통과 판정
    const now = performance.now();
    for (const p of plushBodies.slice()) {
      const t = p.body.translation();
      if (!p.won && t.y < -0.03 && t.x < CHUTE.x1 && t.z > CHUTE.z0) {  // 배출구 바닥선 아래로 들어가면 획득
        p.won = true; p.wonAt = now;
        if (roundActive) {
          roundWins.push(p.type);
          sfx.win();
          emit({ type: 'won', plushId: p.type, thumb: THUMBS[p.type] });
        }
      }
      if (p.won && now - p.wonAt > 1600) removePlush(p);
      else if (t.y < -1.5 || Math.abs(t.x) > 2 || Math.abs(t.z) > 2) removePlush(p);
    }
  }
  let stepCount = 0;
  function penetration(p) {
    let worst = 0;
    for (const col of p.cols) {
      world.contactPairsWith(col, (o) => {
        if (o.parent()?.handle !== fixedBody.handle) return;
        world.contactPair(col, o, (m) => { for (let k = 0; k < m.numContacts(); k++) worst = Math.min(worst, m.contactDist(k)); });
      });
    }
    return worst;
  }
  function unstick() {
    for (const p of plushBodies) {
      if (p.won || !p.body.isDynamic() || p.lifted) continue;  // 집게에 쥐어진 인형은 물리에 맡긴다
      const t = p.body.translation(), v = p.body.linvel();
      const pen = penetration(p);
      // 벽에 박혔거나, 가림막 위에 걸쳐서 떨고 있는 경우
      const onGuard = t.y > 0.07 && t.y < 0.2 && Math.abs(t.x - CHUTE.x1) < 0.03 && t.z > CHUTE.z0 - 0.03
        || (t.y > 0.07 && t.y < 0.2 && Math.abs(t.z - CHUTE.z0) < 0.03 && t.x < CHUTE.x1 + 0.03);
      const jitter = Math.hypot(v.x, v.y, v.z) > 0.02 && Math.hypot(v.x, v.y, v.z) < 0.25;
      p.stuck = pen < -0.01 || (onGuard && jitter) ? p.stuck + 1 : 0;
      if (p.stuck >= 6) {
        // 가까운 쪽(배출구 안 또는 놀이 영역)으로 살짝 들어 옮긴다
        const inChute = t.x < CHUTE.x1 && t.z > CHUTE.z0;
        let nx = t.x, nz = t.z;
        if (inChute) { nx = Math.min(t.x, CHUTE.x1 - 0.07); nz = Math.max(t.z, CHUTE.z0 + 0.07); }
        else if (t.z > CHUTE.z0) nx = Math.max(t.x, CHUTE.x1 + 0.07);   // 옆 가림막에 걸림
        else if (t.x < CHUTE.x1) nz = Math.min(t.z, CHUTE.z0 - 0.07);   // 뒤 가림막에 걸림
        p.body.setTranslation({ x: THREE.MathUtils.clamp(nx, X0 + 0.07, X1 - 0.07), y: t.y + 0.05, z: THREE.MathUtils.clamp(nz, Z0 + 0.07, Z1 - 0.07) }, true);
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        p.stuck = 0;
      }
    }
  }
  const spawnQueue = [];
  function maybeRefill() {
    if (spawnQueue.length) return;
    const inside = plushBodies.filter((p) => !p.won).length;
    if (inside < 15) {
      const n = 26 - inside;
      let bag = shuffled(TYPE_IDS);
      for (let i = 0; i < n; i++) {
        if (!bag.length) bag = shuffled(TYPE_IDS);
        spawnQueue.push(bag.pop());
      }
      toast('인형 보충!');
    }
  }

  // ------------------------------------------------------------------ 화면 동기화
  const _up = new THREE.Vector3();
  function syncVisuals(time, dt) {
    for (const p of plushBodies) {
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z); p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      p.squish = THREE.MathUtils.lerp(p.squish || 0, p.lifted ? 1 : 0, 0.15);
      p.mesh.scale.set(1 - 0.045 * p.squish, 1 + 0.035 * p.squish, 1 - 0.045 * p.squish);
      p.mesh.updateMatrixWorld(true);
      if (dt > 0) updateSoft(p, Math.min(dt, 1 / 30));
    }
    clawVis.hub.position.copy(claw.hubPos); clawVis.hub.quaternion.copy(claw.hubQ);
    const closeT = THREE.MathUtils.clamp((OPEN - prongAngle(prongs[0])) / (OPEN - CLOSE_LIMIT), 0, 1);
    clawVis.plunger.position.y = -0.028 - closeT * 0.012;
    const pl = _up.set(0, -0.036 - closeT * 0.012, 0).applyQuaternion(claw.hubQ).add(claw.hubPos).clone();
    prongs.forEach((p, i) => {
      const g = clawVis.prongs[i];
      const t = p.body.translation(), r = p.body.rotation();
      g.position.set(t.x, t.y, t.z);
      g.quaternion.set(r.x, r.y, r.z, r.w).multiply(p.yaw);
      const a = new THREE.Vector3(0.003, -0.03, 0).applyQuaternion(g.quaternion).add(g.position);
      const link = clawVis.links[i];
      link.position.copy(a).add(pl).multiplyScalar(0.5);
      link.scale.set(1, a.distanceTo(pl), 1);
      link.quaternion.setFromUnitVectors(Y_AXIS, a.sub(pl).normalize());
    });
    const top = new THREE.Vector3(claw.x, REEL_Y, claw.z);
    clawVis.trolley.position.set(claw.x, RAIL_Y + 0.004, claw.z);
    clawVis.bridge.position.x = claw.x;
    const cableEnd = _up.set(0, HUB_TOP, 0).applyQuaternion(claw.hubQ).add(claw.hubPos);
    const mid = top.clone().add(cableEnd).multiplyScalar(0.5);
    clawVis.cable.position.copy(mid);
    clawVis.cable.scale.set(1, top.distanceTo(cableEnd), 1);
    clawVis.cable.quaternion.setFromUnitVectors(Y_AXIS, top.clone().sub(cableEnd).normalize());
    clawSpot.position.set(claw.x, RAIL_Y - 0.02, claw.z);
    clawSpot.target.position.set(claw.hubPos.x, 0, claw.hubPos.z);
    // 조작부
    const ix = (input.r ? 1 : 0) - (input.l ? 1 : 0), iy = (input.u ? 1 : 0) - (input.d ? 1 : 0);
    const live = claw.mode === 'play';
    machine.stick.rotation.z = THREE.MathUtils.lerp(machine.stick.rotation.z, live ? -ix * 0.4 : 0, 0.3);
    machine.stick.rotation.x = THREE.MathUtils.lerp(machine.stick.rotation.x, live ? -iy * 0.4 : 0, 0.3);
    machine.btn.position.y = THREE.MathUtils.lerp(machine.btn.position.y, claw.mode === 'down' ? 0.038 : 0.046, 0.3);
    // 전구 체이스
    const chase = claw.mode === 'ready' ? time * 6 : time * 14;
    for (const b of bulbs) b.mat.emissiveIntensity = ((b.i + Math.floor(chase)) % 3 === 0) ? 2.4 : 0.35;
    inner.intensity = 0.9 + (claw.mode === 'play' ? 0.1 * Math.sin(time * 8) : 0);
  }

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // 세로 화면에서도 기계 전체 폭이 보이도록 화각 보정
    const hfov = 2 * Math.atan(Math.tan(deg(38) / 2) * camera.aspect);
    const need = 2 * Math.atan(0.5 / 1.6);
    camera.fov = hfov < need ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(need / 2) / camera.aspect)) : 38;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let last = performance.now(), acc = 0, lastSec = -1, rafId = 0;
  // 성능 측정(학교 태블릿 점검용): 최근 1초의 화면 수와 물리 계산 시간.
  const perf = { fps: 0, stepMs: 0, frames: 0, stepTotal: 0, since: performance.now() };
  function frame(now) {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt;
    let n = 0;
    const stepStart = performance.now();
    while (acc >= 1 / 60 && n < 5) { step(1 / 60); acc -= 1 / 60; n++; }
    perf.stepTotal += performance.now() - stepStart; perf.frames++;
    if (now - perf.since >= 1000) {
      perf.fps = Math.round(perf.frames * 1000 / (now - perf.since));
      perf.stepMs = Math.round(perf.stepTotal / perf.frames * 10) / 10;
      perf.frames = 0; perf.stepTotal = 0; perf.since = now;
      emit({ type: 'perf', fps: perf.fps, stepMs: perf.stepMs });
    }
    if (n === 5) acc = 0;
    const ease = Math.min(1, dt * 7);
    orbit.az += (orbit.goal.az - orbit.az) * ease;
    orbit.pol += (orbit.goal.pol - orbit.pol) * ease;
    orbit.r += (orbit.goal.r - orbit.r) * ease;
    const rr = orbit.r * (camera.aspect < 0.8 && orbit.pol > deg(40) ? 1 + 0.3 * Math.abs(Math.sin(orbit.az)) : 1);
    camTarget.copy(orbit.target);
    camPos.setFromSphericalCoords(rr, orbit.pol, orbit.az).add(camTarget);
    camera.position.copy(camPos);
    // 위에서 볼 때 화면 위쪽이 기계 뒤쪽이 되도록 up 벡터를 방위각에 맞춘다
    camera.up.set(-Math.sin(orbit.az) * Math.cos(orbit.pol), Math.sin(orbit.pol), -Math.cos(orbit.az) * Math.cos(orbit.pol)).normalize();
    camera.lookAt(camTarget);
    // 위에서 볼 때 지붕을 투명하게
    const fade = THREE.MathUtils.smoothstep(orbit.pol, deg(30), deg(55));
    roofMat.opacity = 0.08 + 0.92 * fade; roofMat.depthWrite = fade > 0.95;
    syncVisuals(now / 1000, dt);
    if (claw.mode === 'play') {
      const sec = Math.ceil(claw.timer);
      if (sec !== lastSec) { lastSec = sec; renderHud(); if (sec <= 5) sfx.tick(); }
    }
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  if (disposed) return null;
  renderHud();
  rafId = requestAnimationFrame(frame);
  performance.mark('claw-ready');

  return {
    thumbs: THUMBS,
    startRound,
    pressDrop,
    setInput(dir, on) { if (dir in input) input[dir] = Boolean(on); },
    setView,
    setDifficulty(next) { if (DIFF[next]) { state.diff = next; renderHud(); } },
    setSound(on) { state.sound = Boolean(on); },
    getMode: () => claw.mode,
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      cleanups.forEach((fn) => fn());
      try { actx?.close(); } catch { /* 이미 닫힘 */ }
      world.free();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
