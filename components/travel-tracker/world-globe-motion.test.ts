import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGlobeInertiaDampingRate,
  getGlobeMomentumScale,
  getGlobeRotationSensitivity,
  MAX_CAMERA_Z,
  MAX_ZOOM_INERTIA_DAMPING_RATE,
  MIN_CAMERA_Z,
  MIN_ROTATION_SENSITIVITY,
  OVERVIEW_CAMERA_Z,
  OVERVIEW_INERTIA_DAMPING_RATE,
  shouldHandoffPinchToPan,
} from './world-globe-motion';

const MID_ZOOM_CAMERA_Z = (OVERVIEW_CAMERA_Z + MIN_CAMERA_Z) / 2;

function assertApproximately(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < Number.EPSILON * 4);
}

test('approved camera distances remain unchanged', () => {
  assert.equal(MIN_CAMERA_Z, 1.43);
  assert.equal(OVERVIEW_CAMERA_Z, 3.35);
  assert.equal(MAX_CAMERA_Z, 5.25);
});

test('rotation sensitivity follows the approved smooth zoom curve', () => {
  assert.equal(getGlobeRotationSensitivity(MAX_CAMERA_Z), 1);
  assert.equal(getGlobeRotationSensitivity(OVERVIEW_CAMERA_Z), 1);
  assertApproximately(getGlobeRotationSensitivity(MID_ZOOM_CAMERA_Z), 0.65);
  assertApproximately(
    getGlobeRotationSensitivity(MIN_CAMERA_Z),
    MIN_ROTATION_SENSITIVITY,
  );
});

test('rotation sensitivity is continuous and monotonic through the zoom range', () => {
  let previous = getGlobeRotationSensitivity(MIN_CAMERA_Z);
  for (let step = 1; step <= 100; step += 1) {
    const cameraZ = MIN_CAMERA_Z + (
      (OVERVIEW_CAMERA_Z - MIN_CAMERA_Z) * step / 100
    );
    const current = getGlobeRotationSensitivity(cameraZ);
    assert.ok(current >= previous);
    assert.ok(current - previous < 0.02);
    previous = current;
  }
});

test('close-up momentum is strongly reduced and decays faster', () => {
  assert.equal(getGlobeMomentumScale(OVERVIEW_CAMERA_Z), 1);
  assertApproximately(getGlobeMomentumScale(MID_ZOOM_CAMERA_Z), 0.65 ** 2);
  assertApproximately(
    getGlobeMomentumScale(MIN_CAMERA_Z),
    MIN_ROTATION_SENSITIVITY ** 2,
  );

  assert.equal(
    getGlobeInertiaDampingRate(OVERVIEW_CAMERA_Z),
    OVERVIEW_INERTIA_DAMPING_RATE,
  );
  assert.equal(
    getGlobeInertiaDampingRate(MIN_CAMERA_Z),
    MAX_ZOOM_INERTIA_DAMPING_RATE,
  );
});

test('Android pinch hands the remaining pointer back to pan without a jump', () => {
  assert.equal(shouldHandoffPinchToPan(false, 1), false);
  assert.equal(shouldHandoffPinchToPan(true, 2), false);
  assert.equal(shouldHandoffPinchToPan(true, 1), true);
});
