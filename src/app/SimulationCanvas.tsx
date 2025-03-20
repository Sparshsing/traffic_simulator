// SimulationCanvas.tsx
"use client";

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Update container size when window resizes
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        // Get the parent container's width
        const containerWidth = containerRef.current.clientWidth;
        // Calculate available height (viewport height minus some padding for other elements)
        const availableHeight = window.innerHeight - 100; // reduced padding from 150 to 100
        setContainerSize({ width: containerWidth, height: availableHeight });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Compute bounding box from all lane points.
  const { minX, minY, width, height } = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    
    // Only include non-virtual lanes in bounding box calculation
    simulationState.lanes.filter(lane => !lane.virtual).forEach((lane) => {
      lane.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
    
    // Include roads in bounding box with proper rotation handling
    simulationState.roads.forEach((road) => {
      if (road.x !== undefined && road.y !== undefined && road.width !== undefined && road.height !== undefined) {
        const centerX = road.x + road.width / 2;
        const centerY = road.y + road.height / 2;
        const rotationRad = ((road.rotation ?? 0) * Math.PI) / 180;
        
        // Calculate the four corners of the road
        const corners = [
          { x: road.x, y: road.y },
          { x: road.x + road.width, y: road.y },
          { x: road.x + road.width, y: road.y + road.height },
          { x: road.x, y: road.y + road.height }
        ];
        
        // Rotate each corner around the center
        corners.forEach(corner => {
          const dx = corner.x - centerX;
          const dy = corner.y - centerY;
          const rotatedX = centerX + dx * Math.cos(rotationRad) - dy * Math.sin(rotationRad);
          const rotatedY = centerY + dx * Math.sin(rotationRad) + dy * Math.cos(rotationRad);
          
          minX = Math.min(minX, rotatedX);
          minY = Math.min(minY, rotatedY);
          maxX = Math.max(maxX, rotatedX);
          maxY = Math.max(maxY, rotatedY);
        });
      }
    });
    
    // Apply margin and prevent empty boundingbox
    const margin = 30; // Reduced margin from 50 to 30
    if (maxX === -Infinity) return { minX: 0, minY: 0, width: 800, height: 600 };
    
    // Calculate dimensions including margin
    const calculatedWidth = (maxX - minX) + margin * 2;
    const calculatedHeight = (maxY - minY) + margin * 2;
    
    // Center the viewport by setting minX and minY to center the content
    return {
      minX: minX - margin,
      minY: minY - margin,
      width: calculatedWidth,
      height: calculatedHeight
    };
  }, [simulationState.lanes, simulationState.roads]);

  // Calculate scaled dimensions to fit in container with better fit
  const { scaledWidth, scaledHeight } = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { scaledWidth: width, scaledHeight: height };
    }

    const aspectRatio = width / height;
    const containerAspectRatio = containerSize.width / containerSize.height;

    let scaledWidth, scaledHeight;
    if (aspectRatio > containerAspectRatio) {
      // Width limited by container width
      scaledWidth = containerSize.width * 0.95; // Use 95% of available width
      scaledHeight = (containerSize.width * 0.95) / aspectRatio;
    } else {
      // Height limited by container height
      scaledHeight = containerSize.height * 0.95; // Use 95% of available height
      scaledWidth = (containerSize.height * 0.95) * aspectRatio;
    }

    return { scaledWidth, scaledHeight };
  }, [width, height, containerSize]);

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
    
    setHoveredVehicleId(null);

    // Check for vehicle hover
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
        break;
      }
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredVehicleId(null);
  };

  // Wrap drawVehicles with useCallback
  const drawVehicles = useCallback((ctx: CanvasRenderingContext2D) => {
    simulationState.vehicles.forEach((vehicle) => {
      if (!vehicle.visible) return;
      const { x, y } = vehicle.position;
      const { width: vWidth, length: vLength } = vehicle.dimensions;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(vehicle.rotation - Math.PI / 2);
      ctx.fillStyle = vehicle.color;
      ctx.fillRect(-vWidth / 2, -vLength / 2, vWidth, vLength);
      if (hoveredVehicleId === vehicle.id) {
        ctx.rotate(-vehicle.rotation + Math.PI / 2);
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
  }, [simulationState.vehicles, hoveredVehicleId]);

  // Wrap drawRoadsAndLanes with useCallback
  const drawRoadsAndLanes = useCallback((ctx: CanvasRenderingContext2D) => {
    const sortedRoads = simulationState.roads.slice().sort((a, b) => ((a.zIndex ?? 0) - (b.zIndex ?? 0)));
    sortedRoads.forEach((road) => {
      if (road.x !== undefined && road.y !== undefined && road.width !== undefined && road.height !== undefined) {
        ctx.save();
        ctx.translate(road.x, road.y);
        ctx.translate(road.width/2, road.height/2);
        const rotationRad = ((road.rotation ?? 0) * Math.PI) / 180;
        ctx.rotate(rotationRad);
        ctx.translate(-road.width/2, -road.height/2);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, road.width, road.height);
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, road.width, road.height);
        ctx.restore();

        const roadLanes = simulationState.lanes.filter((lane) => 
          lane.roadId === road.id && 
          lane.points.length >= 2 && 
          !lane.virtual
        );
        roadLanes.forEach((lane) => {
          ctx.beginPath();
          const points = lane.points;
          if (points.length >= 2) {
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.strokeStyle = lane.color;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }
    });
    const noRoadLanes = simulationState.lanes.filter((lane) => 
      lane.roadId == null && 
      lane.points.length >= 2 && 
      !lane.virtual
    );
    noRoadLanes.forEach((lane) => {
      ctx.beginPath();
      const points = lane.points;
      if (points.length >= 2) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [simulationState.roads, simulationState.lanes]);

  // Wrap drawGrid with useCallback
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const gridSpacing = 100;
    const pointRadius = 2;
    const startX = Math.floor(minX / gridSpacing) * gridSpacing;
    const endX = Math.ceil((minX + width) / gridSpacing) * gridSpacing;
    const startY = Math.floor(minY / gridSpacing) * gridSpacing;
    const endY = Math.ceil((minY + height) / gridSpacing) * gridSpacing;
    ctx.fillStyle = '#666666';
    for (let x = startX; x <= endX; x += gridSpacing) {
      for (let y = startY; y <= endY; y += gridSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(minX, minY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(minX + width, minY + height, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [minX, minY, width, height]);

  // Memoize the draw function
  const draw = useMemo(() => {
    return () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Map world coordinates to canvas coordinates
      ctx.save();
      ctx.translate(-minX, -minY);
      
      // Draw everything
      drawGrid(ctx);  // Draw grid first
      drawRoadsAndLanes(ctx);
      drawVehicles(ctx);
      
      ctx.restore();
    };
  }, [minX, minY, drawGrid, drawRoadsAndLanes, drawVehicles]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [width, height]);

  return (
    <div 
      ref={containerRef} 
      className="border border-gray-300 rounded shadow-lg bg-white w-full h-full flex items-center justify-center overflow-hidden"
    >
      <canvas 
        ref={canvasRef} 
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          maxWidth: '100%',
          maxHeight: '100%'
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
};

export default SimulationCanvas;
