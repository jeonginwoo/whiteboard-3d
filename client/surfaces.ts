// 낙서면 — 물체의 면마다 캔버스 하나를 텍스처로 붙인다. 모든 낙서는 Seg 하나를 그리는 것으로 귀결된다.
import * as THREE from 'three';
import type { Seg } from '../shared/protocol.ts';
import { facePixels, faceSizes, type Shape, type Vec3 } from '../shared/world.ts';
import { hexColor, uvToPx } from './paint-math.ts';

export class Surface {
  readonly id: string;
  readonly sizeM: [number, number];
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: string;
  private readonly pxPerM: number;
  dirty = false;

  constructor(id: string, sizeM: [number, number], density: number, baseColor: number) {
    this.id = id;
    this.sizeM = sizeM;
    const canvas = document.createElement('canvas');
    canvas.width = facePixels(sizeM[0], density);
    canvas.height = facePixels(sizeM[1], density);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d 컨텍스트를 만들 수 없다');
    this.ctx = ctx;
    this.base = hexColor(baseColor);
    this.pxPerM = (canvas.width / sizeM[0] + canvas.height / sizeM[1]) / 2;
    ctx.fillStyle = this.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(seg: Seg): void {
    const { width: w, height: h } = this.ctx.canvas;
    const [ax, ay] = uvToPx(seg.a, w, h);
    const [bx, by] = uvToPx(seg.b, w, h);
    const color = seg.e ? this.base : hexColor(seg.c);
    const px = Math.max(1, seg.w * this.pxPerM);
    const ctx = this.ctx;
    if (ax === bx && ay === by) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ax, ay, px / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = px;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    this.dirty = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export class SurfaceRegistry {
  private readonly surfaces = new Map<string, Surface>();

  get(id: string): Surface | undefined {
    return this.surfaces.get(id);
  }

  /** 물체 하나의 면별 재질을 만든다. mesh.userData.surfaceKey = key 로 두면 hit 에서 면 id 를 얻는다 */
  materialsFor(key: string, shape: Shape, size: Vec3, density: number, color: number): THREE.MeshLambertMaterial[] {
    return faceSizes(shape, size).map((sizeM, i) => {
      const s = new Surface(`${key}:${i}`, sizeM, density, color);
      this.surfaces.set(s.id, s);
      return new THREE.MeshLambertMaterial({ map: s.texture });
    });
  }

  apply(seg: Seg): void {
    this.surfaces.get(seg.s)?.draw(seg);
  }

  removePrefix(prefix: string): void {
    for (const [id, s] of this.surfaces) {
      if (id.startsWith(prefix)) {
        s.dispose();
        this.surfaces.delete(id);
      }
    }
  }

  /** 프레임마다 한 번 — 바뀐 캔버스만 GPU 로 올린다 */
  flush(): void {
    for (const s of this.surfaces.values()) {
      if (s.dirty) {
        s.texture.needsUpdate = true;
        s.dirty = false;
      }
    }
  }
}

/** 낙서할 수 있는 메시를 모양에 맞게 만든다 */
export function paintableMesh(
  registry: SurfaceRegistry,
  key: string,
  shape: Shape,
  size: Vec3,
  density: number,
  color: number,
): THREE.Mesh {
  const mats = registry.materialsFor(key, shape, size, density, color);
  let geo: THREE.BufferGeometry;
  if (shape === 'box') geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  else if (shape === 'cylinder') geo = new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 32);
  else geo = new THREE.SphereGeometry(size[0] / 2, 48, 24);
  const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
  mesh.userData.surfaceKey = key;
  return mesh;
}

/** 레이 hit → 낙서면 id. 그룹이 없는 지오메트리(구)는 materialIndex 가 0 */
export function surfaceIdOf(hit: THREE.Intersection): string | null {
  const key = hit.object.userData.surfaceKey as string | undefined;
  if (!key || !hit.uv || !hit.face) return null;
  return `${key}:${hit.face.materialIndex}`;
}
