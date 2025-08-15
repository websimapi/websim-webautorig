import * as THREE from 'three';
import { BONE_HIERARCHY, BONE_NAMES, buildSkeletonFromMarkers } from './bones.js';
import { computeSkinnedMesh } from './skinning.js';
import { createAnimations } from './animations.js';

export async function rigCharacter(model, markers, modelInverseMatrix, onProgress) {
    onProgress(0.1, "Creating skeleton...");
    await new Promise(res => setTimeout(res, 200));

    // Markers to local space
    const markerPositions = new Map();
    for (const id of BONE_NAMES) {
        const worldPos = markers.get(id);
        markerPositions.set(id, worldPos.clone().applyMatrix4(modelInverseMatrix));
    }

    const { bones, boneMap, skeleton } = buildSkeletonFromMarkers(markerPositions);

    // Find target mesh
    let targetMesh;
    model.traverse(child => { if (child.isMesh && !targetMesh) targetMesh = child; });
    if (!targetMesh) throw new Error("No mesh found in the model.");
    targetMesh.position.set(0,0,0); targetMesh.rotation.set(0,0,0); targetMesh.scale.set(1,1,1);
    targetMesh.updateMatrixWorld(true);

    onProgress(0.4, "Computing skinning weights...");
    await new Promise(res => setTimeout(res, 200));

    const skinnedMesh = computeSkinnedMesh(targetMesh, bones, boneMap, skeleton, markerPositions);

    onProgress(0.9, "Finalizing rig...");
    await new Promise(res => setTimeout(res, 200));

    const riggedModel = new THREE.Group();
    riggedModel.add(skinnedMesh);

    const animations = createAnimations(skeleton, boneMap.get('hips').position.clone(), markerPositions);
    return { riggedModel, animations };
}