import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Uint16BufferAttribute,
  Vector2,
  Vector3,
} from 'three';

import { COUNTRIES } from './country-data';
import { WORLD_GLOBE_MESH } from './world-globe-data';

function decodeMesh() {
  const positionBuffer = Buffer.from(WORLD_GLOBE_MESH.positions, 'base64');
  const indexBuffer = Buffer.from(WORLD_GLOBE_MESH.indices, 'base64');
  const positions = new Float32Array(WORLD_GLOBE_MESH.stats.vertexCount * 3);
  const indices = new Uint16Array(WORLD_GLOBE_MESH.stats.triangleCount * 3);
  const faceCountries = new Uint16Array(WORLD_GLOBE_MESH.stats.triangleCount);

  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = (
      positionBuffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT)
    ) * 1.006;
  }

  for (const [countryIndex, country] of WORLD_GLOBE_MESH.countries.entries()) {
    const vertexStart = country.positionOffset / 3;
    for (let index = 0; index < country.indexCount; index += 1) {
      indices[country.indexOffset + index] = indexBuffer.readUInt16LE(
        (country.indexOffset + index) * Uint16Array.BYTES_PER_ELEMENT,
      ) + vertexStart;
    }
    faceCountries.fill(
      countryIndex,
      country.indexOffset / 3,
      (country.indexOffset + country.indexCount) / 3,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return { geometry, positions, indices, faceCountries };
}

test('precomputed globe mesh covers the complete tracker source compactly', () => {
  assert.equal(WORLD_GLOBE_MESH.version, 2);
  assert.equal(WORLD_GLOBE_MESH.stats.countryCount, COUNTRIES.length);
  assert.equal(WORLD_GLOBE_MESH.countries.length, COUNTRIES.length);
  assert.deepEqual(
    WORLD_GLOBE_MESH.countries.map(({ code }) => code),
    COUNTRIES.map(({ code }) => code),
  );
  assert.equal(
    Buffer.from(WORLD_GLOBE_MESH.positions, 'base64').byteLength,
    WORLD_GLOBE_MESH.stats.vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT,
  );
  assert.equal(
    Buffer.from(WORLD_GLOBE_MESH.indices, 'base64').byteLength,
    WORLD_GLOBE_MESH.stats.triangleCount * 3 * Uint16Array.BYTES_PER_ELEMENT,
  );
});

test('every country index remains inside its own vertex range', () => {
  const indexBuffer = Buffer.from(WORLD_GLOBE_MESH.indices, 'base64');
  for (const country of WORLD_GLOBE_MESH.countries) {
    assert.equal(country.indexCount % 3, 0, `${country.code} index count`);
    for (let index = 0; index < country.indexCount; index += 1) {
      const localIndex = indexBuffer.readUInt16LE(
        (country.indexOffset + index) * Uint16Array.BYTES_PER_ELEMENT,
      );
      assert.ok(localIndex < country.vertexCount, `${country.code} local index`);
    }
  }
});

test('raycast face indices resolve representative countries and Antarctica', () => {
  const { geometry, positions, indices, faceCountries } = decodeMesh();
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const camera = new PerspectiveCamera(36, 1, 0.1, 100);
  const raycaster = new Raycaster();
  const center = new Vector2(0, 0);

  for (const code of ['SE', 'GI', 'VA', 'AQ']) {
    const countryIndex = WORLD_GLOBE_MESH.countries.findIndex(
      (country) => country.code === code,
    );
    const country = WORLD_GLOBE_MESH.countries[countryIndex];
    let largestFace = country.indexOffset / 3;
    let largestArea = -1;

    for (
      let faceIndex = country.indexOffset / 3;
      faceIndex < (country.indexOffset + country.indexCount) / 3;
      faceIndex += 1
    ) {
      const a = new Vector3().fromArray(positions, indices[faceIndex * 3] * 3);
      const b = new Vector3().fromArray(positions, indices[faceIndex * 3 + 1] * 3);
      const c = new Vector3().fromArray(positions, indices[faceIndex * 3 + 2] * 3);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();
      if (area > largestArea) {
        largestArea = area;
        largestFace = faceIndex;
      }
    }

    const direction = new Vector3()
      .fromArray(positions, indices[largestFace * 3] * 3)
      .add(new Vector3().fromArray(positions, indices[largestFace * 3 + 1] * 3))
      .add(new Vector3().fromArray(positions, indices[largestFace * 3 + 2] * 3))
      .normalize();
    camera.position.copy(direction.multiplyScalar(3.35));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
    raycaster.setFromCamera(center, camera);

    const hit = raycaster.intersectObject(mesh, false)[0];
    assert.ok(hit && typeof hit.faceIndex === 'number', `${code} raycast hit`);
    const hitCountryIndex = faceCountries[hit.faceIndex];
    assert.equal(WORLD_GLOBE_MESH.countries[hitCountryIndex].code, code);
  }

  geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
});
