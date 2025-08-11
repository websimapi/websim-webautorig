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
    await new Promise(res => setTimeout(res, 100));

    // 1) Gather marker positions in model-local space and create bones
    const bones = [];
    const boneMap = new Map();
    const markerPositions = new Map();

    for (const id of BONE_NAMES) {
        const worldPos = markers.get(id);
        if (!worldPos) throw new Error(`Missing marker: ${id}`);
        const localPos = worldPos.clone().applyMatrix4(modelInverseMatrix);
        markerPositions.set(id, localPos);

        const bone = new THREE.Bone();
        bone.name = id;
        boneMap.set(id, bone);
        bones.push(bone);
    }

    // 2) Build hierarchy and local positions
    for (const [id, bone] of boneMap.entries()) {
        const parentId = Object.keys(BONE_HIERARCHY).find(p => BONE_HIERARCHY[p].children.includes(id));
        if (parentId) {
            const parentBone = boneMap.get(parentId);
            parentBone.add(bone);
            const childLocalPos = markerPositions.get(id);
            const parentLocalPos = markerPositions.get(parentId);
            bone.position.copy(childLocalPos).sub(parentLocalPos);
        } else {
            // Root (hips)
            bone.position.copy(markerPositions.get(id));
        }
    }

    // Skeleton from bone list
    const skeleton = new THREE.Skeleton(bones);
    const rootBone = boneMap.get('hips');

    // 3) Collect ALL meshes under the model
    const sourceMeshes = [];
    model.updateMatrixWorld(true);
    model.traverse(child => {
        if (child.isMesh && child.geometry && child.geometry.attributes?.position) {
            sourceMeshes.push(child);
        }
    });

    if (sourceMeshes.length === 0) {
        throw new Error("No meshes with geometry found in the model.");
    }

    onProgress(0.4, "Computing skinning weights...");
    await new Promise(res => setTimeout(res, 100));

    // Helper for distance-to-segment squared
    function distanceToSegmentSq(point, segStart, segEnd) {
        const l2 = segStart.distanceToSquared(segEnd);
        if (l2 === 0) return point.distanceToSquared(segStart);
        let t = ((point.x - segStart.x) * (segEnd.x - segStart.x) + (point.y - segStart.y) * (segEnd.y - segStart.y) + (point.z - segStart.z) * (segEnd.z - segStart.z)) / l2;
        t = Math.max(0, Math.min(1, t));
        const closestPointOnSegment = segStart.clone().lerp(segEnd, t);
        return point.distanceToSquared(closestPointOnSegment);
    }

    // Precompute bone segments in model-local space
    const boneSegments = [];
    const boneIndexMap = new Map(bones.map((bone, index) => [bone.name, index]));
    for (const bone of bones) {
        const startPos = markerPositions.get(bone.name);
        const childrenNames = BONE_HIERARCHY[bone.name]?.children || [];
        if (childrenNames.length > 0) {
            for (const childName of childrenNames) {
                const endPos = markerPositions.get(childName);
                if (endPos) {
                    boneSegments.push({
                        boneIndex: boneIndexMap.get(bone.name),
                        boneName: bone.name,
                        start: startPos,
                        end: endPos
                    });
                }
            }
        } else {
            boneSegments.push({
                boneIndex: boneIndexMap.get(bone.name),
                boneName: bone.name,
                start: startPos,
                end: startPos
            });
        }
    }

    // Region guards (all in model-local space)
    const hipsPos = markerPositions.get('hips')?.clone() || new THREE.Vector3();
    const neckPos = markerPositions.get('neck')?.clone() || new THREE.Vector3();
    const spinePos = markerPositions.get('spine')?.clone() || new THREE.Vector3();

    const midX = hipsPos.x;
    const headGuard = 0.02;
    const sideTol = 0.01;

    function allowBoneForVertex(boneName, vModelLocal) {
        const isHeadArea = vModelLocal.y > (neckPos.y + headGuard);

        if (isHeadArea) {
            if (boneName.startsWith('left_') || boneName.startsWith('right_')) {
                if (boneName.includes('hip') || boneName.includes('knee') || boneName.includes('ankle') ||
                    boneName.includes('shoulder') || boneName.includes('elbow') || boneName.includes('wrist') || boneName.includes('clavicle')) {
                    return false;
                }
            }
        }

        if (boneName.startsWith('left_')) {
            if (vModelLocal.x < (midX - sideTol)) return false;
        }
        if (boneName.startsWith('right_')) {
            if (vModelLocal.x > (midX + sideTol)) return false;
        }

        if ((boneName.includes('shoulder') || boneName.includes('elbow') || boneName.includes('wrist') || boneName.includes('clavicle')) &&
            vModelLocal.y > (neckPos.y + headGuard)) {
            return false;
        }

        if ((boneName.includes('knee') || boneName.includes('ankle') || boneName.includes('hip')) && vModelLocal.y > spinePos.y) {
            if (!boneName.includes('hips')) return false;
        }

        return true;
    }

    function computeSkinAttributesForGeometry(geometry, meshLocalToModelMatrix) {
        const position = geometry.attributes.position;
        const skinIndex = new THREE.BufferAttribute(new Uint16Array(position.count * 4), 4);
        const skinWeight = new THREE.BufferAttribute(new Float32Array(position.count * 4), 4);

        const temp = new THREE.Vector3();

        for (let i = 0; i < position.count; i++) {
            temp.fromBufferAttribute(position, i).applyMatrix4(meshLocalToModelMatrix);

            const boneDistances = boneSegments.map(segment => {
                const allowed = allowBoneForVertex(segment.boneName, temp);
                const distanceSq = allowed ? distanceToSegmentSq(temp, segment.start, segment.end) : Number.POSITIVE_INFINITY;
                return {
                    index: segment.boneIndex,
                    name: segment.boneName,
                    distanceSq
                };
            });

            const minBoneDistances = new Map();
            for (const dist of boneDistances) {
                if (!minBoneDistances.has(dist.index) || dist.distanceSq < minBoneDistances.get(dist.index).distanceSq) {
                    minBoneDistances.set(dist.index, { distanceSq: dist.distanceSq });
                }
            }

            const uniqueBoneDistances = Array.from(minBoneDistances.entries())
                .filter(([, obj]) => Number.isFinite(obj.distanceSq))
                .map(([index, obj]) => ({
                    index,
                    distance: Math.sqrt(obj.distanceSq)
                }));

            if (uniqueBoneDistances.length === 0) {
                const torsoCandidates = ['hips', 'spine', 'neck'];
                const torsoDistances = boneSegments
                    .filter(s => torsoCandidates.includes(s.boneName))
                    .map(s => ({
                        index: s.boneIndex,
                        distance: Math.sqrt(distanceToSegmentSq(temp, s.start, s.end))
                    }));
                torsoDistances.sort((a, b) => a.distance - b.distance);
                uniqueBoneDistances.push(...torsoDistances.slice(0, 4));
            }

            uniqueBoneDistances.sort((a, b) => a.distance - b.distance);
            const closestBones = uniqueBoneDistances.slice(0, 4);

            let totalWeight = 0;
            const weights = closestBones.map(b => {
                const w = 1.0 / (Math.pow(b.distance, 4) + 1e-8);
                totalWeight += w;
                return { index: b.index, weight: w };
            });

            const final = [];
            for (let j = 0; j < 4; j++) {
                if (weights[j]) {
                    final.push({ index: weights[j].index, weight: weights[j].weight / totalWeight });
                } else {
                    final.push({ index: 0, weight: 0 });
                }
            }

            skinIndex.setXYZW(i, final[0].index, final[1].index, final[2].index, final[3].index);
            skinWeight.setXYZW(i, final[0].weight, final[1].weight, final[2].weight, final[3].weight);
        }

        geometry.setAttribute('skinIndex', skinIndex);
        geometry.setAttribute('skinWeight', skinWeight);
    }

    // 4) Build rigged model with a shared skeleton and skinned meshes for ALL parts
    onProgress(0.75, "Binding meshes to skeleton...");
    await new Promise(res => setTimeout(res, 50));

    const riggedModel = new THREE.Group();
    riggedModel.name = 'RiggedModel';

    // Place bones once into the rigged model (model-local space)
    const bonesRoot = new THREE.Group();
    bonesRoot.name = 'BonesRoot';
    bonesRoot.add(rootBone);
    riggedModel.add(bonesRoot);

    // Prepare each mesh
    const skinnedMeshes = [];
    for (const srcMesh of sourceMeshes) {
        // Build transform that converts geometry positions from mesh-local to model-local
        // modelInverseMatrix is inverse(model.matrixWorld), so:
        // modelLocalPos = modelInverseMatrix * mesh.matrixWorld * meshLocalPos
        const meshLocalToModelMatrix = new THREE.Matrix4().copy(srcMesh.matrixWorld).premultiply(modelInverseMatrix);

        // Clone geometry so we don't mutate original, and compute weights for this mesh
        const geometry = srcMesh.geometry.clone();
        computeSkinAttributesForGeometry(geometry, meshLocalToModelMatrix);

        // Material(s) with skinning enabled
        const material = Array.isArray(srcMesh.material)
            ? srcMesh.material.map(m => {
                const c = m.clone ? m.clone() : m;
                if ('skinning' in c) c.skinning = true;
                return c;
            })
            : (() => {
                const c = srcMesh.material && srcMesh.material.clone ? srcMesh.material.clone() : srcMesh.material;
                if (c && 'skinning' in c) c.skinning = true;
                return c;
            })();

        const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
        skinnedMesh.name = srcMesh.name || 'SkinnedPart';
        skinnedMesh.frustumCulled = false;

        // Copy the original local transform relative to the model
        skinnedMesh.position.copy(srcMesh.position);
        skinnedMesh.quaternion.copy(srcMesh.quaternion);
        skinnedMesh.scale.copy(srcMesh.scale);

        // Ensure matrices are updated before binding
        riggedModel.add(skinnedMesh);
        riggedModel.updateMatrixWorld(true);
        bonesRoot.updateMatrixWorld(true);

        skinnedMesh.bind(skeleton);

        skinnedMeshes.push(skinnedMesh);
    }

    onProgress(0.9, "Finalizing rig...");
    await new Promise(res => setTimeout(res, 50));

    // 5) Create test animations (uses marker-based adaptive idle + wave)
    const animations = createTestAnimations(skeleton, boneMap.get('hips').position.clone(), markerPositions);

    return { riggedModel, animations };
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

    return animations;
}