// SimulationCanvas.tsx
"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
import { SimulationState } from "./simulationEngine";

interface SimulationCanvasProps {
  simulationState: SimulationState;
}

interface Point {
  x: number;
  y: number;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulationState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

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

  // Check if a point is inside a rotated rectangle
  const isPointInRotatedRect = (
    point: Point,
    rectCenter: Point,
    width: number,
    length: number,
    rotation: number
  ): boolean => {
    // Translate point to origin
    const dx = point.x - rectCenter.x;
    const dy = point.y - rectCenter.y;
    
    // Rotate point in opposite direction
    const cosA = Math.cos(-rotation + Math.PI / 2);
    const sinA = Math.sin(-rotation + Math.PI / 2);
    const rotatedX = dx * cosA - dy * sinA;
    const rotatedY = dx * sinA + dy * cosA;
    
    // Check if point is inside rectangle
    return (
      Math.abs(rotatedX) <= width / 2 &&
      Math.abs(rotatedY) <= length / 2
    );
  };

  // Handle mouse move
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Scale mouse coordinates to match canvas scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Transform to world coordinates
    const worldX = x * scaleX + minX;
    const worldY = y * scaleY + minY;
    
    setMousePos({ x: worldX, y: worldY });

    // Check for vehicle hover
    let foundVehicle = false;
    for (const vehicle of simulationState.vehicles) {
      if (!vehicle.visible) continue;
      
      if (isPointInRotatedRect(
        { x: worldX, y: worldY },
        vehicle.position,
        vehicle.dimensions.width,
        vehicle.dimensions.length,
        vehicle.rotation
      )) {
        setHoveredVehicleId(vehicle.id);
        foundVehicle = true;
        break;
      }
    }
    
    if (!foundVehicle) {
      setHoveredVehicleId(null);
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredVehicleId(null);
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
      
      // If this vehicle is being hovered, draw its ID
      if (hoveredVehicleId === vehicle.id) {
        ctx.rotate(-vehicle.rotation + Math.PI / 2); // Reset rotation for text
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const text = `Vehicle ${vehicle.id}`;
        ctx.strokeText(text, 0, -vLength/2 - 5);
        ctx.fillText(text, 0, -vLength/2 - 5);
      }
      
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
  }, [simulationState, minX, minY, hoveredVehicleId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [width, height]);

  return (
    <div className="border border-gray-300 rounded shadow-lg bg-white overflow-auto w-full">
      <canvas 
        ref={canvasRef} 
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
};

export default SimulationCanvas;
