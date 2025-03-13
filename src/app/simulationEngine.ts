// simulationEngine.ts
import { Alumni_Sans_Collegiate_One } from "next/font/google";
import interchange from "./interchange.json";

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
  color: string; // Inherited from parent road
  virtual?: boolean;
}

export interface Vehicle {
  id: string;
  type: "car" | "bus" | "truck";
  route: string[]; // ordered list of lane IDs to follow
  currentLaneIndex: number;
  progress: number; // distance traveled along the current lane
  speed: number; // units per simulation step (100ms)
  position: Point; // center position for rendering
  sourceRoadId: string;
  targetRoadId: string;
  color: string; // from target road
  visible: boolean; // computed based on lane point visibility
  dimensions: { length: number; width: number }; // vehicle size
  rotation: number; // in radians, for drawing rotation
  stoppedSince: number;
}

export interface SimulationState {
  roads: Road[];
  lanes: Lane[];
  vehicles: Vehicle[];
}

// ---------------------
//   Simulation Settings
// ---------------------
const DEFAULT_VEHICLE_SPEED = 30; // units per step (100ms)
const DEFAULT_INFLOW_RATE = 0.1; // fallback spawn probability
const ROAD_TRAFFIC_INFLOW: { [roadId: string]: number } = {
  "1741517495196": 0.5,
  "1741517499620": 0.3,
  // add more roads as needed
};
const DEADLOCK_TIMEOUT = 5000; // 5 seconds before considering a vehicle deadlocked
const MAX_STOPPED_TIME = 10000; // 10 seconds maximum wait time before forcing movement

// Added deterministic seeded RNG and vehicle counter for reproducible simulation
let vehicleCounter = 0;
let seed = 2; // default seed value
export function setSeed(newSeed: number) {
  seed = newSeed;
  vehicleCounter = 0;
}
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

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
const loadedRoads = (interchange.roads || []).map((road: any) => ({
  ...road,
  color: colorFromString(road.id),
}));

const loadedLanes = (interchange.lines || []).map((line: any) => {
  let laneColor = "#999";
  if (line.roadId) {
    const parentRoad = loadedRoads.find((r: Road) => r.id === line.roadId);
    if (parentRoad) {
      laneColor = parentRoad.color;
    }
  }
  return { ...line, color: laneColor };
});

// ---------------------
//   Initial Simulation State
// ---------------------

// Add virtual lanes for links
const virtualLanes: Lane[] = [];
loadedLanes.forEach((lane) => {
  (['forward', 'forward_left', 'forward_right'] as const).forEach((linkKey) => {
    const targetLaneId = lane.links[linkKey];
    if (targetLaneId) {
      const targetLane = loadedLanes.find(l => l.id === targetLaneId);
      if (!targetLane) return;
      const virtualLaneId = `v${lane.id}to${targetLane.id}`;
      // Update the source lane's link to point to the virtual lane
      lane.links[linkKey] = virtualLaneId;
      const sourceLastPoint = lane.points[lane.points.length - 1];
      const targetFirstPoint = targetLane.points[0];
      const virtualPoints = [
        { ...sourceLastPoint, visibility: 0 },
        { ...targetFirstPoint, visibility: 0 }
      ];
      const virtualLaneName = `v${lane.name}to${targetLane.name}`;
      const virtualLane: Lane = {
        id: virtualLaneId,
        name: virtualLaneName,
        points: virtualPoints,
        links: { forward: targetLane.id, forward_left: null, forward_right: null },
        roadId: null,
        color: lane.color,
        virtual: true
      } as Lane;
      virtualLanes.push(virtualLane);
    }
  });
});
const allLanes = loadedLanes.concat(virtualLanes);
// console.log(allLanes);
// Update initial simulation state to use allLanes
export const initialSimulationState: SimulationState = {
  roads: loadedRoads,
  lanes: allLanes,
  vehicles: [],
};

// ---------------------
//   Helper Functions
// ---------------------

// Global variables for collision tracking

// getBlockingVehicles removed: collision detection is disabled

/**
 * A lane is a valid destination if it belongs to targetRoadId and has no further links.
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
 * Using DFS, find a route (list of lane IDs) from startLaneId to an "end lane" on targetRoadId.
 */
function findRoute(lanes: Lane[], startLaneId: string, targetRoadId: string): string[] | null {
  const laneMap = new Map(lanes.map((l) => [l.id, l]));
  const visited = new Set<string>();

  function dfs(currentLaneId: string, path: string[]): string[] | null {
    if (visited.has(currentLaneId)) return null;
    visited.add(currentLaneId);
    const lane = laneMap.get(currentLaneId);
    if (!lane) return null;
    const newPath = [...path, currentLaneId];
    if (isEndLane(lane, targetRoadId)) return newPath;
    const nextLinks = [lane.links.forward, lane.links.forward_left, lane.links.forward_right].filter(
      Boolean
    ) as string[];
    for (const nextLaneId of nextLinks) {
      const result = dfs(nextLaneId, newPath);
      if (result) return result;
    }
    return null;
  }
  return dfs(startLaneId, []);
}

/**
 * Get candidate entry lanes for a given road: lanes that belong to roadId and are not referenced as links.
 */
function getCandidateEntryLanes(lanes: Lane[], roadId: string): Lane[] {
  const referencedLaneIds = new Set<string>();
  lanes.forEach((lane) => {
    const links = [lane.links.forward, lane.links.forward_left, lane.links.forward_right];
    links.forEach((l) => l && referencedLaneIds.add(l));
  });
  return lanes.filter((l) => l.roadId === roadId && !referencedLaneIds.has(l.id));
}

