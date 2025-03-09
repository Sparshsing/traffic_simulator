// simulationEngine.ts
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
}

export interface Vehicle {
  id: string;
  type: 'car' | 'bus' | 'truck';
  // Route is the ordered list of lane IDs the vehicle will follow.
  route: string[];
  currentLaneIndex: number;
  progress: number;      // distance traveled along the current lane
  speed: number;         // constant speed per simulation step (100ms)
  position: Point;       // computed current position for rendering
  sourceRoadId: string;
  targetRoadId: string;
}

export interface SimulationState {
  roads: Road[];
  lanes: Lane[];
  vehicles: Vehicle[];
}

// --- Simulation Settings ---
const DEFAULT_VEHICLE_SPEED = 5;  // units per simulation step (100ms)
const DEFAULT_INFLOW_RATE = 0.2;    // default probability for spawning a vehicle on a road per step

// Define traffic inflow rates per road (using road IDs from interchange.json).
const ROAD_TRAFFIC_INFLOW: { [roadId: string]: number } = {
  "1741517495196": 0.5,
  "1741517499620": 0.3,
  // Add additional roads if needed.
};

// Extract roads and lanes from the interchange design.
// Use default empty arrays if not defined.
const roads: Road[] = interchange.roads || [];
const lanes: Lane[] = interchange.lines || [];

// The initial simulation state contains the roads, lanes, and an empty list of vehicles.
export const initialSimulationState: SimulationState = {
  roads,
  lanes,
  vehicles: []
};

// --- Helper Functions ---

// Compute the total length of a lane (its polyline) based on its points.
function computeLaneLength(lane: Lane): number {
  let length = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const dx = lane.points[i].x - lane.points[i - 1].x;
    const dy = lane.points[i].y - lane.points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

// Given a lane and a progress distance, return the (x,y) position along that lane.
function getPositionOnLane(lane: Lane, progress: number): Point {
  let remaining = progress;
  for (let i = 1; i < lane.points.length; i++) {
    const start = lane.points[i - 1];
    const end = lane.points[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio
      };
    }
    remaining -= segmentLength;
  }
  // Return the last point if progress exceeds the lane length.
  return lane.points[lane.points.length - 1];
}

// Using DFS, find a route (list of lane IDs) from a starting lane (startLaneId)
// to a lane whose roadId matches targetRoadId.
function findRoute(lanes: Lane[], startLaneId: string, targetRoadId: string): string[] | null {
  const laneMap = new Map(lanes.map(l => [l.id, l]));
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
    for (const nextLaneId of links) {
      if (nextLaneId) {
        const result = dfs(nextLaneId, newPath);
        if (result) return result;
      }
    }
    return null;
  }
  return dfs(startLaneId, []);
}

// Get candidate entry lanes for a given road.
// A candidate lane belongs to the given road and is not referenced as a link by any other lane.
function getCandidateEntryLanes(lanes: Lane[], sourceRoadId: string): Lane[] {
  const referencedLaneIds = new Set<string>();
  lanes.forEach(lane => {
    const links = [lane.links.forward, lane.links.forward_left, lane.links.forward_right];
    links.forEach(link => {
      if (link) referencedLaneIds.add(link);
    });
  });
  return lanes.filter(lane => lane.roadId === sourceRoadId && !referencedLaneIds.has(lane.id));
}

// --- Main Simulation Step ---
// This function is called every 100ms.
export function simulationStep(state: SimulationState): SimulationState {
  let newVehicles = [...state.vehicles];

  // For each road, decide whether to add a new vehicle based on its traffic inflow rate.
  for (const road of state.roads) {
    const inflow = ROAD_TRAFFIC_INFLOW[road.id] ?? DEFAULT_INFLOW_RATE;
    if (Math.random() < inflow) {
      // Get candidate entry lanes for this road.
      const candidateLanes = getCandidateEntryLanes(state.lanes, road.id);
      if (candidateLanes.length > 0) {
        // Choose a random entry lane.
        const entryLane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
        // Choose a random target road different from the source.
        const otherRoads = state.roads.filter(r => r.id !== road.id);
        if (otherRoads.length === 0) continue;
        const targetRoad = otherRoads[Math.floor(Math.random() * otherRoads.length)];
        // Find a route from the entry lane to a lane whose roadId matches the target road.
        const route = findRoute(state.lanes, entryLane.id, targetRoad.id);
        if (route) {
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
            targetRoadId: targetRoad.id
          };
          newVehicles.push(newVehicle);
        }
      }
    }
  }

  // Update positions for all existing vehicles.
  newVehicles = newVehicles.map(vehicle => {
    const route = vehicle.route;
    let currentLane = state.lanes.find(l => l.id === route[vehicle.currentLaneIndex]);
    if (!currentLane || currentLane.points.length < 2) return vehicle;
    let laneLength = computeLaneLength(currentLane);
    let newProgress = vehicle.progress + vehicle.speed;
    let newLaneIndex = vehicle.currentLaneIndex;
    // If the vehicle reaches the end of the current lane and has a next lane in its route,
    // carry over the extra progress into the next lane.
    while (newProgress >= laneLength && newLaneIndex < route.length - 1) {
      newProgress -= laneLength;
      newLaneIndex++;
      currentLane = state.lanes.find(l => l.id === route[newLaneIndex]);
      if (!currentLane) break;
      laneLength = computeLaneLength(currentLane);
    }
    const newPos = currentLane ? getPositionOnLane(currentLane, newProgress) : vehicle.position;
    return {
      ...vehicle,
      currentLaneIndex: newLaneIndex,
      progress: newProgress,
      position: newPos
    };
  });

  // Remove vehicles that have reached the end of their route.
  newVehicles = newVehicles.filter(vehicle => {
    const currentLane = state.lanes.find(l => l.id === vehicle.route[vehicle.currentLaneIndex]);
    if (!currentLane) return false;
    const laneLength = computeLaneLength(currentLane);
    return !(vehicle.currentLaneIndex === vehicle.route.length - 1 && vehicle.progress >= laneLength);
  });

  // Return a new state ensuring roads and lanes are always defined.
  return {
    roads: state.roads || [],
    lanes: state.lanes || [],
    vehicles: newVehicles
  };
}
