import{C as e,O as t,T as n}from"./api-DnvS8MWF.js";import{Et as r,Ft as i,L as a,R as o,U as s,d as c,dn as l,i as u,k as d,n as f,pt as p,sn as m,t as h,u as g,w as _,x as v}from"./PremiumBase-B_Jx8OhB.js";import{a as y,d as b,f as x,g as S,h as C,i as w,l as T,m as E,n as D,o as O,r as k,s as A,t as j,v as M,y as N}from"./PremiumParts-DEsEiX5W.js";import{t as P}from"./OrbitControls-D1y39ZMm.js";import{n as ee}from"./geometry-DR_usbtU.js";import{s as F,u as I}from"./pistons-5sbSJOgO.js";var L=t(n()),R=N({cellSize:.5,sectionSize:1,fadeDistance:100,fadeStrength:1,fadeFrom:1,cellThickness:.5,sectionThickness:1,cellColor:new s,sectionColor:new s,infiniteGrid:!1,followCamera:!1,worldCamProjPosition:new m,worldPlanePosition:new m},`
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform vec3 worldPlanePosition;
    uniform float fadeDistance;
    uniform bool infiniteGrid;
    uniform bool followCamera;

    void main() {
      localPosition = position.xzy;
      if (infiniteGrid) localPosition *= 1.0 + fadeDistance;
      
      worldPosition = modelMatrix * vec4(localPosition, 1.0);
      if (followCamera) {
        worldPosition.xyz += (worldCamProjPosition - worldPlanePosition);
        localPosition = (inverse(modelMatrix) * worldPosition).xyz;
      }

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,`
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float fadeDistance;
    uniform float fadeStrength;
    uniform float fadeFrom;
    uniform float cellThickness;
    uniform float sectionThickness;

    float getGrid(float size, float thickness) {
      vec2 r = localPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(grid.x, grid.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float g1 = getGrid(cellSize, cellThickness);
      float g2 = getGrid(sectionSize, sectionThickness);

      vec3 from = worldCamProjPosition*vec3(fadeFrom);
      float dist = distance(from, worldPosition.xyz);
      float d = 1.0 - min(dist / fadeDistance, 1.0);
      vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));

      gl_FragColor = vec4(color, (g1 + g2) * pow(d, fadeStrength));
      gl_FragColor.a = mix(0.75 * gl_FragColor.a, gl_FragColor.a, g2);
      if (gl_FragColor.a <= 0.0) discard;

      #include <tonemapping_fragment>
      #include <${M>=154?`colorspace_fragment`:`encodings_fragment`}>
    }
  `),z=L.forwardRef(({args:e,cellColor:t=`#000000`,sectionColor:n=`#2080ff`,cellSize:r=.5,sectionSize:a=1,followCamera:o=!1,infiniteGrid:s=!1,fadeDistance:c=100,fadeStrength:u=1,fadeFrom:d=1,cellThickness:f=.5,sectionThickness:p=1,side:h=1,...g},y)=>{v({GridMaterial:R});let b=L.useRef(null);L.useImperativeHandle(y,()=>b.current,[]);let x=new i,S=new m(0,1,0),C=new m(0,0,0);_(e=>{x.setFromNormalAndCoplanarPoint(S,C).applyMatrix4(b.current.matrixWorld);let t=b.current.material,n=t.uniforms.worldCamProjPosition,r=t.uniforms.worldPlanePosition;x.projectPoint(e.camera.position,n.value),r.value.set(0,0,0).applyMatrix4(b.current.matrixWorld)});let w={cellSize:r,sectionSize:a,cellColor:t,sectionColor:n,cellThickness:f,sectionThickness:p},T={fadeDistance:c,fadeStrength:u,fadeFrom:d,infiniteGrid:s,followCamera:o};return L.createElement(`mesh`,l({ref:b,frustumCulled:!1},g),L.createElement(`gridMaterial`,l({transparent:!0,"extensions-derivatives":!0,side:h},w,T)),L.createElement(`planeGeometry`,{args:e}))}),B=e(),V=Object.fromEntries(Object.entries(c).map(([e,t])=>[e,new s(t)]));function H({geometry:e,store:t}){let n=(0,L.useRef)(null),i=(0,L.useRef)(null),{plate:s}=A(e),c=(0,L.useMemo)(()=>{let e=new o;return e.setAttribute(`position`,new a(new Float32Array(36),3)),e.setAttribute(`color`,new a(new Float32Array(36),3)),e},[]),l=(0,L.useMemo)(()=>new p({vertexColors:!0,transparent:!0,opacity:.95}),[]),u=(0,L.useMemo)(()=>new r({color:`#2f9e41`,transparent:!0,opacity:.22,depthWrite:!1}),[]);return _(()=>{let e=t.ghost,r=i.current;if(!n.current||!r||(n.current.visible=r.visible=e!==null,!e))return;O(n.current,e.pose);let a=r.geometry,o=a.getAttribute(`position`),s=a.getAttribute(`color`);for(let n=0;n<6;n++){let r=t.geometry.base_points[n],i=e.top[n];o.setXYZ(n*2,r[0],r[1],r[2]),o.setXYZ(n*2+1,i[0],i[1],i[2]);let a=V[e.status[n]];s.setXYZ(n*2,a.r,a.g,a.b),s.setXYZ(n*2+1,a.r,a.g,a.b)}o.needsUpdate=!0,s.needsUpdate=!0,a.computeBoundingSphere()}),(0,B.jsxs)(`group`,{children:[(0,B.jsx)(`lineSegments`,{ref:i,geometry:c,material:l,frustumCulled:!1}),(0,B.jsx)(`group`,{ref:n,children:(0,B.jsx)(`mesh`,{geometry:s,material:u,position:[0,0,ee.topPlateGap]})})]})}function U({index:e,store:t}){let n=(0,L.useRef)(null),r=(0,L.useRef)(null),i=(0,L.useRef)(null),a=(0,L.useMemo)(()=>u.aluminum.clone(),[]);return _(()=>{if(!n.current||!r.current)return;let o=t.geometry.base_points[e],s=t.solid.top[e],c=x(n.current,o,s);r.current.position.set(0,c-j.joint-j.rodLength/2,0),a.emissive.copy(g[t.solid.status[e]]),i.current=b(s,o,t.solid.pose,i.current??void 0)}),(0,B.jsxs)(B.Fragment,{children:[(0,B.jsxs)(`group`,{ref:n,children:[(0,B.jsx)(w,{}),(0,B.jsx)(D,{index:e,highlighted:!1,selected:!1,tubeMaterial:a}),(0,B.jsx)(`group`,{ref:r,children:(0,B.jsx)(k,{})})]}),(0,B.jsx)(T,{get:()=>i.current})]})}var W=[0,1,2,3,4,5];function G({store:e}){return(0,B.jsx)(`group`,{children:W.map(t=>(0,B.jsx)(U,{index:t,store:e},t))})}function K({store:e}){return _((t,n)=>e.step(n)),null}var q={iso:{label:`Isométrica`,position:[1150,-1350,900]},front:{label:`Frente (+X)`,position:[1900,0,350]},side:{label:`Lateral (−Y)`,position:[0,-1900,350]},top:{label:`Topo`,position:[0,-1,2400]}},J=[0,0,140];function Y({view:e,nonce:t,enabled:n=!0,distance:r=1}){let i=(0,L.useRef)(null),a=d(e=>e.camera);return(0,L.useEffect)(()=>{let[t,n,o]=q[e].position;a.position.set(t*r,n*r,o*r),i.current?.target.set(...J),i.current?.update()},[a,e,t,r]),(0,B.jsx)(P,{ref:i,makeDefault:!0,enabled:n,target:J,enableDamping:!0,dampingFactor:.12,minDistance:500,maxDistance:5e3})}function X({geometry:e,store:t,background:n,gridColor:r,view:i,viewNonce:a}){return(0,B.jsxs)(B.Fragment,{children:[(0,B.jsx)(`color`,{attach:`background`,args:[n]}),(0,B.jsx)(K,{store:t}),(0,B.jsx)(Y,{view:i,nonce:a}),(0,B.jsx)(`ambientLight`,{intensity:.45}),(0,B.jsx)(`hemisphereLight`,{position:[0,0,1e3],args:[`#ffffff`,`#3a3f45`,.55]}),(0,B.jsx)(`directionalLight`,{castShadow:!0,position:[700,-900,1700],intensity:1.7,"shadow-mapSize":[2048,2048],"shadow-camera-left":-900,"shadow-camera-right":900,"shadow-camera-top":900,"shadow-camera-bottom":-900,"shadow-camera-near":100,"shadow-camera-far":5e3,"shadow-bias":-4e-4}),(0,B.jsxs)(S,{resolution:128,frames:1,children:[(0,B.jsx)(E,{form:`rect`,intensity:3,position:[0,0,1200],scale:[1600,1600,1]}),(0,B.jsx)(E,{form:`rect`,intensity:1.2,position:[1400,-600,400],rotation:[0,Math.PI/2,0],scale:[900,500,1]}),(0,B.jsx)(E,{form:`rect`,intensity:.8,position:[-1400,700,300],rotation:[0,-Math.PI/2,0],scale:[900,500,1]})]}),(0,B.jsx)(f,{geometry:e}),(0,B.jsx)(G,{store:t}),(0,B.jsx)(y,{geometry:e,store:t}),(0,B.jsx)(H,{geometry:e,store:t}),(0,B.jsxs)(`group`,{position:[0,0,h],children:[(0,B.jsx)(C,{rotation:[Math.PI/2,0,0],scale:2200,far:900,blur:2.2,opacity:.45,resolution:512}),(0,B.jsx)(z,{rotation:[Math.PI/2,0,0],position:[0,0,-.5],cellSize:50,sectionSize:250,cellColor:r,sectionColor:r,cellThickness:.6,sectionThickness:1.1,fadeDistance:3200,fadeStrength:1.5,infiniteGrid:!0})]})]})}function Z(e,t){let n=F(e,t);return{pose:e,top:n.top,lengths:n.lengths,status:n.status}}var Q=[`x`,`y`,`z`,`roll`,`pitch`,`yaw`];function $(e,t,n){let r={...e};for(let i of Q){let a=t[i]-e[i];r[i]=Math.abs(a)<1e-4?t[i]:e[i]+a*n}return r}function te(e,t){return Math.abs(e.x-t.x)<1&&Math.abs(e.y-t.y)<1&&Math.abs(e.z-t.z)<1&&Math.abs(e.roll-t.roll)<.3&&Math.abs(e.pitch-t.pitch)<.3&&Math.abs(e.yaw-t.yaw)<.3}var ne=class{geometry;solid;ghost=null;live=null;liveAt=0;target=null;reducedMotion;source;constructor(e,t,n=`auto`){this.geometry=e,this.solid=Z(I(e.home_z),e),this.reducedMotion=t,this.source=n}setGeometry(e){this.geometry=e}setTarget(e){this.target=e}setLive(e,t=performance.now()){this.live=e,this.liveAt=t}freshLive(e=performance.now()){return this.live&&e-this.liveAt<1500?this.live:null}currentTarget(){return this.target}step(e,t=performance.now()){let n=this.freshLive(t),r=I(this.geometry.home_z),i,a=null;this.source===`target`?i=this.target??r:this.source===`live`?i=n??this.solid.pose:(i=n??this.target??r,a=n&&this.target&&!te(n,this.target)?this.target:null);let o=this.reducedMotion?1:Math.min(1,e*14);this.solid=Z($(this.solid.pose,i,o),this.geometry),this.ghost=a?Z($(this.ghost?.pose??a,a,o),this.geometry):null}};export{X as a,Y as i,Z as n,H as o,q as r,ne as t};