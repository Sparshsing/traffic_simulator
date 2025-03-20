// TrafficSimulation.tsx
"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import SimulationCanvas from './SimulationCanvas';
import SimulationSettingsBar from './SimulationSettingsBar';
import { SimulationState, initialSimulationState } from './simulationEngine';

interface InterchangeData {
  roads?: Array<{
    id: string;
    name: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    zIndex?: number;
  }>;
  lines?: Array<{
    id: string;
    name: string;
    points: Array<{
      x: number;
      y: number;
      attribute: string;
      height: number;
      visibility: number;
    }>;
    links: {
      forward: string | null;
      forward_left: string | null;
      forward_right: string | null;
    };
    roadId: string | null;
  }>;
}

const TrafficSimulation: React.FC = () => {
  const [simulationState, setSimulationState] = useState<SimulationState>(initialSimulationState);
  const [isPaused, setIsPaused] = useState(false);
  const [roadSettings, setRoadSettings] = useState<{ [roadId: string]: { inflow: number; turnProbability: number } }>({});
  const [globalVehicleSpeed, setGlobalVehicleSpeed] = useState(10);

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
    return () => { if (animationRef.current) { cancelAnimationFrame(animationRef.current); } };
  }, []);

  const togglePause = () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    workerRef.current?.postMessage(newPausedState ? 'pause' : 'resume');
  };

  const handleRoadSettingChange = (roadId: string, newSettings: { inflow: number; turnProbability: number }) => {
    setRoadSettings(prev => ({
      ...prev,
      [roadId]: newSettings,
    }));
    workerRef.current?.postMessage({
      type: 'roadSettingChange',
      roadId,
      settings: newSettings,
    });
  };

  const handleGlobalVehicleSpeedChange = (newSpeed: number) => {
    setGlobalVehicleSpeed(newSpeed);
    workerRef.current?.postMessage({
      type: 'globalVehicleSpeedChange',
      newSpeed,
    });
  };

  const handleInterchangeUpload = (data: InterchangeData) => {
    workerRef.current?.postMessage({
      type: 'interchange',
      data,
    });
  };

  const candidateRoads = useMemo(() => {
    const referencedLaneIds = new Set<string>();
    simulationState.lanes.forEach(lane => {
      [lane.links.forward, lane.links.forward_left, lane.links.forward_right].forEach(link => {
        if (link) referencedLaneIds.add(link);
      });
    });
    return simulationState.roads.filter(road =>
      simulationState.lanes.some(lane => lane.roadId === road.id && !referencedLaneIds.has(lane.id))
    );
  }, [simulationState]);

  return (
    <div className="bg-gray-100 w-full h-full flex flex-col">
      <div className="flex flex-grow h-full">
        <div className="flex-grow h-full">
          <SimulationCanvas simulationState={simulationState} />
        </div>
        <div className="w-80 border-l h-full overflow-hidden">
          <SimulationSettingsBar
            candidateRoads={candidateRoads}
            roadSettings={roadSettings}
            globalVehicleSpeed={globalVehicleSpeed}
            onRoadSettingChange={handleRoadSettingChange}
            onGlobalVehicleSpeedChange={handleGlobalVehicleSpeedChange}
            onUploadInterchange={handleInterchangeUpload}
            isPaused={isPaused}
            onTogglePause={togglePause}
          />
        </div>
      </div>
    </div>
  );
};

export default TrafficSimulation;