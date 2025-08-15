import * as THREE from 'three';
import { BONE_HIERARCHY } from './bones.js';

function distanceToSegmentSq(point, segStart, segEnd) {
    const l2 = segStart.distanceToSquared(segEnd);
    if (l2 === 0) return point.distanceToSquared(segStart);
    let t = ((point.x - segStart.x) * (segEnd.x - segStart.x) + (point.y - segStart.y) * (segEnd.y - segStart.y) + (point.z - segStart.z) * (segEnd.z - segStart.z)) / l2;
    t = Math.max(0, Math.min(1, t));
    const closest = segStart.clone().lerp(segEnd, t);
    return point.distanceToSquared(closest);
}

export function computeSkinnedMesh(targetMesh, bones, boneMap, skeleton, markerPositions) {
    const geometry = targetMesh.geometry.clone(); // avoid mutating original
    const position = geometry.attributes.position;

    const skinIndex = new THREE.BufferAttribute(new Uint16Array(position.count * 4), 4);
    const skinWeight = new THREE.BufferAttribute(new Float32Array(position.count * 4), 4);

    const boneIndexMap = new Map(bones.map((b, i) => [b.name, i]));
    const boneSegments = [];

    for (const bone of bones) {
        const startPos = markerPositions.get(bone.name);
        const children = BONE_HIERARCHY[bone.name]?.children || [];
        if (children.length) {
            for (const child of children) {
                const endPos = markerPositions.get(child);
                if (endPos) boneSegments.push({ boneIndex: boneIndexMap.get(bone.name), start: startPos, end: endPos });
            }
        } else {
            boneSegments.push({ boneIndex: boneIndexMap.get(bone.name), start: startPos, end: startPos });
        }
    }

    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i);

        const minByBone = new Map();
        for (const seg of boneSegments) {
            const d2 = distanceToSegmentSq(v, seg.start, seg.end);
            const prev = minByBone.get(seg.boneIndex);
            if (prev === undefined || d2 < prev) minByBone.set(seg.boneIndex, d2);
        }

        const distances = Array.from(minByBone.entries()).map(([index, d2]) => ({ index, d: Math.sqrt(d2) }));
        distances.sort((a, b) => a.d - b.d);
        const closest = distances.slice(0, 4);

        let total = 0;
        const weights = closest.map(c => {
            const w = 1.0 / (Math.pow(c.d, 4) + 1e-8);
            total += w;
            return { index: c.index, weight: w };
        });

        for (let j = 0; j < 4; j++) {
            const w = weights[j] ? weights[j].weight / total : 0;
            const bi = weights[j] ? weights[j].index : 0;
            skinIndex.setComponent(i * 4 + j, bi);
            skinWeight.setComponent(i * 4 + j, w);
        }
    }

    geometry.setAttribute('skinIndex', skinIndex);
    geometry.setAttribute('skinWeight', skinWeight);

    const material = targetMesh.material;
    if (material && 'skinning' in material) material.skinning = true;

    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.add(boneMap.get('hips'));
    skinnedMesh.bind(skeleton);
    return skinnedMesh;
}