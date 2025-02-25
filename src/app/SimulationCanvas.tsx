// SimulationCanvas.tsx
"use client";

import React from 'react';
import { SimulationState } from './simulationEngine';

interface SimulationCanvasProps {
  simulationState: SimulationState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulationState }) => {
  return (
    <div className="border border-gray-300 rounded shadow-lg bg-white">
      <svg width="800" height="600" className="block mx-auto">
        {/* Render Roads */}
        {simulationState.roads.map(road => (
          <polyline
            key={road.id}
            points={road.points.map(p => `${p.x},${p.y}`).join(' ')}
            stroke="gray"
            fill="none"
            strokeWidth={road.lanes * 2}
          />
        ))}

        {/* Render Vehicles */}
        {simulationState.vehicles.map(vehicle => (
          <rect
            key={vehicle.id}
            x={vehicle.position.x - vehicle.dimensions.width / 2}
            y={vehicle.position.y - vehicle.dimensions.length / 2}
            width={vehicle.dimensions.width}
            height={vehicle.dimensions.length}
            fill="blue"
            className="transition-all duration-300"
          />
        ))}

        {/* Render Traffic Signals */}
        {simulationState.signals.map(signal => (
          <circle
            key={signal.id}
            cx={signal.position.x}
            cy={signal.position.y}
            r="10"
            fill={
              signal.currentState === 'green'
                ? 'green'
                : signal.currentState === 'yellow'
                ? 'yellow'
                : 'red'
            }
            stroke="black"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
};

export default SimulationCanvas;
