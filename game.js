import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.158/examples/jsm/loaders/GLTFLoader.js';

console.log("Game.js Loaded!")

export class GameClient {
  constructor({ canvas }) {
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    // Camera (use window size for correct initial aspect)
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 20, -30);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // ensure crisp rendering on HiDPI displays
    this.renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    // use correct output encoding for physically-based materials
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    // keep camera aspect in sync with renderer size
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    // Light
    //const light = new THREE.PointLight(0xffffff, 1);
    //light.position.set(0, 50, -50);
    //this.scene.add(light);

  // Lighting: ambient + hemisphere + directional for nicer PBR lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  this.scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xddddff, 0x222233, 0.4);
  this.scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 7);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 1024;
  dir.shadow.mapSize.height = 1024;
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  this.scene.add(dir);

    // Arena floor
    const floorGeo = new THREE.PlaneGeometry(100, 100, 1, 1);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // --- Debug helpers: axes + a small red cube so we can confirm rendering works ---
    const axes = new THREE.AxesHelper(5);
    this.scene.add(axes);

    const debugCube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    debugCube.position.set(0, 0.5, 0);
    debugCube.castShadow = true;
    debugCube.receiveShadow = true;
    this.scene.add(debugCube);

    console.log('DEBUG renderer:', {
      pixelRatio: this.renderer.getPixelRatio(),
      size: this.renderer.getSize(new THREE.Vector2()),
      outputEncoding: this.renderer.outputEncoding
    });

    // Player
    this.player = this.createBike(0x00e5ff);
    this.player.position.set(0, 0.5, 0);
    this.scene.add(this.player);

    // Trail
    this.trail = [];
    this.trailGroup = new THREE.Group();
    this.scene.add(this.trailGroup);

    this.trailPoints = [this.player.position.clone()]; // store points over time
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x00e5ff });
    const trailGeometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    this.trailLine = new THREE.Line(trailGeometry, trailMaterial);
    this.trailGroup.add(this.trailLine);

    // Movement
    this.dir = new THREE.Vector3(0, 0, 1); // forward
    this.speed = 0.3;

    this.keys = {};
    window.addEventListener('keydown', e => this.keys[e.key] = true);
    window.addEventListener('keyup', e => this.keys[e.key] = false);

    this.animate();
  }

  //createBike(color) {
    //const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12);
    //const material = new THREE.MeshStandardMaterial({ color });
    //const mesh = new THREE.Mesh(geometry, material);
    //mesh.castShadow = true;
    //return mesh;
  //}

  createBike(color) {
    const loader = new GLTFLoader();
    const group = new THREE.Group(); // create empty container

    loader.load(
      './Bike.glb',
      gltf => {
        const bike = gltf.scene || gltf.scenes[0];

        // ensure the model is visible at a reasonable scale
        bike.scale.set(10, 10, 10);
        bike.position.set(0, 0, 0);
        bike.rotation.y = Math.PI;

        // enable shadows and ensure materials use correct side/encoding where needed
        bike.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            // some exported materials need an update to show correctly
            if (node.material) {
              node.material.needsUpdate = true;
            }
          }
        });

        group.add(bike);
        group.userData.loaded = true;

        // log bounding box to help decide camera positioning and scale
        try {
          const bbox = new THREE.Box3().setFromObject(bike);
          const size = bbox.getSize(new THREE.Vector3());
          const center = bbox.getCenter(new THREE.Vector3());
          console.log('BIKE LOADED!', { bbox, size, center });
        } catch (e) {
          console.log('BIKE LOADED (bbox calc failed)', bike, e);
        }
      },
      undefined,
      err => console.error('Error loading bike', err)
    );

    // if loader hasn't finished after a short time, warn (helps spot network/CORS problems)
    setTimeout(() => {
      if (!group.userData.loaded) {
        console.warn('DEBUG: Bike model not loaded yet. Check DevTools Network and Console for XHR/CORS errors and that Bike.glb is served (HTTP).');
      }
    }, 2000);

    group.position.y = 1

    return group;
  }



  handleInput() {
    // Rotate left/right
    if (this.keys['ArrowLeft'] || this.keys['a']) {
      this.player.rotation.y += 0.1;
    }
    if (this.keys['ArrowRight'] || this.keys['d']) {
      this.player.rotation.y -= 0.1;
    }

    // Update direction vector
    const angle = this.player.rotation.y;
    this.dir.set(Math.sin(angle), 0, Math.cos(angle));
  }

  updateTrail() {
    const pos = this.player.position.clone();

    // Only add a new trail block if player moved enough
    const lastPos = this.trailPoints[this.trailPoints.length - 1];
    if (!lastPos || pos.distanceTo(lastPos) > 0.05) {
        this.trailPoints.push(pos);

        const block = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 1.5, 0.2), // thin vertical block
            new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff })
        );
        block.position.copy(pos);
        block.position.y = 0.75; // raise half of height to sit on ground
        this.trailGroup.add(block);

        //Optional: remove old trail blocks after certain length
        if (this.trailGroup.children.length > 300) {
            const old = this.trailGroup.children.shift();
            this.trailGroup.remove(old);
        }
    }
}


  animate = () => {
    requestAnimationFrame(this.animate);

    this.handleInput();

    // Move player
    this.player.position.add(this.dir.clone().multiplyScalar(this.speed));

    // Update trail
    this.updateTrail();

    // Camera follows player
    const camOffset = new THREE.Vector3(0, 10, -15)//.applyEuler(this.player.rotation);
    this.camera.position.copy(this.player.position.clone().add(camOffset));
    this.camera.lookAt(this.player.position);

    this.renderer.render(this.scene, this.camera);
  };
}
