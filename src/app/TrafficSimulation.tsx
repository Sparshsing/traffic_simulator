// TrafficSimulation.tsx
"use client";

import React, { useEffect, useState, useRef } from 'react';
import SimulationCanvas from './SimulationCanvas';
import { SimulationState, initialSimulationState } from './simulationEngine';

const TrafficSimulation: React.FC = () => {
  const [simulationState, setSimulationState] = useState<SimulationState>(initialSimulationState);
  const animationRef = useRef<number | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./simulation.worker.ts', import.meta.url));
    workerRef.current.onmessage = (event: MessageEvent<SimulationState>) => {
      setSimulationState(event.data);
    };
    return () => workerRef.current?.terminate();
  }, []);

  // Re-render loop
  useEffect(() => {
    const updateCanvas = () => {
      animationRef.current = requestAnimationFrame(updateCanvas);
    };
    animationRef.current = requestAnimationFrame(updateCanvas);
    return () => animationRef.current && cancelAnimationFrame(animationRef.current);
  }, []);

  return (
    // Remove min-h-screen so it doesn't conflict with the parent's height.
    <div className="p-4 bg-gray-100">
      <h1 className="text-2xl font-bold mb-4 text-center">Traffic Interchange Simulator</h1>
      <SimulationCanvas simulationState={simulationState} />
    </div>
  );
};

export default TrafficSimulation;
