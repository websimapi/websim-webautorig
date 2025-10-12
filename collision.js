import * as THREE from 'three';

// Represents a line segment with a radius, forming a capsule.
class Capsule {
    constructor(start, end, radius) {
        this.start = start;
        this.end = end;
        this.radius = radius;
        this.segment = new THREE.Line3(this.start, this.end);
    }
}

// Helper function to find the closest points between two line segments.
// Returns the squared distance.
function closestPointsSegmentSegment(p1, q1, p2, q2) {
    const d1 = new THREE.Vector3().subVectors(q1, p1);
    const d2 = new THREE.Vector3().subVectors(q2, p2);
    const r = new THREE.Vector3().subVectors(p1, p2);

    const a = d1.dot(d1); // Squared length of segment 1
    const e = d2.dot(d2); // Squared length of segment 2
    const f = d2.dot(r);

    let s, t;

    if (a <= 1e-6 && e <= 1e-6) { // Both segments are points
        s = t = 0;
    } else if (a <= 1e-6) { // First segment is a point
        s = 0;
        t = f / e;
        t = THREE.MathUtils.clamp(t, 0, 1);
    } else {
        const c = d1.dot(r);
        if (e <= 1e-6) { // Second segment is a point
            t = 0;
            s = -c / a;
            s = THREE.MathUtils.clamp(s, 0, 1);
        } else {
            const b = d1.dot(d2);
            const denom = a * e - b * b;

            if (denom !== 0) {
                s = (b * f - c * e) / denom;
                s = THREE.MathUtils.clamp(s, 0, 1);
            } else {
                s = 0;
            }

            t = (b * s + f) / e;

            if (t < 0) {
                t = 0;
                s = -c / a;
                s = THREE.MathUtils.clamp(s, 0, 1);
            } else if (t > 1) {
                t = 1;
                s = (b - c) / a;
                s = THREE.MathUtils.clamp(s, 0, 1);
            }
        }
    }

    const c1 = new THREE.Vector3().addVectors(p1, d1.multiplyScalar(s));
    const c2 = new THREE.Vector3().addVectors(p2, d2.multiplyScalar(t));
    return { distanceSq: c1.distanceToSquared(c2), c1, c2 };
}

export class CollisionManager {
    constructor(model) {
        this.model = model;
        this.bones = {};
        this.capsules = [];
        this.torsoCapsule = null;

        this.init();
    }

    init() {
        this.model.traverse(obj => {
            if (obj.isBone) {
                this.bones[obj.name] = obj;
            }
        });

        this.setupCollisionVolumes();
    }

    setupCollisionVolumes() {
        const hips = this.bones['hips'];
        const neck = this.bones['neck'];
        const shoulderL = this.bones['left_shoulder'];
        const shoulderR = this.bones['right_shoulder'];
        const elbowL = this.bones['left_elbow'];
        const elbowR = this.bones['right_elbow'];
        const wristL = this.bones['left_wrist'];
        const wristR = this.bones['right_wrist'];

        if (!hips || !neck || !shoulderL || !shoulderR || !elbowL || !elbowR || !wristL || !wristR) {
            console.warn("Collision Manager: Missing required bones for collision setup.");
            return;
        }

        // --- Define Radii ---
        // Estimate radii based on bone lengths for robustness
        const worldHips = new THREE.Vector3();
        const worldShoulderL = new THREE.Vector3();
        hips.getWorldPosition(worldHips);
        shoulderL.getWorldPosition(worldShoulderL);
        const torsoRadius = worldHips.distanceTo(worldShoulderL) * 0.9;
        const armRadius = torsoRadius * 0.3;

        // --- Create Capsules ---
        this.torsoCapsule = new Capsule(
            this.bones['hips'],   // Use bones directly; we'll get their world positions in the update loop
            this.bones['neck'],
            torsoRadius
        );

        this.capsules.push(new Capsule(shoulderL, elbowL, armRadius)); // L Upper Arm
        this.capsules.push(new Capsule(elbowL, wristL, armRadius));     // L Forearm
        this.capsules.push(new Capsule(shoulderR, elbowR, armRadius)); // R Upper Arm
        this.capsules.push(new Capsule(elbowR, wristR, armRadius));     // R Forearm
    }

    update() {
        if (!this.torsoCapsule) return;

        // Get current world positions for torso capsule
        const torsoStart = new THREE.Vector3();
        const torsoEnd = new THREE.Vector3();
        this.torsoCapsule.start.getWorldPosition(torsoStart);
        this.torsoCapsule.end.getWorldPosition(torsoEnd);

        // Check each arm capsule against the torso
        for (const armCapsule of this.capsules) {
            const armStart = new THREE.Vector3();
            const armEnd = new THREE.Vector3();
            armCapsule.start.getWorldPosition(armStart);
            armCapsule.end.getWorldPosition(armEnd);

            const { distanceSq, c1: closestOnTorso, c2: closestOnArm } = closestPointsSegmentSegment(
                torsoStart, torsoEnd, armStart, armEnd
            );

            const totalRadius = this.torsoCapsule.radius + armCapsule.radius;
            if (distanceSq < totalRadius * totalRadius) {
                // Collision detected
                const distance = Math.sqrt(distanceSq);
                const penetration = totalRadius - distance;

                // Vector pointing from torso to arm
                const normal = new THREE.Vector3().subVectors(closestOnArm, closestOnTorso).normalize();

                this.resolveCollision(armCapsule, penetration, normal);
            }
        }
    }

    resolveCollision(armCapsule, penetration, normal) {
        // The primary bone to rotate is the one at the start of the capsule chain (shoulder)
        let shoulderBone;
        const startBoneName = armCapsule.start.name;

        if (startBoneName.includes('left_shoulder') || startBoneName.includes('left_elbow')) {
            shoulderBone = this.bones['left_shoulder'];
        } else if (startBoneName.includes('right_shoulder') || startBoneName.includes('right_elbow')) {
            shoulderBone = this.bones['right_shoulder'];
        }

        if (!shoulderBone) return;

        // Calculate the vector from the shoulder to the collision point on the arm
        const shoulderPos = new THREE.Vector3();
        shoulderBone.getWorldPosition(shoulderPos);

        const armVector = new THREE.Vector3();
        armCapsule.start.getWorldPosition(armVector); // Use capsule start for lever arm
        armVector.sub(shoulderPos);

        // We want to rotate the armVector by applying a rotation around an axis
        // that is perpendicular to both the arm vector and the collision normal.
        const rotationAxis = new THREE.Vector3().crossVectors(armVector, normal).normalize();

        // The amount of rotation should be proportional to the penetration depth.
        // This is a simplified heuristic.
        const rotationAngle = penetration / armVector.length();

        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAngle);

        // Apply the correction to the shoulder bone's quaternion.
        // We must do this in world space and then convert back to local.
        const parentInverse = new THREE.Matrix4();
        shoulderBone.parent.getWorldMatrix(true, parentInverse).invert();

        const worldQuaternion = shoulderBone.getWorldQuaternion(new THREE.Quaternion());
        worldQuaternion.premultiply(correctionQuaternion); // Apply correction

        const localQuaternion = shoulderBone.quaternion;
        localQuaternion.copy(worldQuaternion).premultiply(parentInverse.getRotation(new THREE.Quaternion()).invert());
    }
}