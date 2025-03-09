// simulation.worker.ts
import { SimulationState, simulationStep, initialSimulationState } from './simulationEngine';

let simulationState: SimulationState = initialSimulationState;

function stepSimulation() {
  simulationState = simulationStep(simulationState);
  // Post the updated state back to the main thread.
  postMessage(simulationState);
}

// Update the simulation every 100ms.
setInterval(stepSimulation, 100);
