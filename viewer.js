import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
    constructor(canvas, markerDefs) {
        this.canvas = canvas;
        this.markerDefs = markerDefs;
        this.onMarkerPlaced = () => {};

        this.initScene();
        this.initControls();
        this.initLights();
        this.initRaycaster();
        
        this.markers = new THREE.Group();
        this.scene.add(this.markers);
        
        this.activeMarkerId = null;
        this.model = null;

        this.animate = this.animate.bind(this);
        this.animate();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a2e);

        this.camera = new THREE.PerspectiveCamera(50, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 100);
        this.camera.position.set(0, 1, 3);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);
    }
    
    initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0.9, 0);
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 1.5);
        directional.position.set(2, 5, 3);
        this.scene.add(directional);
    }

    initRaycaster() {
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        
        const { clientWidth, clientHeight } = this.renderer.domElement;
        if (this.canvas.width !== clientWidth || this.canvas.height !== clientHeight) {
            this.renderer.setSize(clientWidth, clientHeight, false);
            this.camera.aspect = clientWidth / clientHeight;
            this.camera.updateProjectionMatrix();
        }

        this.renderer.render(this.scene, this.camera);
    }

    async loadModel(url) {
        if (this.model) {
            this.scene.remove(this.model);
            this.markers.clear();
        }
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(url);
        
        this.model = gltf.scene;

        // Pre-process: center and normalize
        const box = new THREE.Box3().setFromObject(this.model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        this.model.position.sub(center);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.8 / maxDim; // Normalize to fit a 1.8 unit height
        this.model.scale.setScalar(scale);

        this.scene.add(this.model);
        URL.revokeObjectURL(url);
    }

    onPointerDown(event) {
        if (!this.model || !this.activeMarkerId) return;
        
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / this.canvas.clientWidth) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / this.canvas.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);

        const intersects = this.raycaster.intersectObject(this.model, true);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.placeMarker(this.activeMarkerId, point);
        }
    }

    placeMarker(markerId, position) {
        const markerDef = this.markerDefs.find(m => m.id === markerId);
        if (!markerDef) return;

        let existingMarker = this.markers.getObjectByName(markerId);
        if (existingMarker) {
            existingMarker.position.copy(position);
        } else {
            const geometry = new THREE.SphereGeometry(0.02, 16, 16);
            const material = new THREE.MeshBasicMaterial({ color: markerDef.color, transparent: true, opacity: 0.8 });
            const markerMesh = new THREE.Mesh(geometry, material);
            markerMesh.name = markerId;
            markerMesh.position.copy(position);
            this.markers.add(markerMesh);
        }

        this.onMarkerPlaced(markerId, position.clone());
    }


    setActiveMarker(markerId) {
        this.activeMarkerId = markerId;
    }
    
    getSceneData() {
        return {
            model: this.model
        };
    }
    
    resetControls() {
        this.controls.reset();
        this.camera.position.set(0, 1, 3);
        this.controls.target.set(0, 0.9, 0);
    }
    
    dispose() {
        this.renderer.dispose();
        this.scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if(Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }
}

