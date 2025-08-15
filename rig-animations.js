import * as THREE from 'three';
import { BONE_HIERARCHY } from './rig-constants.js';

export function createTestAnimations(skeleton, hipPos, markerPositions) {
    const animations = {};
    
    const hips = skeleton.getBoneByName('hips');
    const spine = skeleton.getBoneByName('spine');
    const shoulderL = skeleton.getBoneByName('left_shoulder');
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const elbowL = skeleton.getBoneByName('left_elbow');
    const elbowR = skeleton.getBoneByName('right_elbow');
    const kneeL = skeleton.getBoneByName('left_knee');
    const kneeR = skeleton.getBoneByName('right_knee');

    // Wave animation (right arm)
    if (shoulderR && elbowR) {
        const times = [0, 0.5, 1, 1.5, 2];
        const shoulderZAngle = Math.PI / 4;
        const shoulderValues = [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, shoulderZAngle)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, shoulderZAngle)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ];
        const shoulderTrack = new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, times, shoulderValues);

        const elbowYAngle = -Math.PI / 2;
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

    const makeArmDownQuaternion = (shoulderName, elbowName) => {
        const s = markerPositions.get(shoulderName);
        const e = markerPositions.get(elbowName);
        if (!s || !e) return new THREE.Quaternion();
        const currentDir = e.clone().sub(s).normalize();
        const downDir = new THREE.Vector3(0, -1, 0);
        return new THREE.Quaternion().setFromUnitVectors(currentDir, downDir);
    };

    // Idle animation (arms down from T-pose, subtle sway)
    if (hips && spine && shoulderL && shoulderR && kneeL && kneeR) {
        const idleTimes = [0, 1, 2, 3, 4];
        const interpolation = THREE.InterpolateSmooth;
        const tracks = [];

        const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
        const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');

        const armSwayAngle = Math.PI / 36;
        const qSwayL_Pos = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, +armSwayAngle));
        const qSwayL_Neg = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwayAngle));
        const qSwayR_Pos = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, +armSwayAngle));
        const qSwayR_Neg = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwayAngle));

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

        const swayAmount = 0.01;
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

        const kneeBendAngle = Math.PI / 30;
        const qKnee_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
        const qKnee_Bent = new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, idleTimes, [
            ...qKnee_Base.toArray(), ...qKnee_Bent.toArray(), ...qKnee_Base.toArray(), ...qKnee_Base.toArray(), ...qKnee_Base.toArray()
        ], interpolation));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, idleTimes, [
            ...qKnee_Base.toArray(), ...qKnee_Base.toArray(), ...qKnee_Base.toArray(), ...qKnee_Bent.toArray(), ...qKnee_Base.toArray()
        ], interpolation));

        if (elbowL) {
            const qElbowL_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 16, 0));
            tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, idleTimes, [
                ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray(), ...qElbowL_Base.toArray()
            ], interpolation));
        }
        if (elbowR) {
            const qElbowR_Base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 16, 0));
            tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, idleTimes, [
                ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray(), ...qElbowR_Base.toArray()
            ], interpolation));
        }

        const idleClip = new THREE.AnimationClip('idle', -1, tracks);
        animations.idle = idleClip;
    }

    // Walk animation (forward/backward cycle with correct axes)
    if (hips && spine && shoulderL && shoulderR && elbowL && elbowR && kneeL && kneeR) {
        const hipL = skeleton.getBoneByName('left_hip');
        const hipR = skeleton.getBoneByName('right_hip');
        
        const walkTimes = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const walkTracks = [];
        const interpolation = THREE.InterpolateSmooth;

        // Hips: forward (Z+) and subtle vertical bob; minimal lateral sway
        const initialHipPos = hipPos.clone();
        const stepLength = 0.02;
        const hipVertical = 0.008;
        walkTracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, walkTimes, [
            initialHipPos.x, initialHipPos.y, initialHipPos.z,
            initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 0.25,
            initialHipPos.x, initialHipPos.y, initialHipPos.z + stepLength * 0.5,
            initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 0.75,
            initialHipPos.x, initialHipPos.y, initialHipPos.z + stepLength,
            initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 1.25,
            initialHipPos.x, initialHipPos.y, initialHipPos.z + stepLength * 1.5,
            initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z + stepLength * 1.75,
            initialHipPos.x, initialHipPos.y, initialHipPos.z + stepLength * 2,
        ], interpolation));

        // Small yaw oscillation for hips to add realism
        const hipRotAngle = Math.PI / 36;
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

        // Leg swing is around X (forward/back) relative to rest pose orientation
        if (hipL) {
            const legStepAngle = Math.PI / 12;
            walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hipL.name}.quaternion`, walkTimes, [
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legStepAngle, 0, 0)).toArray(),   // Left leg forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legStepAngle, 0, 0)).toArray(),  // Left leg back
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legStepAngle, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legStepAngle, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legStepAngle, 0, 0)).toArray(),
            ], interpolation));
        }
        if (hipR) {
            const legStepAngle = Math.PI / 12;
            walkTracks.push(new THREE.QuaternionKeyframeTrack(`${hipR.name}.quaternion`, walkTimes, [
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legStepAngle, 0, 0)).toArray(),  // Right leg back
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legStepAngle, 0, 0)).toArray(),   // Right leg forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legStepAngle, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legStepAngle, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legStepAngle, 0, 0)).toArray(),
            ], interpolation));
        }

        const kneeBendAngle = Math.PI / 6;
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),
        ], interpolation));
        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, walkTimes, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBendAngle * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ], interpolation));

        // Arms swing forward/back around X when arms are down
        const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
        const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');
        const armSwingAngle = Math.PI / 15;
        const qSwingF = new THREE.Quaternion().setFromEuler(new THREE.Euler(armSwingAngle, 0, 0));
        const qSwingB = new THREE.Quaternion().setFromEuler(new THREE.Euler(-armSwingAngle, 0, 0));

        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, walkTimes, [
            ...qSwingB.clone().multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...qSwingF.clone().multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...qSwingB.clone().multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...qSwingF.clone().multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...qSwingB.clone().multiply(qDownL).toArray(),
        ], interpolation));

        walkTracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, walkTimes, [
            ...qSwingF.clone().multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...qSwingB.clone().multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...qSwingF.clone().multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...qSwingB.clone().multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...qSwingF.clone().multiply(qDownR).toArray(),
        ], interpolation));

        const elbowWalkBend = Math.PI / 20;
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

        const spineCounterAngle = Math.PI / 36;
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

        const walkClip = new THREE.AnimationClip('walk', -1, walkTracks);
        animations.walk = walkClip;
    }

    return animations;
}