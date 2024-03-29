import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const DEFAULT_CONFIG = {
  size: 3,
  chunkSize: 512,
  resolution: 22,
  octaves: 6,
  persistance: 0.707,
  lacunarity: 1.7,
  heightMultiplier: 250,
  islands: false,
  wireframe: false,
}

let CONFIG = { ...DEFAULT_CONFIG };

const COLORS = {
  water: new THREE.Color(0x4169e1),
  sand: new THREE.Color(0xeee8aa),
  grass: new THREE.Color(0x2e8b57),
  rock: new THREE.Color(0x696969),
  snow: new THREE.Color(0xfffafa),
}

// Utils
function inverseLerp(min, max, value) {
  // Garante que o value esteja dentro do intervalo de min a max
  value = Math.max(min, Math.min(max, value));

  // Calcula o value transformado para o intervalo de 0 a 1
  return (value - min) / (max - min);
}

function createEmptyMatrix(size) {
  return Array.from({ length: size }).map(() => Array.from({ length: size }).fill(0));
}

function createIslandShapeGrid(size) {
  const grid = [];

  function evaluate(value) {
    const a = 3;
    const b = 2.2;

    return Math.pow(value, a) / (Math.pow(value, a) + Math.pow(b - b * value, a))
  }

  for (let i = 0; i < size; i++) {
    grid[i] = [];
    for (let j = 0; j < size; j++) {
      const x = i / size * 2 - 1;
      const y = j / size * 2 - 1;

      const value = Math.max(Math.abs(x), Math.abs(y));

      grid[i][j] = evaluate(value);
    }
  }

  return grid
}

// Core
class Noise {
  seed;

  constructor() {
    this.seed = Math.floor(Math.random() * 100000);

    noise.seed(this.seed);
  }

  get(x, z) {
    const value = noise.simplex2(x, z);

    return (value + 1) / 2;
  }
}

class Terrain {
  scene;

  // Sizing
  size;

  chunkSize;

  // Variation
  octaves;

  persistance;

  lacunarity;

  heightMultiplier;

  // Config
  islands;

  wireframe;

  chunks;

  noise;

  minHeight;

  maxHeight;

  constructor({
    scene,
    size,
    chunkSize,
    resolution,
    octaves,
    persistance,
    lacunarity,
    heightMultiplier,
    islands,
    wireframe
  }) {
    this.scene = scene;
    this.size = size;
    this.chunkSize = chunkSize;
    this.resolution = resolution;
    this.octaves = octaves;
    this.persistance = persistance;
    this.lacunarity = lacunarity;
    this.heightMultiplier = heightMultiplier;
    this.islands = islands;
    this.wireframe = wireframe;

    this.minHeight = Number.MAX_SAFE_INTEGER;
    this.maxHeight = Number.MIN_SAFE_INTEGER;

    this.chunks = [];

    this.noise = new Noise();
  }

  #create() {
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        const chunk = new Chunk({
          size: this.chunkSize,
          offset: { z: z * this.chunkSize, x: x * this.chunkSize },
          resolution: this.resolution,
          heightMultiplier: this.heightMultiplier,
          getHeight: this.#getHeight.bind(this),
          islands: this.islands,
          wireframe: this.wireframe,
        });

        this.#addChunk(chunk);
      }
    }
  }

  #addChunk(chunk) {
    this.chunks.push(chunk);
    this.scene.add(chunk.mesh);
  }

  #getHeight({ x, z }, offset) {
    let amplitude = 1;
    let frequency = 1;
    let noiseHeight = 0;

    const terrainWidth = this.size * this.chunkSize;
    const gridSize = Math.floor(this.chunkSize / this.resolution);

    const noisePosition = {
      x: (x * gridSize + offset.x) / terrainWidth,
      z: (z * gridSize + offset.z) / terrainWidth
    }

    for (let i = 0; i < this.octaves; i++) {
      const value = this.noise.get(
        noisePosition.x * frequency,
        noisePosition.z * frequency
      );

      noiseHeight += value * amplitude;

      amplitude *= this.persistance;
      frequency *= this.lacunarity;
    }

    if (noiseHeight < this.minHeight) this.minHeight = noiseHeight;
    if (noiseHeight > this.maxHeight) this.maxHeight = noiseHeight;

    noiseHeight = inverseLerp(this.minHeight, this.maxHeight, noiseHeight);

    return noiseHeight;
  }

  destroy() {
    this.chunks.forEach(chunk => this.scene.remove(chunk.mesh));

    this.chunks.length = 0;
  }

  update({ size, chunkSize, resolution, octaves, persistance, lacunarity, heightMultiplier, islands, wireframe }) {
    this.size = size;
    this.chunkSize = chunkSize;
    this.resolution = resolution;
    this.octaves = octaves;
    this.persistance = persistance;
    this.lacunarity = lacunarity;
    this.heightMultiplier = heightMultiplier;
    this.islands = islands;
    this.wireframe = wireframe;
  }

  create() {
    this.#create();
  }

  hash() {
    return JSON.stringify({
      size: this.size,
      chunkSize: this.chunkSize,
      resolution: this.resolution,
      octaves: this.octaves,
      persistance: this.persistance,
      lacunarity: this.lacunarity,
      heightMultiplier: this.heightMultiplier,
      islands: this.islands,
      wireframe: this.wireframe
    })
  }
}

