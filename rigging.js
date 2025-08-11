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
    'head': { children: [] },
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
        const localPos = worldPos.clone().applyMatrix4(modelInverseMatrix);
        markerPositions.set(id, localPos);
        
        const bone = new THREE.Bone();
        bone.name = id;
        boneMap.set(id, bone);
        bones.push(bone);
    }

    // 2. Build hierarchy and set local positions
    for (const [id, bone] of boneMap.entries()) {
        const parentId = Object.keys(BONE_HIERARCHY).find(p => BONE_HIERARCHY[p].children.includes(id));
        if (parentId) {
            const parentBone = boneMap.get(parentId);
            parentBone.add(bone);
            
            // Position is relative to parent bone
            const childLocalPos = markerPositions.get(id);
            const parentLocalPos = markerPositions.get(parentId);
            bone.position.copy(childLocalPos).sub(parentLocalPos);

        } else { // This is the root bone (hips)
            bone.position.copy(markerPositions.get(id));
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

    // --- New skinning weight logic ---
    // Create bone segments (start and end points) in local space for more accurate distance calculation.
    const boneSegments = [];
    const boneIndexMap = new Map(bones.map((bone, index) => [bone.name, index]));

    for (const bone of bones) {
        const startPos = markerPositions.get(bone.name);
        const childrenNames = BONE_HIERARCHY[bone.name]?.children || [];
        
        if (childrenNames.length > 0) {
            // For bones with children, create segments to each child.
            for (const childName of childrenNames) {
                const endPos = markerPositions.get(childName);
                if (endPos) {
                    boneSegments.push({
                        boneIndex: boneIndexMap.get(bone.name),
                        start: startPos,
                        end: endPos
                    });
                }
            }
        } else {
             // For leaf bones (like wrists/ankles), treat them as a point.
             // We represent this as a zero-length segment.
            boneSegments.push({
                boneIndex: boneIndexMap.get(bone.name),
                start: startPos,
                end: startPos
            });
        }
    }
    
    for (let i = 0; i < position.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, i);

        // Calculate distance from the vertex to each bone segment.
        const boneDistances = boneSegments.map(segment => ({
            index: segment.boneIndex,
            // Use squared distance for efficiency
            distanceSq: distanceToSegmentSq(vertex, segment.start, segment.end)
        }));

        // Group distances by bone index, keeping the minimum distance for bones with multiple segments (e.g., hips, neck).
        const minBoneDistances = new Map();
        for (const dist of boneDistances) {
            if (!minBoneDistances.has(dist.index) || dist.distanceSq < minBoneDistances.get(dist.index)) {
                minBoneDistances.set(dist.index, dist.distanceSq);
            }
        }

        const uniqueBoneDistances = Array.from(minBoneDistances.entries()).map(([index, distanceSq]) => ({
            index,
            distance: Math.sqrt(distanceSq) // Now take the square root
        }));

        uniqueBoneDistances.sort((a, b) => a.distance - b.distance);

        const closestBones = uniqueBoneDistances.slice(0, 4);
        let totalWeight = 0;
        
        const weights = closestBones.map(b => {
            // Using a power of 4 for faster falloff, which can help reduce unwanted influence from distant bones.
            const weight = 1.0 / (Math.pow(b.distance, 4) + 1e-8);
            totalWeight += weight;
            return { weight, index: b.index };
        });

        // Normalize weights
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
    // --- End of new skinning logic ---

    geometry.setAttribute('skinIndex', skinIndex);
    geometry.setAttribute('skinWeight', skinWeight);

    // 4. Create SkinnedMesh
    const material = targetMesh.material;
    // THREE.Material doesn't have a skinning property, so we must check for it.
    if(material && 'skinning' in material) {
        material.skinning = true;
    }

    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    
    // Add the root bone to the skinned mesh
    skinnedMesh.add(boneMap.get('hips')); 
    skinnedMesh.bind(skeleton);
    
    // The skinned mesh is created at the origin, which matches the model's centered position.

    onProgress(0.9, "Finalizing rig...");
    await new Promise(res => setTimeout(res, 200));
    
    // Create a new model group to hold the final result
    const riggedModel = new THREE.Group();
    riggedModel.add(skinnedMesh);
    
    // Add a simple test animation
    const animations = createTestAnimations(skeleton, boneMap.get('hips').position, markerPositions);

    return { riggedModel: riggedModel, animations };
}

function createTestAnimations(skeleton, hipPos, markerPositions) {
    const animations = {};
    
    // Get all bones we might need for animations
    const hips = skeleton.getBoneByName('hips');
    const spine = skeleton.getBoneByName('spine');
    const shoulderL = skeleton.getBoneByName('left_shoulder');
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const elbowL = skeleton.getBoneByName('left_elbow');
    const elbowR = skeleton.getBoneByName('right_elbow');
    const kneeL = skeleton.getBoneByName('left_knee');
    const kneeR = skeleton.getBoneByName('right_knee');

    // Wave animation for right arm
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

    // Walking Animation: Basic walk cycle with leg movement, arm swing, and hip motion
    if (hips && spine && shoulderL && shoulderR && elbowL && elbowR && kneeL && kneeR) {
        const walkTimes = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const walkTracks = [];
        const interpolation = THREE.InterpolateSmooth;

        // Hip position - primarily forward motion with minimal side sway
        const initialHipPos = hipPos.clone();
        const forwardSpeed = 0.2; // Forward motion per full cycle
        const hipSway = 0.005; // Very minimal side-to-side sway
        const hipVertical = 0.005; // Subtle up/down bob
        
        walkTracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, walkTimes, [
            initialHipPos.x, initialHipPos.y - hipVertical, initialHipPos.z,
            initialHipPos.x + hipSway, initialHipPos.y, initialHipPos.z + forwardSpeed * 0.125,
            initialHipPos.x, initialHipPos.y - hipVertical, initialHipPos.z + forwardSpeed * 0.25,
            initialHipPos.x - hipSway, initialHipPos.y, initialHipPos.z + forwardSpeed * 0.375,
            initialHipPos.x, initialHipPos.y - hipVertical, initialHipPos.z + forwardSpeed * 0.5,
            initialHipPos.x + hipSway, initialHipPos.y, initialHipPos.z + forwardSpeed * 0.625,
            initialHipPos.x, initialHipPos.y - hipVertical, initialHipPos.z + forwardSpeed * 0.75,
            initialHipPos.x - hipSway, initialHipPos.y, initialHipPos.z + forwardSpeed * 0.875,
            initialHipPos.x, initialHipPos.y - hipVertical, initialHipPos.z + forwardSpeed,
        ], interpolation));

        // Hip rotation - minimal rotation that follows leg movement
        const hipRotAngle = Math.PI / 48; // Much smaller rotation ~3.75 degrees
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hips.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipRotAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipRotAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipRotAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipRotAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ], interpolation));

        // Get hip joints for proper leg movement
        const hipL = skeleton.getBoneByName('left_hip');
        const hipR = skeleton.getBoneByName('right_hip');

        // Left hip and knee - proper walking cycle
        if (hipL) {
            const hipLegForward = Math.PI / 12; // 15 degrees forward
            const hipLegBack = -Math.PI / 24; // 7.5 degrees back
            walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hipL.name}.quaternion`, walkTimes, [
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // neutral
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward, 0, 0)).toArray(), // left leg forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward * 0.5, 0, 0)).toArray(), // transition
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegBack, 0, 0)).toArray(), // left leg back
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // neutral
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward, 0, 0)).toArray(), // left leg forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward * 0.5, 0, 0)).toArray(), // transition
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegBack, 0, 0)).toArray(), // left leg back
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // neutral
            ], interpolation));
        }

        if (hipR) {
            const hipLegForward = Math.PI / 12; // 15 degrees forward
            const hipLegBack = -Math.PI / 24; // 7.5 degrees back
            walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hipR.name}.quaternion`, walkTimes, [
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegBack, 0, 0)).toArray(), // right leg back
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // neutral
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward, 0, 0)).toArray(), // right leg forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward * 0.5, 0, 0)).toArray(), // transition
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegBack, 0, 0)).toArray(), // right leg back
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // neutral
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward, 0, 0)).toArray(), // right leg forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegForward * 0.5, 0, 0)).toArray(), // transition
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(hipLegBack, 0, 0)).toArray(), // right leg back
            ], interpolation));
        }

        // Left knee - bends when leg is forward or lifting
        const kneeBendAngle = Math.PI / 8; // 22.5 degrees
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // straight
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(), // bend when forward
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // slight bend
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 1.2, 0, 0)).toArray(), // lifting
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // straight
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(), // bend when forward
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // slight bend
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 1.2, 0, 0)).toArray(), // lifting
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // straight
        ], interpolation));

        // Right knee - opposite timing to left knee
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 1.2, 0, 0)).toArray(), // lifting
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // straight
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(), // bend when forward
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // slight bend
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 1.2, 0, 0)).toArray(), // lifting
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(), // straight
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(), // bend when forward
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // slight bend
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 1.2, 0, 0)).toArray(), // lifting
        ], interpolation));

        // Arms down but with natural walking swing (opposite to legs)
        const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
        const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');
        
        const armSwingAngle = Math.PI / 16; // 11.25 degrees - more natural swing
        const qSwingL_Forward = new THREE.Quaternion().setFromEuler(new THREE.Euler(-armSwingAngle, 0, 0));
        const qSwingL_Back = new THREE.Quaternion().setFromEuler(new THREE.Euler(armSwingAngle, 0, 0));
        const qSwingR_Forward = new THREE.Quaternion().setFromEuler(new THREE.Euler(-armSwingAngle, 0, 0));
        const qSwingR_Back = new THREE.Quaternion().setFromEuler(new THREE.Euler(armSwingAngle, 0, 0));

        // Left arm swings opposite to left leg (forward when right leg is forward)
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, walkTimes, [
            ...qSwingL_Forward.clone().multiply(qDownL).toArray(), // forward when right leg back
            ...qDownL.toArray(),
            ...qSwingL_Back.clone().multiply(qDownL).toArray(), // back when right leg forward
            ...qDownL.toArray(),
            ...qSwingL_Forward.clone().multiply(qDownL).toArray(), // forward when right leg back
            ...qDownL.toArray(),
            ...qSwingL_Back.clone().multiply(qDownL).toArray(), // back when right leg forward
            ...qDownL.toArray(),
            ...qSwingL_Forward.clone().multiply(qDownL).toArray(), // forward when right leg back
        ], interpolation));

        // Right arm swings opposite to left arm (and opposite to right leg)
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, walkTimes, [
            ...qSwingR_Back.clone().multiply(qDownR).toArray(), // back when left leg forward
            ...qDownR.toArray(),
            ...qSwingR_Forward.clone().multiply(qDownR).toArray(), // forward when left leg back
            ...qDownR.toArray(),
            ...qSwingR_Back.clone().multiply(qDownR).toArray(), // back when left leg forward
            ...qDownR.toArray(),
            ...qSwingR_Forward.clone().multiply(qDownR).toArray(), // forward when left leg back
            ...qDownR.toArray(),
            ...qSwingR_Back.clone().multiply(qDownR).toArray(), // back when left leg forward
        ], interpolation));

        // Natural elbow bends during walk
        const elbowWalkBend = Math.PI / 24; // More natural bend
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
        ], interpolation));

        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 0.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
        ], interpolation));

        // Very subtle spine movement for natural walking posture
        const spineWalkAngle = Math.PI / 72; // Very small counter-rotation
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${spine.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spineWalkAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -spineWalkAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spineWalkAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -spineWalkAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ], interpolation));

        const walkClip = new THREE.AnimationClip('walk', -1, walkTracks);
        animations.walk = walkClip;
    }

    return animations;
}