import * as THREE from 'three';
import { Viewer } from './viewer.js';
import { rigCharacter } from './rigging.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { aiGenerateAnimationJSON, repairAnimationJSON } from './ai.js';

const MARKER_DEFINITIONS = [
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

class App {
    constructor() {
        this.editorViewer = null;
        this.previewViewer = null;
        this.currentMarkers = new Map();
        this.activeMarkerId = null;
        this.riggedModel = null;
        this.animations = {};
        this.customAnimationsJSON = [];

        this.initViews();
        this.initEventListeners();
        this.setupMarkerList();
    }

    initViews() {
        this.views = {
            upload: document.getElementById('upload-view'),
            editor: document.getElementById('editor-view'),
            preview: document.getElementById('preview-view'),
        };
    }

    initEventListeners() {
        document.getElementById('model-input').addEventListener('change', this.handleModelUpload.bind(this));
        document.getElementById('rig-btn').addEventListener('click', this.handleRigging.bind(this));
        document.getElementById('reset-view-btn').addEventListener('click', () => this.editorViewer?.resetControls());
        document.getElementById('start-over-btn').addEventListener('click', this.resetApp.bind(this));
        document.getElementById('export-btn').addEventListener('click', this.exportRiggedModel.bind(this));
        document.getElementById('skeleton-toggle').addEventListener('change', (e) => this.previewViewer?.toggleSkeleton(e.target.checked));
        document.getElementById('animation-select').addEventListener('change', (e) => this.previewViewer?.playAnimation(e.target.value));
        
        const genBtn = document.getElementById('gen-ai-anim-btn');
        const bonesBtn = document.getElementById('list-bones-btn');
        genBtn?.addEventListener('click', () => this.generateAIAnimation());
        bonesBtn?.addEventListener('click', () => this.showBoneNames());

        const uploadBox = document.querySelector('.upload-box');
        uploadBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        uploadBox.addEventListener('dragleave', (e) => {
            e.currentTarget.style.backgroundColor = '';
        });
        uploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            e.currentTarget.style.backgroundColor = '';
            const input = document.getElementById('model-input');
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                input.dispatchEvent(new Event('change'));
            }
        });
    }

    setupMarkerList() {
        const listEl = document.getElementById('marker-list');
        listEl.innerHTML = '';
        MARKER_DEFINITIONS.forEach(markerDef => {
            const li = document.createElement('li');
            li.id = `marker-item-${markerDef.id}`;
            li.dataset.markerId = markerDef.id;
            li.innerHTML = `<span class="status-indicator"></span> ${markerDef.name}`;
            li.addEventListener('click', () => this.setActiveMarker(markerDef.id));
            listEl.appendChild(li);
        });
        this.setActiveMarker(MARKER_DEFINITIONS[0].id);
    }
    
    setActiveMarker(markerId) {
        if (this.activeMarkerId) {
            document.getElementById(`marker-item-${this.activeMarkerId}`).classList.remove('active');
        }
        this.activeMarkerId = markerId;
        document.getElementById(`marker-item-${this.activeMarkerId}`).classList.add('active');
        this.editorViewer?.setActiveMarker(markerId);
    }

    async handleModelUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const objectURL = URL.createObjectURL(file);

        this.switchView('editor');

        if (!this.editorViewer) {
            const canvas = document.getElementById('viewer-canvas');
            this.editorViewer = new Viewer(canvas, MARKER_DEFINITIONS);
            this.editorViewer.onMarkerPlaced = this.onMarkerPlaced.bind(this);
        }
        
        await this.editorViewer.loadModel(objectURL);
        this.editorViewer.resetControls();
    }

    onMarkerPlaced(markerId, position) {
        this.currentMarkers.set(markerId, position);
        document.getElementById(`marker-item-${markerId}`).classList.add('placed');

        const allPlaced = MARKER_DEFINITIONS.every(def => this.currentMarkers.has(def.id));
        document.getElementById('rig-btn').disabled = !allPlaced;

        // Auto-select next unplaced marker
        const currentIndex = MARKER_DEFINITIONS.findIndex(def => def.id === markerId);
        const nextMarker = MARKER_DEFINITIONS.slice(currentIndex + 1).find(def => !this.currentMarkers.has(def.id))
            || MARKER_DEFINITIONS.slice(0, currentIndex).find(def => !this.currentMarkers.has(def.id));
        
        if (nextMarker) {
            this.setActiveMarker(nextMarker.id);
        }
    }

    async handleRigging() {
        const rigBtn = document.getElementById('rig-btn');
        const progressContainer = document.querySelector('.progress-container');
        const progressLabel = document.getElementById('progress-label');
        const progressBar = document.getElementById('progress-bar');

        rigBtn.disabled = true;
        progressContainer.style.display = 'block';

        const onProgress = (progress, label) => {
            progressBar.value = progress * 100;
            progressLabel.textContent = label;
        };

        try {
            const model = this.editorViewer.getSceneData().model;
            const modelInverseMatrix = this.editorViewer.getModelInverseMatrix();
            const {riggedModel, animations} = await rigCharacter(model, this.currentMarkers, modelInverseMatrix, onProgress);
            
            this.riggedModel = riggedModel;
            this.animations = animations;
            console.log('Rigging complete', this.riggedModel);
            
            onProgress(1, 'Done!');
            
            setTimeout(() => {
                this.setupPreview();
                this.switchView('preview');
                document.getElementById('export-btn').disabled = false;
            }, 500);

        } catch (error) {
            console.error('Rigging failed:', error);
            alert('Rigging failed. Check console for details.');
            rigBtn.disabled = false;
            progressContainer.style.display = 'none';
        }
    }
    
    setupPreview() {
        if (!this.previewViewer) {
            const canvas = document.getElementById('preview-viewer-canvas');
            this.previewViewer = new Viewer(canvas);
        }
        this.previewViewer.setModel(this.riggedModel, this.animations);
        this.previewViewer.resetControls();

        this.loadSavedAIAnimations(); // load from localStorage into this.animations
        // Populate animation dropdown
        const animSelect = document.getElementById('animation-select');
        const animControls = document.getElementById('animation-controls');
        animSelect.innerHTML = '<option value="none">None (T-Pose)</option>';

        const animNames = Object.keys(this.animations);
        if (animNames.length > 0) {
            animControls.style.display = 'block';
            animNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
                animSelect.appendChild(option);
            });
        } else {
            animControls.style.display = 'none';
        }
        this.refreshSavedAnimList();
    }

    async exportRiggedModel() {
        if (!this.riggedModel) return;

        const exporter = new GLTFExporter();
        const options = {
            binary: true, // Export as GLB
            animations: Object.values(this.animations)
        };

        exporter.parse(
            this.riggedModel,
            (gltf) => {
                const blob = new Blob([gltf], { type: 'model/gltf-binary' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'rigged-character.glb';
                a.click();
                URL.revokeObjectURL(url);
            },
            (error) => {
                console.error('An error happened during GLTF export:', error);
                alert('Failed to export model.');
            },
            options
        );
    }

    resetApp() {
        this.editorViewer?.dispose();
        this.editorViewer = null;
        this.previewViewer?.dispose();
        this.previewViewer = null;

        this.currentMarkers.clear();
        this.riggedModel = null;
        this.animations = {};

        document.getElementById('model-input').value = '';
        
        document.querySelectorAll('#marker-list li').forEach(li => li.classList.remove('placed', 'active'));
        this.setupMarkerList();
        
        document.getElementById('rig-btn').disabled = true;
        document.getElementById('export-btn').disabled = true;
        document.querySelector('.progress-container').style.display = 'none';
        document.getElementById('skeleton-toggle').checked = false;

        this.switchView('upload');
    }

    switchView(viewName) {
        Object.values(this.views).forEach(v => v.classList.remove('active'));
        this.views[viewName].classList.add('active');
    }

    loadSavedAIAnimations() {
        try {
            const raw = localStorage.getItem('webAutoRig.customAnimations');
            if (!raw) return;
            this.customAnimationsJSON = JSON.parse(raw);
            const skeletonRoot = this.getSkeletonRoot();
            if (!skeletonRoot) return;
            const clips = this.customAnimationsJSON
                .map(j => this.buildClipFromJSON(j, skeletonRoot))
                .filter(c => c);
            for (const clip of clips) this.animations[clip.name] = clip;
        } catch (e) {
            console.warn('Failed to load saved AI animations', e);
        }
    }

    async generateAIAnimation() {
        const promptEl = document.getElementById('ai-anim-prompt');
        const statusEl = document.getElementById('ai-anim-status');
        const prompt = (promptEl?.value || '').trim();
        if (!prompt) { statusEl.textContent = 'Please enter a description.'; return; }
        if (!this.riggedModel) { statusEl.textContent = 'Rig not ready.'; return; }
        statusEl.textContent = 'Generating with AI...';
        try {
            const bones = this.getBoneNames();
            const data = await aiGenerateAnimationJSON(prompt, bones);
            const repaired = repairAnimationJSON(data, bones);
            this.verifyAndSaveAnimationJSON(repaired);
            const clip = this.buildClipFromJSON(repaired, this.getSkeletonRoot());
            if (!clip) throw new Error('Failed to build clip.');
            this.animations[clip.name] = clip;
            this.refreshAnimationDropdown(clip.name);
            this.refreshSavedAnimList();
            statusEl.textContent = `Added animation "${clip.name}".`;
        } catch (err) {
            console.error(err);
            statusEl.textContent = 'AI generation failed. Check console.';
        }
    }

    verifyAndSaveAnimationJSON(data) {
        if (!data || typeof data !== 'object') throw new Error('Invalid JSON.');
        if (!data.name || !data.duration || !data.tracks) throw new Error('Missing fields.');
        if (!Array.isArray(data.tracks) || data.tracks.length === 0) throw new Error('No tracks.');
        const bones = new Set(this.getBoneNames());
        const dur = Number(data.duration);
        if (!(dur > 0 && dur < 120)) throw new Error('Duration out of range.');
        data.fps = Math.min(60, Math.max(12, Number(data.fps || 24)));
        for (const t of data.tracks) {
            if (!bones.has(t.bone)) throw new Error(`Unknown bone: ${t.bone}`);
            if (!['quaternion','position'].includes(t.property)) throw new Error('Bad property.');
            if (!Array.isArray(t.times) || t.times.length < 2) throw new Error('Times invalid.');
            if (!Array.isArray(t.values)) throw new Error('Values invalid.');
            const stride = t.property === 'quaternion' ? 4 : 3;
            if (t.values.length !== t.times.length * stride) throw new Error('Values length mismatch.');
            let prev = -Infinity;
            for (const tm of t.times) {
                if (!(tm >= 0 && tm <= dur)) throw new Error('Time out of bounds.');
                if (tm <= prev) throw new Error('Times must be ascending.');
                prev = tm;
            }
        }
        // Save/replace by name
        const raw = localStorage.getItem('webAutoRig.customAnimations');
        this.customAnimationsJSON = raw ? JSON.parse(raw) : [];
        const idx = this.customAnimationsJSON.findIndex(a => a.name === data.name);
        if (idx >= 0) this.customAnimationsJSON[idx] = data; else this.customAnimationsJSON.push(data);
        localStorage.setItem('webAutoRig.customAnimations', JSON.stringify(this.customAnimationsJSON));
    }

    buildClipFromJSON(data, skeletonRoot) {
        try {
            const tracks = [];
            for (const t of data.tracks) {
                const path = `${t.bone}.${t.property}`;
                const interp = t.interpolation === 'Step' ? THREE.InterpolateDiscrete :
                               t.interpolation === 'Linear' ? THREE.InterpolateLinear :
                               THREE.InterpolateSmooth;
                if (t.property === 'position') {
                    tracks.push(new THREE.VectorKeyframeTrack(path, t.times, t.values, interp));
                } else {
                    // normalize quaternions
                    const vals = t.values.slice();
                    for (let i = 0; i < vals.length; i += 4) {
                        const q = new THREE.Quaternion(vals[i], vals[i+1], vals[i+2], vals[i+3]).normalize();
                        vals[i]=q.x; vals[i+1]=q.y; vals[i+2]=q.z; vals[i+3]=q.w;
                    }
                    tracks.push(new THREE.QuaternionKeyframeTrack(path, t.times, vals, interp));
                }
            }
            const clip = new THREE.AnimationClip(data.name, data.duration, tracks);
            return clip;
        } catch (e) {
            console.warn('Failed to build clip', e);
            return null;
        }
    }

    refreshAnimationDropdown(selectName) {
        const animSelect = document.getElementById('animation-select');
        const animControls = document.getElementById('animation-controls');
        if (!animSelect) return;
        const current = animSelect.value;
        animSelect.innerHTML = '<option value="none">None (T-Pose)</option>';
        const names = Object.keys(this.animations);
        if (names.length) {
            animControls.style.display = 'block';
            for (const n of names) {
                const opt = document.createElement('option');
                opt.value = n; opt.textContent = n.replace(/_/g,' ');
                animSelect.appendChild(opt);
            }
        }
        animSelect.value = selectName || current || 'none';
        this.previewViewer?.playAnimation(animSelect.value);
    }

    refreshSavedAnimList() {
        const ul = document.getElementById('saved-anim-list');
        if (!ul) return;
        ul.innerHTML = '';
        for (const a of this.customAnimationsJSON) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.textContent = `Load "${a.name}"`;
            btn.addEventListener('click', () => {
                const clip = this.buildClipFromJSON(a, this.getSkeletonRoot());
                if (clip) {
                    this.animations[clip.name] = clip;
                    this.refreshAnimationDropdown(clip.name);
                }
            });
            li.appendChild(btn);
            ul.appendChild(li);
        }
    }

    getSkeletonRoot() {
        let root = null;
        this.riggedModel?.traverse(o => { if (o.isBone && !root) root = o; });
        return root;
    }
    getBoneNames() {
        const names = [];
        this.riggedModel?.traverse(o => { if (o.isBone) names.push(o.name); });
        return names.sort();
    }
    showBoneNames() {
        const bones = this.getBoneNames();
        const statusEl = document.getElementById('ai-anim-status');
        statusEl.textContent = bones.length ? `Bones: ${bones.join(', ')}` : 'No bones detected.';
    }
}

window.addEventListener('load', () => new App());