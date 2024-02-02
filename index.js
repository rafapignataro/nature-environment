import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
const DEFAULT_CONFIG = {
  width: 300,
  height: 300,
  cellSize: 4,
  octaves: 8,
  persistance: 0.5,
  lacunarity: 2,
  heightLimit: 50,
  falloff: false,
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

function createSea(map) {
  const geometry = new THREE.CircleGeometry(
    map.width,
    map.columns - 1
  );

  const material = new THREE.MeshStandardMaterial({
    color: COLORS.water,
    side: THREE.DoubleSide,
    wireframe: false
  });

  material.shadowSide = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);

  mesh.rotation.x = - Math.PI / 2;
  mesh.position.y -= 0;
  mesh.receiveShadow = true;

  return mesh;
}

function inverseLerp(min, max, valor) {
  // Garante que o valor esteja dentro do intervalo de min a max
  valor = Math.max(min, Math.min(max, valor));

  // Calcula o valor transformado para o intervalo de 0 a 1
  return (valor - min) / (max - min);
}

class MapGenerator {
  // Params
  width;

  height;

  cellSize;

  octaves;

  persistance;

  lacunarity;

  heightLimit;

  falloff;

  wireframe;

  offset;

  // Calculated
  columns;

  rows;

  map;

  mesh;

  minHeight;

  maxHeight;

  constructor({ width, height, cellSize, octaves, persistance, lacunarity, heightLimit, falloff, wireframe, offset }) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.octaves = octaves;
    this.persistance = persistance;
    this.lacunarity = lacunarity;
    this.heightLimit = heightLimit;
    this.falloff = falloff;
    this.wireframe = wireframe;

    this.columns = Math.floor(this.width / this.cellSize);
    this.rows = Math.floor(this.height / this.cellSize);

    this.minHeight = Number.MAX_SAFE_INTEGER;
    this.maxHeight = Number.MIN_SAFE_INTEGER;

    this.offset = offset;

    this.map = this.#createMap();
    this.mesh = this.#createMesh();
  }

  #createMap() {
    const grid = [];

    let falloffGrid = this.falloff ? this.#createFalloffMap() : null;

    for (let y = 0; y < this.rows; y++) {
      grid[y] = [];

      for (let x = 0; x < this.columns; x++) {
        let amplitude = 1;
        let frequency = 1;
        let noiseHeight = 0;

        for (let i = 0; i < this.octaves; i++) {
          const xPos = ((x * this.cellSize / this.width) - this.offset.x + (this.width / 2)) * frequency;
          const yPos = ((y * this.cellSize / this.height) - this.offset.y + (this.height / 2)) * frequency;

          const value = (perlin.get(xPos, yPos) + 1) / 2;

          noiseHeight += value * amplitude;

          amplitude *= this.persistance;

          frequency *= this.lacunarity;
        }

        if (noiseHeight < this.minHeight) this.minHeight = noiseHeight;
        if (noiseHeight > this.maxHeight) this.maxHeight = noiseHeight;

        grid[y][x] = (noiseHeight)

        if (this.falloff) grid[y][x] = grid[y][x] - falloffGrid[y][x]
      }
    }

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.columns; x++) {
        grid[y][x] = inverseLerp(this.minHeight, this.maxHeight, grid[y][x]);
      }
    }
    console.timeEnd('frame')

    return grid;
  }

  #createFalloffMap() {
    const size = this.rows;
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

  #createMesh() {
    const geometry = new THREE.PlaneGeometry(
      this.width,
      this.height,
      this.columns - 1,
      this.rows - 1
    );

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.rows * this.columns * 3), 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.8,
      wireframe: this.wireframe,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    material.needsUpdate = true;

    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.columns; x++) {
        const index = y * this.columns + x;
        const height = this.map[y][x];

        const color = (() => {
          if (height < .45) {
            positions.setZ(index, 0.45 * this.heightLimit);

            return COLORS.water;
          }
          positions.setZ(index, height * this.heightLimit);

          if (height < .5) return COLORS.sand;
          if (height < .7) return COLORS.grass;
          if (height < .9) return COLORS.rock;
          return COLORS.snow;
        })();

        colors.setXYZ(index, color.r, color.g, color.b);
      }
    }

    BufferGeometryUtils.mergeVertices(geometry)
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.x = this.offset.x + (this.width / 2);
    mesh.position.z = this.offset.y + (this.height / 2);
    mesh.rotation.x = - Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  hash() {
    return JSON.stringify({
      width: this.width,
      height: this.height,
      cellSize: this.cellSize,
      octaves: this.octaves,
      persistance: this.persistance,
      lacunarity: this.lacunarity,
      heightLimit: this.heightLimit,
      falloff: this.falloff,
      wireframe: this.wireframe
    });
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer();

renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);

// Luz direcional
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(500, 250, -500);
directionalLight.castShadow = true;
scene.add(directionalLight);
const helper = new THREE.DirectionalLightHelper(directionalLight, 5);
scene.add(helper);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;

// Configuração da câmera
camera.position.z -= 300;
camera.position.y = 175;

camera.lookAt(new THREE.Vector3(0, 0, 0));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function createChunks(size, config) {
  const chunks = [];

  for (let i = 0; i < size; i++) {
    chunks[i] = [];

    for (let j = 0; j < size; j++) {
      const chunkOffset = { x: j * config.width, y: i * config.height };
      console.log(chunkOffset)
      const chunk = new MapGenerator({ ...config, offset: chunkOffset });

      chunks[i][j] = chunk;
    }
  }

  return {
    chunks,
    render(scene) {
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const chunk = chunks[i][j];

          scene.add(chunk.mesh);
          const arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(chunk.offset.x, 0, chunk.offset.y),
            100,
            'red'
          );
          scene.add(arrowHelper);
        }
      }
    },
    destroy(scene) {
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const chunk = chunks[i][j];

          scene.remove(chunk.mesh)
        }
      }
    }
  }
}

let currentChunks;

const animate = () => {
  requestAnimationFrame(animate);

  // Atualiza os controles
  controls.update();

  // Renderiza a cena
  renderer.render(scene, camera);

  if (!currentChunks || JSON.stringify(CONFIG) !== currentChunks.chunks[0][0].hash()) {
    if (currentChunks) currentChunks.destroy(scene);

    currentChunks = createChunks(3, CONFIG);

    currentChunks.render(scene);
  }
};

const gui = new dat.GUI();

const generationFolder = gui.addFolder('Generation');
generationFolder.open();

generationFolder.add(CONFIG, 'width', 100, 3000, 100);
generationFolder.add(CONFIG, 'height', 100, 3000, 100);
generationFolder.add(CONFIG, 'cellSize', 2, 32, 2);
generationFolder.add(CONFIG, 'octaves', 1, 10, 1);
generationFolder.add(CONFIG, 'persistance', 0.1, 5, 0.1);
generationFolder.add(CONFIG, 'lacunarity', 1, 10, 1);
generationFolder.add(CONFIG, 'heightLimit', 1, 100, 0.1);
generationFolder.add(CONFIG, 'falloff');
generationFolder.add(CONFIG, 'wireframe');
generationFolder.add({
  'Generate new seed': () => {
    perlin.seed();
    if (currentChunks) {
      currentChunks.destroy(scene)
      currentChunks = undefined;
    }

  }
}, 'Generate new seed');

animate();