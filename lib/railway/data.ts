import { MAP_SCALE } from './map';
export type City = {
  id: string;
  name: string;
  cargo: string;
  x: number;
  z: number;
  color: string;
};
const originalCities: City[] = [
  {
    id: 'coalhaven',
    name: 'Coalhaven',
    cargo: 'Coal',
    x: -63,
    z: -22,
    color: '#78817a',
  },
  {
    id: 'ashford',
    name: 'Ashford',
    cargo: 'Passengers',
    x: -30,
    z: -57,
    color: '#ac775d',
  },
  {
    id: 'pinecrest',
    name: 'Pinecrest',
    cargo: 'Timber',
    x: 30,
    z: -54,
    color: '#d5c6a2',
  },
  {
    id: 'millbrook',
    name: 'Millbrook',
    cargo: 'Grain',
    x: -57,
    z: 27,
    color: '#dbccab',
  },
  {
    id: 'grand',
    name: 'Grand Junction',
    cargo: 'Goods',
    x: -4,
    z: 0,
    color: '#b78065',
  },
  {
    id: 'kingscross',
    name: 'Kingscross',
    cargo: 'Passengers',
    x: -17,
    z: 52,
    color: '#b17659',
  },
  {
    id: 'fairwater',
    name: 'Fairwater',
    cargo: 'Grain',
    x: 48,
    z: 52,
    color: '#dfd1aa',
  },
  {
    id: 'riverside',
    name: 'Riverside',
    cargo: 'Goods',
    x: 65,
    z: 4,
    color: '#c8bfa5',
  },
];
export const cities: City[] = originalCities.map((city) => ({
  ...city,
  x: city.x * MAP_SCALE,
  z: city.z * MAP_SCALE,
}));

export const corridors: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [0, 4],
  [1, 4],
  [2, 4],
  [2, 7],
  [3, 4],
  [3, 5],
  [4, 5],
  [4, 7],
  [5, 6],
  [6, 7],
];
export const locomotives = [
  {
    name: 'Ouray',
    type: '2-8-0 Consolidation',
    year: 1887,
    color: '#617e71',
    route: [0, 1, 4, 3],
    speed: 10,
  },
  {
    name: 'Commodore Vanderbilt',
    type: '4-6-4 Hudson',
    year: 1934,
    color: '#546f85',
    route: [1, 2, 7, 4],
    speed: 14,
  },
  {
    name: 'Frontier Belle',
    type: '4-4-0 American',
    year: 1885,
    color: '#7c8a65',
    route: [3, 5, 4, 0],
    speed: 9,
  },
  {
    name: 'Copper Creek',
    type: '2-6-0 Mogul',
    year: 1892,
    color: '#aa6a48',
    route: [0, 4, 7, 2, 1],
    speed: 11,
  },
  {
    name: 'Golden Valley',
    type: '4-6-0 Ten-wheeler',
    year: 1898,
    color: '#b3934e',
    route: [3, 4, 5],
    speed: 10,
  },
  {
    name: 'Silver Arrow',
    type: '4-4-2 Atlantic',
    year: 1905,
    color: '#7292a1',
    route: [5, 6, 7, 4],
    speed: 13,
  },
  {
    name: 'Timberline',
    type: '2-6-2 Prairie',
    year: 1908,
    color: '#6e7947',
    route: [2, 7, 4],
    speed: 9,
  },
  {
    name: 'Royal Meridian',
    type: '4-6-2 Pacific',
    year: 1914,
    color: '#885f6d',
    route: [1, 2, 4],
    speed: 12,
  },
  {
    name: 'Iron Horse',
    type: '2-8-2 Mikado',
    year: 1918,
    color: '#68716c',
    route: [0, 3, 4],
    speed: 10,
  },
  {
    name: 'Red Mesa',
    type: '2-10-2 Santa Fe',
    year: 1920,
    color: '#a96452',
    route: [4, 7, 6, 5],
    speed: 11,
  },
  {
    name: 'Alpine Monarch',
    type: '4-8-2 Mountain',
    year: 1925,
    color: '#477773',
    route: [0, 1, 4],
    speed: 12,
  },
  {
    name: 'Northern Star',
    type: '4-8-4 Northern',
    year: 1930,
    color: '#4c665a',
    route: [3, 5, 6, 7, 4],
    speed: 13,
  },
];
export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
