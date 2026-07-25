/* eslint-disable react/no-unknown-property */
import {
  Canvas,
  type RootState,
  useFrame,
} from '@react-three/fiber/native/dist/react-three-fiber-native.esm.js';
import {
  Component,
  memo,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { PixelRatio, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  Raycaster,
  Uint16BufferAttribute,
  Uint8BufferAttribute,
  Vector2,
} from 'three';

import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import {
  type Country,
  type CountryStatus,
  type StatusMap,
} from './country-data';
import { getTravelTrackerLivingColors } from './status-colors';
import { getCountryByCode } from './travel-tracker-state';
import {
  WORLD_GLOBE_MESH,
} from './world-globe-data';
import {
  type GlobeRotation,
  resolveInitialGlobeView,
} from './world-globe-focus';
import {
  DRAG_RADIANS_PER_POINT,
  getGlobeInertiaDampingRate,
  getGlobeMomentumScale,
  getGlobeRotationSensitivity,
  MAX_CAMERA_Z,
  MIN_CAMERA_Z,
  MOMENTUM_RADIANS_PER_POINT_PER_SECOND,
  shouldHandoffPinchToPan,
} from './world-globe-motion';

interface WorldGlobeProps {
  statusMap: StatusMap;
  activeCode: string | null;
  initialFocusCode: string | null | undefined;
  onCountryPress: (country: Country) => void;
}

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

interface GlobePalette {
  ocean: string;
  unvisited: string;
  visited: string;
  planned: string;
  living: string;
  border: string;
  active: string;
}

interface RotationTarget {
  x: number;
  y: number;
}

interface AngularVelocity {
  x: number;
  y: number;
}

const COUNTRY_RADIUS = 1.006;
const BORDER_RADIUS = 1.011;
const TAP_MAX_DISTANCE = 7;

interface DecodedMeshData {
  positions: DataView;
  indices: DataView;
  borders: DataView;
}

let cachedCountrySurface: BufferGeometry | null = null;
let cachedBorders: BufferGeometry | null = null;
let cachedMeshData: DecodedMeshData | null = null;

class GlobeErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) console.warn('[TRAVEL_TRACKER] 3D globe failed to render:', error.message);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function getGlobePalette(theme: AppTheme): GlobePalette {
  const livingColors = getTravelTrackerLivingColors(theme);
  return {
    ocean: theme.isDark ? '#101720' : '#DCE8EA',
    unvisited: theme.isDark ? theme.colors.surfaceElevated : '#FAF8F3',
    visited: theme.colors.primary,
    planned: theme.colors.secondary,
    living: livingColors.globe,
    border: theme.isDark ? '#596171' : '#C8C4BC',
    active: theme.colors.white,
  };
}

function decodeBase64(value: string): DataView {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new DataView(bytes.buffer);
}

function getDecodedMeshData(): DecodedMeshData {
  if (cachedMeshData) return cachedMeshData;
  cachedMeshData = {
    positions: decodeBase64(WORLD_GLOBE_MESH.positions),
    indices: decodeBase64(WORLD_GLOBE_MESH.indices),
    borders: decodeBase64(WORLD_GLOBE_MESH.borders),
  };
  return cachedMeshData;
}

