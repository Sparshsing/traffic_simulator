// TrafficSimulation.tsx
"use client";

import React, { useEffect, useState, useRef } from 'react';
import SimulationCanvas from './SimulationCanvas';
import { SimulationState, initialSimulationState } from './simulationEngine';

const TrafficSimulation: React.FC = () => {
  const [simulationState, setSimulationState] = useState<SimulationState>(initialSimulationState);
  const [isPaused, setIsPaused] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./simulation.worker.ts', import.meta.url));
    workerRef.current.onmessage = (event: MessageEvent<SimulationState>) => {
      setSimulationState(event.data);
    };
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    const updateCanvas = () => {
      animationRef.current = requestAnimationFrame(updateCanvas);
    };
    animationRef.current = requestAnimationFrame(updateCanvas);
    return () => animationRef.current && cancelAnimationFrame(animationRef.current);
  }, []);

  const togglePause = () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    workerRef.current?.postMessage(newPausedState ? 'pause' : 'resume');
  };

  return (
    <div className="p-4 bg-gray-100 w-full h-full">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold text-center">Traffic Interchange Simulator</h1>
        <button
          onClick={togglePause}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          {isPaused ? 'Resume Simulation' : 'Pause Simulation'}
        </button>
      </div>
      <SimulationCanvas simulationState={simulationState} />
    </div>
  );
};

export default TrafficSimulation;