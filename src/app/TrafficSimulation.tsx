// TrafficSimulation.tsx
"use client";

import React, { useEffect, useState, useRef } from 'react';
import SimulationCanvas from './SimulationCanvas';
import { SimulationState } from './simulationEngine';
import {initialSimulationState} from './initialState';

// console.log('initial state', initialSimulationState)

const TrafficSimulation: React.FC = () => {
  // console.log('initial state inside', initialSimulationState)
  const [simulationState, setSimulationState] = useState<SimulationState>(initialSimulationState);
  const animationRef = useRef<number | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);

  // useEffect(() => {
  //   const updateSimulation = () => {
  //     setSimulationState(prevState => simulationStep(prevState));
  //     animationRef.current = requestAnimationFrame(updateSimulation);
  //   };

  //   animationRef.current = requestAnimationFrame(updateSimulation);
  //   console.log('animationRef.current', animationRef.current)
  //   return () => {
  //     if (animationRef.current) cancelAnimationFrame(animationRef.current);
  //   };
  // }, []);

  useEffect(() => {
    // Create the worker using the URL import syntax.
    workerRef.current = new Worker(new URL('./simulation.worker.ts', import.meta.url));
    
    // Listen for messages from the worker.
    workerRef.current.onmessage = (event: MessageEvent<SimulationState>) => {
      setSimulationState(event.data);
    };

    // Clean up the worker when the component unmounts.
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Use requestAnimationFrame to drive canvas updates (if needed).
  useEffect(() => {
    const updateCanvas = () => {
      // The canvas can re-render based on the updated simulationState.
      animationRef.current = requestAnimationFrame(updateCanvas);
    };

    animationRef.current = requestAnimationFrame(updateCanvas);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // console.log('inside trafficSimulation Component. rendering canvas. state:', simulationState)
  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Traffic Interchange Simulator</h1>
      <SimulationCanvas simulationState={simulationState} />
    </div>
  );
};

export default TrafficSimulation;