function createCountrySurface(): BufferGeometry {
  if (cachedCountrySurface) return cachedCountrySurface;

  const source = getDecodedMeshData();
  const positions = new Float32Array(WORLD_GLOBE_MESH.stats.vertexCount * 3);
  const normals = new Float32Array(positions.length);
  const colors = new Uint8Array(positions.length);
  colors.fill(255);
  const indices = new Uint16Array(WORLD_GLOBE_MESH.stats.triangleCount * 3);
  const triangleCountryIndices = new Uint16Array(WORLD_GLOBE_MESH.stats.triangleCount);

  for (const [countryIndex, country] of WORLD_GLOBE_MESH.countries.entries()) {
    const vertexStart = country.positionOffset / 3;
    for (let component = 0; component < country.vertexCount * 3; component += 1) {
      const normalized = source.positions.getFloat32(
        (country.positionOffset + component) * Float32Array.BYTES_PER_ELEMENT,
        true,
      );
      positions[country.positionOffset + component] = normalized * COUNTRY_RADIUS;
      normals[country.positionOffset + component] = normalized;
    }

    for (let index = 0; index < country.indexCount; index += 1) {
      indices[country.indexOffset + index] = source.indices.getUint16(
        (country.indexOffset + index) * Uint16Array.BYTES_PER_ELEMENT,
        true,
      ) + vertexStart;
    }
    triangleCountryIndices.fill(
      countryIndex,
      country.indexOffset / 3,
      (country.indexOffset + country.indexCount) / 3,
    );
  }

  cachedCountrySurface = new BufferGeometry();
  cachedCountrySurface.setAttribute('position', new Float32BufferAttribute(positions, 3));
  cachedCountrySurface.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  cachedCountrySurface.setAttribute('color', new Uint8BufferAttribute(colors, 3, true));
  cachedCountrySurface.setIndex(new Uint16BufferAttribute(indices, 1));
  cachedCountrySurface.computeBoundingSphere();
  cachedCountrySurface.userData.triangleCountryIndices = triangleCountryIndices;
  return cachedCountrySurface;
}

function createBorderGeometry(): BufferGeometry {
  if (cachedBorders) return cachedBorders;

  const source = getDecodedMeshData().borders;
  const positions = new Float32Array(source.byteLength / Int16Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = (
      source.getInt16(index * Int16Array.BYTES_PER_ELEMENT, true)
      / WORLD_GLOBE_MESH.borderQuantizationMax
    ) * BORDER_RADIUS;
  }

  cachedBorders = new BufferGeometry();
  cachedBorders.setAttribute('position', new Float32BufferAttribute(positions, 3));
  cachedBorders.computeBoundingSphere();
  return cachedBorders;
}

function countryColor(status: CountryStatus | undefined, palette: GlobePalette): string {
  if (status === 'visited') return palette.visited;
  if (status === 'planned') return palette.planned;
  if (status === 'living') return palette.living;
  return palette.unvisited;
}

function updateCountryColors(
  geometry: BufferGeometry,
  statusMap: StatusMap,
  activeCode: string | null,
  palette: GlobePalette,
) {
  const attribute = geometry.getAttribute('color') as Uint8BufferAttribute;
  const colors = attribute.array as Uint8Array;
  const activeColor = new Color(palette.active);

  for (const country of WORLD_GLOBE_MESH.countries) {
    const color = new Color(countryColor(statusMap[country.code], palette));
    if (country.code === activeCode) color.lerp(activeColor, 0.24);
    const red = Math.round(color.r * 255);
    const green = Math.round(color.g * 255);
    const blue = Math.round(color.b * 255);

    for (
      let index = country.positionOffset;
      index < country.positionOffset + country.vertexCount * 3;
      index += 3
    ) {
      colors[index] = red;
      colors[index + 1] = green;
      colors[index + 2] = blue;
    }
  }
  attribute.needsUpdate = true;
}

interface GlobeSceneProps {
  statusMap: StatusMap;
  activeCode: string | null;
  palette: GlobePalette;
  rotationTarget: MutableRefObject<RotationTarget>;
  angularVelocity: MutableRefObject<AngularVelocity>;
  zoomTarget: MutableRefObject<number>;
  countryHitTargetRef: MutableRefObject<Mesh | null>;
  initialRotation: GlobeRotation;
}

