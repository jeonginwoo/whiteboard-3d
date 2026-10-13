// 플레이어 아바타 — 몸통·머리가 낙서면이라 다른 참가자가 그 위에 그릴 수 있다.
// 낙서면 키: "p:<id>:body" / "p:<id>:head" (protocol.avatarPrefix 와 맞물린다).
import * as THREE from 'three';
import { avatarPrefix, type PlayerInfo, type PlayerState } from '../shared/protocol.ts';
import { AVATAR, type Vec3 } from '../shared/world.ts';
import { paintableMesh, type SurfaceRegistry } from './surfaces.ts';

const LERP_PER_SEC = 12; // 원격 위치 보간 속도

export class Avatar {
  readonly id: string;
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[];
  private readonly head: THREE.Mesh;
  private target: PlayerState | null = null;

  constructor(info: PlayerInfo, registry: SurfaceRegistry) {
    this.id = info.id;
    const prefix = avatarPrefix(info.id);
    const body = paintableMesh(registry, `${prefix}body`, 'box', AVATAR.body.size, AVATAR.density, info.color);
    body.position.y = AVATAR.body.y;
    this.head = paintableMesh(registry, `${prefix}head`, 'box', AVATAR.head.size, AVATAR.density, 0xf1d3b3);
    this.head.position.y = AVATAR.head.y;
    this.meshes = [body, this.head];

    // 눈 — 앞(−z)을 알려 주는 장식. 낙서면이 아니라 레이 대상에서 빠진다
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2e3440 });
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.01), eyeMat);
      eye.position.set(x, 0.04, -AVATAR.head.size[2] / 2 - 0.006);
      this.head.add(eye);
    }

    const label = nameSprite(info.name);
    label.position.y = 1.95;
    this.group.add(body, this.head, label);
    if (info.state) this.snap(info.state);
  }

  setTarget(st: PlayerState): void {
    if (!this.target) this.snap(st);
    this.target = st;
  }

  /** 보간 없이 즉시 — 내 아바타는 매 프레임 이걸로 맞춘다 */
  snap(st: PlayerState): void {
    this.target = st;
    this.group.position.set(...st.p);
    this.group.rotation.y = st.yaw;
    this.head.rotation.x = st.pitch * 0.6;
  }

  update(dt: number): void {
    if (!this.target) return;
    const k = 1 - Math.exp(-LERP_PER_SEC * dt);
    const p = this.group.position;
    const t: Vec3 = this.target.p;
    p.set(p.x + (t[0] - p.x) * k, p.y + (t[1] - p.y) * k, p.z + (t[2] - p.z) * k);
    // 각도는 가까운 쪽으로 돈다
    let dy = this.target.yaw - this.group.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.group.rotation.y += dy * k;
    this.head.rotation.x += (this.target.pitch * 0.6 - this.head.rotation.x) * k;
  }

  dispose(registry: SurfaceRegistry): void {
    registry.removePrefix(avatarPrefix(this.id));
    this.group.removeFromParent();
  }
}

function nameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(1.2, 0.3, 1);
  return sprite;
}
