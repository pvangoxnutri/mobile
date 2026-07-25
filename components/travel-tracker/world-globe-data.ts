/**
 * Local, render-ready vector mesh for the Travel Tracker globe.
 *
 * Source: Natural Earth, 1:10m Admin 0 – Map Units, version 5.1.1.
 * https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-details/
 *
 * License: public domain. The source was dissolved by SideQuest ISO code,
 * simplified to 4% with shape preservation using Mapshaper, triangulated at
 * 1.5-degree curvature resolution, and stored as render-ready Float32
 * unit-sphere positions. No raster map or texture is stored or loaded by the
 * app.
 */
import mesh from './world-globe-mesh.json';

export interface GlobeCountryMesh {
  code: string;
  centroid: {
    latitude: number;
    longitude: number;
  };
  positionOffset: number;
  vertexCount: number;
  indexOffset: number;
  indexCount: number;
}

export interface WorldGlobeMesh {
  version: number;
  positionEncoding: 'float32-le';
  borderEncoding: 'int16-normalized-le';
  borderQuantizationMax: number;
  curvatureResolutionDegrees: number;
  countries: GlobeCountryMesh[];
  positions: string;
  indices: string;
  borders: string;
  stats: {
    countryCount: number;
    vertexCount: number;
    triangleCount: number;
    borderSegmentCount: number;
  };
}

export const WORLD_GLOBE_MESH = mesh as WorldGlobeMesh;
export const WORLD_GLOBE_GEOMETRY_CODES = new Set(
  WORLD_GLOBE_MESH.countries
    .filter(({ indexCount }) => indexCount > 0)
    .map(({ code }) => code),
);
export const WORLD_GLOBE_MISSING_CODES = WORLD_GLOBE_MESH.countries
  .filter(({ indexCount }) => indexCount === 0)
  .map(({ code }) => code);