const GlobeScene = memo(function GlobeScene({
  statusMap,
  activeCode,
  palette,
  rotationTarget,
  angularVelocity,
  zoomTarget,
  countryHitTargetRef,
  initialRotation,
}: GlobeSceneProps) {
  const countrySurface = useMemo(createCountrySurface, []);
  const borderGeometry = useMemo(createBorderGeometry, []);
  const localGlobeRef = useRef<Group>(null);
  const handleGlobeRef = useCallback((globe: Group | null) => {
    localGlobeRef.current = globe;
    if (globe) globe.rotation.set(initialRotation.x, initialRotation.y, 0);
  }, [initialRotation.x, initialRotation.y]);

  useLayoutEffect(() => {
    updateCountryColors(countrySurface, statusMap, activeCode, palette);
  }, [activeCode, countrySurface, palette, statusMap]);

  useFrame(({ camera }, delta) => {
    const globe = localGlobeRef.current;
    if (!globe) return;

    const damping = Math.exp(-getGlobeInertiaDampingRate(camera.position.z) * delta);
    if (Math.abs(angularVelocity.current.x) > 0.0001 || Math.abs(angularVelocity.current.y) > 0.0001) {
      rotationTarget.current.x += angularVelocity.current.x * delta;
      rotationTarget.current.y += angularVelocity.current.y * delta;
      angularVelocity.current.x *= damping;
      angularVelocity.current.y *= damping;
    }

    globe.rotation.x = MathUtils.damp(globe.rotation.x, rotationTarget.current.x, 15, delta);
    globe.rotation.y = MathUtils.damp(globe.rotation.y, rotationTarget.current.y, 15, delta);
    camera.position.z = MathUtils.damp(camera.position.z, zoomTarget.current, 16, delta);
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <ambientLight intensity={1.65} />
      <directionalLight position={[2.8, 3.5, 5]} intensity={1.7} />
      <directionalLight position={[-3, -1.5, 1]} intensity={0.42} />

      <group ref={handleGlobeRef}>
        <mesh renderOrder={0}>
          <sphereGeometry args={[1, 128, 96]} />
          <meshLambertMaterial color={palette.ocean} />
        </mesh>

        <mesh
          ref={countryHitTargetRef}
          geometry={countrySurface}
          renderOrder={2}>
          <meshLambertMaterial vertexColors />
        </mesh>

        <lineSegments geometry={borderGeometry} renderOrder={3}>
          <lineBasicMaterial
            color={palette.border}
            transparent
            opacity={0.74}
            depthWrite={false}
          />
        </lineSegments>
      </group>
    </>
  );
});

function pickCountry(
  eventX: number,
  eventY: number,
  state: RootState | null,
  countryHitTarget: Mesh | null,
): Country | null {
  if (!state || !countryHitTarget || state.size.width <= 0 || state.size.height <= 0) return null;

  const pointer = new Vector2(
    (eventX / state.size.width) * 2 - 1,
    -(eventY / state.size.height) * 2 + 1,
  );
  const raycaster: Raycaster = state.raycaster;
  raycaster.setFromCamera(pointer, state.camera);

  // Intersect only country meshes. Including the ocean and thousands of border
  // segments makes taps more expensive and can create irrelevant line hits.
  const hits = raycaster.intersectObject(countryHitTarget, false);
  for (const hit of hits) {
    if (typeof hit.faceIndex !== 'number') continue;
    const triangleCountryIndices = countryHitTarget.geometry.userData
      .triangleCountryIndices as Uint16Array | undefined;
    const countryIndex = triangleCountryIndices?.[hit.faceIndex];
    const code = typeof countryIndex === 'number'
      ? WORLD_GLOBE_MESH.countries[countryIndex]?.code
      : undefined;
    if (code) return getCountryByCode(code) ?? null;
  }
  return null;
}

interface ReadyWorldGlobeProps {
  statusMap: StatusMap;
  activeCode: string | null;
  initialFocusCode: string | null;
  onCountryPress: (country: Country) => void;
  palette: GlobePalette;
}

function ReadyWorldGlobe({
  statusMap,
  activeCode,
  initialFocusCode,
  onCountryPress,
  palette,
}: ReadyWorldGlobeProps) {
  const initialViewRef = useRef<ReturnType<typeof resolveInitialGlobeView> | null>(null);
  initialViewRef.current ??= resolveInitialGlobeView(initialFocusCode);
  const initialView = initialViewRef.current;
  const rotationTarget = useRef<RotationTarget>({ ...initialView.rotation });
  const angularVelocity = useRef<AngularVelocity>({ x: 0, y: 0 });
  const zoomTarget = useRef(initialView.cameraZ);
  const zoomStart = useRef(initialView.cameraZ);
  const lastPanTranslation = useRef({ x: 0, y: 0 });
  const panNeedsRebase = useRef(false);
  const isPinching = useRef(false);
  const pinchAffectedPan = useRef(false);
  const countryHitTargetRef = useRef<Mesh | null>(null);
  const rootState = useRef<RootState | null>(null);

  const pan = useMemo(
    () => Gesture.Pan()
      .minDistance(TAP_MAX_DISTANCE + 1)
      .averageTouches(true)
      .runOnJS(true)
      .onBegin(() => {
        lastPanTranslation.current = { x: 0, y: 0 };
        panNeedsRebase.current = isPinching.current;
        pinchAffectedPan.current = isPinching.current;
        angularVelocity.current = { x: 0, y: 0 };
      })
      .onUpdate((event) => {
        const nextTranslation = {
          x: event.translationX,
          y: event.translationY,
        };

        // RNGH Android keeps Pinch ACTIVE until the last pointer is lifted.
        // When one finger remains, hand control back to Pan from the current
        // translation instead of swallowing the rest of the drag.
        if (shouldHandoffPinchToPan(isPinching.current, event.numberOfPointers)) {
          isPinching.current = false;
          panNeedsRebase.current = false;
          lastPanTranslation.current = nextTranslation;
          return;
        }

        // Pinch changes the gesture centroid and can make the pan translation
        // jump. Consume that coordinate change, then resume from a fresh
        // baseline on the first one-finger update after pinch.
        if (isPinching.current || panNeedsRebase.current) {
          lastPanTranslation.current = nextTranslation;
          if (!isPinching.current) panNeedsRebase.current = false;
          return;
        }

        const deltaX = nextTranslation.x - lastPanTranslation.current.x;
        const deltaY = nextTranslation.y - lastPanTranslation.current.y;
        lastPanTranslation.current = nextTranslation;

        const cameraZ = rootState.current?.camera.position.z ?? zoomTarget.current;
        const sensitivity = getGlobeRotationSensitivity(cameraZ);
        rotationTarget.current.x += deltaY * DRAG_RADIANS_PER_POINT * sensitivity;
        rotationTarget.current.y += deltaX * DRAG_RADIANS_PER_POINT * sensitivity;
      })
      .onEnd((event) => {
        if (pinchAffectedPan.current) {
          angularVelocity.current = { x: 0, y: 0 };
          return;
        }

        const cameraZ = rootState.current?.camera.position.z ?? zoomTarget.current;
        const momentumScale = getGlobeMomentumScale(cameraZ);
        angularVelocity.current.x = (
          event.velocityY
          * MOMENTUM_RADIANS_PER_POINT_PER_SECOND
          * momentumScale
        );
        angularVelocity.current.y = (
          event.velocityX
          * MOMENTUM_RADIANS_PER_POINT_PER_SECOND
          * momentumScale
        );
      }),
    [],
  );

  const pinch = useMemo(
    () => Gesture.Pinch()
      .runOnJS(true)
      // Android enters BEGAN for Pinch on the first pointer. Only mark a
      // real pinch once RNGH promotes the two-pointer gesture to ACTIVE.
      .onStart(() => {
        isPinching.current = true;
        pinchAffectedPan.current = true;
        panNeedsRebase.current = true;
        angularVelocity.current = { x: 0, y: 0 };
        zoomStart.current = zoomTarget.current;
      })
      .onUpdate((event) => {
        if (!isPinching.current) return;
        angularVelocity.current = { x: 0, y: 0 };
        zoomTarget.current = Math.max(
          MIN_CAMERA_Z,
          Math.min(MAX_CAMERA_Z, zoomStart.current / event.scale),
        );
      })
      .onFinalize(() => {
        // A one-pointer Pinch candidate also finalizes on Android. It must
        // not erase the velocity produced by an ordinary pan.
        if (!isPinching.current) return;
        isPinching.current = false;
        panNeedsRebase.current = true;
        angularVelocity.current = { x: 0, y: 0 };
      }),
    [],
  );

  const tap = useMemo(
    () => Gesture.Tap()
      .maxDistance(TAP_MAX_DISTANCE)
      .maxDuration(250)
      .runOnJS(true)
      .onEnd((event, success) => {
        if (!success) return;
        const country = pickCountry(
          event.x,
          event.y,
          rootState.current,
          countryHitTargetRef.current,
        );
        if (country) onCountryPress(country);
      }),
    [onCountryPress],
  );

  const gestures = useMemo(
    () => Gesture.Race(Gesture.Simultaneous(pan, pinch), tap),
    [pan, pinch, tap],
  );

  const handleCreated = useCallback((state: RootState) => {
    rootState.current = state;
    state.camera.position.set(0, 0, initialView.cameraZ);
    state.camera.lookAt(0, 0, 0);
    state.gl.setClearColor(0x000000, 0);
    if (__DEV__) {
      const nativeDpr = PixelRatio.get();
      const drawingSize = state.gl.getDrawingBufferSize(new Vector2());
      console.info(
        `[TRAVEL_TRACKER] Globe renderer DPR ${nativeDpr}; buffer ${drawingSize.x}×${drawingSize.y}`,
      );
    }
  }, [initialView.cameraZ]);

  return (
    <GestureDetector gesture={gestures}>
      <View style={readyStyles.canvasHost} collapsable={false}>
        <Canvas
          style={{ flex: 1 }}
          pointerEvents="none"
          camera={{ fov: 36, near: 0.1, far: 100, position: [0, 0, initialView.cameraZ] }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={handleCreated}>
          <GlobeScene
            statusMap={statusMap}
            activeCode={activeCode}
            palette={palette}
            rotationTarget={rotationTarget}
            angularVelocity={angularVelocity}
            zoomTarget={zoomTarget}
            countryHitTargetRef={countryHitTargetRef}
            initialRotation={initialView.rotation}
          />
        </Canvas>
      </View>
    </GestureDetector>
  );
}

export default function WorldGlobe({
  statusMap,
  activeCode,
  initialFocusCode,
  onCountryPress,
}: WorldGlobeProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const height = Math.max(330, Math.min(430, width * 1.04));
  const palette = useMemo(() => getGlobePalette(theme), [theme]);

  const fallback = (
    <View style={[styles.fallback, { height }]}>
      <Text style={styles.fallbackTitle}>{t('travel.mapUnavailable')}</Text>
      <Text style={styles.fallbackText}>{t('travel.mapUseList')}</Text>
    </View>
  );

  return (
    <View
      style={[styles.container, { height }]}
      accessible={initialFocusCode !== undefined}
      accessibilityRole="image"
      accessibilityLabel={t('travel.globeAccessibility')}
      accessibilityHint={t('travel.globeAccessibilityHint')}>
      {initialFocusCode === undefined ? null : (
        <GlobeErrorBoundary fallback={fallback}>
          <ReadyWorldGlobe
            statusMap={statusMap}
            activeCode={activeCode}
            initialFocusCode={initialFocusCode}
            onCountryPress={onCountryPress}
            palette={palette}
          />
        </GlobeErrorBoundary>
      )}
    </View>
  );
}

const readyStyles = StyleSheet.create({
  canvasHost: {
    flex: 1,
  },
});

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    marginHorizontal: -20,
    marginTop: -12,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#F7F3EC',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  fallbackText: {
    marginTop: 5,
    fontSize: 12,
    color: theme.colors.textMeta,
    textAlign: 'center',
  },
});
