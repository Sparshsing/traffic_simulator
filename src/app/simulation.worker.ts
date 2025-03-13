// simulation.worker.ts
import { 
  simulationStep, 
  initialSimulationState, 
  setGlobalVehicleSpeed, 
  updateRoadTrafficSettings,
  loadInterchangeData,
  SimulationState 
} from './simulationEngine';

// Use a clone of initialSimulationState to avoid shared reference issues
let currentState = JSON.parse(JSON.stringify(initialSimulationState));
let isPaused = false;
let intervalId: number | undefined;

const SIMULATION_INTERVAL = 100; // Simulation update interval in ms

function startSimulation() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  
  intervalId = setInterval(() => {
    if (!isPaused) {
      currentState = simulationStep(currentState);
      self.postMessage(currentState);
    }
  }, SIMULATION_INTERVAL) as unknown as number;
}

// Handle incoming messages
self.onmessage = (event: MessageEvent) => {
  const data = event.data;
  
  // Handle string messages like 'pause' and 'resume'
  if (typeof data === 'string') {
    if (data === 'pause') {
      isPaused = true;
    } else if (data === 'resume') {
      isPaused = false;
    }
    return;
  }
  
  // Handle object messages with type field
  if (data && typeof data === 'object' && 'type' in data) {
    switch (data.type) {
      case 'roadSettingChange':
        // Update road settings (inflow rate and turn probability)
        if (data.roadId && data.settings) {
          updateRoadTrafficSettings(data.roadId, data.settings);
          console.log(`Updated road ${data.roadId} settings:`, data.settings);
        }
        break;
        
      case 'globalVehicleSpeedChange':
        // Update global vehicle speed
        if (typeof data.newSpeed === 'number') {
          setGlobalVehicleSpeed(data.newSpeed);
          console.log(`Updated global vehicle speed to ${data.newSpeed}`);
        }
        break;
        
      case 'interchange':
        // Handle new interchange data
        if (data.data) {
          // Reset the simulation with new interchange data
          console.log('Loading new interchange data...');
          
          // Temporarily pause simulation while loading
          const wasPaused = isPaused;
          isPaused = true;
          
          try {
            // Load new data and reset simulation state
            currentState = loadInterchangeData(data.data);
            console.log('New interchange data loaded successfully');
            
            // Immediately send updated state to UI
            self.postMessage(currentState);
          } catch (error) {
            console.error('Error loading interchange data:', error);
          }
          
          // Restore previous pause state
          isPaused = wasPaused;
        }
        break;
        
      default:
        console.warn('Unknown message type:', data.type);
    }
  }
};

// Start the simulation
startSimulation();

// Export empty type for TypeScript
export {};