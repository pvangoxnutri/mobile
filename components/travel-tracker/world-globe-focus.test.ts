import assert from 'node:assert/strict';
import test from 'node:test';

import { Euler, Vector3 } from 'three';

import type { AppTheme } from '@/constants/themes';
import {
  getTravelTrackerLivingColors,
  TRAVEL_TRACKER_LIVING_COLOR_TOKENS,
} from './status-colors';
import { WORLD_GLOBE_MESH } from './world-globe-data';
import {
  coordinatesToGlobeRotation,
  EUROPE_GLOBE_VIEW,
  resolveInitialGlobeView,
} from './world-globe-focus';

function pointOnUnitSphere(latitude: number, longitude: number): Vector3 {
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  return new Vector3(
    Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
    Math.sin(latitudeRadians),
    Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
  );
}

function assertCentered(latitude: number, longitude: number) {
  const rotation = coordinatesToGlobeRotation(latitude, longitude);
  const centered = pointOnUnitSphere(latitude, longitude)
    .applyEuler(new Euler(rotation.x, rotation.y, 0, 'XYZ'));
  assert.ok(Math.abs(centered.x) < 1e-9);
  assert.ok(Math.abs(centered.y) < 1e-9);
  assert.ok(Math.abs(centered.z - 1) < 1e-9);
}

test('Europe is the exact safe fallback with a natural overview zoom', () => {
  const expected = {
    ...EUROPE_GLOBE_VIEW,
    rotation: coordinatesToGlobeRotation(
      EUROPE_GLOBE_VIEW.latitude,
      EUROPE_GLOBE_VIEW.longitude,
    ),
  };
  assert.deepEqual(resolveInitialGlobeView(null), expected);
  assert.deepEqual(resolveInitialGlobeView('ZZ'), expected);
  assertCentered(expected.latitude, expected.longitude);
});

test('country focus uses the offline spherical centroid', () => {
  const sweden = resolveInitialGlobeView('SE');
  assert.equal(sweden.code, 'SE');
  assert.equal(sweden.latitude, 62.415341);
  assert.equal(sweden.longitude, 16.272328);
  assert.equal(sweden.cameraZ, 3.35);
  assertCentered(sweden.latitude, sweden.longitude);

  const fiji = resolveInitialGlobeView('FJ');
  assert.ok(fiji.longitude > 170);
  assertCentered(fiji.latitude, fiji.longitude);
});

test('every renderable country has a finite offline centroid', () => {
  assert.equal(WORLD_GLOBE_MESH.version, 2);
  for (const country of WORLD_GLOBE_MESH.countries) {
    assert.ok(country.indexCount > 0, `${country.code} geometry`);
    assert.ok(Number.isFinite(country.centroid.latitude), `${country.code} latitude`);
    assert.ok(Number.isFinite(country.centroid.longitude), `${country.code} longitude`);
    assert.ok(
      country.centroid.latitude >= -90 && country.centroid.latitude <= 90,
      `${country.code} latitude range`,
    );
    assert.ok(
      country.centroid.longitude >= -180 && country.centroid.longitude <= 180,
      `${country.code} longitude range`,
    );
  }
});

test('living uses one shared yellow token in light and dark mode', () => {
  const lightTheme = {
    isDark: false,
    colors: { primary: '#ff4f74' },
  } as AppTheme;
  const darkTheme = {
    isDark: true,
    colors: { primary: '#ff4f74' },
  } as AppTheme;
  assert.deepEqual(
    getTravelTrackerLivingColors(lightTheme),
    TRAVEL_TRACKER_LIVING_COLOR_TOKENS.light,
  );
  assert.deepEqual(
    getTravelTrackerLivingColors(darkTheme),
    TRAVEL_TRACKER_LIVING_COLOR_TOKENS.dark,
  );
  assert.notEqual(
    getTravelTrackerLivingColors(lightTheme).accent,
    lightTheme.colors.primary,
  );
  assert.notEqual(
    getTravelTrackerLivingColors(darkTheme).accent,
    darkTheme.colors.primary,
  );
});
