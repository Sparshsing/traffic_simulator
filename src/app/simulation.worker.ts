// simulation.worker.ts
import { SimulationState, simulationStep,  } from './simulationEngine';
import {initialSimulationState} from './initialState';
let simulationState: SimulationState = initialSimulationState;

function stepSimulation() {
  simulationState = simulationStep(simulationState);
  // Post the updated state to the main thread.
  postMessage(simulationState);
}

// Update the simulation every 0.5 second.
setInterval(stepSimulation, 500);