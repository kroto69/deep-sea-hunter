import * as THREE from 'three';
import { part, mergeParts } from './geo.js';

// Saturated, sun-lit reef hues: pastel tones greyed out under water fog.
const COLORS = [0xff7a5c, 0xff5fa2, 0x9b7bff, 0xffc94a, 0x2fd8d0, 0x6ff08a];
export const CORAL_VARIANTS = Array.from({length: 27}, (_, i) => ({
  id: `${['staghorn','brain','table','plate','fan','tube','mushroom','boulder','soft'][i % 9]}-${Math.floor(i / 9) + 1}`,
  family: ['staghorn','brain','table','plate','fan','tube','mushroom','boulder','soft'][i % 9],
  form: Math.floor(i / 9), color: COLORS[i % COLORS.length]
}));

const FAMILIES = ['staghorn','brain','table','plate','fan','tube','mushroom','boulder','soft'];

// One draw call per family: the three growth forms share a single merged clump.
export function coralFamilyGeometry(family) {
  const forms = [0, 1, 2].map(form => coralGeometry({ family, form, color: COLORS[(FAMILIES.indexOf(family) + form) % COLORS.length] }));
  const offsets = [[0, 0, 0], [1.7, 0, 0.6], [-1.2, 0, -1.5]];
  const merged = mergeParts(forms.map((geo, i) => part(geo, null, offsets[i])));
  forms.forEach(g => g.dispose());
  return merged;
}

export function coralGeometry({family, form = 0, color = COLORS[0]}) {
  const parts = [];
  const add = (g,p=[0,0,0],r=[0,0,0],s=[1,1,1],c=color) => parts.push(part(g,c,p,r,s));
  const branch = (a,b,r=.07) => {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.sub(start);
    const g=new THREE.CylinderGeometry(r*.6,r,delta.length(),5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()));
    g.translate(...start.addScaledVector(delta,.5).toArray());add(g);
  };
  const h=1+form*.35;
  if(family==='staghorn'||family==='soft') {
    for(let i=0;i<5+form;i++) {
      const a=i*2.4, x=Math.cos(a)*.6,z=Math.sin(a)*.6;
      branch([0,0,0],[x,h,z],family==='soft'?.14:.065);
      branch([x*.6,h*.6,z*.6],[x*1.6,h*.9,z*1.6]);
      branch([x,h,z],[x+.22,h+.3,z-.15],.045);
    }
  } else if(family==='brain'||family==='boulder') {
    add(new THREE.SphereGeometry(1,8,5),[0,.5,0],[0,0,0],[1,h*.65,.85]);
    if(family==='brain') for(let i=0;i<5;i++) {
      const g=new THREE.TorusGeometry(.45+i*.07,.035,3,8,Math.PI*1.5);
      add(g,[(i-2)*.23,.55,0],[0,i*.6,0],[1,h,1],0xfff2b0);
    }
  } else if(['table','plate','mushroom'].includes(family)) {
    const n=family==='plate'?4:family==='mushroom'?3:2;
    for(let i=0;i<n;i++) {
      const y=.35+i*.38, x=i%2?.45:-.15;
      branch([x,0,0],[x,y,0],.09);
      add(new THREE.CylinderGeometry(.7+form*.2,.5,.09,8),[x,y,0],[.1*i,0,.08*i]);
      if(family==='mushroom') add(new THREE.SphereGeometry(.65,8,4,0,Math.PI*2,0,Math.PI/2),[x,y,0],[0,0,0],[1,.25,1]);
    }
  } else if(family==='fan') {
    branch([0,0,0],[0,.5,0],.08);
    for(let i=0;i<9+form*2;i++) {
      const a=-1.2+i/(8+form*2)*2.4;
      branch([0,.35,0],[Math.sin(a)*h,h*.3+Math.cos(a)*h,0],.035);
      if(i>0) branch([Math.sin(a)*h*.7,.35+Math.cos(a)*h*.7,0],[Math.sin(a-.24)*h*.7,.35+Math.cos(a-.24)*h*.7,0],.02);
    }
  } else if(family==='tube') {
    for(let i=0;i<4+form;i++) {
      const a=i*2.4,x=Math.cos(a)*.45,z=Math.sin(a)*.45,y=.6+i*.14;
      add(new THREE.CylinderGeometry(.18,.22,y,5,1,true),[x,y/2,z]);
      add(new THREE.TorusGeometry(.18,.035,3,6),[x,y,z],[Math.PI/2,0,0]);
      add(new THREE.CircleGeometry(.145,5),[x,y-.12,z],[-Math.PI/2,0,0],[1,1,1],0x1a4a6e);
    }
  }
  const geo=mergeParts(parts);
  parts.forEach(p=>p.geo.dispose());
  return geo;
}
