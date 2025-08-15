import * as THREE from 'three';

export function createWalkClip(skeleton, hipPos, markerPositions) {
    const hips = skeleton.getBoneByName('hips');
    const spine = skeleton.getBoneByName('spine');
    const shoulderL = skeleton.getBoneByName('left_shoulder');
    const shoulderR = skeleton.getBoneByName('right_shoulder');
    const elbowL = skeleton.getBoneByName('left_elbow');
    const elbowR = skeleton.getBoneByName('right_elbow');
    const kneeL = skeleton.getBoneByName('left_knee');
    const kneeR = skeleton.getBoneByName('right_knee');
    const hipL = skeleton.getBoneByName('left_hip');
    const hipR = skeleton.getBoneByName('right_hip');
    if (!hips || !spine || !shoulderL || !shoulderR || !elbowL || !elbowR || !kneeL || !kneeR) return null;

    const walkTimes = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const tracks = [];
    const interpolation = THREE.InterpolateSmooth;

    // Forward along -Z (walk away from camera), subtle vertical bob
    const initialHipPos = hipPos.clone();
    const stepLength = 0.02;
    const hipVertical = 0.008;
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, walkTimes, [
        initialHipPos.x, initialHipPos.y, initialHipPos.z,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z - stepLength * 0.25,
        initialHipPos.x, initialHipPos.y, initialHipPos.z - stepLength * 0.5,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z - stepLength * 0.75,
        initialHipPos.x, initialHipPos.y, initialHipPos.z - stepLength,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z - stepLength * 1.25,
        initialHipPos.x, initialHipPos.y, initialHipPos.z - stepLength * 1.5,
        initialHipPos.x, initialHipPos.y + hipVertical, initialHipPos.z - stepLength * 1.75,
        initialHipPos.x, initialHipPos.y, initialHipPos.z - stepLength * 2,
    ], interpolation));

    // Small yaw oscillation on hips
    const hipRotAngle = Math.PI / 36;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${hips.name}.quaternion`, walkTimes, [
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

    // New: Leg swing using forward/back plane alignment (avoid sidestep)
    const worldForward = new THREE.Vector3(0, 0, -1);
    const down = new THREE.Vector3(0, -1, 0);
    function swingQuat(fromDir, forwardSign = 1, amt = 0.35) {
        const target = down.clone().multiplyScalar(0.85).add(worldForward.clone().multiplyScalar(forwardSign * amt)).normalize();
        return new THREE.Quaternion().setFromUnitVectors(fromDir.clone().normalize(), target);
    }

    if (hipL && kneeL) {
        const dirL = markerPositions.get('left_knee').clone().sub(markerPositions.get('left_hip')).normalize();
        const qLF = swingQuat(dirL, +1); // forward
        const qLB = swingQuat(dirL, -1); // back
        tracks.push(new THREE.QuaternionKeyframeTrack(`${hipL.name}.quaternion`, walkTimes, [
            ...qLF.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qLF, qLB, 0.5).toArray(),
            ...qLB.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qLB, qLF, 0.5).toArray(),
            ...qLF.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qLF, qLB, 0.5).toArray(),
            ...qLB.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qLB, qLF, 0.5).toArray(),
            ...qLF.toArray(),
        ], interpolation));
    }
    if (hipR && kneeR) {
        const dirR = markerPositions.get('right_knee').clone().sub(markerPositions.get('right_hip')).normalize();
        const qRF = swingQuat(dirR, -1); // opposite phase to left leg at t=0
        const qRB = swingQuat(dirR, +1);
        tracks.push(new THREE.QuaternionKeyframeTrack(`${hipR.name}.quaternion`, walkTimes, [
            ...qRB.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qRB, qRF, 0.5).toArray(),
            ...qRF.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qRF, qRB, 0.5).toArray(),
            ...qRB.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qRB, qRF, 0.5).toArray(),
            ...qRF.toArray(),
            ...new THREE.Quaternion().slerpQuaternions(qRF, qRB, 0.5).toArray(),
            ...qRB.toArray(),
        ], interpolation));
    }

    // Knees bend in counter phase
    const kneeBendAngle = Math.PI / 6;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeL.name}.quaternion`, walkTimes, [
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
    tracks.push(new THREE.QuaternionKeyframeTrack(`${kneeR.name}.quaternion`, walkTimes, [
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

    // New: Arm swing in forward/back plane (counter phase with legs)
    if (shoulderL && skeleton.getBoneByName('left_elbow')) {
        const dirArmL = markerPositions.get('left_elbow').clone().sub(markerPositions.get('left_shoulder')).normalize();
        const qArmL_F = swingQuat(dirArmL, -1, 0.3); // arm forward when right leg forward
        const qArmL_B = swingQuat(dirArmL, +1, 0.3);
        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderL.name}.quaternion`, walkTimes, [
            ...qArmL_B.toArray(), ...qArmL_F.toArray(), ...qArmL_B.toArray(),
            ...qArmL_F.toArray(), ...qArmL_B.toArray(), ...qArmL_F.toArray(),
            ...qArmL_B.toArray(), ...qArmL_F.toArray(), ...qArmL_B.toArray(),
        ], interpolation));
    }
    if (shoulderR && skeleton.getBoneByName('right_elbow')) {
        const dirArmR = markerPositions.get('right_elbow').clone().sub(markerPositions.get('right_shoulder')).normalize();
        const qArmR_F = swingQuat(dirArmR, -1, 0.3);
        const qArmR_B = swingQuat(dirArmR, +1, 0.3);
        tracks.push(new THREE.QuaternionKeyframeTrack(`${shoulderR.name}.quaternion`, walkTimes, [
            ...qArmR_F.toArray(), ...qArmR_B.toArray(), ...qArmR_F.toArray(),
            ...qArmR_B.toArray(), ...qArmR_F.toArray(), ...qArmR_B.toArray(),
            ...qArmR_F.toArray(), ...qArmR_B.toArray(), ...qArmR_F.toArray(),
        ], interpolation));
    }

    const elbowWalkBend = Math.PI / 20;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowL.name}.quaternion`, walkTimes, [
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
    tracks.push(new THREE.QuaternionKeyframeTrack(`${elbowR.name}.quaternion`, walkTimes, [
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend, 0)).toArray(),
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -elbowWalkBend * 1.5, 0)).toArray(),
    ], interpolation));

    const spineCounterAngle = Math.PI / 36;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${spine.name}.quaternion`, walkTimes, [
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

    return new THREE.AnimationClip('walk', -1, tracks);
}