class Chunk {
  size;

  offset;

  resolution;

  heightMultiplier;

  islands;

  wireframe;

  getHeight;

  // Calculated
  grid;

  mesh;

  constructor({ size, offset, resolution, heightMultiplier, islands, wireframe, getHeight }) {
    this.size = size;
    this.offset = offset;
    this.resolution = resolution;
    this.heightMultiplier = heightMultiplier;
    this.islands = islands;
    this.wireframe = wireframe;
    this.getHeight = getHeight;

    this.grid = this.#createGrid();
    this.mesh = this.#createMesh();
  }

  #createGrid() {
    const gridSize = Math.floor(this.size / this.resolution);

    const grid = createEmptyMatrix(gridSize);

    // Generate heights
    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        const height = this.getHeight(
          { x, z },
          this.offset
        );

        grid[z][x] = height;
      }
    }

    return grid;
  }

  #createMesh() {
    const gridSize = Math.floor(this.size / this.resolution);

    const geometry = new THREE.PlaneGeometry(
      this.size,
      this.size,
      gridSize - 1,
      gridSize - 1
    );

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gridSize * gridSize * 3), 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.2,
      wireframe: this.wireframe,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;

    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        const index = z * gridSize + x;

        const height = this.grid[z][x];

        const color = (() => {
          if (height < .45) return COLORS.water;
          if (height < .5) return COLORS.sand;
          if (height < .7) return COLORS.grass;
          if (height < .9) return COLORS.rock;
          return COLORS.snow;
        })();

        positions.setZ(index, (height < .49 ? .49 : height) * this.heightMultiplier);
        colors.setXYZ(index, color.r, color.g, color.b);
      }
    }
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.add(new THREE.Vector3(this.offset.x, 0, this.offset.z))
    mesh.rotation.x = - Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    return mesh;
  }
}

class UIControl {
  config;

  constructor(config) {
    this.config = config;

    const gui = new dat.GUI();

    const generationFolder = gui.addFolder('Generation');
    generationFolder.open();

    generationFolder.add(this.config, 'size', 1, 5, 1);
    generationFolder.add(this.config, 'resolution', 2, 32, 2);
    generationFolder.add(this.config, 'chunkSize', 128, 2048, 128);

    generationFolder.add(this.config, 'octaves', 1, 10, 1);
    generationFolder.add(this.config, 'persistance', 0.1, 5, 0.1);
    generationFolder.add(this.config, 'lacunarity', 1, 10, 0.1);
    generationFolder.add(this.config, 'heightMultiplier', 1, 1000, 0.1);

    generationFolder.add(this.config, 'islands');
    generationFolder.add(this.config, 'wireframe');

    generationFolder.add({
      'Generate new seed': () => {
        window.terrain.destroy();
        window.terrain = new Terrain({ ...this.config, scene });

        window.terrain.create();
      }
    }, 'Generate new seed');
  }
}

// App
function main() {
  // Scene
  const scene = new THREE.Scene();
  window.scene = scene;
  scene.background = new THREE.Color(0xeeeeee);

  // Renderer
  const renderer = new THREE.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z -= 300;
  camera.position.y = 175;
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // Light
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(500, 250, -500);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  const helper = new THREE.DirectionalLightHelper(directionalLight, 5);
  scene.add(helper);

  // Fly Controls
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // UI Controller
  new UIControl(CONFIG);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.terrain = new Terrain({ ...CONFIG, scene });

  window.terrain.create();

  const dir = new THREE.Vector3(0, 1, 0);
  dir.normalize();
  const origin = new THREE.Vector3(50, 0, 50);
  const arrowHelper = new THREE.ArrowHelper(dir, origin, 350, 'red');
  scene.add(arrowHelper);

  const animate = () => {
    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);

    if (window.terrain.hash() !== JSON.stringify(CONFIG)) {
      window.terrain.destroy();

      window.terrain.update(CONFIG);

      window.terrain.create();
    }
  };

  animate();
}

main();