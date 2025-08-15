import * as THREE from 'three';

export const BONE_HIERARCHY = {
    hips: { children: ['spine', 'left_hip', 'right_hip'] },
    spine: { children: ['neck'] },
    neck: { children: ['head', 'left_clavicle', 'right_clavicle'] },
    head: { children: [] },
    left_clavicle: { children: ['left_shoulder'] },
    right_clavicle: { children: ['right_shoulder'] },
    left_shoulder: { children: ['left_elbow'] },
    right_shoulder: { children: ['right_elbow'] },
    left_elbow: { children: ['left_wrist'] },
    right_elbow: { children: ['right_wrist'] },
    left_hip: { children: ['left_knee'] },
    right_hip: { children: ['right_knee'] },
    left_knee: { children: ['left_ankle'] },
    right_knee: { children: ['right_ankle'] },
    left_wrist: { children: [] },
    right_wrist: { children: [] },
    left_ankle: { children: [] },
    right_ankle: { children: [] },
};

export const BONE_NAMES = Object.keys(BONE_HIERARCHY);

export function buildSkeletonFromMarkers(markerPositions) {
    const bones = [];
    const boneMap = new Map();

    // Create bones
    for (const id of BONE_NAMES) {
        const bone = new THREE.Bone();
        bone.name = id;
        boneMap.set(id, bone);
        bones.push(bone);
    }

    // Build hierarchy and positions (local)
    for (const [id, bone] of boneMap.entries()) {
        const parentId = Object.keys(BONE_HIERARCHY).find(p => BONE_HIERARCHY[p].children.includes(id));
        if (parentId) {
            const parentBone = boneMap.get(parentId);
            parentBone.add(bone);
            bone.position.copy(markerPositions.get(id)).sub(markerPositions.get(parentId));
        } else {
            bone.position.copy(markerPositions.get(id)); // root (hips)
        }
    }

    const skeleton = new THREE.Skeleton(bones);
    return { bones, boneMap, skeleton };
}