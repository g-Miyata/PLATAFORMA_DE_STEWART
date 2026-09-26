import{A as e,F as t,M as n}from"./geometry-Pfm3D84W.js";import{a as r}from"./kinematics-DPwKWD-x.js";import{B as i,Bt as a,C as o,Dt as s,E as c,Et as l,K as u,Kt as d,Lt as f,Nt as p,Ot as m,Q as h,Rt as g,U as _,V as v,cn as ee,dn as y,et as te,fn as b,j as x,kt as S,ln as C,lt as ne,mn as re,qt as w,rn as T,un as E,vt as D}from"./ModelSlot-UFrcvjzl.js";import{d as ie,g as O,m as k}from"./PremiumParts-C5zmdTWV.js";import{a as A,c as j,i as M,n as N,o as P,r as F,s as I,t as L}from"./dist-BxF7mU-E.js";import{n as R}from"./pistons-zXUPA1Rx.js";import{t as z}from"./PremiumBase-Bn6jXULb.js";import{t as B}from"./PremiumRig-y_F8KWcb.js";import{n as V,t as H}from"./Studio-D0acraKz.js";import{n as U}from"./PresentationPage-CraeJn7_.js";var ae=class extends w{constructor(e=new C){super({uniforms:{inputBuffer:new T(null),depthBuffer:new T(null),resolution:new T(new C),texelSize:new T(new C),halfTexelSize:new T(new C),kernel:new T(0),scale:new T(1),cameraNear:new T(0),cameraFar:new T(1),minDepthThreshold:new T(0),maxDepthThreshold:new T(1),depthScale:new T(0),depthToBlurRatioBias:new T(.25)},fragmentShader:`#include <common>
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
          #include <${k>=154?`colorspace_fragment`:`encodings_fragment`}>
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
        }`,blending:0,depthWrite:!1,depthTest:!1}),this.toneMapped=!1,this.setTexelSize(e.x,e.y),this.kernel=new Float32Array([0,1,2,2,3])}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t),this.uniforms.halfTexelSize.value.set(e,t).multiplyScalar(.5)}setResolution(e){this.uniforms.resolution.value.copy(e)}},oe=class{constructor({gl:e,resolution:t,width:n=500,height:r=500,minDepthThreshold:a=0,maxDepthThreshold:o=1,depthScale:s=0,depthToBlurRatioBias:c=.25}){this.renderToScreen=!1,this.renderTargetA=new b(t,t,{minFilter:D,magFilter:D,stencilBuffer:!1,depthBuffer:!1,type:ne}),this.renderTargetB=this.renderTargetA.clone(),this.convolutionMaterial=new ae,this.convolutionMaterial.setTexelSize(1/n,1/r),this.convolutionMaterial.setResolution(new C(n,r)),this.scene=new d,this.camera=new _,this.convolutionMaterial.uniforms.minDepthThreshold.value=a,this.convolutionMaterial.uniforms.maxDepthThreshold.value=o,this.convolutionMaterial.uniforms.depthScale.value=s,this.convolutionMaterial.uniforms.depthToBlurRatioBias.value=c,this.convolutionMaterial.defines.USE_DEPTH=s>0;let l=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),u=new Float32Array([0,0,2,0,0,2]),f=new v;f.setAttribute(`position`,new i(l,3)),f.setAttribute(`uv`,new i(u,2)),this.screen=new m(f,this.convolutionMaterial),this.screen.frustumCulled=!1,this.scene.add(this.screen)}render(e,t,n){let r=this.scene,i=this.camera,a=this.renderTargetA,o=this.renderTargetB,s=this.convolutionMaterial,c=s.uniforms;c.depthBuffer.value=t.depthTexture;let l=s.kernel,u=t,d,f,p;for(f=0,p=l.length-1;f<p;++f)d=f&1?o:a,c.kernel.value=l[f],c.inputBuffer.value=u.texture,e.setRenderTarget(d),e.render(r,i),u=d;c.kernel.value=l[f],c.inputBuffer.value=u.texture,e.setRenderTarget(this.renderToScreen?null:n),e.render(r,i)}},se=class extends p{constructor(e={}){super(e),this._tDepth={value:null},this._distortionMap={value:null},this._tDiffuse={value:null},this._tDiffuseBlur={value:null},this._textureMatrix={value:null},this._hasBlur={value:!1},this._mirror={value:0},this._mixBlur={value:0},this._blurStrength={value:.5},this._minDepthThreshold={value:.9},this._maxDepthThreshold={value:1},this._depthScale={value:0},this._depthToBlurRatioBias={value:.25},this._distortion={value:1},this._mixContrast={value:1},this.setValues(e)}onBeforeCompile(e){var t;(t=e.defines)!=null&&t.USE_UV||(e.defines.USE_UV=``),e.uniforms.hasBlur=this._hasBlur,e.uniforms.tDiffuse=this._tDiffuse,e.uniforms.tDepth=this._tDepth,e.uniforms.distortionMap=this._distortionMap,e.uniforms.tDiffuseBlur=this._tDiffuseBlur,e.uniforms.textureMatrix=this._textureMatrix,e.uniforms.mirror=this._mirror,e.uniforms.mixBlur=this._mixBlur,e.uniforms.mixStrength=this._blurStrength,e.uniforms.minDepthThreshold=this._minDepthThreshold,e.uniforms.maxDepthThreshold=this._maxDepthThreshold,e.uniforms.depthScale=this._depthScale,e.uniforms.depthToBlurRatioBias=this._depthToBlurRatioBias,e.uniforms.distortion=this._distortion,e.uniforms.mixContrast=this._mixContrast,e.vertexShader=`
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
      `)}get tDiffuse(){return this._tDiffuse.value}set tDiffuse(e){this._tDiffuse.value=e}get tDepth(){return this._tDepth.value}set tDepth(e){this._tDepth.value=e}get distortionMap(){return this._distortionMap.value}set distortionMap(e){this._distortionMap.value=e}get tDiffuseBlur(){return this._tDiffuseBlur.value}set tDiffuseBlur(e){this._tDiffuseBlur.value=e}get textureMatrix(){return this._textureMatrix.value}set textureMatrix(e){this._textureMatrix.value=e}get hasBlur(){return this._hasBlur.value}set hasBlur(e){this._hasBlur.value=e}get mirror(){return this._mirror.value}set mirror(e){this._mirror.value=e}get mixBlur(){return this._mixBlur.value}set mixBlur(e){this._mixBlur.value=e}get mixStrength(){return this._blurStrength.value}set mixStrength(e){this._blurStrength.value=e}get minDepthThreshold(){return this._minDepthThreshold.value}set minDepthThreshold(e){this._minDepthThreshold.value=e}get maxDepthThreshold(){return this._maxDepthThreshold.value}set maxDepthThreshold(e){this._maxDepthThreshold.value=e}get depthScale(){return this._depthScale.value}set depthScale(e){this._depthScale.value=e}get depthToBlurRatioBias(){return this._depthToBlurRatioBias.value}set depthToBlurRatioBias(e){this._depthToBlurRatioBias.value=e}get distortion(){return this._distortion.value}set distortion(e){this._distortion.value=e}get mixContrast(){return this._mixContrast.value}set mixContrast(e){this._mixContrast.value=e}},W=t(n()),G=W.forwardRef(({mixBlur:e=0,mixStrength:t=1,resolution:n=256,blur:r=[0,0],minDepthThreshold:i=.9,maxDepthThreshold:a=1,depthScale:l=0,depthToBlurRatioBias:u=.25,mirror:d=0,distortion:p=1,mixContrast:m=1,distortionMap:_,reflectorOffset:v=0,...S},C)=>{o({MeshReflectorMaterialImpl:se});let w=x(({gl:e})=>e),T=x(({camera:e})=>e),ie=x(({scene:e})=>e);r=Array.isArray(r)?r:[r,r];let O=r[0]+r[1]>0,k=r[0],A=r[1],j=W.useRef(null);W.useImperativeHandle(C,()=>j.current,[]);let[M]=W.useState(()=>new g),[N]=W.useState(()=>new E),[P]=W.useState(()=>new E),[F]=W.useState(()=>new E),[I]=W.useState(()=>new s),[L]=W.useState(()=>new E(0,0,-1)),[R]=W.useState(()=>new y),[z]=W.useState(()=>new E),[B]=W.useState(()=>new E),[V]=W.useState(()=>new y),[H]=W.useState(()=>new s),[U]=W.useState(()=>new f),ae=W.useCallback(()=>{var e;let t=j.current.parent||((e=j.current)==null||(e=e.__r3f.parent)==null?void 0:e.object);if(!t||(P.setFromMatrixPosition(t.matrixWorld),F.setFromMatrixPosition(T.matrixWorld),I.extractRotation(t.matrixWorld),N.set(0,0,1),N.applyMatrix4(I),P.addScaledVector(N,v),z.subVectors(P,F),z.dot(N)>0))return;z.reflect(N).negate(),z.add(P),I.extractRotation(T.matrixWorld),L.set(0,0,-1),L.applyMatrix4(I),L.add(F),B.subVectors(P,L),B.reflect(N).negate(),B.add(P),U.position.copy(z),U.up.set(0,1,0),U.up.applyMatrix4(I),U.up.reflect(N),U.lookAt(B),U.far=T.far,U.updateMatrixWorld(),U.projectionMatrix.copy(T.projectionMatrix),H.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),H.multiply(U.projectionMatrix),H.multiply(U.matrixWorldInverse),H.multiply(t.matrixWorld),M.setFromNormalAndCoplanarPoint(N,P),M.applyMatrix4(U.matrixWorldInverse),R.set(M.normal.x,M.normal.y,M.normal.z,M.constant);let n=U.projectionMatrix;V.x=(Math.sign(R.x)+n.elements[8])/n.elements[0],V.y=(Math.sign(R.y)+n.elements[9])/n.elements[5],V.z=-1,V.w=(1+n.elements[10])/n.elements[14],R.multiplyScalar(2/R.dot(V)),n.elements[2]=R.x,n.elements[6]=R.y,n.elements[10]=R.z+1,n.elements[14]=R.w},[T,v]),[G,ce,K,q]=W.useMemo(()=>{let r={minFilter:D,magFilter:D,type:ne},o=new b(n,n,r);o.depthBuffer=!0,o.depthTexture=new te(n,n),o.depthTexture.format=h,o.depthTexture.type=ee;let s=new b(n,n,r);return[o,s,new oe({gl:w,resolution:n,width:k,height:A,minDepthThreshold:i,maxDepthThreshold:a,depthScale:l,depthToBlurRatioBias:u}),{mirror:d,textureMatrix:H,mixBlur:e,tDiffuse:o.texture,tDepth:o.depthTexture,tDiffuseBlur:s.texture,hasBlur:O,mixStrength:t,minDepthThreshold:i,maxDepthThreshold:a,depthScale:l,depthToBlurRatioBias:u,distortion:p,distortionMap:_,mixContrast:m,"defines-USE_BLUR":O?``:void 0,"defines-USE_DEPTH":l>0?``:void 0,"defines-USE_DISTORTION":_?``:void 0}]},[w,k,A,H,n,d,O,e,t,i,a,l,u,p,_,m]);return c(()=>{var e;let t=j.current.parent||((e=j.current)==null||(e=e.__r3f.parent)==null?void 0:e.object);if(!t)return;t.visible=!1;let n=w.xr.enabled,r=w.shadowMap.autoUpdate;ae(),w.xr.enabled=!1,w.shadowMap.autoUpdate=!1,w.setRenderTarget(G),w.state.buffers.depth.setMask(!0),w.autoClear||w.clear(),w.render(ie,U),O&&K.render(w,G,ce),w.xr.enabled=n,w.shadowMap.autoUpdate=r,t.visible=!0,w.setRenderTarget(null)}),W.createElement(`meshReflectorMaterialImpl`,re({attach:`material`,key:`key`+q[`defines-USE_BLUR`]+q[`defines-USE_DEPTH`]+q[`defines-USE_DISTORTION`],ref:j},q,S))}),ce=class extends w{constructor(){super({uniforms:{time:{value:0},pixelRatio:{value:1}},vertexShader:`
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
          #include <${k>=154?`colorspace_fragment`:`encodings_fragment`}>
        }
      `})}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}get pixelRatio(){return this.uniforms.pixelRatio.value}set pixelRatio(e){this.uniforms.pixelRatio.value=e}},K=e=>e&&e.constructor===Float32Array,q=e=>[e.r,e.g,e.b],le=e=>e instanceof C||e instanceof E||e instanceof y,ue=e=>Array.isArray(e)?e:le(e)?e.toArray():[e,e,e];function J(e,t,n){return W.useMemo(()=>{if(t!==void 0){if(K(t))return t;if(t instanceof u){let n=Array.from({length:e*3},()=>q(t)).flat();return Float32Array.from(n)}if(le(t)||Array.isArray(t)){let n=Array.from({length:e*3},()=>ue(t)).flat();return Float32Array.from(n)}return Float32Array.from({length:e},()=>t)}return Float32Array.from({length:e},n)},[t])}var de=W.forwardRef(({noise:e=1,count:t=100,speed:n=1,opacity:r=1,scale:i=1,size:a,color:s,children:d,...f},p)=>{W.useMemo(()=>o({SparklesImplMaterial:ce}),[]);let m=W.useRef(null),h=x(e=>e.viewport.dpr),g=ue(i),_=W.useMemo(()=>Float32Array.from(Array.from({length:t},()=>g.map(l.randFloatSpread)).flat()),[t,...g]),v=J(t,a,Math.random),ee=J(t,r),y=J(t,n),te=J(t*3,e),b=J(s===void 0?t*3:t,K(s)?s:new u(s),()=>1);return c(e=>{m.current&&m.current.material&&(m.current.material.time=e.clock.elapsedTime)}),W.useImperativeHandle(p,()=>m.current,[]),W.createElement(`points`,re({key:`particle-${t}-${JSON.stringify(i)}`},f,{ref:m}),W.createElement(`bufferGeometry`,null,W.createElement(`bufferAttribute`,{attach:`attributes-position`,args:[_,3]}),W.createElement(`bufferAttribute`,{attach:`attributes-size`,args:[v,1]}),W.createElement(`bufferAttribute`,{attach:`attributes-opacity`,args:[ee,1]}),W.createElement(`bufferAttribute`,{attach:`attributes-speed`,args:[y,1]}),W.createElement(`bufferAttribute`,{attach:`attributes-color`,args:[b,3]}),W.createElement(`bufferAttribute`,{attach:`attributes-noise`,args:[te,3]})),d||W.createElement(`sparklesImplMaterial`,{transparent:!0,pixelRatio:h,depthWrite:!1}))}),Y=e(),X=`#05080a`,Z=`#3fb654`;function fe({onFrame:e}){return c((t,n)=>e(Math.min(n,.1))),null}function pe({getFrame:e,instant:t}){let n=(0,W.useRef)(new E(0,0,170)),r=(0,W.useRef)(new E),i=(0,W.useRef)(new E),a=(0,W.useRef)(!0),o=x(e=>e.size),s=x(e=>e.camera);return(0,W.useEffect)(()=>{o.width/o.height>1.25&&o.width>=900?s.setViewOffset(o.width,o.height,-o.width*.2,0,o.width,o.height):s.clearViewOffset(),s.updateProjectionMatrix()},[s,o.width,o.height]),c((o,c)=>{let{shot:l}=e();r.current.set(...U(l));let u=t||a.current?1:1-Math.exp(-Math.min(c,.1)*1.6);a.current=!1,s.position.lerp(r.current,u),n.current.lerp(i.current.set(0,0,l.targetZ),u),s.lookAt(n.current)}),null}var me=new E(0,1,0),he=R.map(e=>new S({color:new u(e).multiplyScalar(2.2),transparent:!0,opacity:0,toneMapped:!1,depthWrite:!1,depthTest:!1})),Q={a:new E,b:new E,d:new E,q:new a},ge=new S({color:`#ffffff`,toneMapped:!1,transparent:!0,opacity:.95}),$={color:new u,q:new a,dir:new E,z:new E(0,0,1)};function _e({geometry:e,getFrame:t}){let n=(0,W.useRef)([]);return c((i,a)=>{let{pose:o,legs:s}=t(),c=r(o,e.platform_points_local);for(let t=0;t<6;t++){let r=n.current[t];if(!r)continue;let i=s===`all`||s===t,o=he[t];if(o.opacity+=((i?.7:0)-o.opacity)*Math.min(1,a*5),r.visible=o.opacity>.02,!r.visible)continue;Q.a.set(...e.base_points[t]),Q.b.set(...c[t]),Q.d.subVectors(Q.b,Q.a);let l=Q.d.length();r.position.addVectors(Q.a,Q.b).multiplyScalar(.5),r.quaternion.copy(Q.q.setFromUnitVectors(me,Q.d.normalize())),r.scale.set(1,l,1)}}),(0,Y.jsx)(`group`,{children:he.map((e,t)=>(0,Y.jsx)(`mesh`,{ref:e=>{n.current[t]=e},material:e,renderOrder:20,children:(0,Y.jsx)(`cylinderGeometry`,{args:[10,10,1,16,1,!0]})},t))})}var ve={x:[1,0,0],y:[0,1,0],z:[0,0,1],roll:[1,0,0],pitch:[0,1,0],yaw:[0,0,1]},ye={x:`#ff5a5a`,y:`#5dff7a`,z:`#5aa8ff`,roll:`#ff5a5a`,pitch:`#5dff7a`,yaw:`#5aa8ff`};function be({getFrame:e}){let t=(0,W.useRef)(null),n=(0,W.useRef)(null),r=ge;return c(()=>{let{pose:r,axis:i}=e(),a=i===`roll`||i===`pitch`||i===`yaw`;if(t.current&&(t.current.visible=!!i&&!a),n.current&&(n.current.visible=!!i&&a),!i)return;ge.color.copy($.color.set(ye[i]).multiplyScalar(1.8)),$.dir.set(...ve[i]);let o=a?n.current:t.current;o&&(o.position.set(r.x,r.y,r.z+70),o.quaternion.copy($.q.setFromUnitVectors(a?$.z:me,$.dir)))}),(0,Y.jsxs)(Y.Fragment,{children:[(0,Y.jsxs)(`group`,{ref:t,visible:!1,children:[(0,Y.jsx)(`mesh`,{material:r,position:[0,0,0],children:(0,Y.jsx)(`cylinderGeometry`,{args:[6,6,300,16]})}),(0,Y.jsx)(`mesh`,{material:r,position:[0,175,0],children:(0,Y.jsx)(`coneGeometry`,{args:[20,50,24]})}),(0,Y.jsx)(`mesh`,{material:r,position:[0,-175,0],rotation:[Math.PI,0,0],children:(0,Y.jsx)(`coneGeometry`,{args:[20,50,24]})})]}),(0,Y.jsxs)(`group`,{ref:n,visible:!1,children:[(0,Y.jsx)(`mesh`,{material:r,children:(0,Y.jsx)(`torusGeometry`,{args:[230,6,12,96,Math.PI*1.6]})}),(0,Y.jsx)(`mesh`,{material:r,position:[230*Math.cos(Math.PI*1.6),230*Math.sin(Math.PI*1.6),0],rotation:[0,0,Math.PI*1.6],children:(0,Y.jsx)(`coneGeometry`,{args:[18,46,24]})})]})]})}function xe(){return(0,Y.jsxs)(`group`,{position:[0,0,z],children:[(0,Y.jsxs)(`mesh`,{position:[0,0,-1],receiveShadow:!0,children:[(0,Y.jsx)(`circleGeometry`,{args:[9e3,96]}),(0,Y.jsx)(G,{resolution:512,blur:[400,120],mixBlur:1,mixStrength:1.6,roughness:.85,depthScale:.6,minDepthThreshold:.4,maxDepthThreshold:1.2,color:`#0b1110`,metalness:.4,mirror:.4})]}),(0,Y.jsx)(ie,{rotation:[Math.PI/2,0,0],scale:2400,far:1e3,blur:2.6,opacity:.7,resolution:1024}),(0,Y.jsxs)(`mesh`,{position:[0,0,1],children:[(0,Y.jsx)(`ringGeometry`,{args:[520,560,128]}),(0,Y.jsx)(`meshBasicMaterial`,{color:new u(Z).multiplyScalar(1.6),toneMapped:!1,transparent:!0,opacity:.55})]})]})}function Se({geometry:e,getFrame:t,onFrame:n,reducedMotion:r}){let[i,a]=(0,W.useState)(!0);return(0,Y.jsxs)(O,{shadows:!0,dpr:i?[1,2]:[1,1.25],camera:{position:[1650,-1900,1150],up:[0,0,1],fov:30,near:5,far:3e4},gl:{antialias:!i,toneMapping:6,toneMappingExposure:1.1},children:[(0,Y.jsx)(`color`,{attach:`background`,args:[X]}),(0,Y.jsx)(`fog`,{attach:`fog`,args:[X,4800,11e3]}),(0,Y.jsx)(j,{onDecline:()=>a(!1)}),n&&(0,Y.jsx)(fe,{onFrame:n}),(0,Y.jsx)(pe,{getFrame:t,instant:r}),(0,Y.jsx)(H,{high:i}),(0,Y.jsx)(`spotLight`,{position:[-1400,1500,1500],angle:.5,penumbra:.8,intensity:5e6,distance:0,decay:2,color:Z}),(0,Y.jsx)(`spotLight`,{position:[1800,1200,600],angle:.45,penumbra:.9,intensity:5e6,distance:0,decay:2,color:`#6aa8ff`}),(0,Y.jsx)(B,{geometry:e,getPose:()=>t().pose}),(0,Y.jsx)(_e,{geometry:e,getFrame:t}),(0,Y.jsx)(be,{getFrame:t}),!r&&(0,Y.jsx)(de,{count:70,scale:[2600,2600,1200],position:[0,0,500],size:6,speed:.25,opacity:.5,color:Z}),i?(0,Y.jsx)(xe,{}):(0,Y.jsx)(V,{color:X,high:!1}),i&&(0,Y.jsxs)(N,{multisampling:0,children:[(0,Y.jsx)(F,{aoRadius:90,intensity:2,distanceFalloff:.7,halfRes:!0}),(0,Y.jsx)(L,{luminanceThreshold:.9,luminanceSmoothing:.2,intensity:r?.4:.9,mipmapBlur:!0}),(0,Y.jsx)(A,{mode:I.AGX}),(0,Y.jsx)(P,{offset:.25,darkness:.75}),(0,Y.jsx)(M,{})]})]})}export{Se as ExhibitCanvas};