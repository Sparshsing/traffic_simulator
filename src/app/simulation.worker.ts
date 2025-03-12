// simulation.worker.ts
import { SimulationState, simulationStep, initialSimulationState } from './simulationEngine';

let simulationState: SimulationState = initialSimulationState;
let intervalId: NodeJS.Timeout | null = null;
let isPaused = false;

function stepSimulation() {
  simulationState = simulationStep(simulationState);
  // Post the updated state back to the main thread.
  postMessage(simulationState);
}

function startSimulation() {
  if (!intervalId) {
    intervalId = setInterval(stepSimulation, 100);
  }
}

function stopSimulation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// Listen for messages from the main thread
addEventListener('message', (event) => {
  if (event.data === 'pause') {
    isPaused = true;
    stopSimulation();
  } else if (event.data === 'resume') {
    isPaused = false;
    startSimulation();
  }
});

// Start the simulation initially
startSimulation();