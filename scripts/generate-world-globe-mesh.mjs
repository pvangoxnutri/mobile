/**
 * Precomputes render-ready spherical country meshes from the filtered Natural
 * Earth longitude/latitude source. Keeping triangulation out of the mobile
 * render path makes the first globe mount deterministic and fast.
 *
 * Usage:
 *   node scripts/generate-world-globe-mesh.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

// three-conic-polygon-geometry checks window.THREE at module evaluation time.
// React Native provides window; Node does not, so supply the minimal equivalent
// for this local generation script before dynamically importing the module.
globalThis.window ??= {};

const { default: ConicPolygonGeometry } = await import('three-conic-polygon-geometry');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(
  root,
  'components/travel-tracker/world-globe-geometry.json',
);
const outputPath = path.join(
  root,
  'components/travel-tracker/world-globe-mesh.json',
);

const CURVATURE_RESOLUTION_DEGREES = 1.5;
const BORDER_SEGMENT_DEGREES = 1.25;
const BORDER_QUANTIZATION_MAX = 32767;

function pointOnUnitSphere([longitude, latitude]) {
  const phi = ((90 - latitude) * Math.PI) / 180;
  const theta = ((90 - longitude) * Math.PI) / 180;
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ];
}

function float32Base64(values) {
  const buffer = Buffer.allocUnsafe(values.length * Float32Array.BYTES_PER_ELEMENT);
  values.forEach((value, index) => {
    buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
  });
  return buffer.toString('base64');
}

function int16Base64(values) {
  const buffer = Buffer.allocUnsafe(values.length * Int16Array.BYTES_PER_ELEMENT);
  values.forEach((value, index) => {
    buffer.writeInt16LE(value, index * Int16Array.BYTES_PER_ELEMENT);
  });
  return buffer.toString('base64');
}

function uint16Base64(values) {
  const buffer = Buffer.allocUnsafe(values.length * Uint16Array.BYTES_PER_ELEMENT);
  values.forEach((value, index) => {
    buffer.writeUInt16LE(value, index * Uint16Array.BYTES_PER_ELEMENT);
  });
  return buffer.toString('base64');
}

function triangleFacesOutward(positions, a, b, c) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const bax = positions[b * 3] - ax;
  const bay = positions[b * 3 + 1] - ay;
  const baz = positions[b * 3 + 2] - az;
  const cax = positions[c * 3] - ax;
  const cay = positions[c * 3 + 1] - ay;
  const caz = positions[c * 3 + 2] - az;
  const nx = bay * caz - baz * cay;
  const ny = baz * cax - bax * caz;
  const nz = bax * cay - bay * cax;
  return nx * ax + ny * ay + nz * az >= 0;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(vector) {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length < 1e-12) return null;
  return vector.map((value) => value / length);
}

function sphericalCountryCentroid(positions, indices, code) {
  const weightedCenter = [0, 0, 0];

  for (let index = 0; index < indices.length; index += 3) {
    const vertices = [indices[index], indices[index + 1], indices[index + 2]]
      .map((vertexIndex) => normalize([
        positions[vertexIndex * 3],
        positions[vertexIndex * 3 + 1],
        positions[vertexIndex * 3 + 2],
      ]));
    if (vertices.some((vertex) => !vertex)) continue;

    const [a, b, c] = vertices;
    const numerator = Math.abs(dot(a, cross(b, c)));
    const denominator = 1 + dot(a, b) + dot(b, c) + dot(c, a);
    const sphericalArea = 2 * Math.atan2(numerator, denominator);
    const triangleCenter = normalize([
      a[0] + b[0] + c[0],
      a[1] + b[1] + c[1],
      a[2] + b[2] + c[2],
    ]);
    if (!triangleCenter || !Number.isFinite(sphericalArea) || sphericalArea <= 0) continue;

    weightedCenter[0] += triangleCenter[0] * sphericalArea;
    weightedCenter[1] += triangleCenter[1] * sphericalArea;
    weightedCenter[2] += triangleCenter[2] * sphericalArea;
  }

  const center = normalize(weightedCenter);
  if (!center) throw new Error(`Could not calculate a finite centroid for ${code}.`);

  const latitude = Math.asin(Math.max(-1, Math.min(1, center[1]))) * 180 / Math.PI;
  const longitude = Math.atan2(center[0], center[2]) * 180 / Math.PI;
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
  };
}

function addBorderSegment(target, seen, from, to) {
  const quantizedFrom = pointOnUnitSphere(from).map((value) => (
    Math.round(value * BORDER_QUANTIZATION_MAX)
  ));
  const quantizedTo = pointOnUnitSphere(to).map((value) => (
    Math.round(value * BORDER_QUANTIZATION_MAX)
  ));
  const fromKey = quantizedFrom.join(',');
  const toKey = quantizedTo.join(',');
  if (fromKey === toKey) return;
  const key = fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push(...quantizedFrom, ...quantizedTo);
}

function addRingSegments(target, seen, ring) {
  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    let longitudeDelta = end[0] - start[0];
    if (longitudeDelta > 180) longitudeDelta -= 360;
    if (longitudeDelta < -180) longitudeDelta += 360;
    const latitudeDelta = end[1] - start[1];
    const steps = Math.max(
      1,
      Math.ceil(
        Math.max(Math.abs(longitudeDelta), Math.abs(latitudeDelta))
          / BORDER_SEGMENT_DEGREES,
      ),
    );

    for (let step = 0; step < steps; step += 1) {
      const fromRatio = step / steps;
      const toRatio = (step + 1) / steps;
      const from = [
        start[0] + longitudeDelta * fromRatio,
        start[1] + latitudeDelta * fromRatio,
      ];
      const to = [
        start[0] + longitudeDelta * toRatio,
        start[1] + latitudeDelta * toRatio,
      ];
      addBorderSegment(target, seen, from, to);
    }
  }
}

const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const allPositions = [];
const allIndices = [];
const borderPositions = [];
const borderSegmentKeys = new Set();
const countries = [];

for (const { code, polygons } of rows) {
  const countryPositions = [];
  const countryIndices = [];

  for (const polygon of polygons) {
    // Mapshaper emits RFC 7946 winding. d3-geo, used by the conic geometry
    // triangulator, interprets the opposite spherical winding; without this
    // reversal each land becomes the complement of itself (almost a full
    // globe), which is both visually wrong and extremely expensive.
    const sphericalPolygon = polygon.map((ring) => [...ring].reverse());
    const geometry = new ConicPolygonGeometry(
      sphericalPolygon,
      1,
      1,
      false,
      true,
      false,
      CURVATURE_RESOLUTION_DEGREES,
    );
    const positions = geometry.getAttribute('position').array;
    const indices = geometry.index?.array;
    if (!indices) throw new Error(`Missing triangle index for ${code}.`);

    const vertexOffset = countryPositions.length / 3;
    countryPositions.push(...positions);
    for (let index = 0; index < indices.length; index += 3) {
      const a = Number(indices[index]);
      const b = Number(indices[index + 1]);
      const c = Number(indices[index + 2]);
      countryIndices.push(
        a + vertexOffset,
        ...(triangleFacesOutward(positions, a, b, c)
          ? [b + vertexOffset, c + vertexOffset]
          : [c + vertexOffset, b + vertexOffset]),
      );
    }
    geometry.dispose();
  }

  const vertexCount = countryPositions.length / 3;
  if (vertexCount === 0 || countryIndices.length === 0) {
    throw new Error(`No renderable geometry generated for ${code}.`);
  }
  if (vertexCount > 65535) {
    throw new Error(`${code} has ${vertexCount} vertices; Uint16 indices are insufficient.`);
  }

  countries.push({
    code,
    centroid: sphericalCountryCentroid(countryPositions, countryIndices, code),
    positionOffset: allPositions.length,
    vertexCount,
    indexOffset: allIndices.length,
    indexCount: countryIndices.length,
  });
  allPositions.push(...countryPositions);
  allIndices.push(...countryIndices);

  for (const polygon of polygons) {
    for (const ring of polygon) {
      addRingSegments(borderPositions, borderSegmentKeys, ring);
    }
  }
}

const payload = {
  version: 2,
  positionEncoding: 'float32-le',
  borderEncoding: 'int16-normalized-le',
  borderQuantizationMax: BORDER_QUANTIZATION_MAX,
  curvatureResolutionDegrees: CURVATURE_RESOLUTION_DEGREES,
  countries,
  positions: float32Base64(allPositions),
  indices: uint16Base64(allIndices),
  borders: int16Base64(borderPositions),
  stats: {
    countryCount: countries.length,
    vertexCount: allPositions.length / 3,
    triangleCount: allIndices.length / 3,
    borderSegmentCount: borderPositions.length / 6,
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`);
console.log(
  `Generated ${payload.stats.countryCount} countries, `
    + `${payload.stats.vertexCount} vertices, `
    + `${payload.stats.triangleCount} triangles and `
    + `${payload.stats.borderSegmentCount} border segments.`,
);
