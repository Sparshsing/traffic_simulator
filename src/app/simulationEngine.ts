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
  maxSpeed?: number; // maximum speed the vehicle can travel
}

export interface SimulationState {
  roads: Road[];
  lanes: Lane[];
  vehicles: Vehicle[];
}

// ---------------------
//   Simulation Settings
// ---------------------
const DEFAULT_VEHICLE_SPEED = 10; // units per step (100ms)
const MAX_VEHICLE_SPEED = 15; // maximum speed a vehicle can reach
const MIN_VEHICLE_SPEED = 0; // minimum speed when slowing down (but not stopped)
const VEHICLE_ACCELERATION = 2; // speed increase per step when clear ahead
const VEHICLE_DECELERATION = 4; // speed decrease per step when obstacle ahead
const SAFE_DISTANCE_MULTIPLIER = 2.5; // multiplier of vehicle length for safe distance

// New mutable global settings
let currentGlobalVehicleSpeed = DEFAULT_VEHICLE_SPEED;

const DEFAULT_INFLOW_RATE = 0.2; // fallback spawn probability
const DEFAULT_TURN_PROBABILITY = 0.5; // default probability to switch target road

let roadTrafficSettings: { [roadId: string]: { inflow: number; turnProbability: number } } = {
  "1741517495196": { inflow: 0.5, turnProbability: 0.5 },
  "1741517499620": { inflow: 0.3, turnProbability: 0.5 }
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

/**
 * Check if a vehicle is blocking the path of another vehicle
 */
function getBlockingVehicles(vehicle: Vehicle, vehicles: Vehicle[], lanes: Lane[]): Vehicle[] {
  const currentLaneId = vehicle.route[vehicle.currentLaneIndex];
  const currentLane = lanes.find(l => l.id === currentLaneId);
  if (!currentLane) return [];
  
  // Get next lane too if we're near the end of current lane
  const laneLength = computeLaneLength(currentLane);
  const isNearEnd = laneLength - vehicle.progress < vehicle.dimensions.length * 2;
  const nextLaneId = isNearEnd && vehicle.currentLaneIndex < vehicle.route.length - 1 
    ? vehicle.route[vehicle.currentLaneIndex + 1] 
    : null;
  
  return vehicles.filter(v => {
    // Skip self
    if (v.id === vehicle.id) return false;
    
    // Check if vehicle is in current lane and ahead of us
    const isInCurrentLane = v.route[v.currentLaneIndex] === currentLaneId;
    const isAhead = isInCurrentLane && v.progress > vehicle.progress;
    
    // Check if vehicle is in next lane and near the start (if we're near the end)
    const isInNextLane = nextLaneId && v.route[v.currentLaneIndex] === nextLaneId;
    const isNearStart = isInNextLane && v.progress < vehicle.dimensions.length * 3;
    
    return isAhead || isNearStart;
  });
}

/**
 * Calculate the distance to the nearest vehicle ahead and its speed
 */
function distanceToNearestVehicle(vehicle: Vehicle, blockingVehicles: Vehicle[], lanes: Lane[]): 
  { distance: number; leadVehicle: Vehicle | null } {
  if (blockingVehicles.length === 0) return { distance: Infinity, leadVehicle: null };
  
  const currentLaneId = vehicle.route[vehicle.currentLaneIndex];
  const currentLane = lanes.find(l => l.id === currentLaneId);
  if (!currentLane) return { distance: Infinity, leadVehicle: null };
  
  const laneLength = computeLaneLength(currentLane);
  
  let minDistance = Infinity;
  let leadVehicle = null;
  
  for (const blockingVehicle of blockingVehicles) {
    let distance;
    
    if (blockingVehicle.route[blockingVehicle.currentLaneIndex] === currentLaneId) {
      // Same lane
      distance = blockingVehicle.progress - blockingVehicle.dimensions.length/2 - 
                (vehicle.progress + vehicle.dimensions.length/2);
    } else {
      // Vehicle is in next lane
      distance = laneLength - vehicle.progress + blockingVehicle.progress;
    }
    
    if (distance < minDistance) {
      minDistance = distance;
      leadVehicle = blockingVehicle;
    }
  }
  
  return { distance: minDistance, leadVehicle };
}

/* Replaced updateVehicle function */
export function updateVehicle(vehicle: Vehicle, lanes: Lane[], allVehicles: Vehicle[]): Vehicle | null {
  const currentLaneId = vehicle.route[vehicle.currentLaneIndex];
  const lane = lanes.find(l => l.id === currentLaneId);
  if (!lane || lane.points.length < 2) {
    return vehicle;
  }
  
  // Initialize maxSpeed if not set
  if (vehicle.maxSpeed === undefined) {
    vehicle.maxSpeed = currentGlobalVehicleSpeed + (random() * 10 - 5); // Randomize slightly
  }
  
  // Check for blocking vehicles and adjust speed
  const blockingVehicles = getBlockingVehicles(vehicle, allVehicles, lanes);
  const { distance, leadVehicle } = distanceToNearestVehicle(vehicle, blockingVehicles, lanes);
  const safeDistance = vehicle.dimensions.length * SAFE_DISTANCE_MULTIPLIER;
  
  let newSpeed = vehicle.speed;
  
  // Clear path by default - will be overridden if there are obstacles
  let isClearPath = true;
  
  if (distance < safeDistance * 0.5) {
    // Very close - stop completely
    newSpeed = 0;
    isClearPath = false;
  } else if (distance < safeDistance) {
    // Within safety zone - adjust speed based on vehicle ahead
    if (leadVehicle) {
      // Match the speed of the vehicle ahead, but slow down a bit more to increase distance
      newSpeed = Math.min(
        leadVehicle.speed * 0.9, // Target 90% of lead vehicle's speed to increase gap
        Math.max(MIN_VEHICLE_SPEED, vehicle.speed - VEHICLE_DECELERATION)
      );
      isClearPath = false;
    } else {
      // No lead vehicle despite having a distance? This shouldn't happen, but accelerate just in case
      newSpeed = Math.min(vehicle.maxSpeed, vehicle.speed + VEHICLE_ACCELERATION);
    }
  } else if (leadVehicle && leadVehicle.speed < vehicle.speed) {
    // Lead vehicle is moving slower than us but we're not in safety zone yet
    // Only adjust if the difference is significant
    if (vehicle.speed - leadVehicle.speed > 5) {
      // Calculate the time to collision if speeds remain constant
      const timeToCollision = distance / (vehicle.speed - leadVehicle.speed);
      
      // If we'd catch up too quickly, start slowing down preemptively
      if (timeToCollision < 2.0) {  // 2 second rule (adjust as needed)
        newSpeed = Math.max(leadVehicle.speed, vehicle.speed - VEHICLE_DECELERATION);
        isClearPath = false;
      }
    }
  }
  
  // If path is clear, accelerate toward max speed
  if (isClearPath) {
    newSpeed = Math.min(vehicle.maxSpeed, vehicle.speed + VEHICLE_ACCELERATION);
  }
  
  // Failsafe: If speed has been consistently low with no obstacles,
  // gradually increase it to recover from any stuck situations
  if (vehicle.speed < vehicle.maxSpeed * 0.5 && isClearPath) {
    newSpeed = Math.min(vehicle.maxSpeed * 0.6, newSpeed + VEHICLE_ACCELERATION * 1.5);
  }
  
  const laneLength = computeLaneLength(lane);
  const newProgress = vehicle.progress + newSpeed;
  
  // Record if vehicle is stopped
  const stoppedSince = newSpeed === 0 ? 
    (vehicle.stoppedSince || Date.now()) : 0;
  
  let newPos, newRotation, newLaneIndex;
  if (newProgress < laneLength) {
    // Continue in current lane
    const { x, y, visible, rotation } = getPositionAndVisibilityOnLane(lane, newProgress);
    newPos = { x, y };
    newRotation = rotation;
    newLaneIndex = vehicle.currentLaneIndex;
  } else {
    // Transition to next lane if available
    const nextLaneId = vehicle.route[vehicle.currentLaneIndex + 1];
    const nextLane = lanes.find(l => l.id === nextLaneId);
    if (nextLane) {
      const leftover = newProgress - laneLength;
      const { x, y, visible, rotation } = getPositionAndVisibilityOnLane(nextLane, leftover);
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
    speed: newSpeed,
    stoppedSince
  };
}

// Adding helper function to update vehicle visibility based on the vehicle's current lane's road
function updateVehicleVisibility(vehicle: Vehicle, lanes: Lane[], roads: Road[]): Vehicle {
  const currentLaneId = vehicle.route[vehicle.currentLaneIndex];
  const currentLane = lanes.find(l => l.id === currentLaneId);
  if (!currentLane) return { ...vehicle };

  // Find the relevant road ID
  let relevantRoadId: string | null = null;
  
  if (currentLane.roadId) {
    // If current lane has a road ID, use it
    relevantRoadId = currentLane.roadId;
  } else {
    // Check linked lanes in order: forward, forward_left, forward_right
    const linkedLaneIds = [
      currentLane.links.forward,
      currentLane.links.forward_left,
      currentLane.links.forward_right
    ];

    for (const linkedLaneId of linkedLaneIds) {
      if (linkedLaneId) {
        const linkedLane = lanes.find(l => l.id === linkedLaneId);
        if (linkedLane?.roadId) {
          relevantRoadId = linkedLane.roadId;
          break;
        }
      }
    }
  }

  // If no relevant road ID found, make visible
  if (!relevantRoadId) {
    return { ...vehicle, visible: true };
  }

  const baseRoad = roads.find(r => r.id === relevantRoadId);
  const baseZ = baseRoad?.zIndex ?? 0;
  let underHigherRoad = false;
  
  for (const road of roads) {
    if (
      road.zIndex !== undefined &&
      road.x !== undefined &&
      road.y !== undefined &&
      road.width !== undefined &&
      road.height !== undefined &&
      road.zIndex > baseZ &&
      vehicle.position.x >= road.x &&
      vehicle.position.x <= road.x + road.width &&
      vehicle.position.y >= road.y &&
      vehicle.position.y <= road.y + road.height
    ) {
      underHigherRoad = true;
      break;
    }
  }
  return { ...vehicle, visible: !underHigherRoad };
}

// ---------------------
//   Main Simulation Step
// ---------------------
export function simulationStep(state: SimulationState): SimulationState {
  const oldVehicles = [...state.vehicles];
  const updatedVehicles: Vehicle[] = [];
  
  // 1. Spawn new vehicles on each road based on inflow.
  for (const road of state.roads) {
    const settings = roadTrafficSettings[road.id] || { inflow: DEFAULT_INFLOW_RATE, turnProbability: DEFAULT_TURN_PROBABILITY };
    const inflow = settings.inflow;
    if (random() < inflow) {
      const candidates = getCandidateEntryLanes(state.lanes, road.id);
      let entryLane = null;
      if (candidates.length > 0) {
        // Shuffle candidates randomly
        const shuffledCandidates = [...candidates].sort(() => Math.random() - 0.5);
        // Check each candidate for available space at the lane's start (threshold = 30)
        for (const candidate of shuffledCandidates) {
          const threshold = 30;
          const laneBusy = state.vehicles.some(v => v.route[v.currentLaneIndex] === candidate.id && v.progress < threshold);
          if (!laneBusy) {
            entryLane = candidate;
            break;
          }
        }
      }
      if (!entryLane) continue;
      
      // Choose target road using per-road turnProbability
      let targetRoad = road;
      if (random() < settings.turnProbability) {
        const otherRoads = state.roads.filter(r => r.id !== road.id);
        if (otherRoads.length > 0) {
          targetRoad = otherRoads[Math.floor(random() * otherRoads.length)];
        }
      }
      
      const route = findRoute(state.lanes, entryLane.id, targetRoad.id);
      if (!route) continue;
      const vehicleId = (++vehicleCounter).toString();
      const startPos = entryLane.points[0];
      const maxSpeed = currentGlobalVehicleSpeed + (random() * 10 - 5); // Randomize speed based on global setting
      updatedVehicles.push({
        id: vehicleId,
        type: "car",
        route,
        currentLaneIndex: 0,
        progress: 0,
        speed: maxSpeed * 0.7, // Start at 70% of max speed
        maxSpeed,
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

  // 2. Update positions for each existing vehicle with collision detection
  for (const vehicle of oldVehicles) {
    const updated = updateVehicle(vehicle, state.lanes, oldVehicles);
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

  // Update each vehicle's visibility based on its current lane's road
  const finalVehiclesWithVisibility = finalVehicles.map((vehicle) => updateVehicleVisibility(vehicle, state.lanes, state.roads));

  return {
    roads: state.roads,
    lanes: state.lanes,
    vehicles: finalVehiclesWithVisibility,
  };
}

// ---------------------
//   Exported Settings Update Functions
// ---------------------
export function setGlobalVehicleSpeed(newSpeed: number) {
  currentGlobalVehicleSpeed = newSpeed;
}

export function updateRoadTrafficSettings(roadId: string, settings: { inflow: number; turnProbability: number }) {
  roadTrafficSettings[roadId] = settings;
}

// New function to load interchange data and create a new simulation state
export function loadInterchangeData(data: any): SimulationState {
  // Reset counters and settings
  vehicleCounter = 0;
  
  // Process roads with colors
  const newRoads = (data.roads || []).map((road: any) => ({
    ...road,
    color: colorFromString(road.id),
  }));
  
  // Process lanes with colors based on their parent road
  const newLanes = (data.lines || []).map((line: any) => {
    let laneColor = "#999";
    if (line.roadId) {
      const parentRoad = newRoads.find((r: Road) => r.id === line.roadId);
      if (parentRoad) {
        laneColor = parentRoad.color;
      }
    }
    return { ...line, color: laneColor };
  });
  
  // Create virtual lanes for connections
  const virtualLanes: Lane[] = [];
  newLanes.forEach((lane: Lane) => {
    (['forward', 'forward_left', 'forward_right'] as const).forEach((linkKey) => {
      const targetLaneId = lane.links[linkKey];
      if (targetLaneId) {
        const targetLane = newLanes.find(l => l.id === targetLaneId);
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
  
  // Combine all lanes
  const allLanes = [...newLanes, ...virtualLanes];
  
  // Initialize road traffic settings for new roads
  const newTrafficSettings: typeof roadTrafficSettings = {};
  newRoads.forEach(road => {
    newTrafficSettings[road.id] = {
      inflow: DEFAULT_INFLOW_RATE,
      turnProbability: DEFAULT_TURN_PROBABILITY
    };
  });
  
  // Update global road traffic settings
  roadTrafficSettings = newTrafficSettings;
  
  // Return fresh simulation state
  return {
    roads: newRoads,
    lanes: allLanes,
    vehicles: []  // Start with no vehicles
  };
}
