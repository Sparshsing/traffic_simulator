import interchange from './interchange.json';

export interface Point {
  x: number;
  y: number;
}

export interface Road {
  id: string;
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  color: string; // Deterministic color for the road
}

export interface LanePoint extends Point {
  attribute: string;
  height: number;
  visibility: number; // 0 => invisible, 1 => visible
}

export interface Lane {
  id: string;
  name: string;
  points: LanePoint[];
  links: {
    forward: string | null;
    forward_left: string | null;
    forward_right: string | null;
  };
  roadId: string | null;
  color: string; // Inherited from its parent road
}

export interface Vehicle {
  id: string;
  type: 'car' | 'bus' | 'truck';
  route: string[];         // ordered list of lane IDs
  currentLaneIndex: number;
  progress: number;        // distance traveled along the current lane
  speed: number;           // constant speed per simulation step (100ms)
  position: Point;         // current (x,y) position for rendering
  sourceRoadId: string;
  targetRoadId: string;
  color: string;           // color inherited from target road
  visible: boolean;        // true => render; false => skip or set opacity=0
}

export interface SimulationState {
  roads: Road[];
  lanes: Lane[];
  vehicles: Vehicle[];
}

// ---------------------
//   Simulation Settings
// ---------------------
const DEFAULT_VEHICLE_SPEED = 5;  // units per 100ms
const DEFAULT_INFLOW_RATE = 0.6;  // fallback probability for spawning a vehicle

// Customize inflow rates per road (by road ID).
const ROAD_TRAFFIC_INFLOW: { [roadId: string]: number } = {
  "1741517495196": 0.5,
  "1741517499620": 0.3,
  // ...add more as needed
};

// ---------------------
//   Deterministic Color
// ---------------------
function colorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const r = (hash >> 16) & 0xff;
  const g = (hash >> 8) & 0xff;
  const b = hash & 0xff;
  return `rgb(${(r + 256) % 256}, ${(g + 256) % 256}, ${(b + 256) % 256})`;
}

// ---------------------
//   Load Roads & Lanes
// ---------------------
const loadedRoads = (interchange.roads || []).map(road => ({
  ...road,
  color: colorFromString(road.id),
}));

const loadedLanes = (interchange.lines || []).map(line => {
  let laneColor = '#999';
  if (line.roadId) {
    const parentRoad = loadedRoads.find(r => r.id === line.roadId);
    if (parentRoad) {
      laneColor = parentRoad.color;
    }
  }
  return {
    ...line,
    color: laneColor,
  };
});

// ---------------------
//   Initial Simulation
// ---------------------
export const initialSimulationState: SimulationState = {
  roads: loadedRoads,
  lanes: loadedLanes,
  vehicles: [],
};

// ---------------------
//   Helpers
// ---------------------

/**
 * Check if this lane belongs to targetRoadId AND has no forward/left/right links.
 * This is required for a valid "destination lane."
 */
function isEndLane(lane: Lane, targetRoadId: string): boolean {
  return (
    lane.roadId === targetRoadId &&
    !lane.links.forward &&
    !lane.links.forward_left &&
    !lane.links.forward_right
  );
}

/**
 * Find a route (list of lane IDs) from startLaneId to an "end lane"
 * (one that belongs to the target road and has no forward links).
 */
function findRoute(lanes: Lane[], startLaneId: string, targetRoadId: string): string[] | null {
  const laneMap = new Map(lanes.map(l => [l.id, l]));
  const visited = new Set<string>();

  function dfs(currentLaneId: string, path: string[]): string[] | null {
    if (visited.has(currentLaneId)) return null;
    visited.add(currentLaneId);

    const lane = laneMap.get(currentLaneId);
    if (!lane) return null;

    const newPath = [...path, currentLaneId];

    // If this lane is a valid "end lane," route is complete
    if (isEndLane(lane, targetRoadId)) {
      return newPath;
    }

    // Otherwise, continue exploring its links
    const { forward, forward_left, forward_right } = lane.links;
    const nextLinks = [forward, forward_left, forward_right].filter(Boolean) as string[];
    for (const nextLaneId of nextLinks) {
      const result = dfs(nextLaneId, newPath);
      if (result) return result;
    }
    return null;
  }

  return dfs(startLaneId, []);
}

/**
 * Get candidate lanes for the "start" of a road: lanes that belong to roadId
 * but are NOT referenced as a link in any other lane.
 */
function getCandidateEntryLanes(lanes: Lane[], roadId: string): Lane[] {
  const referencedLaneIds = new Set<string>();
  for (const lane of lanes) {
    const { forward, forward_left, forward_right } = lane.links;
    [forward, forward_left, forward_right].forEach(l => {
      if (l) referencedLaneIds.add(l);
    });
  }
  return lanes.filter(l => l.roadId === roadId && !referencedLaneIds.has(l.id));
}

/**
 * Compute total length of a lane's polyline.
 */
