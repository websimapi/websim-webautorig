import * as THREE from 'three';
import { Viewer } from './viewer.js';
import { rigCharacter } from './rigging.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const MARKER_DEFINITIONS = [
    { id: 'hips', name: 'Hips (Center)', color: 0x8800ff, icon: 'icon_hips.png' },
    { id: 'spine', name: 'Spine (Mid)', color: 0x0000ff, icon: 'icon_spine.png' },
    { id: 'neck', name: 'Neck Base', color: 0xff0000, icon: 'icon_neck.png' },
    { id: 'head', name: 'Head (Top)', color: 0xff4444, icon: 'icon_head.png' },
    { id: 'left_hip', name: 'Left Hip', color: 0xff00ff, icon: 'icon_hip_joint.png' },
    { id: 'right_hip', name: 'Right Hip', color: 0xff00ff, icon: 'icon_hip_joint.png' },
    { id: 'left_knee', name: 'Left Knee', color: 0xff0088, icon: 'icon_knee.png' },
    { id: 'right_knee', name: 'Right Knee', color: 0xff0088, icon: 'icon_knee.png' },
    { id: 'left_ankle', name: 'Left Ankle', color: 0xff8888, icon: 'icon_ankle.png' },
    { id: 'right_ankle', name: 'Right Ankle', color: 0xff8888, icon: 'icon_ankle.png' },
    { id: 'left_clavicle', name: 'Left Clavicle', color: 0xff8800, icon: 'icon_clavicle.png' },
    { id: 'right_clavicle', name: 'Right Clavicle', color: 0xff8800, icon: 'icon_clavicle.png' },
    { id: 'left_shoulder', name: 'Left Shoulder', color: 0xffff00, icon: 'icon_shoulder.png' },
    { id: 'right_shoulder', name: 'Right Shoulder', color: 0xffff00, icon: 'icon_shoulder.png' },
    { id: 'left_elbow', name: 'Left Elbow', color: 0x00ff00, icon: 'icon_elbow.png' },
    { id: 'right_elbow', name: 'Right Elbow', color: 0x00ff00, icon: 'icon_elbow.png' },
    { id: 'left_wrist', name: 'Left Wrist', color: 0x00ffff, icon: 'icon_wrist.png' },
    { id: 'right_wrist', name: 'Right Wrist', color: 0x00ffff, icon: 'icon_wrist.png' },
];

class App {
    constructor() {
        this.editorViewer = null;
        this.previewViewer = null;
        this.currentMarkers = new Map();
        this.activeMarkerId = null;
        this.riggedModel = null;
        this.animations = {};

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
        this.activeMarkerLabel = document.getElementById('active-marker-label');
    }

    initEventListeners() {
        document.getElementById('model-input').addEventListener('change', this.handleModelUpload.bind(this));
        
        // Desktop buttons
        document.getElementById('rig-btn').addEventListener('click', this.handleRigging.bind(this));
        document.getElementById('reset-view-btn').addEventListener('click', () => this.editorViewer?.resetControls());
        
        // Mobile buttons
        document.getElementById('mobile-rig-btn').addEventListener('click', this.handleRigging.bind(this));
        document.getElementById('mobile-reset-view-btn').addEventListener('click', () => this.editorViewer?.resetControls());

        document.getElementById('start-over-btn').addEventListener('click', this.resetApp.bind(this));
        document.getElementById('export-btn').addEventListener('click', this.exportRiggedModel.bind(this));
        document.getElementById('skeleton-toggle').addEventListener('change', (e) => this.toggleSkeletonVisibility(e.target.checked));
        document.getElementById('animation-select').addEventListener('change', (e) => this.previewViewer?.playAnimation(e.target.value));

        // New mobile preview listeners
        document.getElementById('mobile-start-over-btn').addEventListener('click', this.resetApp.bind(this));
        document.getElementById('mobile-export-btn').addEventListener('click', this.exportRiggedModel.bind(this));
        document.getElementById('mobile-skeleton-toggle-btn').addEventListener('click', this.toggleSkeletonButton.bind(this));
        document.getElementById('mobile-animation-select').addEventListener('change', (e) => this.previewViewer?.playAnimation(e.target.value));

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
        // Desktop list
        const listEl = document.getElementById('marker-list');
        listEl.innerHTML = '';

        // Mobile icon container
        const iconsContainer = document.getElementById('marker-icons-container');
        iconsContainer.innerHTML = '';
        
        // Setup mobile action button icons
        document.getElementById('mobile-reset-view-btn').style.backgroundImage = `url(./icon_reset_view.png)`;
        document.getElementById('mobile-rig-btn').style.backgroundImage = `url(./icon_generate_rig.png)`;

        MARKER_DEFINITIONS.forEach(markerDef => {
            // Desktop
            const li = document.createElement('li');
            li.id = `marker-item-${markerDef.id}`;
            li.dataset.markerId = markerDef.id;
            li.innerHTML = `<span class="status-indicator"></span> ${markerDef.name}`;
            li.addEventListener('click', () => this.setActiveMarker(markerDef.id));
            listEl.appendChild(li);

            // Mobile
            const iconButton = document.createElement('button');
            iconButton.id = `marker-icon-${markerDef.id}`;
            iconButton.dataset.markerId = markerDef.id;
            iconButton.className = 'marker-icon';
            iconButton.title = markerDef.name;
            iconButton.style.backgroundImage = `url(./${markerDef.icon})`;
            if (markerDef.id.startsWith('right_')) {
                iconButton.classList.add('flip-h');
            }
            iconButton.innerHTML = `<span class="status-indicator"></span>`;
            iconButton.addEventListener('click', () => this.setActiveMarker(markerDef.id));
            iconsContainer.appendChild(iconButton);
        });
        this.setActiveMarker(MARKER_DEFINITIONS[0].id);
    }
    
