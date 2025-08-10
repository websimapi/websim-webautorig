import { Viewer } from './viewer.js';
import { rigCharacter } from './rigging.js';

const MARKER_DEFINITIONS = [
    { id: 'neck', name: 'Neck Base', color: 0xff0000 },
    { id: 'left_clavicle', name: 'Left Clavicle', color: 0xff8800 },
    { id: 'right_clavicle', name: 'Right Clavicle', color: 0xff8800 },
    { id: 'left_shoulder', name: 'Left Shoulder', color: 0xffff00 },
    { id: 'right_shoulder', name: 'Right Shoulder', color: 0xffff00 },
    { id: 'left_elbow', name: 'Left Elbow', color: 0x00ff00 },
    { id: 'right_elbow', name: 'Right Elbow', color: 0x00ff00 },
    { id: 'left_wrist', name: 'Left Wrist', color: 0x00ffff },
    { id: 'right_wrist', name: 'Right Wrist', color: 0x00ffff },
    { id: 'spine', name: 'Spine (Mid)', color: 0x0000ff },
    { id: 'hips', name: 'Hips (Center)', color: 0x8800ff },
    { id: 'left_hip', name: 'Left Hip', color: 0xff00ff },
    { id: 'right_hip', name: 'Right Hip', color: 0xff00ff },
    { id: 'left_knee', name: 'Left Knee', color: 0xff0088 },
    { id: 'right_knee', name: 'Right Knee', color: 0xff0088 },
    { id: 'left_ankle', name: 'Left Ankle', color: 0xff8888 },
    { id: 'right_ankle', name: 'Right Ankle', color: 0xff8888 },
];

class App {
    constructor() {
        this.viewer = null;
        this.currentMarkers = new Map();
        this.activeMarkerId = null;

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
        document.getElementById('reset-view-btn').addEventListener('click', () => this.viewer?.resetControls());
        document.getElementById('start-over-btn').addEventListener('click', this.resetApp.bind(this));

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
        this.viewer?.setActiveMarker(markerId);
    }

    async handleModelUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const objectURL = URL.createObjectURL(file);

        this.switchView('editor');

        if (!this.viewer) {
            const canvas = document.getElementById('viewer-canvas');
            this.viewer = new Viewer(canvas, MARKER_DEFINITIONS);
            this.viewer.onMarkerPlaced = this.onMarkerPlaced.bind(this);
        }
        
        await this.viewer.loadModel(objectURL);
        this.viewer.resetControls();
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
            const model = this.viewer.getSceneData();
            const riggedData = await rigCharacter(model, this.currentMarkers, onProgress);
            
            // For now, just switch to preview. Later, we'd load the rigged model.
            console.log('Rigging complete', riggedData);
            onProgress(1, 'Done!');
            
            setTimeout(() => {
                this.switchView('preview');
            }, 500);

        } catch (error) {
            console.error('Rigging failed:', error);
            alert('Rigging failed. Check console for details.');
            rigBtn.disabled = false;
            progressContainer.style.display = 'none';
        }
    }

    resetApp() {
        this.viewer?.dispose();
        this.viewer = null;
        this.currentMarkers.clear();
        document.getElementById('model-input').value = '';
        
        document.querySelectorAll('#marker-list li').forEach(li => li.classList.remove('placed', 'active'));
        this.setupMarkerList();
        
        document.getElementById('rig-btn').disabled = true;
        document.querySelector('.progress-container').style.display = 'none';

        this.switchView('upload');
    }

    switchView(viewName) {
        Object.values(this.views).forEach(v => v.classList.remove('active'));
        this.views[viewName].classList.add('active');
    }
}

window.addEventListener('load', () => new App());

