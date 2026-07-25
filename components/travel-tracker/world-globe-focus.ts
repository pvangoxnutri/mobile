import { WORLD_GLOBE_MESH } from './world-globe-data';

export interface GlobeRotation {
  x: number;
  y: number;
}

export interface InitialGlobeView {
  code: string | null;
  latitude: number;
  longitude: number;
  cameraZ: number;
  rotation: GlobeRotation;
}

export const EUROPE_GLOBE_VIEW = Object.freeze({
  code: null,
  latitude: 52,
  longitude: 15,
  cameraZ: 3.35,
});

const COUNTRY_CAMERA_Z = 3.35;
const COUNTRY_MESH_BY_CODE = new Map(
  WORLD_GLOBE_MESH.countries.map((country) => [country.code, country]),
);

export function coordinatesToGlobeRotation(
  latitude: number,
  longitude: number,
): GlobeRotation {
  return {
    x: latitude * Math.PI / 180,
    y: -longitude * Math.PI / 180,
  };
}

function withRotation(
  view: Omit<InitialGlobeView, 'rotation'>,
): InitialGlobeView {
  return {
    ...view,
    rotation: coordinatesToGlobeRotation(view.latitude, view.longitude),
  };
}

export function resolveInitialGlobeView(
  countryCode: string | null,
): InitialGlobeView {
  const country = countryCode ? COUNTRY_MESH_BY_CODE.get(countryCode) : undefined;
  if (!country || country.indexCount <= 0) {
    return withRotation(EUROPE_GLOBE_VIEW);
  }

  const { latitude, longitude } = country.centroid;
  const hasUsableCoordinates = (
    Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
  );

  if (!hasUsableCoordinates) {
    return withRotation(EUROPE_GLOBE_VIEW);
  }

  return withRotation({
    code: country.code,
    latitude,
    longitude,
    cameraZ: COUNTRY_CAMERA_Z,
  });
}
