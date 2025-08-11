/**
 * Constants and definitions for the WebAutoRig system
 */

export const MARKER_DEFINITIONS = [
    { id: 'hips', name: 'Hips (Center)', color: 0x8800ff },
    { id: 'spine', name: 'Spine (Mid)', color: 0x0000ff },
    { id: 'neck', name: 'Neck Base', color: 0xff0000 },
    { id: 'head', name: 'Head (Top)', color: 0xff4444 },
    { id: 'left_hip', name: 'Left Hip', color: 0xff00ff },
    { id: 'right_hip', name: 'Right Hip', color: 0xff00ff },
    { id: 'left_knee', name: 'Left Knee', color: 0xff0088 },
    { id: 'right_knee', name: 'Right Knee', color: 0xff0088 },
    { id: 'left_ankle', name: 'Left Ankle', color: 0xff8888 },
    { id: 'right_ankle', name: 'Right Ankle', color: 0xff8888 },
    { id: 'left_clavicle', name: 'Left Clavicle', color: 0xff8800 },
    { id: 'right_clavicle', name: 'Right Clavicle', color: 0xff8800 },
    { id: 'left_shoulder', name: 'Left Shoulder', color: 0xffff00 },
    { id: 'right_shoulder', name: 'Right Shoulder', color: 0xffff00 },
    { id: 'left_elbow', name: 'Left Elbow', color: 0x00ff00 },
    { id: 'right_elbow', name: 'Right Elbow', color: 0x00ff00 },
    { id: 'left_wrist', name: 'Left Wrist', color: 0x00ffff },
    { id: 'right_wrist', name: 'Right Wrist', color: 0x00ffff },
];

export const BONE_HIERARCHY = {
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

export const BONE_NAMES = Object.keys(BONE_HIERARCHY);