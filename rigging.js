import * as THREE from 'three';

/**
 * Simplified auto-rigging implementation.
 * Creates a skeleton from markers, computes basic skinning weights,
 * and binds it to the mesh.
 */

const BONE_HIERARCHY = {
    'hips': { children: ['spine', 'left_hip', 'right_hip'] },
    'spine': { children: ['neck'] },
    'neck': { children: ['head', 'left_clavicle', 'right_clavicle'] },
    'head': { children: ['head_top', 'chin'] }, /* 'chin' is optional and may not be placed */
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

// Helper function to calculate the squared distance from a point to a line segment.
// It's more efficient to work with squared distances to avoid square roots.
function distanceToSegmentSq(point, segStart, segEnd) {
    const l2 = segStart.distanceToSquared(segEnd);
    if (l2 === 0) return point.distanceToSquared(segStart);
    let t = ((point.x - segStart.x) * (segEnd.x - segStart.x) + (point.y - segStart.y) * (segEnd.y - segStart.y) + (point.z - segStart.z) * (segEnd.z - segStart.z)) / l2;
    t = Math.max(0, Math.min(1, t));
    const closestPointOnSegment = segStart.clone().lerp(segEnd, t);
    return point.distanceToSquared(closestPointOnSegment);
}

export async function rigCharacter(model, markers, modelInverseMatrix, onProgress) {
    onProgress(0.1, "Creating skeleton...");
    await new Promise(res => setTimeout(res, 200));

    // 1. Create bones from markers
    const bones = [];
    const boneMap = new Map();
    const markerPositions = new Map(); // Store local positions of markers
    
    // Transform marker world positions to the model's local space.
    for (const id of BONE_NAMES) {
        const worldPos = markers.get(id);
        // Allow optional markers like 'chin' to be missing
        if (!worldPos) continue;
        const localPos = worldPos.clone().applyMatrix4(modelInverseMatrix);
        markerPositions.set(id, localPos);
        
        const bone = new THREE.Bone();
        bone.name = id;
        boneMap.set(id, bone);
        bones.push(bone);
    }

    // 2. Build hierarchy and set local positions
    for (const [id, bone] of boneMap.entries()) {
        const parentId = Object.keys(BONE_HIERARCHY).find(p => (BONE_HIERARCHY[p].children || []).includes(id));
        if (parentId && boneMap.has(parentId)) {
            const parentBone = boneMap.get(parentId);
            parentBone.add(bone);
            
            // Position is relative to parent bone
            const childLocalPos = markerPositions.get(id);
            const parentLocalPos = markerPositions.get(parentId);
            if (childLocalPos && parentLocalPos) {
                bone.position.copy(childLocalPos).sub(parentLocalPos);
            } else if (childLocalPos && !parentLocalPos) {
                bone.position.copy(childLocalPos);
            }
        } else { // Root bone (hips)
            const pos = markerPositions.get(id);
            if (pos) bone.position.copy(pos);
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
    
    // The geometry is already in the correct local space.
    // We just need to ensure the mesh doesn't have a world transform applied.
    targetMesh.position.set(0,0,0);
    targetMesh.rotation.set(0,0,0);
    targetMesh.scale.set(1,1,1);
    targetMesh.updateMatrixWorld(true);

    onProgress(0.4, "Computing skinning weights...");
    await new Promise(res => setTimeout(res, 200));

    const geometry = targetMesh.geometry;
    const position = geometry.attributes.position;
    const skinIndex = new THREE.BufferAttribute(new Uint16Array(position.count * 4), 4);
    const skinWeight = new THREE.BufferAttribute(new Float32Array(position.count * 4), 4);

    // Build bone segments (start/end) in local space
    const boneSegments = [];
    const boneIndexMap = new Map(bones.map((bone, index) => [bone.name, index]));

    for (const bone of bones) {
        const startPos = markerPositions.get(bone.name);
        const childrenNames = (BONE_HIERARCHY[bone.name]?.children || []).filter(n => markerPositions.has(n));
        
        if (childrenNames.length > 0) {
            for (const childName of childrenNames) {
                const endPos = markerPositions.get(childName);
                if (startPos && endPos) {
                    boneSegments.push({
                        boneIndex: boneIndexMap.get(bone.name),
                        start: startPos,
                        end: endPos
                    });
                }
            }
        } else if (startPos) {
            boneSegments.push({
                boneIndex: boneIndexMap.get(bone.name),
                start: startPos,
                end: startPos
            });
        }
    }

    // Region-aware weighting to prevent head stretching by arm movement.
    const neckPos = markerPositions.get('neck');
    const allowedHeadBones = new Set(['neck', 'head', 'head_top', 'chin', 'spine'].filter(n => boneIndexMap.has(n)));
    const armLegBones = new Set([
        'left_clavicle','right_clavicle','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist',
        'left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle'
    ].filter(n => boneIndexMap.has(n)));

    for (let i = 0; i < position.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, i);

        // Compute distances
        const boneDistances = boneSegments.map(segment => ({
            index: segment.boneIndex,
            distanceSq: distanceToSegmentSq(vertex, segment.start, segment.end)
        }));

        // Group by bone index, keep min distance
        const minBoneDistances = new Map();
        for (const dist of boneDistances) {
            if (!minBoneDistances.has(dist.index) || dist.distanceSq < minBoneDistances.get(dist.index)) {
                minBoneDistances.set(dist.index, dist.distanceSq);
            }
        }

        // Region gating: if vertex above neck Y, strongly prefer head-related bones and de-emphasize arms/legs
        if (neckPos) {
            const isHeadRegion = vertex.y > neckPos.y;
            if (isHeadRegion) {
                // Inflate distances for non-head bones, especially arms/legs
                for (const [idx, d2] of minBoneDistances.entries()) {
                    const name = bones[idx].name;
                    if (!allowedHeadBones.has(name)) {
                        // Increase distance significantly so they won't be in top 4
                        const factor = armLegBones.has(name) ? 1e6 : 1e3;
                        minBoneDistances.set(idx, d2 * factor);
                    }
                }
            }
        }

        const uniqueBoneDistances = Array.from(minBoneDistances.entries()).map(([index, distanceSq]) => ({
            index,
            distance: Math.sqrt(distanceSq)
        }));
        uniqueBoneDistances.sort((a, b) => a.distance - b.distance);

        const closestBones = uniqueBoneDistances.slice(0, 4);
        let totalWeight = 0;
        const weights = closestBones.map(b => {
            const weight = 1.0 / (Math.pow(b.distance, 4) + 1e-8);
            totalWeight += weight;
            return { weight, index: b.index };
        });

        // Normalize
        const finalWeights = [];
        for(let j = 0; j < 4; j++) {
            if(weights[j]) {
                finalWeights.push({
                    index: weights[j].index,
                    weight: weights[j].weight / totalWeight
                });
            } else {
                finalWeights.push({ index: 0, weight: 0 });
            }
        }

        skinIndex.setXYZW(i, finalWeights[0].index, finalWeights[1].index, finalWeights[2].index, finalWeights[3].index);
        skinWeight.setXYZW(i, finalWeights[0].weight, finalWeights[1].weight, finalWeights[2].weight, finalWeights[3].weight);
    }

    geometry.setAttribute('skinIndex', skinIndex);
    geometry.setAttribute('skinWeight', skinWeight);

    // 4. Create SkinnedMesh
    const material = targetMesh.material;
    // THREE.Material doesn't have a skinning property, so we must check for it.
    if(material && 'skinning' in material) {
        material.skinning = true;
    }

    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    if (boneMap.has('hips')) {
        skinnedMesh.add(boneMap.get('hips'));
    } else {
        // Fallback: add first bone as root if hips missing (shouldn't happen with required markers)
        skinnedMesh.add(bones[0]);
    }
    skinnedMesh.bind(skeleton);
    
    // The skinned mesh is created at the origin, which matches the model's centered position.

    onProgress(0.9, "Finalizing rig...");
    await new Promise(res => setTimeout(res, 200));
    
    // Create a new model group to hold the final result
    const riggedModel = new THREE.Group();
    riggedModel.add(skinnedMesh);
    
    // Add a simple test animation
    const animations = createTestAnimations(skeleton, boneMap.get('hips')?.position || new THREE.Vector3(), markerPositions);

    return { riggedModel: riggedModel, animations };
}

function createTestAnimations(skeleton, hipPos, markerPositions) {
    const animations = {};
    
    // Bones for animations
    const hips = skeleton.getBoneByName('hips');
    const spine = skeleton.getBoneByName('spine');
    const shoulderL = skeleton.getBoneByName('left_shoulder');
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const elbowL = skeleton.getBoneByName('left_elbow');
    const elbowR = skeleton.getBoneByName('right_elbow');
    const kneeL = skeleton.getBoneByName('left_knee');
    const kneeR = skeleton.getBoneByName('right_knee');
    // Ensure clavicles don't unintentionally rotate with our tracks (we don't animate them here)
    // Head/neck are also not affected directly by arm animations.

    // Wave animation for right arm (unchanged in behavior, but head won't stretch due to new weights)
    if (shoulderR && elbowR) {
        const times = [0, 0.5, 1, 1.5, 2];
        
        // Shoulder rotation (moves arm up and down from T-Pose)
        const shoulderZAngle = Math.PI / 4; // 45 degrees
        const shoulderValues = [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, shoulderZAngle)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, shoulderZAngle)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ];
        const shoulderTrack = new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, times, shoulderValues);

        // Elbow rotation (bends)
        const elbowYAngle = -Math.PI / 2; // -90 degrees
        const elbowValues = [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowYAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowYAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ];
        const elbowTrack = new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, times, elbowValues);

        const waveClip = new THREE.AnimationClip('wave', -1, [shoulderTrack, elbowTrack]);
        animations.wave = waveClip;
    }

    // Utility: Compute a quaternion that rotates shoulder's current rest direction (to its elbow)
    // downwards along -Y (arms at the body's side). This adapts to any incoming T-pose orientation.
    const makeArmDownQuaternion = (shoulderName, elbowName) => {
        const s = markerPositions.get(shoulderName);
        const e = markerPositions.get(elbowName);
        if (!s || !e) return new THREE.Quaternion(); // identity fallback

        const currentDir = e.clone().sub(s).normalize();   // Shoulder -> Elbow direction in rest pose
        const downDir = new THREE.Vector3(0, -1, 0);       // Desired arm direction
        // Rotate from currentDir to downDir
        const q = new THREE.Quaternion().setFromUnitVectors(currentDir, downDir);
        return q;
    };

    // New Idle Animation: start from T-pose and lower arms to the body's side, add subtle sway and light knee bends.
    if (hips && spine && shoulderL && shoulderR && kneeL && kneeR) {
        const idleTimes = [0, 1, 2, 3, 4];
        const interpolation = THREE.InterpolateSmooth;
        const tracks = [];

        // Compute base "arms down" orientation from T-pose using marker directions
        const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
        const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');

        // Subtle arm sway around Z while keeping them down
        const armSwayAngle = Math.PI / 36; // ~5 degrees
        const qSwayL_Pos = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, +armSwayAngle));
        const qSwayL_Neg = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwayAngle));
        const qSwayR_Pos = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, +armSwayAngle));
        const qSwayR_Neg = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwayAngle));

        // Compose: sway * down to keep sway relative to the "arms-down" base orientation
        const qL0 = qDownL.clone();
        const qL1 = qSwayL_Pos.clone().multiply(qDownL);
        const qL2 = qDownL.clone();
        const qL3 = qSwayL_Neg.clone().multiply(qDownL);
        const qL4 = qDownL.clone();

        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, idleTimes, [
            ...qL0.toArray(), ...qL1.toArray(), ...qL2.toArray(), ...qL3.toArray(), ...qL4.toArray()
        ], interpolation));

        const qR0 = qDownR.clone();
        const qR1 = qSwayR_Neg.clone().multiply(qDownR);
        const qR2 = qDownR.clone();
        const qR3 = qSwayR_Pos.clone().multiply(qDownR);
        const qR4 = qDownR.clone();

        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, idleTimes, [
            ...qR0.toArray(), ...qR1.toArray(), ...qR2.toArray(), ...qR3.toArray(), ...qR4.toArray()
        ], interpolation));

        // Body sway: hips translate slightly left-right, spine counter-rotates to keep upper stable
        const swayAmount = 0.01; // meters
        const initialHipPos = hipPos.clone();
        tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, idleTimes, [
            initialHipPos.x, initialHipPos.y, initialHipPos.z,
            initialHipPos.x + swayAmount, initialHipPos.y, initialHipPos.z,
            initialHipPos.x, initialHipPos.y, initialHipPos.z,
            initialHipPos.x - swayAmount, initialHipPos.y, initialHipPos.z,
            initialHipPos.x, initialHipPos.y, initialHipPos.z,
        ], interpolation));

        const spineSwayAngle = -swayAmount / 0.2;
        const qSpine_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
        const qSpine_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, spineSwayAngle));
        const qSpine_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -spineSwayAngle));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${spine.name}.quaternion`, idleTimes, [
            ...qSpine_Base.toArray(), ...qSpine_L.toArray(), ...qSpine_Base.toArray(), ...qSpine_R.toArray(), ...qSpine_Base.toArray()
        ], interpolation));

        // Light knee bends alternating
        const kneeBendAngle = Math.PI / 30; // ~6 degrees
        const qKnee_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
        const qKnee_Bent = new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, idleTimes, [
            ...qKnee_Base.toArray(), ...qKnee_Bent.toArray(), ...qKnee_Base.toArray(), ...qKnee_Base.toArray(), ...qKnee_Base.toArray()
        ], interpolation));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, idleTimes, [
            ...qKnee_Base.toArray(), ...qKnee_Base.toArray(), ...qKnee_Base.toArray(), ...qKnee_Bent.toArray(), ...qKnee_Base.toArray()
        ], interpolation));

        // Slight elbow bend so arms look natural at sides
        if (elbowL) {
            const qElbowL_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 16, 0)); // small bend
            tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, idleTimes, [
                ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray()
            ], interpolation));
        }
        if (elbowR) {
            const qElbowR_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 16, 0)); // small bend
            tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, idleTimes, [
                ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray()
            ], interpolation));
        }

        const idleClip = new THREE.AnimationClip('idle', -1, tracks);
        animations.idle = idleClip;
    }

    return animations;
}