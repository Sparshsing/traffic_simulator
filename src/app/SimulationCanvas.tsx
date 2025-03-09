// SimulationCanvas.tsx
"use client";

import React, { useMemo } from 'react';
import { SimulationState } from './simulationEngine';

interface SimulationCanvasProps {
  simulationState: SimulationState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulationState }) => {
  // 1. Compute bounding box of all lane points
  const { minX, minY, width, height } = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    simulationState.lanes.forEach(lane => {
      lane.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    const margin = 50; // optional extra space around the edges
    const w = maxX - minX || 800; // fallback if no lanes
    const h = maxY - minY || 600;
    return {
      minX: minX - margin,
      minY: minY - margin,
      width: w + margin * 2,
      height: h + margin * 2
    };
  }, [simulationState.lanes]);

  // 2. Build the SVG viewBox
  const viewBox = `${minX} ${minY} ${width} ${height}`;

  return (
    <div className="border border-gray-300 rounded shadow-lg bg-white w-[800px] h-[600px] mx-auto">
      <svg
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Render Lanes */}
        {simulationState.lanes.map(lane => (
          <polyline
            key={lane.id}
            points={lane.points.map(p => `${p.x},${p.y}`).join(' ')}
            stroke="white"
            fill="none"
            strokeWidth="2"
          />
        ))}

        {/* Render Vehicles */}
        {simulationState.vehicles.map(vehicle => (
          <circle
            key={vehicle.id}
            cx={vehicle.position.x}
            cy={vehicle.position.y}
            r={5}
            fill="magenta"
          />
        ))}
      </svg>
    </div>
  );
};

export default SimulationCanvas;
