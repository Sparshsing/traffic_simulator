// SimulationCanvas.tsx
"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { SimulationState } from "./simulationEngine";

interface SimulationCanvasProps {
  simulationState: SimulationState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulationState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute bounding box from all lane points.
  const { minX, minY, width, height } = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    simulationState.lanes.forEach((lane) => {
      lane.points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    const margin = 50;
    if (maxX === -Infinity) return { minX: 0, minY: 0, width: 800, height: 600 };
    return {
      minX: minX - margin,
      minY: minY - margin,
      width: (maxX - minX) + margin * 2,
      height: (maxY - minY) + margin * 2,
    };
  }, [simulationState.lanes]);

  // Draw lanes: break into segments where points are visible.
  const drawLanes = (ctx: CanvasRenderingContext2D) => {
    simulationState.lanes.forEach((lane) => {
      let segment: { x: number; y: number }[] = [];
      for (const point of lane.points) {
        if (point.visibility === 1) {
          segment.push({ x: point.x, y: point.y });
        } else {
          if (segment.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].y);
            for (let i = 1; i < segment.length; i++) {
              ctx.lineTo(segment[i].x, segment[i].y);
            }
            ctx.strokeStyle = lane.color;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          segment = [];
        }
      }
      if (segment.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(segment[0].x, segment[0].y);
        for (let i = 1; i < segment.length; i++) {
          ctx.lineTo(segment[i].x, segment[i].y);
        }
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  };

  // Draw vehicles as rotated rectangles.
  const drawVehicles = (ctx: CanvasRenderingContext2D) => {
    simulationState.vehicles.forEach((vehicle) => {
      if (!vehicle.visible) return;
      const { x, y } = vehicle.position;
      const { width: vWidth, length: vLength } = vehicle.dimensions;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(vehicle.rotation - Math.PI / 2);
      ctx.fillStyle = vehicle.color;
      // Draw rectangle centered at (0,0)
      ctx.fillRect(-vWidth / 2, -vLength / 2, vWidth, vLength);
      ctx.restore();
    });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Map world coordinates to canvas coordinates.
    ctx.save();
    ctx.translate(-minX, -minY);
    drawLanes(ctx);
    drawVehicles(ctx);
    ctx.restore();
  };

  useEffect(() => {
    draw();
  }, [simulationState, minX, minY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [width, height]);

  return (
    <div className="border border-gray-300 rounded shadow-lg bg-white overflow-auto w-full">
      <canvas ref={canvasRef} className="w-full" />
    </div>
  );
};

export default SimulationCanvas;
