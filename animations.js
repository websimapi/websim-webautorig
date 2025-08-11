/**
 * Animation creation utilities for rigged characters
 */
import * as THREE from 'three';

/**
 * Creates test animations for a rigged character
 * @param {THREE.Skeleton} skeleton - The character skeleton
 * @param {THREE.Vector3} hipPos - Position of the hip bone
 * @param {Map} markerPositions - Map of marker positions
 * @returns {Object} Object containing animation clips
 */
export function createTestAnimations(skeleton, hipPos, markerPositions) {
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

    // Create wave animation
    if (shoulderR && elbowR) {
        animations.wave = createWaveAnimation(shoulderR, elbowR);
    }

    // Create idle animation
    if (hips && spine && shoulderL && shoulderR && kneeL && kneeR) {
        animations.idle = createIdleAnimation(
            { hips, spine, shoulderL, shoulderR, elbowL, elbowR, kneeL, kneeR },
            hipPos,
            markerPositions
        );
    }

    // Create walking animation
    if (hips && spine && shoulderL && shoulderR && elbowL && elbowR && kneeL && kneeR) {
        const hipL = skeleton.getBoneByName('left_hip');
        const hipR = skeleton.getBoneByName('right_hip');
        
        if (hipL && hipR) {
            animations.walk = createWalkAnimation(
                { hips, spine, shoulderL, shoulderR, elbowL, elbowR, kneeL, kneeR, hipL, hipR },
                hipPos,
                markerPositions
            );
        }
    }

    return animations;
}

/**
 * Creates a wave animation for the right arm
 */
function createWaveAnimation(shoulderR, elbowR) {
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

    return new THREE.AnimationClip('wave', -1, [shoulderTrack, elbowTrack]);
}

/**
 * Creates an idle animation with arms down and subtle body movement
 */
function createIdleAnimation(bones, hipPos, markerPositions) {
    const { hips, spine, shoulderL, shoulderR, elbowL, elbowR, kneeL, kneeR } = bones;
    
    const idleTimes = [0, 1, 2, 3, 4];
    const interpolation = THREE.InterpolateSmooth;
    const tracks = [];

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

    return new THREE.AnimationClip('idle', -1, tracks);
}

/**
 * Creates a walking animation with coordinated leg and arm movement
 */
function createWalkAnimation(bones, hipPos, markerPositions) {
    const { hips, spine, shoulderL, shoulderR, elbowL, elbowR, kneeL, kneeR, hipL, hipR } = bones;
    
    const walkTimes = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const walkTracks = [];
    const interpolation = THREE.InterpolateSmooth;

    // Hip position - forward/backward and side-to-side motion
    const initialHipPos = hipPos.clone();
    const stepLength = 0.02; // Smaller forward motion per step
    const hipSway = 0.015; // Side-to-side sway
    const hipVertical = 0.008; // Up/down bob
    
    walkTracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, walkTimes, [
        initialHipPos.x - hipSway, initialHipPos.y, initialHipPos.z,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 0.25,
        initialHipPos.x + hipSway, initialHipPos.y, initialHipPos.z + stepLength * 0.5,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 0.75,
        initialHipPos.x - hipSway, initialHipPos.y, initialHipPos.z + stepLength,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 1.25,
        initialHipPos.x + hipSway, initialHipPos.y, initialHipPos.z + stepLength * 1.5,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 1.75,
        initialHipPos.x - hipSway, initialHipPos.y, initialHipPos.z + stepLength * 2,
    ], interpolation));

    // Hip rotation - slight rotation with steps
    const hipRotAngle = Math.PI / 36; // Reduced rotation ~5 degrees
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hips.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipRotAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipRotAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipRotAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipRotAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipRotAngle, 0)).toArray(),
    ], interpolation));

    // Left hip joint - creates the stepping motion by rotating the entire leg forward/backward
    const legStepAngle = Math.PI / 12; // 15 degrees forward/backward step
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hipL.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -legStepAngle)).toArray(), // Left leg back
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, legStepAngle)).toArray(),   // Left leg forward
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -legStepAngle)).toArray(), // Left leg back
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, legStepAngle)).toArray(),   // Left leg forward
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -legStepAngle)).toArray(), // Left leg back
    ], interpolation));

    // Right hip joint - opposite phase to left hip
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hipR.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, legStepAngle)).toArray(),   // Right leg forward (opposite)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -legStepAngle)).toArray(), // Right leg back
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, legStepAngle)).toArray(),   // Right leg forward
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -legStepAngle)).toArray(), // Right leg back
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Neutral
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, legStepAngle)).toArray(),   // Right leg forward
    ], interpolation));

    // Add knee and arm movements (continuing with existing logic)
    addKneeMovements(walkTracks, walkTimes, kneeL, kneeR, interpolation);
    addArmMovements(walkTracks, walkTimes, shoulderL, shoulderR, elbowL, elbowR, markerPositions, interpolation);
    addSpineMovement(walkTracks, walkTimes, spine, interpolation);

    return new THREE.AnimationClip('walk', -1, walkTracks);
}

