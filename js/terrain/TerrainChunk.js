import * as THREE from 'three';

export default class TerrainChunk {
  constructor(cx, cz, material) {
    this.cx = cx;
    this.cz = cz;
    this.mesh = null;
    this.material = material;
    this._sharedMaterial = material;
    this._textureMaterial = null;
    this.disposed = false;
  }

  buildFromBuffers(positions, colors, indices, chunkSize, uvs) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(this.cx * chunkSize, 0, this.cz * chunkSize);
    this.mesh.frustumCulled = true;
  }

  setTexture(texture) {
    if (texture) {
      if (!this._textureMaterial) {
        this._textureMaterial = new THREE.MeshStandardNodeMaterial({
          side: THREE.DoubleSide,
          wireframe: this._sharedMaterial.wireframe,
          roughness: 1.0,
          metalness: 0.0,
        });
      }
      this._textureMaterial.map = texture;
      this._textureMaterial.vertexColors = false;
      this._textureMaterial.needsUpdate = true;
      this.mesh.material = this._textureMaterial;
    } else {
      this.mesh.material = this._sharedMaterial;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this._textureMaterial) {
        this._textureMaterial.dispose();
      }
    }
  }

  static generateIndices(res) {
    const indices = [];
    for (let z = 0; z < res - 1; z++) {
      for (let x = 0; x < res - 1; x++) {
        const a = z * res + x;
        const b = a + 1;
        const c = a + res;
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
    return res * res <= 65536 ? new Uint16Array(indices) : new Uint32Array(indices);
  }
}
