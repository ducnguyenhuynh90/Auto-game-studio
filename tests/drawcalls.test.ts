import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  makeBarrel,
  makeBoat,
  makeCharacter,
  makeDog,
  makeDogHouse,
  makeFisherman,
  makeHouse,
  makeJunk,
  makeKarst,
  makeLantern,
  makeMarket,
  makePalm,
  makeRaftHouse,
  makeRod,
  makeSaltPile,
  makeShrine,
  makeTrongMai,
  makeTurtle,
  mergeRigid,
} from '../src/render3d/models';

const draws = (o: THREE.Object3D) => {
  let n = 0;
  o.traverseVisible((c) => {
    if ((c as THREE.Mesh).isMesh) n++;
  });
  return n;
};
const names = (o: THREE.Object3D) => {
  const out: string[] = [];
  o.traverse((c) => c.name && out.push(c.name));
  return out.sort();
};
const box = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o, true);
};

const MODELS: [string, () => THREE.Object3D][] = [
  ['fisherman', makeFisherman],
  ['villager', () => makeCharacter('nam')],
  ['turtle', makeTurtle],
  ['dog', makeDog],
  ['dog house', makeDogHouse],
  ['palm', () => makePalm(2.2)],
  ['shrine', makeShrine],
  ['barrel', makeBarrel],
  ['salt pile', makeSaltPile],
  ['lantern', () => makeLantern('#e8443a')],
  ['junk', makeJunk],
  ['karst', () => makeKarst(2, 1)],
  ['raft house', () => makeRaftHouse(0)],
  ['Trống Mái', makeTrongMai],
  ...[0, 1, 2, 3].map((l): [string, () => THREE.Object3D] => [`boat ${l}`, () => makeBoat(l)]),
  ...[0, 1, 2, 3].map((l): [string, () => THREE.Object3D] => [`rod ${l}`, () => makeRod(l)]),
  ...[1, 6].map((l): [string, () => THREE.Object3D] => [`house ${l}`, () => makeHouse(l)]),
  ...[0, 1, 2].map((l): [string, () => THREE.Object3D] => [`market ${l}`, () => makeMarket(l)]),
];

describe('mergeRigid: fewer draw calls, same model', () => {
  for (const [label, make] of MODELS)
    it(label, () => {
      const before = make();
      const after = mergeRigid(make());
      // same shape and place (to float precision), the parts animation code looks up still there
      const a = box(before);
      const b = box(after);
      for (const k of ['min', 'max'] as const) for (const ax of ['x', 'y', 'z'] as const) expect(b[k][ax]).toBeCloseTo(a[k][ax], 4);
      expect(names(after)).toEqual(names(before));
      expect(draws(after)).toBeLessThanOrEqual(draws(before));
    });

  it('a moved, turned and scaled model keeps its own transform', () => {
    const before = makeCharacter('nam');
    const after = makeCharacter('nam');
    for (const o of [before, after]) {
      o.position.set(-1.6, 0.2, 0.6);
      o.rotation.y = 0.7;
      o.scale.setScalar(0.85);
    }
    mergeRigid(after);
    after.rotation.y = 0.7; // later animation moves the model itself, as before
    const a = box(before);
    const b = box(after);
    for (const k of ['min', 'max'] as const) for (const ax of ['x', 'y', 'z'] as const) expect(b[k][ax]).toBeCloseTo(a[k][ax], 4);
  });

  it('one draw per look: a villager in 17 parts draws in 5 (toon, flat, see-through, outline...)', () => {
    const v = makeCharacter('nam');
    expect(draws(v)).toBe(17);
    expect(draws(mergeRigid(v))).toBe(5);
  });

  it('keeps every part colour, now in the vertices of a white vertex-coloured material', () => {
    const hex = (r: number, g: number, b: number) => new THREE.Color(r, g, b).getHexString();
    const before = new Set<string>();
    makeCharacter('nam').traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
      if (m && !o.userData.outline) before.add(m.color.getHexString());
    });
    const after = new Set<string>();
    mergeRigid(makeCharacter('nam')).traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.MeshToonMaterial | undefined;
      const col = mesh.geometry?.attributes.color;
      if (!m || !col) return;
      expect(m.vertexColors).toBe(true);
      expect(m.color.getHexString()).toBe('ffffff');
      for (let i = 0; i < col.count; i++) after.add(hex(col.getX(i), col.getY(i), col.getZ(i)));
    });
    expect(after).toEqual(before);
  });
});
