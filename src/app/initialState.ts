 // initialState.ts

import { SimulationState } from './simulationEngine';

export const initialSimulationState: SimulationState = {
  roads: [
    {
      id: 'road1',
      points: [
        { x: 50, y: 300 },
        { x: 750, y: 300 },
      ],
      lanes: 2,
      speedLimit: 60,
    },
  ],
  vehicles: [
    {
      id: 'veh1',
      type: 'car',
      position: { x: 100, y: 290 },
      velocity: 2, // units per tick
      acceleration: 0,
      dimensions: { length: 40, width: 20 },
      route: ['road1'],
    },
  ],
  signals: [
    {
      id: 'signal1',
      position: { x: 400, y: 300 },
      currentState: 'red',
      timers: {
        green: 3000,  // in milliseconds
        yellow: 1000,
        red: 3000,
      },
    },
  ],
};