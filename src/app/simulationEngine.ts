// simulationEngine.ts
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
  transitionProgress?: number;
}

export interface SimulationState {
  roads: Road[];
  lanes: Lane[];
  vehicles: Vehicle[];
}

// ---------------------
//   Simulation Settings
// ---------------------
const DEFAULT_VEHICLE_SPEED = 5; // units per step (100ms)
const DEFAULT_INFLOW_RATE = 0.2; // fallback spawn probability
const ROAD_TRAFFIC_INFLOW: { [roadId: string]: number } = {
  "1741517495196": 0.5,
  "1741517499620": 0.3,
  // add more roads as needed
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
export const initialSimulationState: SimulationState = {
  roads: loadedRoads,
  lanes: loadedLanes,
  vehicles: [],
};

// ---------------------
//   Helper Functions
// ---------------------

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
 * Get the smoothed position between two connected lanes for transitions
 */
function getSmoothTransitionPosition(
  currentLane: Lane,
  nextLane: Lane, 
  progress: number
): { x: number; y: number; visible: boolean; rotation: number } {
  // Get end point of current lane
  const currentLaneEnd = currentLane.points[currentLane.points.length - 1];
  // Get start point of next lane
  const nextLaneStart = nextLane.points[0];
  
  // Interpolate between end of current lane and start of next lane
  const dx = nextLaneStart.x - currentLaneEnd.x;
  const dy = nextLaneStart.y - currentLaneEnd.y;
  
  // Ensure smooth progress between 0 and 1
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  
  // Calculate position with smooth easing for more natural movement
  // Using simple ease-in-out function
  const easedProgress = normalizedProgress < 0.5
    ? 2 * normalizedProgress * normalizedProgress
    : 1 - Math.pow(-2 * normalizedProgress + 2, 2) / 2;
    
  const x = currentLaneEnd.x + dx * easedProgress;
  const y = currentLaneEnd.y + dy * easedProgress;
  
  // Calculate rotation based on direction vector for smoother turning
  // Use gradual rotation interpolation between lanes for more natural turning
  const currentEndSegment = currentLane.points.length > 1 
    ? { 
        dx: currentLaneEnd.x - currentLane.points[currentLane.points.length - 2].x,
        dy: currentLaneEnd.y - currentLane.points[currentLane.points.length - 2].y
      }
    : { dx, dy };
    
  const nextStartSegment = nextLane.points.length > 1
    ? {
        dx: nextLane.points[1].x - nextLaneStart.x,
        dy: nextLane.points[1].y - nextLaneStart.y
      }
    : { dx, dy };
  
  // Calculate rotations for start and end
  const startRotation = Math.atan2(currentEndSegment.dy, currentEndSegment.dx);
  const endRotation = Math.atan2(nextStartSegment.dy, nextStartSegment.dx);
  
  // Handle rotation wrapping for smoother turns
  let deltaRotation = endRotation - startRotation;
  if (deltaRotation > Math.PI) deltaRotation -= 2 * Math.PI;
  if (deltaRotation < -Math.PI) deltaRotation += 2 * Math.PI;
  
  // Interpolate rotation
  const rotation = startRotation + deltaRotation * easedProgress;
  
  // Ensure visibility during transition
  const visible = currentLaneEnd.visibility === 1 || nextLaneStart.visibility === 1;
  
  return { x, y, visible, rotation };
}

/**
 * Simple axis-aligned bounding box collision detection.
 */
function rectsCollide(
  x1: number,
  y1: number,
  dims1: { width: number; length: number },
  rotation1: number,
  x2: number,
  y2: number,
  dims2: { width: number; length: number },
  rotation2: number
): boolean {
  const corners1 = getRotatedCorners(x1, y1, dims1, rotation1);
  const corners2 = getRotatedCorners(x2, y2, dims2, rotation2);
  return cornersIntersect(corners1, corners2);
}

function getRotatedCorners(x: number, y: number, dims: { width: number; length: number }, rotation: number) {
  const halfW = dims.width / 2;
  const halfL = dims.length / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    { x: x + halfL * cos - halfW * sin, y: y + halfL * sin + halfW * cos },
    { x: x - halfL * cos - halfW * sin, y: y - halfL * sin + halfW * cos },
    { x: x - halfL * cos + halfW * sin, y: y - halfL * sin - halfW * cos },
    { x: x + halfL * cos + halfW * sin, y: y + halfL * sin - halfW * cos },
  ];
}

function cornersIntersect(corners1: { x: number; y: number }[], corners2: { x: number; y: number }[]): boolean {
  return corners1.some((corner) => pointInPolygon(corner, corners2)) ||
         corners2.some((corner) => pointInPolygon(corner, corners1));
}

function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
                      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check whether moving the current vehicle to (newX, newY) would cause a collision.
 * We check against vehicles already updated in this step and those still at their old positions.
 */
