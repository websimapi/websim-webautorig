import { createWaveClip } from './wave.js';
import { createIdleClip } from './idle.js';
import { createWalkClip } from './walk.js';

export function createTestAnimations(skeleton, hipPos, markerPositions) {
    const animations = {};
    const wave = createWaveClip(skeleton);
    if (wave) animations.wave = wave;
    const idle = createIdleClip(skeleton, hipPos, markerPositions);
    if (idle) animations.idle = idle;
    const walk = createWalkClip(skeleton, hipPos, markerPositions);
    if (walk) animations.walk = walk;
    return animations;
}

