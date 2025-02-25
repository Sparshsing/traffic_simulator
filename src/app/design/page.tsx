"use client"
import React, { useState, useRef, MouseEvent } from 'react';

type Point = {
  x: number;
  y: number;
  attribute: string;
};

type Polyline = {
  id: string;
  points: Point[];
};

type SelectedPoint = {
  polylineId: string;
  pointIndex: number;
};

const Home: React.FC = () => {
  const [polylines, setPolylines] = useState<Polyline[]>([]);
  const [activePolylineId, setActivePolylineId] = useState<string | null>(null);
  // Track which polyline entries are expanded (by id)
  const [expandedPolylines, setExpandedPolylines] = useState<string[]>([]);
  // Track the selected point (if any) from the sidebar
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert click event to SVG coordinates and add a point to the active polyline
  const handleSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!activePolylineId || !svgRef.current) return;

    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;
    const transformedPoint = point.matrixTransform(CTM.inverse());

    const newPoint: Point = {
      x: transformedPoint.x,
      y: transformedPoint.y,
      attribute: '',
    };

    setPolylines((prevPolylines) =>
      prevPolylines.map((polyline) => {
        if (polyline.id === activePolylineId) {
          return { ...polyline, points: [...polyline.points, newPoint] };
        }
        return polyline;
      })
    );
  };

  // Create a new polyline and set it as active
  const addNewPolyline = () => {
    const newPolyline: Polyline = {
      id: Date.now().toString(),
      points: [],
    };
    setPolylines((prev) => [...prev, newPolyline]);
    setActivePolylineId(newPolyline.id);
  };

  // Delete the active polyline
  const deleteActivePolyline = () => {
    setPolylines((prevPolylines) =>
      prevPolylines.filter((polyline) => polyline.id !== activePolylineId)
    );
    setActivePolylineId(null);
    setSelectedPoint(null);
  };

  // Update the attribute of a point in a polyline
  const updatePointAttribute = (
    polylineId: string,
    pointIndex: number,
    newAttribute: string
  ) => {
    setPolylines((prevPolylines) =>
      prevPolylines.map((polyline) => {
        if (polyline.id === polylineId) {
          const newPoints = polyline.points.map((pt, idx) => {
            if (idx === pointIndex) {
              return { ...pt, attribute: newAttribute };
            }
            return pt;
          });
          return { ...polyline, points: newPoints };
        }
        return polyline;
      })
    );
  };

  // Set the active polyline
  const selectPolyline = (id: string) => {
    setActivePolylineId(id);
  };

  // Toggle expansion/collapse of a polyline in the sidebar
  const toggleExpandPolyline = (id: string) => {
    setExpandedPolylines((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  // Handle selecting a point from the sidebar
  const handleSelectPoint = (polylineId: string, pointIndex: number) => {
    setSelectedPoint({ polylineId, pointIndex });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Polyline Drawer</h2>
      <div style={{ display: 'flex' }}>
        {/* SVG Drawing Area */}
        <div style={{ flex: 1 }}>
          <svg
            ref={svgRef}
            onClick={handleSvgClick}
            style={{ border: '1px solid #ccc', width: '100%', height: '80vh' }}
          >
            {/* Define marker for arrow */}
            <defs>
              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="10"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="#f00" />
              </marker>
            </defs>

            {/* Render each polyline */}
            {polylines.map((polyline) =>
              polyline.points.length > 0 ? (
                <polyline
                  key={polyline.id}
                  points={polyline.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  stroke={polyline.id === activePolylineId ? 'blue' : 'black'}
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrow)"
                />
              ) : null
            )}

            {/* Render each point as a circle */}
            {polylines.map((polyline) =>
              polyline.points.map((p, index) => {
                const isSelected =
                  selectedPoint &&
                  selectedPoint.polylineId === polyline.id &&
                  selectedPoint.pointIndex === index;
                return (
                  <circle
                    key={`${polyline.id}-${index}`}
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    fill={isSelected ? 'yellow' : 'green'}
                    stroke={isSelected ? 'red' : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                );
              })
            )}
          </svg>

          <div style={{ marginTop: '10px' }}>
            <button onClick={addNewPolyline}>Add Polyline</button>
            {activePolylineId && (
              <button onClick={deleteActivePolyline} style={{ marginLeft: '10px' }}>
                Delete Active Polyline
              </button>
            )}
          </div>
        </div>

        {/* Sidebar for editing point attributes */}
        <div style={{ marginLeft: '20px', width: '300px' }}>
          <h3>Polylines</h3>
          <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
            {polylines.map((polyline) => (
              <li key={polyline.id} style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button onClick={() => selectPolyline(polyline.id)}>
                    {activePolylineId === polyline.id ? 'Active: ' : ''}Polyline {polyline.id}
                  </button>
                  <button
                    onClick={() => toggleExpandPolyline(polyline.id)}
                    style={{ marginLeft: '5px' }}
                  >
                    {expandedPolylines.includes(polyline.id) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {expandedPolylines.includes(polyline.id) && polyline.points.length > 0 && (
                  <ul style={{ paddingLeft: '10px', marginTop: '5px' }}>
                    {polyline.points.map((point, index) => (
                      <li
                        key={index}
                        style={{
                          fontSize: '0.9em',
                          marginTop: '5px',
                          cursor: 'pointer',
                          backgroundColor:
                            selectedPoint &&
                            selectedPoint.polylineId === polyline.id &&
                            selectedPoint.pointIndex === index
                              ? '#efefef'
                              : 'transparent',
                          padding: '2px 5px',
                          borderRadius: '3px',
                        }}
                        onClick={() => handleSelectPoint(polyline.id, index)}
                      >
                        <div>
                          <strong>Point {index + 1}</strong>:
                          ({point.x.toFixed(1)}, {point.y.toFixed(1)})
                        </div>
                        <input
                          type="text"
                          placeholder="Attribute"
                          value={point.attribute}
                          onChange={(e) =>
                            updatePointAttribute(polyline.id, index, e.target.value)
                          }
                          style={{ marginTop: '3px', width: '100%' }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p>
            <em>Click anywhere in the canvas to add a point to the active polyline.</em>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;
