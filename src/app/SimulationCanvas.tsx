"use client";

import React, { useMemo } from 'react';
import { SimulationState } from './simulationEngine';

interface SimulationCanvasProps {
  simulationState: SimulationState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulationState }) => {
  // Compute bounding box of all lane points (optional, if you want to scale to fit).
  const { minX, minY, width, height } = useMemo(() => {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const lane of simulationState.lanes) {
      for (const p of lane.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    // If no lanes, fallback to some default
    if (maxX === -Infinity) {
      return { minX: 0, minY: 0, width: 800, height: 600 };
    }

    const margin = 50;
    return {
      minX: minX - margin,
      minY: minY - margin,
      width: (maxX - minX) + margin * 2,
      height: (maxY - minY) + margin * 2,
    };
  }, [simulationState.lanes]);

  const viewBox = `${minX} ${minY} ${width} ${height}`;

  return (
    // Use w-full/h-full so it expands in the parent
    <div className="border border-gray-300 rounded shadow-lg bg-white w-full h-[600px] overflow-auto">
      <svg
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Lanes */}
        {simulationState.lanes.map(lane => (
          <polyline
            key={lane.id}
            points={lane.points.map(p => `${p.x},${p.y}`).join(' ')}
            stroke={lane.color}
            fill="none"
            strokeWidth={2}
          />
        ))}

        {/* Vehicles */}
        {simulationState.vehicles.map(vehicle => (
          <circle
            key={vehicle.id}
            cx={vehicle.position.x}
            cy={vehicle.position.y}
            r={5}
            fill={vehicle.color}
          />
        ))}
      </svg>
    </div>
  );
};

export default SimulationCanvas;
