import { cities, corridors, locomotives } from './data';
export const edgeKey = (a: number, b: number) => [a,b].sort((x,y)=>x-y).join('-');
export type TrainState = { id: number; leg: number; distance: number; held: boolean; dwell: number; cars: number; delivered: number; revenue: number; status: 'Running' | 'At station' | 'At signal' | 'On hold'; load: number };
export type SaveState = { version: 1; elapsed: number; treasury: number; delivered: number; trains: TrainState[] };
export class Simulation {
  trains: TrainState[] = locomotives.map((_,id)=>({id,leg:0,distance:0,held:false,dwell:id*.8,cars:3,delivered:0,revenue:0,status:'At station',load:62+(id*7)%35}));
  treasury=425000; delivered=0; elapsed=0; speed=1; paused=false;
  events:string[]=['Meridian Railway is open. All services ready for dispatch.'];
  lengths=new Map<string,number>();
  occupied=new Map<string,number>();
  constructor() { for(const [a,b] of corridors) this.lengths.set(edgeKey(a,b),Math.hypot(cities[a].x-cities[b].x,cities[a].z-cities[b].z)); }
  endpoints(t:TrainState, offset=0) {const r=locomotives[t.id].route; const leg=(t.leg+offset+r.length)%r.length;return [r[leg],r[(leg+1)%r.length]] as const;}
  step(realDelta:number) {
    if(this.paused)return;
    // Fixed-sized substeps preserve reservations even at the fastest simulation speed.
    let remaining=Math.min(realDelta,.25)*this.speed;
    while(remaining>0){const dt=Math.min(remaining,.05);remaining-=dt;this.elapsed+=dt;
      for(const t of this.trains){
        if(t.held){t.status='On hold';continue;}
        if(t.dwell>0){t.dwell=Math.max(0,t.dwell-dt);t.status='At station';continue;}
        const [a,b]=this.endpoints(t), key=edgeKey(a,b), length=this.lengths.get(key)!;
        const owner=this.occupied.get(key);
        if(owner!==undefined&&owner!==t.id){t.status='At signal';continue;}
        this.occupied.set(key,t.id);t.status='Running';
        t.distance+=dt*locomotives[t.id].speed*.25/(1+(t.cars-3)*.07);
        if(t.distance>=length){
          const amount=Math.round(t.cars*18*t.load/100),income=Math.round(amount*(40+length*1.7));
          t.delivered+=amount;t.revenue+=income;this.delivered+=amount;this.treasury+=income;
          this.events.unshift(`${locomotives[t.id].name} → ${cities[b].name} · ${amount} delivered · +$${income.toLocaleString('en-US')}`);this.events=this.events.slice(0,20);
          this.occupied.delete(key);t.leg=(t.leg+1)%locomotives[t.id].route.length;t.distance=0;t.dwell=3.5;t.load=60+(t.delivered+t.id*3)%37;
        }
      }
    }
  }
  addCar(id:number){const t=this.trains[id];if(!t||t.cars>=6||this.treasury<8500)return false;t.cars++;this.treasury-=8500;return true;}
  save():SaveState{return {version:1,elapsed:this.elapsed,treasury:this.treasury,delivered:this.delivered,trains:this.trains.map(t=>({...t}))};}
  restore(value:unknown){
    const s=value as SaveState;
    if(!s||s.version!==1||!Number.isFinite(s.elapsed)||s.elapsed<0||!Number.isFinite(s.treasury)||s.treasury<0||!Number.isFinite(s.delivered)||s.delivered<0||!Array.isArray(s.trains)||s.trains.length!==locomotives.length)throw new Error('This save is not compatible.');
    const occupancy=new Map<string,number>();
    s.trains.forEach((t,i)=>{const r=locomotives[i].route;
      if(t.id!==i||!Number.isInteger(t.leg)||t.leg<0||t.leg>=r.length||!Number.isInteger(t.cars)||t.cars<3||t.cars>6||typeof t.held!=='boolean'||!['Running','At station','At signal','On hold'].includes(t.status)||![t.distance,t.dwell,t.delivered,t.revenue,t.load].every(Number.isFinite)||t.distance<0||t.dwell<0||t.delivered<0||t.revenue<0||t.load<0||t.load>100)throw new Error('Invalid train in save.');
      const key=edgeKey(r[t.leg],r[(t.leg+1)%r.length]);if(t.distance>this.lengths.get(key)!)throw new Error('Invalid train position.');
      if(t.distance>0){if(occupancy.has(key))throw new Error('Conflicting track reservations in save.');occupancy.set(key,i);}
    });
    this.trains=s.trains.map(t=>({...t}));this.elapsed=s.elapsed;this.treasury=s.treasury;this.delivered=s.delivered;this.occupied=occupancy;this.events=['Local railway save restored.'];
  }
}
