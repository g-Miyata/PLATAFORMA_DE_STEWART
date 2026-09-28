import{J as e,K as t,Z as n}from"./geometry-C2tUSae9.js";import{c as r}from"./SceneHud-CpMyr2Db.js";import{o as i}from"./kinematics-C7D-qTcS.js";import{At as a,B as o,Bt as s,C as c,E as l,Et as u,Ht as d,Jt as f,K as p,Ot as m,Pt as h,Q as g,U as _,V as v,Yt as y,an as b,dn as x,et as ee,fn as S,gn as C,j as w,kt as T,lt as te,mn as E,pn as D,un as ne,vt as O,zt as re}from"./ModelSlot-BMdQzSMh.js";import{f as k,h as A,u as j}from"./PremiumParts-c-KHX9_6.js";import{a as M,c as N,i as P,n as F,o as I,r as L,s as R,t as z}from"./dist-CcALsxwX.js";import{n as B}from"./pistons-zXUPA1Rx.js";import{t as V}from"./PremiumBase-D8lkewI8.js";import{t as H}from"./PremiumRig-Cvax9g5o.js";import{n as U,t as W}from"./Studio-BLzIGWxX.js";var ie=class extends y{constructor(e=new x){super({uniforms:{inputBuffer:new b(null),depthBuffer:new b(null),resolution:new b(new x),texelSize:new b(new x),halfTexelSize:new b(new x),kernel:new b(0),scale:new b(1),cameraNear:new b(0),cameraFar:new b(1),minDepthThreshold:new b(0),maxDepthThreshold:new b(1),depthScale:new b(0),depthToBlurRatioBias:new b(.25)},fragmentShader:`#include <common>
        #include <dithering_pars_fragment>      
        uniform sampler2D inputBuffer;
        uniform sampler2D depthBuffer;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float minDepthThreshold;
        uniform float maxDepthThreshold;
        uniform float depthScale;
        uniform float depthToBlurRatioBias;
        varying vec2 vUv;
        varying vec2 vUv0;
        varying vec2 vUv1;
        varying vec2 vUv2;
        varying vec2 vUv3;

        void main() {
          float depthFactor = 0.0;
          
          #ifdef USE_DEPTH
            vec4 depth = texture2D(depthBuffer, vUv);
            depthFactor = smoothstep(minDepthThreshold, maxDepthThreshold, 1.0-(depth.r * depth.a));
            depthFactor *= depthScale;
            depthFactor = max(0.0, min(1.0, depthFactor + 0.25));
          #endif
          
          vec4 sum = texture2D(inputBuffer, mix(vUv0, vUv, depthFactor));
          sum += texture2D(inputBuffer, mix(vUv1, vUv, depthFactor));
          sum += texture2D(inputBuffer, mix(vUv2, vUv, depthFactor));
          sum += texture2D(inputBuffer, mix(vUv3, vUv, depthFactor));
          gl_FragColor = sum * 0.25 ;

          #include <dithering_fragment>
          #include <tonemapping_fragment>
          #include <${A>=154?`colorspace_fragment`:`encodings_fragment`}>
        }`,vertexShader:`uniform vec2 texelSize;
        uniform vec2 halfTexelSize;
        uniform float kernel;
        uniform float scale;
        varying vec2 vUv;
        varying vec2 vUv0;
        varying vec2 vUv1;
        varying vec2 vUv2;
        varying vec2 vUv3;

        void main() {
          vec2 uv = position.xy * 0.5 + 0.5;
          vUv = uv;

          vec2 dUv = (texelSize * vec2(kernel) + halfTexelSize) * scale;
          vUv0 = vec2(uv.x - dUv.x, uv.y + dUv.y);
          vUv1 = vec2(uv.x + dUv.x, uv.y + dUv.y);
          vUv2 = vec2(uv.x + dUv.x, uv.y - dUv.y);
          vUv3 = vec2(uv.x - dUv.x, uv.y - dUv.y);

          gl_Position = vec4(position.xy, 1.0, 1.0);
        }`,blending:0,depthWrite:!1,depthTest:!1}),this.toneMapped=!1,this.setTexelSize(e.x,e.y),this.kernel=new Float32Array([0,1,2,2,3])}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t),this.uniforms.halfTexelSize.value.set(e,t).multiplyScalar(.5)}setResolution(e){this.uniforms.resolution.value.copy(e)}},ae=class{constructor({gl:e,resolution:t,width:n=500,height:r=500,minDepthThreshold:i=0,maxDepthThreshold:a=1,depthScale:s=0,depthToBlurRatioBias:c=.25}){this.renderToScreen=!1,this.renderTargetA=new E(t,t,{minFilter:O,magFilter:O,stencilBuffer:!1,depthBuffer:!1,type:te}),this.renderTargetB=this.renderTargetA.clone(),this.convolutionMaterial=new ie,this.convolutionMaterial.setTexelSize(1/n,1/r),this.convolutionMaterial.setResolution(new x(n,r)),this.scene=new f,this.camera=new _,this.convolutionMaterial.uniforms.minDepthThreshold.value=i,this.convolutionMaterial.uniforms.maxDepthThreshold.value=a,this.convolutionMaterial.uniforms.depthScale.value=s,this.convolutionMaterial.uniforms.depthToBlurRatioBias.value=c,this.convolutionMaterial.defines.USE_DEPTH=s>0;let l=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),u=new Float32Array([0,0,2,0,0,2]),d=new v;d.setAttribute(`position`,new o(l,3)),d.setAttribute(`uv`,new o(u,2)),this.screen=new T(d,this.convolutionMaterial),this.screen.frustumCulled=!1,this.scene.add(this.screen)}render(e,t,n){let r=this.scene,i=this.camera,a=this.renderTargetA,o=this.renderTargetB,s=this.convolutionMaterial,c=s.uniforms;c.depthBuffer.value=t.depthTexture;let l=s.kernel,u=t,d,f,p;for(f=0,p=l.length-1;f<p;++f)d=f&1?o:a,c.kernel.value=l[f],c.inputBuffer.value=u.texture,e.setRenderTarget(d),e.render(r,i),u=d;c.kernel.value=l[f],c.inputBuffer.value=u.texture,e.setRenderTarget(this.renderToScreen?null:n),e.render(r,i)}},oe=class extends h{constructor(e={}){super(e),this._tDepth={value:null},this._distortionMap={value:null},this._tDiffuse={value:null},this._tDiffuseBlur={value:null},this._textureMatrix={value:null},this._hasBlur={value:!1},this._mirror={value:0},this._mixBlur={value:0},this._blurStrength={value:.5},this._minDepthThreshold={value:.9},this._maxDepthThreshold={value:1},this._depthScale={value:0},this._depthToBlurRatioBias={value:.25},this._distortion={value:1},this._mixContrast={value:1},this.setValues(e)}onBeforeCompile(e){var t;(t=e.defines)!=null&&t.USE_UV||(e.defines.USE_UV=``),e.uniforms.hasBlur=this._hasBlur,e.uniforms.tDiffuse=this._tDiffuse,e.uniforms.tDepth=this._tDepth,e.uniforms.distortionMap=this._distortionMap,e.uniforms.tDiffuseBlur=this._tDiffuseBlur,e.uniforms.textureMatrix=this._textureMatrix,e.uniforms.mirror=this._mirror,e.uniforms.mixBlur=this._mixBlur,e.uniforms.mixStrength=this._blurStrength,e.uniforms.minDepthThreshold=this._minDepthThreshold,e.uniforms.maxDepthThreshold=this._maxDepthThreshold,e.uniforms.depthScale=this._depthScale,e.uniforms.depthToBlurRatioBias=this._depthToBlurRatioBias,e.uniforms.distortion=this._distortion,e.uniforms.mixContrast=this._mixContrast,e.vertexShader=`
        uniform mat4 textureMatrix;
        varying vec4 my_vUv;
      ${e.vertexShader}`,e.vertexShader=e.vertexShader.replace(`#include <project_vertex>`,`#include <project_vertex>
        my_vUv = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );`),e.fragmentShader=`
        uniform sampler2D tDiffuse;
        uniform sampler2D tDiffuseBlur;
        uniform sampler2D tDepth;
        uniform sampler2D distortionMap;
        uniform float distortion;
        uniform float cameraNear;
			  uniform float cameraFar;
        uniform bool hasBlur;
        uniform float mixBlur;
        uniform float mirror;
        uniform float mixStrength;
        uniform float minDepthThreshold;
        uniform float maxDepthThreshold;
        uniform float mixContrast;
        uniform float depthScale;
        uniform float depthToBlurRatioBias;
        varying vec4 my_vUv;
        ${e.fragmentShader}`,e.fragmentShader=e.fragmentShader.replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>

      float distortionFactor = 0.0;
      #ifdef USE_DISTORTION
        distortionFactor = texture2D(distortionMap, vUv).r * distortion;
      #endif

      vec4 new_vUv = my_vUv;
      new_vUv.x += distortionFactor;
      new_vUv.y += distortionFactor;

      vec4 base = texture2DProj(tDiffuse, new_vUv);
      vec4 blur = texture2DProj(tDiffuseBlur, new_vUv);

      vec4 merge = base;

      #ifdef USE_NORMALMAP
        vec2 normal_uv = vec2(0.0);
        vec4 normalColor = texture2D(normalMap, vUv * normalScale);
        vec3 my_normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );
        vec3 coord = new_vUv.xyz / new_vUv.w;
        normal_uv = coord.xy + coord.z * my_normal.xz * 0.05;
        vec4 base_normal = texture2D(tDiffuse, normal_uv);
        vec4 blur_normal = texture2D(tDiffuseBlur, normal_uv);
        merge = base_normal;
        blur = blur_normal;
      #endif

      float depthFactor = 0.0001;
      float blurFactor = 0.0;

      #ifdef USE_DEPTH
        vec4 depth = texture2DProj(tDepth, new_vUv);
        depthFactor = smoothstep(minDepthThreshold, maxDepthThreshold, 1.0-(depth.r * depth.a));
        depthFactor *= depthScale;
        depthFactor = max(0.0001, min(1.0, depthFactor));

        #ifdef USE_BLUR
          blur = blur * min(1.0, depthFactor + depthToBlurRatioBias);
          merge = merge * min(1.0, depthFactor + 0.5);
        #else
          merge = merge * depthFactor;
        #endif

      #endif

      float reflectorRoughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        vec4 reflectorTexelRoughness = texture2D( roughnessMap, vUv );
        reflectorRoughnessFactor *= reflectorTexelRoughness.g;
      #endif

      #ifdef USE_BLUR
        blurFactor = min(1.0, mixBlur * reflectorRoughnessFactor);
        merge = mix(merge, blur, blurFactor);
      #endif

      vec4 newMerge = vec4(0.0, 0.0, 0.0, 1.0);
      newMerge.r = (merge.r - 0.5) * mixContrast + 0.5;
      newMerge.g = (merge.g - 0.5) * mixContrast + 0.5;
      newMerge.b = (merge.b - 0.5) * mixContrast + 0.5;

      diffuseColor.rgb = diffuseColor.rgb * ((1.0 - min(1.0, mirror)) + newMerge.rgb * mixStrength);
      `)}get tDiffuse(){return this._tDiffuse.value}set tDiffuse(e){this._tDiffuse.value=e}get tDepth(){return this._tDepth.value}set tDepth(e){this._tDepth.value=e}get distortionMap(){return this._distortionMap.value}set distortionMap(e){this._distortionMap.value=e}get tDiffuseBlur(){return this._tDiffuseBlur.value}set tDiffuseBlur(e){this._tDiffuseBlur.value=e}get textureMatrix(){return this._textureMatrix.value}set textureMatrix(e){this._textureMatrix.value=e}get hasBlur(){return this._hasBlur.value}set hasBlur(e){this._hasBlur.value=e}get mirror(){return this._mirror.value}set mirror(e){this._mirror.value=e}get mixBlur(){return this._mixBlur.value}set mixBlur(e){this._mixBlur.value=e}get mixStrength(){return this._blurStrength.value}set mixStrength(e){this._blurStrength.value=e}get minDepthThreshold(){return this._minDepthThreshold.value}set minDepthThreshold(e){this._minDepthThreshold.value=e}get maxDepthThreshold(){return this._maxDepthThreshold.value}set maxDepthThreshold(e){this._maxDepthThreshold.value=e}get depthScale(){return this._depthScale.value}set depthScale(e){this._depthScale.value=e}get depthToBlurRatioBias(){return this._depthToBlurRatioBias.value}set depthToBlurRatioBias(e){this._depthToBlurRatioBias.value=e}get distortion(){return this._distortion.value}set distortion(e){this._distortion.value=e}get mixContrast(){return this._mixContrast.value}set mixContrast(e){this._mixContrast.value=e}},G=n(e()),K=G.forwardRef(({mixBlur:e=0,mixStrength:t=1,resolution:n=256,blur:r=[0,0],minDepthThreshold:i=.9,maxDepthThreshold:a=1,depthScale:o=0,depthToBlurRatioBias:u=.25,mirror:d=0,distortion:f=1,mixContrast:p=1,distortionMap:h,reflectorOffset:_=0,...v},y)=>{c({MeshReflectorMaterialImpl:oe});let b=w(({gl:e})=>e),x=w(({camera:e})=>e),T=w(({scene:e})=>e);r=Array.isArray(r)?r:[r,r];let k=r[0]+r[1]>0,A=r[0],j=r[1],M=G.useRef(null);G.useImperativeHandle(y,()=>M.current,[]);let[N]=G.useState(()=>new s),[P]=G.useState(()=>new S),[F]=G.useState(()=>new S),[I]=G.useState(()=>new S),[L]=G.useState(()=>new m),[R]=G.useState(()=>new S(0,0,-1)),[z]=G.useState(()=>new D),[B]=G.useState(()=>new S),[V]=G.useState(()=>new S),[H]=G.useState(()=>new D),[U]=G.useState(()=>new m),[W]=G.useState(()=>new re),ie=G.useCallback(()=>{var e;let t=M.current.parent||((e=M.current)==null||(e=e.__r3f.parent)==null?void 0:e.object);if(!t||(F.setFromMatrixPosition(t.matrixWorld),I.setFromMatrixPosition(x.matrixWorld),L.extractRotation(t.matrixWorld),P.set(0,0,1),P.applyMatrix4(L),F.addScaledVector(P,_),B.subVectors(F,I),B.dot(P)>0))return;B.reflect(P).negate(),B.add(F),L.extractRotation(x.matrixWorld),R.set(0,0,-1),R.applyMatrix4(L),R.add(I),V.subVectors(F,R),V.reflect(P).negate(),V.add(F),W.position.copy(B),W.up.set(0,1,0),W.up.applyMatrix4(L),W.up.reflect(P),W.lookAt(V),W.far=x.far,W.updateMatrixWorld(),W.projectionMatrix.copy(x.projectionMatrix),U.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),U.multiply(W.projectionMatrix),U.multiply(W.matrixWorldInverse),U.multiply(t.matrixWorld),N.setFromNormalAndCoplanarPoint(P,F),N.applyMatrix4(W.matrixWorldInverse),z.set(N.normal.x,N.normal.y,N.normal.z,N.constant);let n=W.projectionMatrix;H.x=(Math.sign(z.x)+n.elements[8])/n.elements[0],H.y=(Math.sign(z.y)+n.elements[9])/n.elements[5],H.z=-1,H.w=(1+n.elements[10])/n.elements[14],z.multiplyScalar(2/z.dot(H)),n.elements[2]=z.x,n.elements[6]=z.y,n.elements[10]=z.z+1,n.elements[14]=z.w},[x,_]),[K,se,q,J]=G.useMemo(()=>{let r={minFilter:O,magFilter:O,type:te},s=new E(n,n,r);s.depthBuffer=!0,s.depthTexture=new ee(n,n),s.depthTexture.format=g,s.depthTexture.type=ne;let c=new E(n,n,r);return[s,c,new ae({gl:b,resolution:n,width:A,height:j,minDepthThreshold:i,maxDepthThreshold:a,depthScale:o,depthToBlurRatioBias:u}),{mirror:d,textureMatrix:U,mixBlur:e,tDiffuse:s.texture,tDepth:s.depthTexture,tDiffuseBlur:c.texture,hasBlur:k,mixStrength:t,minDepthThreshold:i,maxDepthThreshold:a,depthScale:o,depthToBlurRatioBias:u,distortion:f,distortionMap:h,mixContrast:p,"defines-USE_BLUR":k?``:void 0,"defines-USE_DEPTH":o>0?``:void 0,"defines-USE_DISTORTION":h?``:void 0}]},[b,A,j,U,n,d,k,e,t,i,a,o,u,f,h,p]);return l(()=>{var e;let t=M.current.parent||((e=M.current)==null||(e=e.__r3f.parent)==null?void 0:e.object);if(!t)return;t.visible=!1;let n=b.xr.enabled,r=b.shadowMap.autoUpdate;ie(),b.xr.enabled=!1,b.shadowMap.autoUpdate=!1,b.setRenderTarget(K),b.state.buffers.depth.setMask(!0),b.autoClear||b.clear(),b.render(T,W),k&&q.render(b,K,se),b.xr.enabled=n,b.shadowMap.autoUpdate=r,t.visible=!0,b.setRenderTarget(null)}),G.createElement(`meshReflectorMaterialImpl`,C({attach:`material`,key:`key`+J[`defines-USE_BLUR`]+J[`defines-USE_DEPTH`]+J[`defines-USE_DISTORTION`],ref:M},J,v))}),se=class extends y{constructor(){super({uniforms:{time:{value:0},pixelRatio:{value:1}},vertexShader:`
        uniform float pixelRatio;
        uniform float time;
        attribute float size;  
        attribute float speed;  
        attribute float opacity;
        attribute vec3 noise;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vOpacity;

        void main() {
          vec4 modelPosition = modelMatrix * vec4(position, 1.0);
          modelPosition.y += sin(time * speed + modelPosition.x * noise.x * 100.0) * 0.2;
          modelPosition.z += cos(time * speed + modelPosition.x * noise.y * 100.0) * 0.2;
          modelPosition.x += cos(time * speed + modelPosition.x * noise.z * 100.0) * 0.2;
          vec4 viewPosition = viewMatrix * modelPosition;
          vec4 projectionPostion = projectionMatrix * viewPosition;
          gl_Position = projectionPostion;
          gl_PointSize = size * 25. * pixelRatio;
          gl_PointSize *= (1.0 / - viewPosition.z);
          vColor = color;
          vOpacity = opacity;
        }
      `,fragmentShader:`
        varying vec3 vColor;
        varying float vOpacity;
        void main() {
          float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
          float strength = 0.05 / distanceToCenter - 0.1;
          gl_FragColor = vec4(vColor, strength * vOpacity);
          #include <tonemapping_fragment>
          #include <${A>=154?`colorspace_fragment`:`encodings_fragment`}>
        }
      `})}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}get pixelRatio(){return this.uniforms.pixelRatio.value}set pixelRatio(e){this.uniforms.pixelRatio.value=e}},q=e=>e&&e.constructor===Float32Array,J=e=>[e.r,e.g,e.b],ce=e=>e instanceof x||e instanceof S||e instanceof D,le=e=>Array.isArray(e)?e:ce(e)?e.toArray():[e,e,e];function Y(e,t,n){return G.useMemo(()=>{if(t!==void 0){if(q(t))return t;if(t instanceof p){let n=Array.from({length:e*3},()=>J(t)).flat();return Float32Array.from(n)}if(ce(t)||Array.isArray(t)){let n=Array.from({length:e*3},()=>le(t)).flat();return Float32Array.from(n)}return Float32Array.from({length:e},()=>t)}return Float32Array.from({length:e},n)},[t])}var ue=G.forwardRef(({noise:e=1,count:t=100,speed:n=1,opacity:r=1,scale:i=1,size:a,color:o,children:s,...d},f)=>{G.useMemo(()=>c({SparklesImplMaterial:se}),[]);let m=G.useRef(null),h=w(e=>e.viewport.dpr),g=le(i),_=G.useMemo(()=>Float32Array.from(Array.from({length:t},()=>g.map(u.randFloatSpread)).flat()),[t,...g]),v=Y(t,a,Math.random),y=Y(t,r),b=Y(t,n),x=Y(t*3,e),ee=Y(o===void 0?t*3:t,q(o)?o:new p(o),()=>1);return l(e=>{m.current&&m.current.material&&(m.current.material.time=e.clock.elapsedTime)}),G.useImperativeHandle(f,()=>m.current,[]),G.createElement(`points`,C({key:`particle-${t}-${JSON.stringify(i)}`},d,{ref:m}),G.createElement(`bufferGeometry`,null,G.createElement(`bufferAttribute`,{attach:`attributes-position`,args:[_,3]}),G.createElement(`bufferAttribute`,{attach:`attributes-size`,args:[v,1]}),G.createElement(`bufferAttribute`,{attach:`attributes-opacity`,args:[y,1]}),G.createElement(`bufferAttribute`,{attach:`attributes-speed`,args:[b,1]}),G.createElement(`bufferAttribute`,{attach:`attributes-color`,args:[ee,3]}),G.createElement(`bufferAttribute`,{attach:`attributes-noise`,args:[x,3]})),s||G.createElement(`sparklesImplMaterial`,{transparent:!0,pixelRatio:h,depthWrite:!1}))}),X=t(),Z=`#3fb654`;function de({onFrame:e}){return l((t,n)=>e(Math.min(n,.1))),null}function fe({getFrame:e,instant:t}){let n=(0,G.useRef)(new S(0,0,170)),i=(0,G.useRef)(new S),a=(0,G.useRef)(new S),o=(0,G.useRef)(!0),s=w(e=>e.size),c=w(e=>e.camera);return(0,G.useEffect)(()=>{s.width/s.height>1.25&&s.width>=900?c.setViewOffset(s.width,s.height,-s.width*.2,0,s.width,s.height):c.clearViewOffset(),c.updateProjectionMatrix()},[c,s.width,s.height]),l((s,l)=>{let{shot:u}=e();i.current.set(...r(u));let d=t||o.current?1:1-Math.exp(-Math.min(l,.1)*1.6);o.current=!1,c.position.lerp(i.current,d),n.current.lerp(a.current.set(0,0,u.targetZ),d),c.lookAt(n.current)}),null}var pe=new S(0,1,0),me=B.map(e=>new a({color:new p(e).multiplyScalar(2.2),transparent:!0,opacity:0,toneMapped:!1,depthWrite:!1,depthTest:!1})),Q={a:new S,b:new S,d:new S,q:new d},he=new a({color:`#ffffff`,toneMapped:!1,transparent:!0,opacity:.95}),$={color:new p,q:new d,dir:new S,z:new S(0,0,1)};function ge({geometry:e,getFrame:t}){let n=(0,G.useRef)([]);return l((r,a)=>{let{pose:o,legs:s}=t(),c=i(o,e.platform_points_local);for(let t=0;t<6;t++){let r=n.current[t];if(!r)continue;let i=s===`all`||s===t,o=me[t];if(o.opacity+=((i?.7:0)-o.opacity)*Math.min(1,a*5),r.visible=o.opacity>.02,!r.visible)continue;Q.a.set(...e.base_points[t]),Q.b.set(...c[t]),Q.d.subVectors(Q.b,Q.a);let l=Q.d.length();r.position.addVectors(Q.a,Q.b).multiplyScalar(.5),r.quaternion.copy(Q.q.setFromUnitVectors(pe,Q.d.normalize())),r.scale.set(1,l,1)}}),(0,X.jsx)(`group`,{children:me.map((e,t)=>(0,X.jsx)(`mesh`,{ref:e=>{n.current[t]=e},material:e,renderOrder:20,children:(0,X.jsx)(`cylinderGeometry`,{args:[10,10,1,16,1,!0]})},t))})}var _e={x:[1,0,0],y:[0,1,0],z:[0,0,1],roll:[1,0,0],pitch:[0,1,0],yaw:[0,0,1]},ve={x:`#ff5a5a`,y:`#5dff7a`,z:`#5aa8ff`,roll:`#ff5a5a`,pitch:`#5dff7a`,yaw:`#5aa8ff`};function ye({getFrame:e}){let t=(0,G.useRef)(null),n=(0,G.useRef)(null),r=he;return l(()=>{let{pose:r,axis:i}=e(),a=i===`roll`||i===`pitch`||i===`yaw`;if(t.current&&(t.current.visible=!!i&&!a),n.current&&(n.current.visible=!!i&&a),!i)return;he.color.copy($.color.set(ve[i]).multiplyScalar(1.8)),$.dir.set(..._e[i]);let o=a?n.current:t.current;o&&(o.position.set(r.x,r.y,r.z+70),o.quaternion.copy($.q.setFromUnitVectors(a?$.z:pe,$.dir)))}),(0,X.jsxs)(X.Fragment,{children:[(0,X.jsxs)(`group`,{ref:t,visible:!1,children:[(0,X.jsx)(`mesh`,{material:r,position:[0,0,0],children:(0,X.jsx)(`cylinderGeometry`,{args:[6,6,300,16]})}),(0,X.jsx)(`mesh`,{material:r,position:[0,175,0],children:(0,X.jsx)(`coneGeometry`,{args:[20,50,24]})}),(0,X.jsx)(`mesh`,{material:r,position:[0,-175,0],rotation:[Math.PI,0,0],children:(0,X.jsx)(`coneGeometry`,{args:[20,50,24]})})]}),(0,X.jsxs)(`group`,{ref:n,visible:!1,children:[(0,X.jsx)(`mesh`,{material:r,children:(0,X.jsx)(`torusGeometry`,{args:[230,6,12,96,Math.PI*1.6]})}),(0,X.jsx)(`mesh`,{material:r,position:[230*Math.cos(Math.PI*1.6),230*Math.sin(Math.PI*1.6),0],rotation:[0,0,Math.PI*1.6],children:(0,X.jsx)(`coneGeometry`,{args:[18,46,24]})})]})]})}function be({color:e}){return(0,X.jsxs)(`group`,{position:[0,0,V],children:[(0,X.jsxs)(`mesh`,{position:[0,0,-1],receiveShadow:!0,children:[(0,X.jsx)(`circleGeometry`,{args:[9e3,96]}),(0,X.jsx)(K,{resolution:512,blur:[400,120],mixBlur:1,mixStrength:1.6,roughness:.85,depthScale:.6,minDepthThreshold:.4,maxDepthThreshold:1.2,color:e,metalness:.4,mirror:.4})]}),(0,X.jsx)(k,{rotation:[Math.PI/2,0,0],scale:2400,far:1e3,blur:2.6,opacity:.7,resolution:1024}),(0,X.jsxs)(`mesh`,{position:[0,0,1],children:[(0,X.jsx)(`ringGeometry`,{args:[520,560,128]}),(0,X.jsx)(`meshBasicMaterial`,{color:new p(Z).multiplyScalar(1.6),toneMapped:!1,transparent:!0,opacity:.55})]})]})}function xe({geometry:e,getFrame:t,onFrame:n,reducedMotion:r,bg:i,floor:a,dark:o}){let[s,c]=(0,G.useState)(!0);return(0,X.jsxs)(j,{shadows:!0,dpr:s?[1,2]:[1,1.25],camera:{position:[1650,-1900,1150],up:[0,0,1],fov:30,near:5,far:3e4},gl:{antialias:!s,toneMapping:6,toneMappingExposure:1.1},children:[(0,X.jsx)(`color`,{attach:`background`,args:[i]}),(0,X.jsx)(`fog`,{attach:`fog`,args:[i,4800,11e3]}),(0,X.jsx)(N,{onDecline:()=>c(!1)}),n&&(0,X.jsx)(de,{onFrame:n}),(0,X.jsx)(fe,{getFrame:t,instant:r}),(0,X.jsx)(W,{high:s}),(0,X.jsx)(`spotLight`,{position:[-1400,1500,1500],angle:.5,penumbra:.8,intensity:o?5e6:25e5,distance:0,decay:2,color:Z}),(0,X.jsx)(`spotLight`,{position:[1800,1200,600],angle:.45,penumbra:.9,intensity:o?5e6:25e5,distance:0,decay:2,color:`#6aa8ff`}),(0,X.jsx)(H,{geometry:e,getPose:()=>t().pose}),(0,X.jsx)(ge,{geometry:e,getFrame:t}),(0,X.jsx)(ye,{getFrame:t}),!r&&(0,X.jsx)(ue,{count:70,scale:[2600,2600,1200],position:[0,0,500],size:6,speed:.25,opacity:o?.5:.35,color:Z}),s?(0,X.jsx)(be,{color:a}):(0,X.jsx)(U,{color:i,high:!1}),s&&(0,X.jsxs)(F,{multisampling:0,children:[(0,X.jsx)(L,{aoRadius:90,intensity:2,distanceFalloff:.7,halfRes:!0}),(0,X.jsx)(z,{luminanceThreshold:.9,luminanceSmoothing:.2,intensity:r||!o?.4:.9,mipmapBlur:!0}),(0,X.jsx)(M,{mode:R.AGX}),(0,X.jsx)(I,{offset:.25,darkness:o?.75:.3}),(0,X.jsx)(P,{})]})]})}export{xe as ExhibitCanvas};