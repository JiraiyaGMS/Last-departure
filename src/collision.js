/**
 * collision.js — capsule-vs-level collision on a three-mesh-bvh tree.
 *
 * No physics engine. The player is a vertical capsule; every frame the capsule is
 * pushed out of any triangle it overlaps, and the leftover vertical push tells us
 * whether we are standing on something.
 */
import * as THREE from 'three';
import { MeshBVH, computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const _box = new THREE.Box3();
const _seg = new THREE.Line3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _before = new THREE.Vector3();
const _delta = new THREE.Vector3();

export class Collider {
  constructor(geometry) {
    this.geometry = geometry;
    this.bvh = new MeshBVH(geometry, { targetLeafSize: 8, strategy: 0 });
    geometry.boundsTree = this.bvh;
    // a mesh wrapper so we can raycast the level cheaply
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
    this.mesh.name = 'col_merged';
    this.mesh.geometry.boundsTree = this.bvh;
  }

  /**
   * Resolve a capsule against the level.
   * @param {THREE.Vector3} base  capsule bottom (feet), mutated in place
   * @param {number} height       capsule height (feet to top of head)
   * @param {number} radius
   * @returns {{grounded:boolean, correction:THREE.Vector3, hitWall:boolean}}
   */
  resolve(base, height, radius) {
    // the capsule's inner segment, inset by the radius at each cap
    _seg.start.set(base.x, base.y + radius, base.z);
    _seg.end.set(base.x, base.y + height - radius, base.z);
    _before.copy(_seg.start);

    _box.makeEmpty();
    _box.expandByPoint(_seg.start);
    _box.expandByPoint(_seg.end);
    _box.min.addScalar(-radius);
    _box.max.addScalar(radius);

    let hitWall = false;

    this.bvh.shapecast({
      intersectsBounds: b => b.intersectsBox(_box),
      intersectsTriangle: tri => {
        const dist = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
        if (dist < radius) {
          const depth = radius - dist;
          _dir.copy(_capPoint).sub(_triPoint);
          if (_dir.lengthSq() < 1e-12) return false;
          _dir.normalize();
          if (Math.abs(_dir.y) < 0.6) hitWall = true;
          _seg.start.addScaledVector(_dir, depth);
          _seg.end.addScaledVector(_dir, depth);
        }
        return false;
      },
    });

    _delta.copy(_seg.start).sub(_before);
    const grounded = _delta.y > 1e-4;

    base.set(_seg.start.x, _seg.start.y - radius, _seg.start.z);
    return { grounded, correction: _delta.clone(), hitWall };
  }

  /** is there clear line of sight between two points? used for the Attendant's eyes */
  canSee(from, to, ignoreDist = 0.2) {
    const dir = _dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < ignoreDist) return true;
    dir.normalize();
    const ray = new THREE.Ray(from.clone(), dir);
    const hit = this.bvh.raycastFirst(ray, THREE.FrontSide);
    return !hit || hit.distance > dist - 0.3;
  }

  dispose() {
    this.geometry.disposeBoundsTree?.();
    this.mesh.material.dispose();
  }
}
