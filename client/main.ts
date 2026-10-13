// 진입점 — 1인칭으로 돌아다니며 손이 닿는 표면(사거리 REACH)에 낙서한다.
// 모든 낙서는 Seg 로 만들어 내 화면에 바로 그리고, 서버로 보내 다른 참가자에게 중계한다.
import * as THREE from 'three';
import { PLAYER, REACH, stepBody, type Body } from '../shared/physics.ts';
import type { PlayerState, Seg, ServerMsg } from '../shared/protocol.ts';
import { buildWorld, solidBox, SPAWN } from '../shared/world.ts';
import { Avatar } from './avatar.ts';
import { parseLobbyLink } from './lobby-link.ts';
import { Net } from './net.ts';
import { BRUSH_SIZES, continuesStroke, hexColor, movedEnough, PALETTE, roundUv, type Uv } from './paint-math.ts';
import { paintableMesh, SurfaceRegistry, surfaceIdOf } from './surfaces.ts';

const MOUSE_SENS = 0.0022;
const THIRD_PERSON_DIST = 3.2;

const link = parseLobbyLink(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- 씬 -----------------------------------------------------------------------

const canvas = $<HTMLCanvasElement>('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c7e3);
scene.fog = new THREE.Fog(0xa9c7e3, 30, 70);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(6, 12, 4);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
camera.rotation.order = 'YXZ';

const registry = new SurfaceRegistry();
const world = buildWorld();
const worldMeshes: THREE.Mesh[] = [];
for (const o of world) {
  const mesh = paintableMesh(registry, o.id, o.shape, o.size, o.density, o.color);
  mesh.position.set(...o.center);
  scene.add(mesh);
  worldMeshes.push(mesh);
}
const solids = world.filter((o) => o.solid).map(solidBox);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- 상태 ---------------------------------------------------------------------

let body: Body = { pos: [...SPAWN], vel: [0, 0, 0], onGround: false };
let yaw = 0; // 0 이면 −z(기둥 쪽)를 본다
let pitch = 0;
let thirdPerson = false;

let color = PALETTE[0]!;
let brushIdx = 1;
let eraserMode = false; // E 로 켜면 좌클릭도 지우개
let drawing: 'paint' | 'erase' | null = null;
let prevPoint: { s: string; uv: Uv } | null = null;

let net: Net | null = null;
let myId: string | null = null;
const avatars = new Map<string, Avatar>();
let connection = '오프라인 (혼자 그리기)';

// --- 입력 ---------------------------------------------------------------------

const keys = new Set<string>();
const locked = () => document.pointerLockElement === canvas;

window.addEventListener('keydown', (e) => {
  if (!locked()) return;
  keys.add(e.code);
  const digit = /^Digit([1-8])$/.exec(e.code);
  if (digit) {
    color = PALETTE[Number(digit[1]) - 1]!;
    eraserMode = false;
  } else if (e.code === 'KeyE') eraserMode = !eraserMode;
  else if (e.code === 'KeyV') thirdPerson = !thirdPerson;
  else if (e.code === 'KeyQ') brushIdx = (brushIdx + 1) % BRUSH_SIZES.length;
  renderToolbar();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  drawing = null;
});

document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  yaw -= e.movementX * MOUSE_SENS;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * MOUSE_SENS));
});
canvas.addEventListener('mousedown', (e) => {
  if (!locked()) return;
  if (e.button === 0) drawing = eraserMode ? 'erase' : 'paint';
  else if (e.button === 2) drawing = 'erase';
  prevPoint = null;
});
window.addEventListener('mouseup', () => {
  drawing = null;
  prevPoint = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!locked()) return;
    brushIdx = Math.max(0, Math.min(BRUSH_SIZES.length - 1, brushIdx + (e.deltaY > 0 ? -1 : 1)));
    renderToolbar();
  },
  { passive: true },
);

// --- 시작 / 메뉴 오버레이 -----------------------------------------------------

const overlay = $('overlay');
const nameInput = $<HTMLInputElement>('ov-name');
const startBtn = $<HTMLButtonElement>('ov-start');
const returnLink = $<HTMLAnchorElement>('ov-return');

nameInput.value = link.name ?? safeGet('wb3d.name') ?? '';
if (link.returnUrl) {
  returnLink.href = link.returnUrl;
  returnLink.hidden = false;
}

startBtn.addEventListener('click', () => {
  if (!net) {
    const name = nameInput.value.trim() || `손님${Math.floor(Math.random() * 1000)}`;
    safeSet('wb3d.name', name);
    nameInput.disabled = true;
    connect(name);
  }
  void canvas.requestPointerLock();
});
canvas.addEventListener('click', () => {
  if (net && !locked()) void canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  overlay.classList.toggle('hidden', locked());
  if (!locked()) {
    keys.clear();
    drawing = null;
    $('ov-title').textContent = '일시정지';
    startBtn.textContent = '계속하기';
  }
});

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // 저장 못 해도 다음에 다시 입력하면 된다
  }
}

// --- 네트워크 -----------------------------------------------------------------

function connect(name: string) {
  connection = '접속 중…';
  net = new Net(link.room, name, onServer, () => {
    connection = '서버 연결 끊김 — 새로고침하면 다시 접속';
    for (const a of [...avatars.values()]) {
      if (a.id === myId) continue;
      a.dispose(registry);
      avatars.delete(a.id);
    }
  });
}