function willCollide(
  current: Vehicle,
  newX: number,
  newY: number,
  updated: Vehicle[],
  oldVehicles: Vehicle[]
): boolean {
  for (const v of updated) {
    if (v.id !== current.id) {
      if (rectsCollide(newX, newY, current.dimensions, current.rotation, v.position.x, v.position.y, v.dimensions, v.rotation)) {
        // console.log(
        //   `Collision detected: Vehicle ${current.id} (color: ${current.color}, source: ${current.sourceRoadId}, target: ${current.targetRoadId}, lane: ${current.route[current.currentLaneIndex]}, progress: ${current.progress}) will collide with Vehicle ${v.id} (color: ${v.color}, source: ${v.sourceRoadId}, target: ${v.targetRoadId}, lane: ${v.route[v.currentLaneIndex]}, progress: ${v.progress})`
        // );
        return true;
      }
    }
  }
  for (const v of oldVehicles) {
    if (v.id !== current.id && !updated.find((u) => u.id === v.id)) {
      if (rectsCollide(newX, newY, current.dimensions, current.rotation, v.position.x, v.position.y, v.dimensions, v.rotation)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------
//   Main Simulation Step
// ---------------------
export function simulationStep(state: SimulationState): SimulationState {
  // Clone current vehicles (old state)
  const oldVehicles = [...state.vehicles];
  const updatedVehicles: Vehicle[] = [];

  // 1. Spawn new vehicles on each road based on inflow.
  // 1. Spawn new vehicles on each road based on inflow.
  for (const road of state.roads) {
    const inflow = ROAD_TRAFFIC_INFLOW[road.id] ?? DEFAULT_INFLOW_RATE;
    if (Math.random() < inflow) {
      const candidates = getCandidateEntryLanes(state.lanes, road.id);
      let entryLane = null;
      for (const candidate of candidates) {
        const startPos = candidate.points[0];
        const dimensions = { length: 20, width: 10 }; // Default dimensions; could vary by type.
        // Check for collision at the start position of the candidate lane
        if (!willCollide({
          id: '', // Temporary ID for collision check
          type: 'car',
          route: [],
          currentLaneIndex: 0,
          progress: 0,
          speed: 0,
          position: { x: startPos.x, y: startPos.y },
          sourceRoadId: road.id,
          targetRoadId: '',
          color: '',
          visible: true,
          dimensions,
          rotation: 0,
          stoppedSince: 0,
        }, startPos.x, startPos.y, updatedVehicles, oldVehicles)) {
          entryLane = candidate;
          break;
        }
      }
      if (entryLane) {
        // Allow same road as target.
        const candidateTargetRoads = state.roads;
        const targetRoad = candidateTargetRoads[Math.floor(Math.random() * candidateTargetRoads.length)];
        const route = findRoute(state.lanes, entryLane.id, targetRoad.id);
        if (!route) continue;
        const vehicleId = Date.now().toString() + Math.random().toString();
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
        console.log(
          `[${new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      })}] Vehicle spawned: sourceRoadId=${
            road.name}, vehicleId=${vehicleId
          }, targetRoadId=${targetRoad.name}, route=${route
            .map((laneId) => {
              const lane = state.lanes.find((l) => l.id === laneId);
              return lane ? lane.name : laneId;
            })
            .join(" -> ")}`
        );
      }
    }
  }

  // 2. Update positions for each existing vehicle.
  for (const vehicle of oldVehicles) {
    // Determine current lane.
    const currentLaneId = vehicle.route[vehicle.currentLaneIndex];
    const lane = state.lanes.find((l) => l.id === currentLaneId);
    if (!lane || lane.points.length < 2) {
      updatedVehicles.push(vehicle);
      continue;
    }

    const currentLaneLength = computeLaneLength(lane);
    const initialTransition = vehicle.transitionProgress !== undefined ? vehicle.transitionProgress : Math.max(0, vehicle.progress - currentLaneLength);

    // We'll try fractional movement steps to avoid collisions.
    const numAttempts = 10;
    let foundSafe = false;
    let candidateLaneIndex = vehicle.currentLaneIndex;
    let candidateProgress = vehicle.progress;
    let candidatePos = { x: vehicle.position.x, y: vehicle.position.y };
    let candidateRotation = vehicle.rotation;
    let candidateTransitionProgress = vehicle.transitionProgress; // may be undefined

    for (let i = numAttempts; i >= 0; i--) {
      const attemptSpeed = (vehicle.speed * i) / numAttempts;
      let newLaneIndex = vehicle.currentLaneIndex;
      let newProgress = vehicle.progress;
      let newPos = { x: 0, y: 0 };
      let newRotation = 0;
      let newTransitionProgress: number | undefined = undefined;

      if (vehicle.progress < currentLaneLength && (vehicle.progress + attemptSpeed) <= currentLaneLength && initialTransition === 0) {
        // Normal movement within the current lane.
        const tempProgress = vehicle.progress + attemptSpeed;
        const { x, y, rotation } = getPositionAndVisibilityOnLane(lane, tempProgress);
        newPos = { x, y };
        newRotation = rotation;
        newProgress = tempProgress;
      } else {
        // Transition phase: vehicle is at or past the end of the lane or already transitioning.
        const nextLaneId = vehicle.route[vehicle.currentLaneIndex + 1];
        const nextLane = state.lanes.find(l => l.id === nextLaneId);
        if (!nextLane) {
          // Fallback to staying in current lane if no next lane exists.
          const tempProgress = vehicle.progress + attemptSpeed;
          const { x, y, rotation } = getPositionAndVisibilityOnLane(lane, tempProgress);
          newPos = { x, y };
          newRotation = rotation;
          newProgress = tempProgress;
        } else {
          const currentLaneEnd = lane.points[lane.points.length - 1];
          const nextLaneStart = nextLane.points[0];
          const dx = nextLaneStart.x - currentLaneEnd.x;
          const dy = nextLaneStart.y - currentLaneEnd.y;
          const gapDistance = Math.sqrt(dx * dx + dy * dy);
          if (gapDistance <= 0.1) {
            // No significant gap, immediate transition.
            const leftover = (vehicle.progress + attemptSpeed) - currentLaneLength;
            newLaneIndex = vehicle.currentLaneIndex + 1;
            const { x, y, rotation } = getPositionAndVisibilityOnLane(nextLane, leftover);
            newPos = { x, y };
            newRotation = rotation;
            newProgress = leftover;
          } else {
            // There is a gap; compute transition progress incrementally.
            const currentTransition = vehicle.transitionProgress !== undefined ? vehicle.transitionProgress : Math.max(0, vehicle.progress - currentLaneLength);
            const newRawTransition = currentTransition + attemptSpeed;
            const t = newRawTransition / gapDistance;
            if (t < 1) {
              // Still in transition gap between lanes.
              const { x, y, rotation } = getSmoothTransitionPosition(lane, nextLane, t);
              newPos = { x, y };
              newRotation = rotation;
              newLaneIndex = vehicle.currentLaneIndex;
              newProgress = currentLaneLength; // remains at lane end
              newTransitionProgress = newRawTransition;
            } else {
              // Transition complete; carry leftover distance into next lane.
              const leftover = newRawTransition - gapDistance;
              newLaneIndex = vehicle.currentLaneIndex + 1;
              const { x, y, rotation } = getPositionAndVisibilityOnLane(nextLane, leftover);
              newPos = { x, y };
              newRotation = rotation;
              newProgress = leftover;
            }
          }
        }
      }

      if (!willCollide(vehicle, newPos.x, newPos.y, updatedVehicles, oldVehicles)) {
        foundSafe = true;
        candidateLaneIndex = newLaneIndex;
        candidateProgress = newProgress;
        candidatePos = newPos;
        candidateRotation = newRotation;
        candidateTransitionProgress = newTransitionProgress;
        break;
      }
    }

    if (!foundSafe) {
      candidatePos = vehicle.position;
      candidateProgress = vehicle.progress;
      candidateRotation = vehicle.rotation;
      candidateLaneIndex = vehicle.currentLaneIndex;
    }

    const updatedVehicle = {
      ...vehicle,
      currentLaneIndex: candidateLaneIndex,
      progress: candidateProgress,
      position: candidatePos,
      rotation: candidateRotation,
      visible: (function () {
        const currLane = state.lanes.find((l) => l.id === vehicle.route[candidateLaneIndex]);
        if (!currLane) return false;
        if (candidateLaneIndex === vehicle.currentLaneIndex && candidateProgress >= currentLaneLength) {
          return true;
        }
        const { visible } = getPositionAndVisibilityOnLane(currLane, candidateProgress);
        return visible;
      })(),
    };
    if (candidateLaneIndex === vehicle.currentLaneIndex && candidateProgress === currentLaneLength && candidateTransitionProgress !== undefined) {
      updatedVehicle.transitionProgress = candidateTransitionProgress;
    } else {
      if (updatedVehicle.hasOwnProperty("transitionProgress")) {
         delete updatedVehicle.transitionProgress;
      }
    }
    updatedVehicles.push(updatedVehicle);
  }


  // 3. Remove vehicles that have finished their route.
  const finalVehicles = updatedVehicles.filter((vehicle) => {
    const currentLane = state.lanes.find((l) => l.id === vehicle.route[vehicle.currentLaneIndex]);
    if (!currentLane) return false;
    const laneLength = computeLaneLength(currentLane);
    return !(
      vehicle.currentLaneIndex === vehicle.route.length - 1 && vehicle.progress >= laneLength
    );
  });

  return {
    roads: state.roads,
    lanes: state.lanes,
    vehicles: finalVehicles,
  };
}
