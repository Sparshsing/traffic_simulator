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
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Update container size when window resizes
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        // Get the parent container's width
        const containerWidth = containerRef.current.clientWidth;
        // Calculate available height (viewport height minus some padding for other elements)
        const availableHeight = window.innerHeight - 150; // adjust 150 based on your layout
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
    
    // Include roads in bounding box - simple approach without rotation
    simulationState.roads.forEach((road) => {
      if (road.x !== undefined && road.y !== undefined && road.width !== undefined && road.height !== undefined) {
        // Just use the road's position and dimensions without rotation
        minX = Math.min(minX, road.x);
        minY = Math.min(minY, road.y);
        maxX = Math.max(maxX, road.x + road.width);
        maxY = Math.max(maxY, road.y + road.height);
      }
    });
    
    // Apply margin and prevent empty boundingbox
    const margin = 20; // Reduced margin
    if (maxX === -Infinity) return { minX: 0, minY: 0, width: 800, height: 600 };
    
    // Calculate dimensions including margin
    const calculatedWidth = (maxX - minX) + margin * 2;
    const calculatedHeight = (maxY - minY) + margin * 2;
    
    console.log("Bounds:", { minX, minY, maxX, maxY, width: calculatedWidth, height: calculatedHeight });
    
    // Center the viewport by setting minX and minY to center the content
    return {
      minX: minX - margin,
      minY: minY - margin,
      width: calculatedWidth,
      height: calculatedHeight
    };
  }, [simulationState.lanes, simulationState.roads]);

  // Calculate scaled dimensions to fit in container
  const { scaledWidth, scaledHeight } = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { scaledWidth: width, scaledHeight: height };
    }

    const aspectRatio = width / height;
    const containerAspectRatio = containerSize.width / containerSize.height;

    let scaledWidth, scaledHeight;
    if (aspectRatio > containerAspectRatio) {
      // Width limited by container width
      scaledWidth = containerSize.width;
      scaledHeight = containerSize.width / aspectRatio;
    } else {
      // Height limited by container height
      scaledHeight = containerSize.height;
      scaledWidth = containerSize.height * aspectRatio;
    }

    return { scaledWidth, scaledHeight };
  }, [width, height, containerSize]);

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

  // New function to draw roads and their lanes
  const drawRoadsAndLanes = (ctx: CanvasRenderingContext2D) => {
    // Sort roads by zIndex from lowest to highest
    const sortedRoads = simulationState.roads.slice().sort((a, b) => ((a.zIndex ?? 0) - (b.zIndex ?? 0)));
    
    // Process roads and their associated lanes in order
    sortedRoads.forEach((road) => {
      if (road.x !== undefined && road.y !== undefined && road.width !== undefined && road.height !== undefined) {
        // First draw the road
        ctx.save();
        
        // This transformation sequence mimics SVG's transform:
        // translate(x, y) rotate(angle, width/2, height/2)
        
        // 1. Move to the top-left corner of the rectangle
        ctx.translate(road.x, road.y);
        
        // 2. Move to the center of rotation
        ctx.translate(road.width/2, road.height/2);
        
        // 3. Rotate around this center
        const rotationRad = ((road.rotation ?? 0) * Math.PI) / 180;
        ctx.rotate(rotationRad);
        
        // 4. Move back to draw the rectangle with its top-left at origin
        ctx.translate(-road.width/2, -road.height/2);
        
        // 5. Draw rectangle at (0,0)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, road.width, road.height);
        
        // 6. Add a border around the road
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, road.width, road.height);
        
        ctx.restore();
        
        // Then draw the lanes associated with this road
        const roadLanes = simulationState.lanes.filter((lane) => 
          lane.roadId === road.id && 
          lane.points.length >= 2 && 
          !lane.virtual  // Skip virtual lanes
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

    // Finally draw lanes not tied to any road (after all roads)
    const noRoadLanes = simulationState.lanes.filter((lane) => 
      lane.roadId == null && 
      lane.points.length >= 2 && 
      !lane.virtual  // Skip virtual lanes
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
  };

  // Draw grid points
  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const gridSpacing = 100;
    const pointRadius = 2;
    
    // Calculate grid boundaries based on the viewport
    const startX = Math.floor(minX / gridSpacing) * gridSpacing;
    const endX = Math.ceil((minX + width) / gridSpacing) * gridSpacing;
    const startY = Math.floor(minY / gridSpacing) * gridSpacing;
    const endY = Math.ceil((minY + height) / gridSpacing) * gridSpacing;
    
    // Draw grid points
    ctx.fillStyle = '#666666';
    for (let x = startX; x <= endX; x += gridSpacing) {
      for (let y = startY; y <= endY; y += gridSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw debug points at the bounds
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(minX, minY, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(minX + width, minY + height, 4, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = () => {
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
    <div 
      ref={containerRef} 
      className="border border-gray-300 rounded shadow-lg bg-white w-full h-full flex items-center justify-center"
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