    setActiveMarker(markerId) {
        if (this.activeMarkerId) {
            document.getElementById(`marker-item-${this.activeMarkerId}`).classList.remove('active');
            document.getElementById(`marker-icon-${this.activeMarkerId}`).classList.remove('active');
        }
        this.activeMarkerId = markerId;
        document.getElementById(`marker-item-${this.activeMarkerId}`).classList.add('active');
        document.getElementById(`marker-icon-${this.activeMarkerId}`).classList.add('active');
        this.editorViewer?.setActiveMarker(markerId);

        const markerDef = MARKER_DEFINITIONS.find(def => def.id === markerId);
        if (markerDef && this.activeMarkerLabel) {
            this.activeMarkerLabel.textContent = `Tool: ${markerDef.name}`;
            this.activeMarkerLabel.style.display = 'block';
        }
    }

    toggleSkeletonVisibility(visible) {
        this.previewViewer?.toggleSkeleton(visible);
        const mobileBtn = document.getElementById('mobile-skeleton-toggle-btn');
        if(visible) {
            mobileBtn.classList.add('active');
        } else {
            mobileBtn.classList.remove('active');
        }
        document.getElementById('skeleton-toggle').checked = visible;
    }

    toggleSkeletonButton() {
        const mobileBtn = document.getElementById('mobile-skeleton-toggle-btn');
        const isVisible = !mobileBtn.classList.contains('active');
        this.toggleSkeletonVisibility(isVisible);
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
        document.getElementById(`marker-icon-${markerId}`).classList.add('placed');

        const allPlaced = MARKER_DEFINITIONS.every(def => this.currentMarkers.has(def.id));
        document.getElementById('rig-btn').disabled = !allPlaced;
        document.getElementById('mobile-rig-btn').disabled = !allPlaced;

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
        const mobileRigBtn = document.getElementById('mobile-rig-btn');
        const progressContainer = document.querySelector('.progress-container');
        const progressLabel = document.getElementById('progress-label');
        const progressBar = document.getElementById('progress-bar');

        rigBtn.disabled = true;
        mobileRigBtn.disabled = true;
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
                document.getElementById('mobile-export-btn').disabled = false;
            }, 500);

        } catch (error) {
            console.error('Rigging failed:', error);
            alert('Rigging failed. Check console for details.');
            rigBtn.disabled = false;
            mobileRigBtn.disabled = false;
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

        // Populate animation dropdowns
        const animSelect = document.getElementById('animation-select');
        const mobileAnimSelect = document.getElementById('mobile-animation-select');
        const animControls = document.getElementById('animation-controls');
        
        animSelect.innerHTML = '<option value="none">None (T-Pose)</option>';
        mobileAnimSelect.innerHTML = '<option value="none">Animation</option>';

        const animNames = Object.keys(this.animations);
        if (animNames.length > 0) {
            animControls.style.display = 'block';
            mobileAnimSelect.style.display = 'block';
            animNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
                animSelect.appendChild(option.cloneNode(true));
                mobileAnimSelect.appendChild(option);
            });
        } else {
            animControls.style.display = 'none';
            mobileAnimSelect.style.display = 'none';
        }

        // Setup mobile button icons
        document.getElementById('mobile-start-over-btn').style.backgroundImage = `url(./icon_start_over.png)`;
        document.getElementById('mobile-skeleton-toggle-btn').style.backgroundImage = `url(./icon_skeleton.png)`;
        document.getElementById('mobile-export-btn').style.backgroundImage = `url(./icon_export.png)`;
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
        
        document.querySelectorAll('#marker-list li, .marker-icon').forEach(el => el.classList.remove('placed', 'active'));
        this.setupMarkerList();
        
        document.getElementById('rig-btn').disabled = true;
        document.getElementById('mobile-rig-btn').disabled = true;
        document.getElementById('export-btn').disabled = true;
        document.getElementById('mobile-export-btn').disabled = true;
        document.querySelector('.progress-container').style.display = 'none';
        document.getElementById('skeleton-toggle').checked = false;
        document.getElementById('mobile-skeleton-toggle-btn').classList.remove('active');

        this.switchView('upload');
    }

    switchView(viewName) {
        Object.values(this.views).forEach(v => v.classList.remove('active'));
        this.views[viewName].classList.add('active');

        if (this.activeMarkerLabel) {
            this.activeMarkerLabel.style.display = (viewName === 'editor') ? 'block' : 'none';
        }
    }
}

window.addEventListener('load', () => new App());