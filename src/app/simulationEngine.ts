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
  /** Deterministic color from road ID. */
  color: string;
}

export interface LanePoint extends Point {
  attribute: string;
  height: number;
  visibility: number;
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
  /** Color inherited from parent road. */
  color: string;
}

export interface Vehicle {
  id: string;
  type: 'car' | 'bus' | 'truck';
  route: string[];         // lane IDs
  currentLaneIndex: number;
  progress: number;        // distance traveled along current lane
  speed: number;
  position: Point;
  sourceRoadId: string;
  targetRoadId: string;
  /** Color derived from target road ID. */
  color: string;
}

export interface SimulationState {
  roads: Road[];
  lanes: Lane[];
  vehicles: Vehicle[];
}

// --------------
// Settings
// --------------
const DEFAULT_VEHICLE_SPEED = 5;   // units per 100ms
const DEFAULT_INFLOW_RATE = 0.2;   // fallback if no rate is set
const ROAD_TRAFFIC_INFLOW: { [roadId: string]: number } = {
  "1741517495196": 0.5,
  "1741517499620": 0.3,
  // ...
};

// --------------
// Color Helpers
// --------------
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

// --------------
// Load Roads
// --------------
const loadedRoads = (interchange.roads || []).map((road) => ({
  ...road,
  color: colorFromString(road.id), // stable color from ID
}));

// --------------
// Load Lanes
// --------------
const loadedLanes = (interchange.lines || []).map((line) => {
  let color = '#999';
  if (line.roadId) {
    const road = loadedRoads.find((r) => r.id === line.roadId);
    if (road) color = road.color;
  }
  return {
    ...line,
    color,
  };
});

// --------------
// Initial State
// --------------
export const initialSimulationState: SimulationState = {
  roads: loadedRoads,
  lanes: loadedLanes,
  vehicles: [],
};

// --------------
// Helper Functions
// --------------
function computeLaneLength(lane: Lane): number {
  let length = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const dx = lane.points[i].x - lane.points[i - 1].x;
    const dy = lane.points[i].y - lane.points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

function getPositionOnLane(lane: Lane, progress: number): Point {
  let remaining = progress;
  for (let i = 1; i < lane.points.length; i++) {
    const start = lane.points[i - 1];
    const end = lane.points[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (remaining <= segLen) {
      const ratio = remaining / segLen;
      return {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio,
      };
    }
    remaining -= segLen;
  }
  return lane.points[lane.points.length - 1];
}

function findRoute(lanes: Lane[], startLaneId: string, targetRoadId: string): string[] | null {
  const laneMap = new Map(lanes.map((l) => [l.id, l]));
  const visited = new Set<string>();

  function dfs(currentLaneId: string, path: string[]): string[] | null {
    if (visited.has(currentLaneId)) return null;
    visited.add(currentLaneId);
    const lane = laneMap.get(currentLaneId);
    if (!lane) return null;
    const newPath = [...path, currentLaneId];
    if (lane.roadId === targetRoadId) {
      return newPath;
    }
    const links = [lane.links.forward, lane.links.forward_left, lane.links.forward_right];
    for (const link of links) {
      if (link) {
        const result = dfs(link, newPath);
        if (result) return result;
      }
    }
    return null;
  }

  return dfs(startLaneId, []);
}

function getCandidateEntryLanes(lanes: Lane[], roadId: string): Lane[] {
  const referencedLaneIds = new Set<string>();
  lanes.forEach((lane) => {
    const links = [lane.links.forward, lane.links.forward_left, lane.links.forward_right];
    links.forEach((l) => l && referencedLaneIds.add(l));
  });
  return lanes.filter((l) => l.roadId === roadId && !referencedLaneIds.has(l.id));
}

// --------------
// Simulation Step
// --------------
export function simulationStep(state: SimulationState): SimulationState {
  let newVehicles = [...state.vehicles];

  // 1. Possibly spawn new vehicles
  for (const road of state.roads) {
    const inflow = ROAD_TRAFFIC_INFLOW[road.id] ?? DEFAULT_INFLOW_RATE;
    if (Math.random() < inflow) {
      const candidateLanes = getCandidateEntryLanes(state.lanes, road.id);
      if (candidateLanes.length > 0) {
        // pick random lane
        const entryLane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
        // pick random target road (not the same as source)
        const otherRoads = state.roads.filter((r) => r.id !== road.id);
        if (otherRoads.length === 0) continue;
        const targetRoad = otherRoads[Math.floor(Math.random() * otherRoads.length)];
        // find route
        const route = findRoute(state.lanes, entryLane.id, targetRoad.id);
        if (!route) {
          // no route => skip
          continue;
        }
        // create vehicle
        const vehicleId = Date.now().toString() + Math.random().toString();
        const startPos = entryLane.points[0];
        const newVehicle: Vehicle = {
          id: vehicleId,
          type: 'car',
          route,
          currentLaneIndex: 0,
          progress: 0,
          speed: DEFAULT_VEHICLE_SPEED,
          position: { x: startPos.x, y: startPos.y },
          sourceRoadId: road.id,
          targetRoadId: targetRoad.id,
          color: targetRoad.color, // color from target road
        };
        newVehicles.push(newVehicle);
      }
    }
  }

  // 2. Move existing vehicles
  newVehicles = newVehicles.map((v) => {
    const laneId = v.route[v.currentLaneIndex];
    const lane = state.lanes.find((l) => l.id === laneId);
    if (!lane || lane.points.length < 2) return v;

    let laneLength = computeLaneLength(lane);
    let newProgress = v.progress + v.speed;
    let newLaneIndex = v.currentLaneIndex;

    while (newProgress >= laneLength && newLaneIndex < v.route.length - 1) {
      newProgress -= laneLength;
      newLaneIndex++;
      const nextLaneId = v.route[newLaneIndex];
      const nextLane = state.lanes.find((l) => l.id === nextLaneId);
      if (!nextLane) break;
      laneLength = computeLaneLength(nextLane);
    }

    const curLane = state.lanes.find((l) => l.id === v.route[newLaneIndex]);
    const newPos = curLane ? getPositionOnLane(curLane, newProgress) : v.position;

    return {
      ...v,
      currentLaneIndex: newLaneIndex,
      progress: newProgress,
      position: newPos,
    };
  });

  // 3. Remove vehicles that are done
  newVehicles = newVehicles.filter((v) => {
    const lane = state.lanes.find((l) => l.id === v.route[v.currentLaneIndex]);
    if (!lane) return false;
    const laneLength = computeLaneLength(lane);
    return !(v.currentLaneIndex === v.route.length - 1 && v.progress >= laneLength);
  });

  // 4. Return updated state (no random color => no mismatch)
  return {
    roads: state.roads,
    lanes: state.lanes,
    vehicles: newVehicles,
  };
}
