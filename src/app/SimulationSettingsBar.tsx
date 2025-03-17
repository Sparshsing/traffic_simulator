"use client";

import React, { ChangeEvent, useState, useEffect } from 'react';
import { Road } from './simulationEngine';

interface RoadSettings {
  inflow: number;
  turnProbability: number;
}

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

interface SimulationSettingsBarProps {
  candidateRoads: Road[];
  roadSettings: { [roadId: string]: RoadSettings };
  globalVehicleSpeed: number;
  onRoadSettingChange: (roadId: string, settings: RoadSettings) => void;
  onGlobalVehicleSpeedChange: (newSpeed: number) => void;
  onUploadInterchange: (data: InterchangeData) => void;
  isPaused: boolean;
  onTogglePause: () => void;
}

const SimulationSettingsBar: React.FC<SimulationSettingsBarProps> = ({
  candidateRoads,
  roadSettings,
  globalVehicleSpeed,
  onRoadSettingChange,
  onGlobalVehicleSpeedChange,
  onUploadInterchange,
  isPaused,
  onTogglePause,
}) => {
  const [currentFileName, setCurrentFileName] = useState<string>("diamond_interchange_final.json (default)");
  const [fileUploadKey, setFileUploadKey] = useState<number>(0); // To reset file input

  // Initialize with the default file message
  useEffect(() => {
    // This is just to show the user that default file is loaded
    // The actual loading is done in SimulationEngine.ts
  }, []);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string) as InterchangeData;
          onUploadInterchange(json);
          setCurrentFileName(file.name);
          // Reset file input so the same file can be selected again
          setFileUploadKey(prev => prev + 1);
        } catch (err) {
          console.error("Invalid JSON file", err);
          alert("Error: Invalid JSON file format");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleRoadInflowChange = (roadId: string, value: number) => {
    const current = roadSettings[roadId] || { inflow: 0.2, turnProbability: 0.25 };
    onRoadSettingChange(roadId, { ...current, inflow: value });
  };

  const handleRoadTurnProbabilityChange = (roadId: string, value: number) => {
    const current = roadSettings[roadId] || { inflow: 0.2, turnProbability: 0.25 };
    onRoadSettingChange(roadId, { ...current, turnProbability: value });
  };

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Settings</h2>
        <button onClick={onTogglePause} className="text-2xl p-2">
          {isPaused ? '▶' : '⏸'}
        </button>
      </div>
      <div>
        <label className="block font-medium mb-1">Upload Interchange JSON:</label>
        <input 
          key={fileUploadKey}
          type="file" 
          accept=".json" 
          onChange={handleFileUpload} 
          className="block w-full mb-2"
        />
        <div className="text-sm text-gray-600">
          Current file: <span className="font-medium">{currentFileName}</span>
        </div>
      </div>
      <div>
        <label className="block font-medium mb-1">Global Vehicle Speed: {globalVehicleSpeed}</label>
        <input
          type="range"
          min="0"
          max="30"
          step="0.5"
          value={globalVehicleSpeed}
          onChange={(e) => onGlobalVehicleSpeedChange(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Road Settings</h3>
        {candidateRoads.length === 0 && <p>No candidate roads available.</p>}
        {candidateRoads.map((road) => {
          const settings = roadSettings[road.id] || { inflow: 0.2, turnProbability: 0.25 };
          return (
            <div key={road.id} className="border p-2 my-2 rounded">
              <div className="font-medium">{road.name}</div>
              <div className="mt-1">
                <label className="block text-sm">Inflow Rate: {settings.inflow.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.inflow}
                  onChange={(e) => handleRoadInflowChange(road.id, parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="mt-1">
                <label className="block text-sm">Turn Probability: {settings.turnProbability.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.turnProbability}
                  onChange={(e) => handleRoadTurnProbabilityChange(road.id, parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SimulationSettingsBar; 