function onServer(m: ServerMsg) {
  switch (m.t) {
    case 'welcome':
      myId = m.id;
      connection = `방: ${link.room}`;
      for (const p of m.players) addAvatar(new Avatar(p, registry));
      for (const s of m.history) registry.apply(s);
      break;
    case 'join':
      addAvatar(new Avatar(m.player, registry));
      break;
    case 'leave':
      avatars.get(m.id)?.dispose(registry);
      avatars.delete(m.id);
      break;
    case 'state':
      avatars.get(m.id)?.setTarget(m.st);
      break;
    case 'paint':
      for (const s of m.segs) registry.apply(s);
      break;
  }
}

function addAvatar(a: Avatar) {
  avatars.get(a.id)?.dispose(registry);
  avatars.set(a.id, a);
  scene.add(a.group);
}

// --- 낙서 ---------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const crosshair = $('crosshair');

/** 화면 중앙이 가리키는 낙서면. 사거리는 카메라가 아니라 눈 위치에서 잰다 (3인칭에서도 같은 손 길이) */
function aim(eye: THREE.Vector3): { s: string; uv: Uv } | null {
  const targets: THREE.Object3D[] = [...worldMeshes];
  for (const a of avatars.values()) {
    if (a.id !== myId || thirdPerson) targets.push(...a.meshes);
  }
  raycaster.setFromCamera(center, camera);
  raycaster.far = THIRD_PERSON_DIST + REACH + 1;
  for (const hit of raycaster.intersectObjects(targets, false)) {
    if (hit.point.distanceTo(eye) > REACH) return null;
    const s = surfaceIdOf(hit);
    if (s && hit.uv) return { s, uv: roundUv([hit.uv.x, hit.uv.y]) };
    return null;
  }
  return null;
}

function paint(target: { s: string; uv: Uv } | null) {
  if (!drawing || !target) {
    prevPoint = null;
    return;
  }
  const surface = registry.get(target.s);
  if (!surface) return;
  const w = BRUSH_SIZES[brushIdx]!;
  let seg: Seg;
  if (continuesStroke(prevPoint, target.s, target.uv)) {
    if (!movedEnough(prevPoint!.uv, target.uv, surface.sizeM, w)) return;
    seg = { s: target.s, a: prevPoint!.uv, b: target.uv, c: color, w };
  } else {
    seg = { s: target.s, a: target.uv, b: target.uv, c: color, w };
  }
  if (drawing === 'erase') seg.e = 1;
  prevPoint = target;
  registry.apply(seg);
  net?.queuePaint(seg);
}

// --- HUD ----------------------------------------------------------------------

const toolbar = $('toolbar');
const status = $('status');

function renderToolbar() {
  toolbar.innerHTML = '';
  PALETTE.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = `swatch${c === color && !eraserMode ? ' on' : ''}`;
    sw.style.background = hexColor(c);
    sw.textContent = String(i + 1);
    toolbar.append(sw);
  });
  const tool = document.createElement('div');
  tool.id = 'tool';
  tool.textContent = `${eraserMode ? '지우개' : '펜'} · ${Math.round(BRUSH_SIZES[brushIdx]! * 100)} cm`;
  toolbar.append(tool);
  crosshair.style.setProperty('--brush', eraserMode ? '#fff' : hexColor(color));
}
renderToolbar();

// --- 루프 ---------------------------------------------------------------------

const eye = new THREE.Vector3();
const offset = new THREE.Vector3();
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 이동 — 시선 기준 WASD
  let fx = 0;
  let fz = 0;
  if (locked()) {
    if (keys.has('KeyW')) fz -= 1;
    if (keys.has('KeyS')) fz += 1;
    if (keys.has('KeyA')) fx -= 1;
    if (keys.has('KeyD')) fx += 1;
  }
  const len = Math.hypot(fx, fz) || 1;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const wish: [number, number] = [
    ((fx * cos + fz * sin) / len) * PLAYER.speed,
    ((-fx * sin + fz * cos) / len) * PLAYER.speed,
  ];
  body = stepBody(body, wish, locked() && keys.has('Space'), dt, solids);
  if (body.pos[1] < -10) body = { pos: [...SPAWN], vel: [0, 0, 0], onGround: false };

  // 카메라
  eye.set(body.pos[0], body.pos[1] + PLAYER.eye, body.pos[2]);
  camera.rotation.set(pitch, yaw, 0);
  camera.position.copy(eye);
  if (thirdPerson) {
    offset.set(0.5, 0.3, THIRD_PERSON_DIST).applyQuaternion(camera.quaternion);
    camera.position.add(offset);
  }

  const st: PlayerState = { p: [...body.pos], yaw, pitch };
  const me = myId ? avatars.get(myId) : undefined;
  if (me) {
    me.snap(st);
    me.group.visible = thirdPerson;
  }
  for (const a of avatars.values()) if (a !== me) a.update(dt);

  const target = locked() ? aim(eye) : null;
  crosshair.classList.toggle('reach', target !== null);
  paint(target);

  net?.tick(now, st);
  registry.flush();

  status.innerHTML = `${connection}<br />참가자 ${myId ? avatars.size : 1}명 · 높이 ${body.pos[1].toFixed(1)} m`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  void import('./dev-demo.ts').then((m) =>
    m.runDemo({
      registry,
      addAvatar,
      setPose(pos, y, p) {
        body = { pos, vel: [0, 0, 0], onGround: true };
        yaw = y;
        pitch = p;
      },
    }),
  );
}
