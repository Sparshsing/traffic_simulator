// simulationEngine.ts

export interface Point {
    x: number;
    y: number;
  }
  
  export interface Road {
    id: string;
    points: Point[];
    lanes: number;
    speedLimit: number;
  }
  
  export interface Vehicle {
    id: string;
    type: 'car' | 'bus' | 'truck';
    position: Point;
    velocity: number;
    acceleration: number;
    dimensions: {
      length: number;
      width: number;
    };
    route: string[]; // road ids or intersection nodes
  }
  
  export type SignalState = 'green' | 'yellow' | 'red';
  
  export interface TrafficSignal {
    id: string;
    position: Point;
    currentState: SignalState;
    timers: {
      green: number;
      yellow: number;
      red: number;
    };
  }
  
  export interface SimulationState {
    roads: Road[];
    vehicles: Vehicle[];
    signals: TrafficSignal[];
  }
  
  export function simulationStep(state: SimulationState): SimulationState {
    // Update traffic signals
    const updatedSignals = state.signals.map(signal => {
      // For the sake of example, simply toggle red/green every tick.
      // In a real simulation, you would check elapsed time, etc.
      const newState: SignalState = signal.currentState === 'red' ? 'green' : 'red';
      return { ...signal, currentState: newState };
    });
  
    // Update vehicles positions based on velocity
    const updatedVehicles = state.vehicles.map(vehicle => {
      const newX = vehicle.position.x + vehicle.velocity;
      // If vehicle reaches end of road (example logic), wrap around
      const maxX = state.roads[0].points[state.roads[0].points.length - 1].x;
      const newPosition = { x: newX > maxX ? 50 : newX, y: vehicle.position.y };
      return { ...vehicle, position: newPosition };
    });
  
    return {
      ...state,
      signals: updatedSignals,
      vehicles: updatedVehicles,
    };
  }
  