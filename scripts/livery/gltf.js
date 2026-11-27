// Reading of a single-buffer glTF (embedded or external buffer): the meshes as
// one primitive per entry, with their node name and plain arrays of attributes.
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SIZES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

export function readGltf(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const uri = json.buffers[0].uri;
  const buffer = uri.startsWith('data:')
    ? Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
    : readFileSync(join(dirname(path), uri));
  const read = (index) => {
    const a = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const n = COMPONENTS[a.type];
    const size = SIZES[a.componentType];
    const stride = view.byteStride || n * size;
    const offset = (view.byteOffset || 0) + (a.byteOffset || 0);
    const get = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }[a.componentType];
    const out = new (a.componentType === 5126 ? Float32Array : Uint32Array)(a.count * n);
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) out[k * n + c] = buffer[get](offset + k * stride + c * size);
    return out;
  };
  const primitives = [];
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    for (const p of json.meshes[node.mesh].primitives) {
      const position = read(p.attributes.POSITION);
      primitives.push({
        node: node.name,
        material: p.material,
        position,
        normal: read(p.attributes.NORMAL),
        uv: p.attributes.TEXCOORD_0 === undefined ? null : read(p.attributes.TEXCOORD_0),
        index:
          p.indices === undefined ? Uint32Array.from({ length: position.length / 3 }, (_, i) => i) : read(p.indices),
      });
    }
  }
  return { json, primitives };
}
