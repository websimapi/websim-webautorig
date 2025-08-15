import * as THREE from 'three';

export function createAnimations(skeleton, hipPos, markerPositions) {
    const animations = {};

    const hips = skeleton.getBoneByName('hips');
    const spine = skeleton.getBoneByName('spine');
    const shoulderL = skeleton.getBoneByName('left_shoulder');
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const elbowL = skeleton.getBoneByName('left_elbow');
    const elbowR = skeleton.getBoneByName('right_elbow');
    const kneeL = skeleton.getBoneByName('left_knee');
    const kneeR = skeleton.getBoneByName('right_knee');

    // Wave (right arm)
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
        const elbowYAngle = -Math.PI / 2;
        const elbowValues = [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowYAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowYAngle, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ];
        const waveClip = new THREE.AnimationClip('wave', -1, [
            new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, times, shoulderValues),
            new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, times, elbowValues),
        ]);
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

    // Idle (arms down + subtle motion)
    if (hips && spine && shoulderL && shoulderR) {
        const idleTimes = [0, 1, 2, 3, 4];
        const tracks = [];

        const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
        const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');

        const armSwayAngle = Math.PI / 36;
        const qSwayPos = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, +armSwayAngle));
        const qSwayNeg = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -armSwayAngle));

        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, idleTimes, [
            ...qDownL.toArray(),
            ...qSwayPos.clone().multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...qSwayNeg.clone().multiply(qDownL).toArray(),
            ...qDownL.toArray(),
        ], THREE.InterpolateSmooth));

        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, idleTimes, [
            ...qDownR.toArray(),
            ...qSwayNeg.clone().multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...qSwayPos.clone().multiply(qDownR).toArray(),
            ...qDownR.toArray(),
        ], THREE.InterpolateSmooth));

        const swayAmount = 0.01;
        const baseHip = hipPos.clone();
        tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, idleTimes, [
            baseHip.x, baseHip.y, baseHip.z,
            baseHip.x + swayAmount, baseHip.y, baseHip.z,
            baseHip.x, baseHip.y, baseHip.z,
            baseHip.x - swayAmount, baseHip.y, baseHip.z,
            baseHip.x, baseHip.y, baseHip.z,
        ], THREE.InterpolateSmooth));

        const spineSwayAngle = -swayAmount / 0.2;
        const qSpineBase = new THREE.Quaternion();
        const qSpineL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, spineSwayAngle));
        const qSpineR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -spineSwayAngle));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${spine.name}.quaternion`, idleTimes, [
            ...qSpineBase.toArray(), ...qSpineL.toArray(), ...qSpineBase.toArray(), ...qSpineR.toArray(), ...qSpineBase.toArray()
        ], THREE.InterpolateSmooth));

        if (kneeL) {
            const kneeBend = Math.PI / 30;
            const qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
            const qBent = new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend, 0, 0));
            const knees = new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, idleTimes, [
                ...qBase.toArray(), ...qBase.toArray(), ...qBase.toArray(), ...qBent.toArray(), ...qBase.toArray()
            ], THREE.InterpolateSmooth);
            tracks.push(knees);
        }
        if (kneeR) {
            const kneeBend = Math.PI / 30;
            const qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
            const qBent = new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend, 0, 0));
            const knees = new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, idleTimes, [
                ...qBent.toArray(), ...qBase.toArray(), ...qBase.toArray(), ...qBase.toArray(), ...qBase.toArray()
            ], THREE.InterpolateSmooth);
            tracks.push(knees);
        }
        if (elbowL) {
            const qElbow = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 16, 0));
            tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, idleTimes, [
                ...qElbow.toArray(), ...qElbow.toArray(), ...qElbow.toArray(), ...qElbow.toArray(), ...qElbow.toArray()
            ], THREE.InterpolateSmooth));
        }
        if (elbowR) {
            const qElbow = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 16, 0));
            tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, idleTimes, [
                ...qElbow.toArray(), ...qElbow.toArray(), ...qElbow.toArray(), ...qElbow.toArray(), ...qElbow.toArray()
            ], THREE.InterpolateSmooth));
        }

        animations.idle = new THREE.AnimationClip('idle', -1, tracks);
    }

    // Walk (forward/back) correcting axis to Z-forward
    if (hips && spine && shoulderL && shoulderR && elbowL && elbowR && kneeL && kneeR) {
        const hipL = skeleton.getBoneByName('left_hip');
        const hipR = skeleton.getBoneByName('right_hip');

        const times = [0, 0.25, 0.5, 0.75, 1];
        const tracks = [];
        const interp = THREE.InterpolateSmooth;

        // Hips move forward in +Z with slight vertical bob; minimal X sway to avoid side-stepping feel
        const base = hipPos.clone();
        const stepLen = 0.06;
        const bob = 0.01;
        tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, [
            base.x, base.y, base.z,
            base.x, base.y + bob, base.z + stepLen * 0.25,
            base.x, base.y, base.z + stepLen * 0.5,
            base.x, base.y + bob, base.z + stepLen * 0.75,
            base.x, base.y, base.z + stepLen,
        ], interp));

        // Slight hip yaw for counterbalance
        const hipYaw = Math.PI / 60;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${hips.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipYaw, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipYaw, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -hipYaw, 0)).toArray(),
        ], interp));

        // Legs swing forward/back around X (assuming forward/back is Z, using hip joint to drive)
        const legSwing = Math.PI / 10;
        if (hipL) {
            tracks.push(new THREE.QuaternionKeyframeTrack(`${hipL.name}.quaternion`, times, [
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legSwing, 0, 0)).toArray(),   // forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legSwing, 0, 0)).toArray(),  // backward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legSwing, 0, 0)).toArray(),
            ], interp));
        }
        if (hipR) {
            tracks.push(new THREE.QuaternionKeyframeTrack(`${hipR.name}.quaternion`, times, [
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legSwing, 0, 0)).toArray(),  // backward (opposite)
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(legSwing, 0, 0)).toArray(),   // forward
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
                ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-legSwing, 0, 0)).toArray(),
            ], interp));
        }

        // Knees bend when the corresponding leg is forward (swing phase)
        const kneeBend = Math.PI / 6;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend, 0, 0)).toArray(),
        ], interp));

        tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(kneeBend * 0.5, 0, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
        ], interp));

        // Arms swing opposite to legs around X, from arms-down base
        const qDownL = makeArmDownQuaternion('left_shoulder', 'left_elbow');
        const qDownR = makeArmDownQuaternion('right_shoulder', 'right_elbow');
        const armSwing = Math.PI / 12;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-armSwing, 0, 0)).multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(armSwing, 0, 0)).multiply(qDownL).toArray(),
            ...qDownL.toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-armSwing, 0, 0)).multiply(qDownL).toArray(),
        ], interp));

        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(armSwing, 0, 0)).multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-armSwing, 0, 0)).multiply(qDownR).toArray(),
            ...qDownR.toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(armSwing, 0, 0)).multiply(qDownR).toArray(),
        ], interp));

        // Elbows light bend for natural feel
        const elbowBend = Math.PI / 20;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowBend * 1.2, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowBend * 1.2, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, elbowBend, 0)).toArray(),
        ], interp));

        tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, times, [
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowBend * 1.2, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowBend, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowBend * 1.2, 0)).toArray(),
            ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowBend, 0)).toArray(),
        ], interp));

        animations.walk = new THREE.AnimationClip('walk', -1, tracks);
    }

    return animations;
}