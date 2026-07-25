// Approved camera distances. Sensitivity adapts inside this range without
// changing the globe's initial framing or maximum zoom.
export const MIN_CAMERA_Z = 1.43;
export const OVERVIEW_CAMERA_Z = 3.35;
export const MAX_CAMERA_Z = 5.25;

export const DRAG_RADIANS_PER_POINT = 0.0062;
export const MOMENTUM_RADIANS_PER_POINT_PER_SECOND = 0.00042;

export const MIN_ROTATION_SENSITIVITY = 0.3;
export const OVERVIEW_INERTIA_DAMPING_RATE = 4.6;
export const MAX_ZOOM_INERTIA_DAMPING_RATE = 9.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Returns 0 at the normal overview distance and 1 at maximum zoom.
 * Distances farther out than the overview retain the existing sensitivity.
 */
export function getGlobeZoomProgress(cameraZ: number): number {
  const linearProgress = (
    OVERVIEW_CAMERA_Z - cameraZ
  ) / (
    OVERVIEW_CAMERA_Z - MIN_CAMERA_Z
  );
  return smoothstep(linearProgress);
}

/**
 * Direct-drag sensitivity stays at 1.0 around the approved overview, eases
 * through 0.65 halfway in, and reaches 0.30 at maximum zoom.
 */
export function getGlobeRotationSensitivity(cameraZ: number): number {
  const zoomProgress = getGlobeZoomProgress(cameraZ);
  return 1 - zoomProgress * (1 - MIN_ROTATION_SENSITIVITY);
}

/**
 * Momentum falls faster than direct manipulation so close-up positioning
 * remains precise without removing the premium overview glide.
 */
export function getGlobeMomentumScale(cameraZ: number): number {
  const sensitivity = getGlobeRotationSensitivity(cameraZ);
  return sensitivity * sensitivity;
}

export function getGlobeInertiaDampingRate(cameraZ: number): number {
  const zoomProgress = getGlobeZoomProgress(cameraZ);
  return (
    OVERVIEW_INERTIA_DAMPING_RATE
    + zoomProgress * (
      MAX_ZOOM_INERTIA_DAMPING_RATE - OVERVIEW_INERTIA_DAMPING_RATE
    )
  );
}

export function shouldHandoffPinchToPan(
  isPinching: boolean,
  numberOfPointers: number,
): boolean {
  return isPinching && numberOfPointers < 2;
}