/**
 * Helper functions for walk animation
 */
function addKneeMovements(walkTracks, walkTimes, kneeL, kneeR, interpolation) {
    const kneeBendAngle = Math.PI / 6; // 30 degrees - more bend when lifting
    
    // Left knee - bends when leg is lifting (when leg is moving forward)
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Straight (leg back/planted)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Starting to bend
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),   // Max bend (leg forward/lifting)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Straightening
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Straight (leg back/planted)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Starting to bend
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),   // Max bend (leg forward/lifting)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Straightening
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Straight (leg back/planted)
    ], interpolation));

    // Right knee - opposite phase, bends when right leg is lifting
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),   // Max bend (leg forward/lifting) - opposite phase
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Straightening
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Straight (leg back/planted)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Starting to bend
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),   // Max bend (leg forward/lifting)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Straightening
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),              // Straight (leg back/planted)
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(), // Starting to bend
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),   // Max bend (leg forward/lifting)
    ], interpolation));
}

function addArmMovements(walkTracks, walkTimes, shoulderL, shoulderR, elbowL, elbowR, markerPositions, interpolation) {
    // Utility function for arm down orientation
    const makeArmDownQuaternion = (shoulderName, elbowName) => {
        const s = markerPositions.get(shoulderName);
        const e = markerPositions.get(elbowName);
        if (!s || !e) return new THREE.Quaternion();
        
        const currentDir = e.clone().sub(s).normalize();
        const downDir = new THREE.Vector3(0, -1, 0);
        return new THREE.Quaternion().setFromUnitVectors(currentDir, downDir);
    };

    // Arms down but with side-to-side swing (around Z-axis since arms are down)
    const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
    const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');
    
    const armSwingAngle = Math.PI / 12; // 15 degrees
    const qSwingL_Forward = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwingAngle));
    const qSwingL_Back = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, armSwingAngle));
    const qSwingR_Forward = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, armSwingAngle));
    const qSwingR_Back = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwingAngle));

    // Left arm swings forward when right leg is forward (opposite motion)
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, walkTimes, [
        ...qSwingL_Back.clone().multiply(qDownL).toArray(),
        ...qDownL.toArray(),
        ...qSwingL_Forward.clone().multiply(qDownL).toArray(),
        ...qDownL.toArray(),
        ...qSwingL_Back.clone().multiply(qDownL).toArray(),
        ...qDownL.toArray(),
        ...qSwingL_Forward.clone().multiply(qDownL).toArray(),
        ...qDownL.toArray(),
        ...qSwingL_Back.clone().multiply(qDownL).toArray(),
    ], interpolation));

    // Right arm swings opposite to left arm
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, walkTimes, [
        ...qSwingR_Forward.clone().multiply(qDownR).toArray(),
        ...qDownR.toArray(),
        ...qSwingR_Back.clone().multiply(qDownR).toArray(),
        ...qDownR.toArray(),
        ...qSwingR_Forward.clone().multiply(qDownR).toArray(),
        ...qDownR.toArray(),
        ...qSwingR_Back.clone().multiply(qDownR).toArray(),
        ...qDownR.toArray(),
        ...qSwingR_Forward.clone().multiply(qDownR).toArray(),
    ], interpolation));

    // Slight elbow bends during walk
    const elbowWalkBend = Math.PI / 20; // Small bend
    if (elbowL) {
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowWalkBend, 0)).toArray(),
        ], interpolation));
    }

    if (elbowR) {
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
        ], interpolation));
    }
}

function addSpineMovement(walkTracks, walkTimes, spine, interpolation) {
    // Spine counter-rotation for balance
    const spineCounterAngle = Math.PI / 36; // Small counter-rotation
    walkTracks.push(new THREE.QuaternionKeyframeTrack(`${spine.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spineCounterAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -spineCounterAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spineCounterAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -spineCounterAngle, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spineCounterAngle, 0)).toArray(),
    ], interpolation));
}