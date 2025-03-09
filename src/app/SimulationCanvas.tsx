"use client";

import React, { useMemo } from 'react';
import { SimulationState } from './simulationEngine';

interface SimulationCanvasProps {
  simulationState: SimulationState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulationState }) => {
  // Compute a bounding box that covers all lane points (visible or not).
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
    const margin = 50;
    if (maxX === -Infinity) { // fallback if no lanes exist
      return { minX: 0, minY: 0, width: 800, height: 600 };
    }
    return {
      minX: minX - margin,
      minY: minY - margin,
      width: (maxX - minX) + margin * 2,
      height: (maxY - minY) + margin * 2
    };
  }, [simulationState.lanes]);

  const viewBox = `${minX} ${minY} ${width} ${height}`;

  // For each lane, break its points into contiguous segments where points are visible.
  const getVisibleSegments = (
    points: { x: number; y: number; visibility: number }[]
  ): Array<Array<{ x: number; y: number; visibility: number }>> => {
    const segments: Array<Array<{ x: number; y: number; visibility: number }>> = [];
    let currentSegment: Array<{ x: number; y: number; visibility: number }> = [];

    for (const point of points) {
      if (point.visibility === 1) {
        currentSegment.push(point);
      } else {
        // When an invisible point is encountered, save the current segment (if it has 2+ points) and reset.
        if (currentSegment.length >= 2) {
          segments.push(currentSegment);
        }
        currentSegment = [];
      }
    }
    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }
    return segments;
  };

  return (
    <div className="border border-gray-300 rounded shadow-lg bg-white w-full h-[600px] overflow-auto">
      <svg
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Render Lanes as segmented polylines */}
        {simulationState.lanes.map(lane => {
          const segments = getVisibleSegments(lane.points);
          return segments.map((segment, idx) => (
            <polyline
              key={`${lane.id}-${idx}`}
              points={segment.map(p => `${p.x},${p.y}`).join(" ")}
              stroke={lane.color}
              fill="none"
              strokeWidth={2}
            />
          ));
        })}

        {/* Render Vehicles (hide if not visible) */}
        {simulationState.vehicles.map(vehicle =>
          vehicle.visible ? (
            <circle
              key={vehicle.id}
              cx={vehicle.position.x}
              cy={vehicle.position.y}
              r={5}
              fill={vehicle.color}
            />
          ) : null
        )}
      </svg>
    </div>
  );
};

export default SimulationCanvas;