function computeLaneLength(lane: Lane): number {
  let length = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const dx = lane.points[i].x - lane.points[i - 1].x;
    const dy = lane.points[i].y - lane.points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

/**
 * Return (x, y, visible) for a given lane + progress.
 * "Visibility" is determined by whichever lane point is closer:
 * if ratio < 0.5 => near start point; else near end point.
 */
function getPositionAndVisibilityOnLane(
  lane: Lane,
  progress: number
): { x: number; y: number; visible: boolean } {
  let remaining = progress;
  for (let i = 1; i < lane.points.length; i++) {
    const start = lane.points[i - 1];
    const end = lane.points[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (remaining <= segLen) {
      // We are on this segment
      const ratio = remaining / segLen;
      const x = start.x + dx * ratio;
      const y = start.y + dy * ratio;

      // Decide "near" which point => pick that point's visibility
      const nearStart = ratio < 0.5;
      const pointVisibility = nearStart ? start.visibility : end.visibility;

      return {
        x,
        y,
        visible: pointVisibility === 1,
      };
    }
    remaining -= segLen;
  }
  // If progress exceeds total length, return last point
  const lastPoint = lane.points[lane.points.length - 1];
  return {
    x: lastPoint.x,
    y: lastPoint.y,
    visible: lastPoint.visibility === 1,
  };
}

// ---------------------
//   Main Simulation Step
// ---------------------
export function simulationStep(state: SimulationState): SimulationState {
  let newVehicles = [...state.vehicles];

  // 1. Possibly spawn new vehicles on each road
  for (const road of state.roads) {
    const inflow = ROAD_TRAFFIC_INFLOW[road.id] ?? DEFAULT_INFLOW_RATE;
    if (Math.random() < inflow) {
      // Pick a candidate lane from the source road
      const candidates = getCandidateEntryLanes(state.lanes, road.id);
      if (candidates.length > 0) {
        const entryLane = candidates[Math.floor(Math.random() * candidates.length)];

        // // Pick a random target road (not the same as source)
        // const otherRoads = state.roads.filter(r => r.id !== road.id);
        // if (otherRoads.length === 0) continue;
        // const targetRoad = otherRoads[Math.floor(Math.random() * otherRoads.length)];
        const candidateTargetRoads = state.roads; // allow same road as target
        const targetRoad = candidateTargetRoads[Math.floor(Math.random() * candidateTargetRoads.length)];


        // Find a route from entryLane to an "end lane" on targetRoad
        const route = findRoute(state.lanes, entryLane.id, targetRoad.id);
        if (!route) {
          // No route => skip
          continue;
        }

        // Create new vehicle
        const vehicleId = Date.now().toString() + Math.random().toString();
        const startPos = entryLane.points[0];
        newVehicles.push({
          id: vehicleId,
          type: 'car',
          route,
          currentLaneIndex: 0,
          progress: 0,
          speed: DEFAULT_VEHICLE_SPEED,
          position: { x: startPos.x, y: startPos.y },
          sourceRoadId: road.id,
          targetRoadId: targetRoad.id,
          color: targetRoad.color,  // color from target road
          visible: true,            // will be updated in movement step
        });
      }
    }
  }

  // 2. Move existing vehicles
  newVehicles = newVehicles.map(vehicle => {
    const laneId = vehicle.route[vehicle.currentLaneIndex];
    const lane = state.lanes.find(l => l.id === laneId);
    if (!lane || lane.points.length < 2) {
      return vehicle; // can't move if invalid lane
    }

    let laneLength = computeLaneLength(lane);
    let newProgress = vehicle.progress + vehicle.speed;
    let newLaneIndex = vehicle.currentLaneIndex;

    // If overshooting, carry leftover distance to next lane(s)
    while (newProgress >= laneLength && newLaneIndex < vehicle.route.length - 1) {
      newProgress -= laneLength;
      newLaneIndex++;
      const nextLaneId = vehicle.route[newLaneIndex];
      const nextLane = state.lanes.find(l => l.id === nextLaneId);
      if (!nextLane) break;
      laneLength = computeLaneLength(nextLane);
    }

    // Compute new position & visibility
    const currentLane2 = state.lanes.find(l => l.id === vehicle.route[newLaneIndex]);
    if (!currentLane2) {
      return vehicle; // no next lane found => keep old position
    }
    const { x, y, visible } = getPositionAndVisibilityOnLane(currentLane2, newProgress);

    return {
      ...vehicle,
      currentLaneIndex: newLaneIndex,
      progress: newProgress,
      position: { x, y },
      visible,
    };
  });

  // 3. Remove vehicles that finished the last lane
  newVehicles = newVehicles.filter(vehicle => {
    const laneId = vehicle.route[vehicle.currentLaneIndex];
    const lane = state.lanes.find(l => l.id === laneId);
    if (!lane) return false;
    const laneLength = computeLaneLength(lane);
    // If on last lane and beyond lane length => done
    return !(vehicle.currentLaneIndex === vehicle.route.length - 1 && vehicle.progress >= laneLength);
  });

  // 4. Return updated state
  return {
    roads: state.roads,
    lanes: state.lanes,
    vehicles: newVehicles,
  };
}
