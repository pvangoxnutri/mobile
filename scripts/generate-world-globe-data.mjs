/**
 * Filters a simplified Natural Earth GeoJSON export to exactly the countries
 * used by Travel Tracker. The resulting JSON remains longitude/latitude vector
 * data and is triangulated into sphere geometry at runtime.
 *
 * Usage:
 *   node scripts/generate-world-globe-data.mjs <input.geojson>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('Pass the generated Natural Earth GeoJSON path.');

const countrySource = fs.readFileSync(
  path.join(root, 'components/travel-tracker/country-data.ts'),
  'utf8',
);
const wantedCodes = [
  ...countrySource.matchAll(/code: '([^']+)'/g),
].map((match) => match[1]);
const wanted = new Set(wantedCodes);
const source = JSON.parse(fs.readFileSync(input, 'utf8'));
const polygonsByCode = new Map(wantedCodes.map((code) => [code, []]));

for (const feature of source.features ?? []) {
  const code = feature.properties?.APP_CODE;
  if (!wanted.has(code) || !feature.geometry) continue;

  if (feature.geometry.type === 'Polygon') {
    polygonsByCode.get(code).push(feature.geometry.coordinates);
  } else if (feature.geometry.type === 'MultiPolygon') {
    polygonsByCode.get(code).push(...feature.geometry.coordinates);
  }
}

const rows = wantedCodes.map((code) => ({
  code,
  polygons: polygonsByCode.get(code),
}));
const missing = rows.filter(({ polygons }) => polygons.length === 0).map(({ code }) => code);
const outputPath = path.join(
  root,
  'components/travel-tracker/world-globe-geometry.json',
);

fs.writeFileSync(outputPath, `${JSON.stringify(rows)}\n`);
console.log(
  `Generated ${rows.length - missing.length}/${rows.length} globe countries; missing: ${missing.join(', ') || 'none'}`,
);
