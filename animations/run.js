import * as THREE from 'three';
import { makeArmDownQuaternion } from './utils.js';

/**
 * Creates a run animation.
 * @param {THREE.Skeleton} skeleton - The skeleton to animate.
 * @param {THREE.Vector3} hipPos - The initial local position of the hip bone.
 * @param {Map<string, THREE.Vector3>} markerPositions - A map of bone names to their local positions.
 * @returns {THREE.AnimationClip|null}
 */
export function createRunAnimation(skeleton, hipPos, markerPositions) {
    const hips = skeleton.getBoneByName('hips');
    const spine = skeleton.getBoneByName('spine');
    const shoulderL = skeleton.getBoneByName('left_shoulder');
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const elbowL = skeleton.getBoneByName('left_elbow');
    const elbowR = skeleton.getBoneByName('right_elbow');
    const hipL = skeleton.getBoneByName('left_hip');
    const hipR = skeleton.getBoneByName('right_hip');
    const kneeL = skeleton.getBoneByName('left_knee');
    const kneeR = skeleton.getBoneByName('right_knee');
    const ankleL = skeleton.getBoneByName('left_ankle');
    const ankleR = skeleton.getBoneByName('right_ankle');

    if (!hips || !spine || !shoulderL || !shoulderR || !elbowL || !elbowR || !hipL || !hipR || !kneeL || !kneeR || !ankleL || !ankleR) return null;

    const runTimes = [0, 0.15, 0.3, 0.45, 0.6]; // Faster cycle for running
    const runTracks = [];
    const interpolation = THREE.InterpolateSmooth;

    // --- Hip Movement ---
    const initialHipPos = hipPos.clone();
    const hipVertical = 0.03; // Increased up/down bob for running
    runTracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, runTimes, [
        initialHipPos.x, initialHipPos.y, initialHipPos.z,               // Low point at contact
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z, // Peak height mid-air
        initialHipPos.x, initialHipPos.y, initialHipPos.z,               // Low point at contact
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z, // Peak height mid-air
        initialHipPos.x, initialHipPos.y, initialHipPos.z,
    ], interpolation));

    // Slight forward lean for the spine
    const forwardLeanAngle = Math.PI / 36; // 5 degrees lean
    const qSpineLean = new THREE.Quaternion().setFromEuler(new THREE.Euler(-forwardLeanAngle, 0, 0));


    // --- Leg Animation (based on running gait) ---
    const hipFlexion = Math.PI / 5;   // Max forward leg swing (36 deg)
    const hipExtension = -Math.PI / 6;  // Max backward leg swing (-30 deg)
    const kneeFlexion = Math.PI / 1.5; // Max knee bend during swing (120 deg)
    const ankleFlexion = Math.PI / 12; // Ankle bend up (15 deg)
    const ankleExtension = -Math.PI / 9; // Ankle bend down (-20 deg)

    const eHipForward = new THREE.Euler(0, 0, hipFlexion);
    const eHipBack = new THREE.Euler(0, 0, hipExtension);
    const eHipNeutral = new THREE.Euler(0, 0, 0);

    const qHipFwd = new THREE.Quaternion().setFromEuler(eHipForward);
    const qHipBack = new THREE.Quaternion().setFromEuler(eHipBack);
    const qHipNeutral = new THREE.Quaternion().setFromEuler(eHipNeutral);

    const eKneeStraight = new THREE.Euler(0, 0, 0);
    const eKneeBent = new THREE.Euler(0, 0, -kneeFlexion);
    const eKneeSlightlyBent = new THREE.Euler(0, 0, -kneeFlexion * 0.3);

    const qKneeStraight = new THREE.Quaternion().setFromEuler(eKneeStraight);
    const qKneeBent = new THREE.Quaternion().setFromEuler(eKneeBent);
    const qKneeSlightlyBent = new THREE.Quaternion().setFromEuler(eKneeSlightlyBent);

    const eAnkleNeutral = new THREE.Euler(0, 0, 0);
    const eAnkleUp = new THREE.Euler(0, 0, -ankleFlexion);
    const eAnkleDown = new THREE.Euler(0, 0, ankleExtension);

    const qAnkleNeutral = new THREE.Quaternion().setFromEuler(eAnkleNeutral);
    const qAnkleUp = new THREE.Quaternion().setFromEuler(eAnkleUp);
    const qAnkleDown = new THREE.Quaternion().setFromEuler(eAnkleDown);

    // Left Leg Keyframes (Starts cycle with foot strike)
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${hipL.name}.quaternion`, runTimes, [
        ...qHipFwd.toArray(), ...qHipNeutral.toArray(), ...qHipBack.toArray(), ...qHipNeutral.toArray(), ...qHipFwd.toArray()
    ], interpolation));
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, runTimes, [
        ...qKneeSlightlyBent.toArray(), ...qKneeSlightlyBent.toArray(), ...qKneeSlightlyBent.toArray(), ...qKneeBent.toArray(), ...qKneeSlightlyBent.toArray()
    ], interpolation));
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${ankleL.name}.quaternion`, runTimes, [
        ...qAnkleUp.toArray(), ...qAnkleNeutral.toArray(), ...qAnkleDown.toArray(), ...qAnkleUp.toArray(), ...qAnkleUp.toArray()
    ], interpolation));

    // Right Leg Keyframes (Offset by 0.5 cycle)
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${hipR.name}.quaternion`, runTimes, [
        ...qHipBack.toArray(), ...qHipNeutral.toArray(), ...qHipFwd.toArray(), ...qHipNeutral.toArray(), ...qHipBack.toArray()
    ], interpolation));
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, runTimes, [
        ...qKneeSlightlyBent.toArray(), ...qKneeBent.toArray(), ...qKneeSlightlyBent.toArray(), ...qKneeSlightlyBent.toArray(), ...qKneeSlightlyBent.toArray()
    ], interpolation));
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${ankleR.name}.quaternion`, runTimes, [
        ...qAnkleDown.toArray(), ...qAnkleUp.toArray(), ...qAnkleUp.toArray(), ...qAnkleNeutral.toArray(), ...qAnkleDown.toArray()
    ], interpolation));

    // --- Arm Swing ---
    const qDownL = makeArmDownQuaternion(markerPositions, 'left_shoulder', 'left_elbow');
    const qDownR = makeArmDownQuaternion(markerPositions, 'right_shoulder', 'right_elbow');

    // Make the forward arm swing more pronounced than the backward swing for a more powerful run.
    const armSwingForwardAngle = Math.PI / 4.5; // ~40 degrees forward
    const armSwingBackwardAngle = Math.PI / 9;  // ~20 degrees backward

    const qSwingFwd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, armSwingForwardAngle));
    const qSwingBack = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwingBackwardAngle));

    // Right arm swings forward with left leg.
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, runTimes, [
        ...qDownR.clone().premultiply(qSwingFwd).toArray(),
        ...qDownR.toArray(),
        ...qDownR.clone().premultiply(qSwingBack).toArray(),
        ...qDownR.toArray(),
        ...qDownR.clone().premultiply(qSwingFwd).toArray(),
    ], interpolation));

    // Left arm swings opposite.
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, runTimes, [
        ...qDownL.clone().premultiply(qSwingBack).toArray(),
        ...qDownL.toArray(),
        ...qDownL.clone().premultiply(qSwingFwd).toArray(),
        ...qDownL.toArray(),
        ...qDownL.clone().premultiply(qSwingBack).toArray(),
    ], interpolation));

    // Elbows are bent more in a run. Increased slightly to match new swing.
    const elbowRunBend = Math.PI / 2.5; // 72 degree bend
    // The inward angle corrects the forearms from splaying outwards.
    // A positive Y rotation on the left and negative on the right brings them inward.
    const forearmInwardAngle = -Math.PI / 4; // -45 degrees for a clear inward bend.

    // Euler order 'YXZ' is used to apply the inward twist (Y) before the main bend (Z).
    const qElbowL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, forearmInwardAngle, elbowRunBend, 'YXZ'));
    const qElbowR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -forearmInwardAngle, elbowRunBend, 'YXZ'));

    runTracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, [0], qElbowL.toArray()));
    runTracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, [0], qElbowR.toArray()));

    // Spine counter-rotation for balance
    const spineCounterAngle = Math.PI / 24; // ~7.5 degrees
    const qSpineRotL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spineCounterAngle, 0));
    const qSpineRotR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -spineCounterAngle, 0));

    const qNeutralSpine = new THREE.Quaternion(); // Neutral rotation

    // Combine lean and rotation
    const qFinalSpineR = qSpineLean.clone().multiply(qSpineRotR);
    const qFinalSpineL = qSpineLean.clone().multiply(qSpineRotL);
    const qFinalSpineNeutral = qSpineLean.clone().multiply(qNeutralSpine);

    runTracks.push(new THREE.QuaternionKeyframeTrack(`${spine.name}.quaternion`, runTimes, [
        ...qFinalSpineR.toArray(),
        ...qFinalSpineNeutral.toArray(),
        ...qFinalSpineL.toArray(),
        ...qFinalSpineNeutral.toArray(),
        ...qFinalSpineR.toArray(),
    ], interpolation));

    const runClip = new THREE.AnimationClip('run', -1, runTracks);
    return runClip;
}