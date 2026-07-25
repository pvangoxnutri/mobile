import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEntries, COUNTRIES } from './country-data';
import {
  getCountryByCode,
  getPrimaryLivingCountryCode,
  getVisitedContinents,
  getVisitedCount,
  mergeStatusMaps,
  sanitizeStatusMap,
  setCountryStatus,
} from './travel-tracker-state';
import {
  WORLD_GLOBE_GEOMETRY_CODES,
  WORLD_GLOBE_MISSING_CODES,
} from './world-globe-data';

test('globe ISO lookup resolves the exact country source used by the list flow', () => {
  const swedenFromSource = COUNTRIES.find(({ code }) => code === 'SE');
  assert.equal(getCountryByCode('SE'), swedenFromSource);
  assert.equal(getCountryByCode('AQ')?.continent, 'Antarctica');
});

test('a shared status-sheet selection immediately updates globe and list data', () => {
  const local = setCountryStatus({}, 'SE', 'visited');
  const merged = mergeStatusMaps({}, local);
  const sweden = buildEntries(merged).find(({ code }) => code === 'SE');
  assert.equal(merged.SE, 'visited');
  assert.equal(sweden?.status, 'visited');
});

test('a list change is immediately represented by globe status data', () => {
  const merged = mergeStatusMaps({}, setCountryStatus({}, 'GI', 'planned'));
  assert.equal(merged.GI, 'planned');
  assert.equal(WORLD_GLOBE_GEOMETRY_CODES.has('GI'), true);
  assert.equal(getCountryByCode('GI')?.code, 'GI');
});

test('the first saved living country is the deterministic initial globe focus', () => {
  assert.equal(getPrimaryLivingCountryCode({ SE: 'living' }), 'SE');
  assert.equal(
    getPrimaryLivingCountryCode({ US: 'living', SE: 'living', NO: 'visited' }),
    'US',
  );
  assert.equal(getPrimaryLivingCountryCode({ SE: 'visited', NO: 'planned' }), null);
});

test('changing living to visited removes the living status everywhere immediately', () => {
  const living = setCountryStatus({}, 'SE', 'living');
  assert.equal(mergeStatusMaps({}, living).SE, 'living');
  assert.equal(buildEntries(living).find(({ code }) => code === 'SE')?.status, 'living');

  const visited = setCountryStatus(living, 'SE', 'visited');
  assert.equal(mergeStatusMaps({}, visited).SE, 'visited');
  assert.equal(buildEntries(visited).find(({ code }) => code === 'SE')?.status, 'visited');
});

test('statistics use the country source independently of render geometry', () => {
  const map = { SE: 'visited', VA: 'visited', TR: 'living', AQ: 'visited' } as const;
  assert.equal(getVisitedCount(map), 4);
  assert.deepEqual(
    [...getVisitedContinents(map)].sort(),
    ['Antarctica', 'Asia', 'Europe'],
  );
});

test('an explicit none tombstone overrides a trip-derived country', () => {
  const tripDerived = { SE: 'visited' } as const;
  const local = setCountryStatus({}, 'SE', 'none');
  assert.equal(mergeStatusMaps(tripDerived, local).SE, 'none');
});

test('unknown codes and invalid statuses are ignored safely', () => {
  assert.deepEqual(sanitizeStatusMap({ XX: 'visited', SE: 'invalid', GI: 'planned' }), {
    GI: 'planned',
  });
  const original = { SE: 'visited' } as const;
  assert.equal(setCountryStatus(original, 'XX', 'visited'), original);
  assert.equal(getCountryByCode('XX'), undefined);
});

test('Natural Earth globe geometry covers the complete tracker source', () => {
  assert.equal(WORLD_GLOBE_GEOMETRY_CODES.has('SE'), true);
  assert.equal(WORLD_GLOBE_GEOMETRY_CODES.has('GI'), true);
  assert.equal(WORLD_GLOBE_GEOMETRY_CODES.has('VA'), true);
  assert.equal(WORLD_GLOBE_GEOMETRY_CODES.has('AQ'), true);
  assert.deepEqual([...WORLD_GLOBE_MISSING_CODES], []);
});