/**
 * Compute the total length of a lane's polyline.
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
 * Compute the (x, y) position, visibility, and rotation (in radians) along a lane given progress.
 */
function getPositionAndVisibilityOnLane(
  lane: Lane,
  progress: number
): { x: number; y: number; visible: boolean; rotation: number } {
  let remaining = progress;
  for (let i = 1; i < lane.points.length; i++) {
    const start = lane.points[i - 1];
    const end = lane.points[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (remaining <= segLen) {
      const ratio = remaining / segLen;
      const x = start.x + dx * ratio;
      const y = start.y + dy * ratio;
      const pointVisibility = ratio < 0.5 ? start.visibility : end.visibility;
      const rotation = Math.atan2(dy, dx);
      return { x, y, visible: pointVisibility === 1, rotation };
    }
    remaining -= segLen;
  }
  const lastPoint = lane.points[lane.points.length - 1];
  return {
    x: lastPoint.x,
    y: lastPoint.y,
    visible: lastPoint.visibility === 1,
    rotation: 0,
  };
}

// ---------------------
//   Main Simulation Step
// ---------------------
export function simulationStep(state: SimulationState): SimulationState {
  const oldVehicles = [...state.vehicles];
  const updatedVehicles: Vehicle[] = [];
  
  // 1. Spawn new vehicles on each road based on inflow.
  for (const road of state.roads) {
    const inflow = ROAD_TRAFFIC_INFLOW[road.id] ?? DEFAULT_INFLOW_RATE;
    if (random() < inflow) {
      const candidates = getCandidateEntryLanes(state.lanes, road.id);
      const entryLane = candidates.length > 0 ? candidates[0] : null;
      if (entryLane) {
        const candidateTargetRoads = state.roads;
        const targetRoad = candidateTargetRoads[Math.floor(random() * candidateTargetRoads.length)];
        const route = findRoute(state.lanes, entryLane.id, targetRoad.id);
        if (!route) continue;
        const vehicleId = (++vehicleCounter).toString();
        const startPos = entryLane.points[0];
        updatedVehicles.push({
          id: vehicleId,
          type: "car",
          route,
          currentLaneIndex: 0,
          progress: 0,
          speed: DEFAULT_VEHICLE_SPEED,
          position: { x: startPos.x, y: startPos.y },
          sourceRoadId: road.id,
          targetRoadId: targetRoad.id,
          color: targetRoad.color,
          visible: true,
          dimensions: { length: 20, width: 10 },
          rotation: 0,
          stoppedSince: 0
        });
        console.log(`[${new Date().toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3})}] Vehicle spawned: sourceRoadId=${road.name}, vehicleId=${vehicleId}, targetRoadId=${targetRoad.name}, route=${route.map(laneId => {
          const lane = state.lanes.find(l => l.id === laneId);
          return lane ? lane.name : laneId;
        }).join(" -> ")}`);
      }
    }
  }

  // 2. Update positions for each existing vehicle without collision or transition safety checks.
  for (const vehicle of oldVehicles) {
    const updated = updateVehicle(vehicle, state.lanes);
    if (updated) {
      updatedVehicles.push(updated);
    }
  }

  // 3. Remove vehicles that have finished their route.
  const finalVehicles = updatedVehicles.filter((vehicle) => {
    const currentLane = state.lanes.find((l) => l.id === vehicle.route[vehicle.currentLaneIndex]);
    if (!currentLane) return false;
    const laneLength = computeLaneLength(currentLane);
    return !(vehicle.currentLaneIndex === vehicle.route.length - 1 && vehicle.progress >= laneLength);
  });

  return {
    roads: state.roads,
    lanes: state.lanes,
    vehicles: finalVehicles,
  };
}

/* Inserted updateVehicle function */
export function updateVehicle(vehicle: Vehicle, lanes: Lane[]): Vehicle | null {
  const currentLaneId = vehicle.route[vehicle.currentLaneIndex];
  const lane = lanes.find(l => l.id === currentLaneId);
  if (!lane || lane.points.length < 2) {
    return vehicle;
  }
  const laneLength = computeLaneLength(lane);
  const newProgress = vehicle.progress + vehicle.speed;

  let newPos, newRotation, newLaneIndex;
  if (newProgress < laneLength) {
    // Continue in current lane
    const { x, y, rotation } = getPositionAndVisibilityOnLane(lane, newProgress);
    newPos = { x, y };
    newRotation = rotation;
    newLaneIndex = vehicle.currentLaneIndex;
  } else {
    // Transition to next lane if available
    const nextLaneId = vehicle.route[vehicle.currentLaneIndex + 1];
    const nextLane = lanes.find(l => l.id === nextLaneId);
    if (nextLane) {
      const leftover = newProgress - laneLength;
      const { x, y, rotation } = getPositionAndVisibilityOnLane(nextLane, leftover);
      newPos = { x, y };
      newRotation = rotation;
      newLaneIndex = vehicle.currentLaneIndex + 1;
    } else {
      // No next lane; route is finished.
      return null;
    }
  }

  return {
    ...vehicle,
    currentLaneIndex: newLaneIndex,
    progress: newProgress < laneLength ? newProgress : newProgress - laneLength,
    position: newPos,
    rotation: newRotation,
    stoppedSince: 0
  };
}
