import * as THREE from 'three';

/**
 * Simplified auto-rigging implementation.
 * Creates a skeleton from markers, computes basic skinning weights,
 * and binds it to the mesh.
 */

const BONE_HIERARCHY = {
    'hips': { children: ['spine', 'left_hip', 'right_hip'] },
    'spine': { children: ['neck'] },
    'neck': { children: ['left_clavicle', 'right_clavicle'] },
    'left_clavicle': { children: ['left_shoulder'] },
    'right_clavicle': { children: ['right_shoulder'] },
    'left_shoulder': { children: ['left_elbow'] },
    'right_shoulder': { children: ['right_elbow'] },
    'left_elbow': { children: ['left_wrist'] },
    'right_elbow': { children: ['right_wrist'] },
    'left_hip': { children: ['left_knee'] },
    'right_hip': { children: ['right_knee'] },
    'left_knee': { children: ['left_ankle'] },
    'right_knee': { children: ['right_ankle'] },
    'left_wrist': { children: [] },
    'right_wrist': { children: [] },
    'left_ankle': { children: [] },
    'right_ankle': { children: [] },
};

const BONE_NAMES = Object.keys(BONE_HIERARCHY);

export async function rigCharacter(model, markers, onProgress) {
    onProgress(0.1, "Creating skeleton...");
    await new Promise(res => setTimeout(res, 200));

    // 1. Create bones from markers
    const bones = [];
    const boneMap = new Map();
    for (const id of BONE_NAMES) {
        const bone = new THREE.Bone();
        bone.name = id;
        // The marker positions are in world space, we need to transform them to local
        bone.position.copy(markers.get(id));
        bones.push(bone);
        boneMap.set(id, bone);
    }

    // 2. Build hierarchy
    for (const [id, bone] of boneMap.entries()) {
        const parentId = Object.keys(BONE_HIERARCHY).find(p => BONE_HIERARCHY[p].children.includes(id));
        if (parentId) {
            const parentBone = boneMap.get(parentId);
            parentBone.add(bone);
        }
    }
    
    // Convert children positions to local space relative to parent
    for (const bone of bones) {
        if(bone.parent && bone.parent.isBone) {
            bone.position.sub(bone.parent.getWorldPosition(new THREE.Vector3()));
        }
    }

    const skeleton = new THREE.Skeleton(bones);

    // 3. Find the mesh and prepare it for skinning
    let targetMesh;
    model.traverse(child => {
        if (child.isMesh && !targetMesh) {
            targetMesh = child;
        }
    });

    if (!targetMesh) {
        throw new Error("No mesh found in the model.");
    }

    onProgress(0.4, "Computing skinning weights...");
    await new Promise(res => setTimeout(res, 200));

    const geometry = targetMesh.geometry;
    const position = geometry.attributes.position;
    const skinIndex = new THREE.BufferAttribute(new Uint16Array(position.count * 4), 4);
    const skinWeight = new THREE.BufferAttribute(new Float32Array(position.count * 4), 4);

    const bonePositions = bones.map(b => b.getWorldPosition(new THREE.Vector3()));

    for (let i = 0; i < position.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, i);

        const boneDistances = bonePositions.map((bonePos, index) => ({
            index,
            distance: vertex.distanceTo(bonePos)
        }));

        boneDistances.sort((a, b) => a.distance - b.distance);

        const closestBones = boneDistances.slice(0, 4);
        let totalWeight = 0;
        
        const weights = closestBones.map(b => {
            const weight = 1.0 / (b.distance * b.distance + 1e-6); // Inverse square distance
            totalWeight += weight;
            return weight;
        });

        skinIndex.setXYZW(i, closestBones[0].index, closestBones[1].index, closestBones[2].index, closestBones[3].index);
        skinWeight.setXYZW(i, weights[0] / totalWeight, weights[1] / totalWeight, weights[2] / totalWeight, weights[3] / totalWeight);
    }

    geometry.setAttribute('skinIndex', skinIndex);
    geometry.setAttribute('skinWeight', skinWeight);

    // 4. Create SkinnedMesh
    const material = targetMesh.material;
    material.skinning = true;

    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.add(skeleton.bones[0]); // Add root bone
    skinnedMesh.bind(skeleton);

    onProgress(0.9, "Finalizing rig...");
    await new Promise(res => setTimeout(res, 200));
    
    // Replace the original mesh with the skinned mesh in the scene graph
    const riggedModel = model.clone();
    let meshToReplace;
    riggedModel.traverse(child => {
        if (child.isMesh) meshToReplace = child;
    });

    if (meshToReplace) {
       const parent = meshToReplace.parent;
       parent.remove(meshToReplace);
       parent.add(skinnedMesh);
    }
    
    // Add a simple test animation
    const animations = createTestAnimations(skeleton);

    return { riggedModel: riggedModel, animations };
}

function createTestAnimations(skeleton) {
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const shoulderL = skeleton.getBoneByName('left_shoulder');

    if (!shoulderR || !shoulderL) return {};

    // Wave animation for right arm
    const times = [0, 1, 2];
    const valuesR = [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
    ];
    const shoulderTrackR = new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, times, valuesR);
    const waveClip = new THREE.AnimationClip('wave', -1, [shoulderTrackR]);

    return { wave: waveClip };
}