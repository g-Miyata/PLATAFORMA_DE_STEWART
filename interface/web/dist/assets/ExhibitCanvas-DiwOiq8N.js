import{C as e,O as t,T as n}from"./api-DnvS8MWF.js";import{c as r}from"./SceneHud-cqaeLuyp.js";import{At as i,B as a,Bt as o,C as s,E as c,Et as l,Ht as u,Jt as d,K as f,Ot as p,Pt as m,Q as h,U as g,V as _,Yt as v,an as y,dn as b,et as ee,fn as x,gn as te,j as S,kt as C,lt as w,mn as T,pn as E,un as ne,vt as D,zt as re}from"./ModelSlot-8HLdEP2X.js";import{f as ie,h as O,u as k}from"./PremiumParts-BT4YOyEI.js";import{a as A,c as j,i as M,n as N,o as P,r as F,s as I,t as L}from"./dist-KgU89l5y.js";import{l as R,n as z}from"./pistons-M3cL6g6A.js";import{t as B}from"./PremiumBase-BeAJWM1x.js";import{t as V}from"./PremiumRig-CZWmav1o.js";import{n as H,t as U}from"./Studio-Dpm8UTfW.js";var ae=class extends v{constructor(e=new b){super({uniforms:{inputBuffer:new y(null),depthBuffer:new y(null),resolution:new y(new b),texelSize:new y(new b),halfTexelSize:new y(new b),kernel:new y(0),scale:new y(1),cameraNear:new y(0),cameraFar:new y(1),minDepthThreshold:new y(0),maxDepthThreshold:new y(1),depthScale:new y(0),depthToBlurRatioBias:new y(.25)},fragmentShader:`#include <common>
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
          #include <${O>=154?`colorspace_fragment`:`encodings_fragment`}>
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
        }`,blending:0,depthWrite:!1,depthTest:!1}),this.toneMapped=!1,this.setTexelSize(e.x,e.y),this.kernel=new Float32Array([0,1,2,2,3])}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t),this.uniforms.halfTexelSize.value.set(e,t).multiplyScalar(.5)}setResolution(e){this.uniforms.resolution.value.copy(e)}},oe=class{constructor({gl:e,resolution:t,width:n=500,height:r=500,minDepthThreshold:i=0,maxDepthThreshold:o=1,depthScale:s=0,depthToBlurRatioBias:c=.25}){this.renderToScreen=!1,this.renderTargetA=new T(t,t,{minFilter:D,magFilter:D,stencilBuffer:!1,depthBuffer:!1,type:w}),this.renderTargetB=this.renderTargetA.clone(),this.convolutionMaterial=new ae,this.convolutionMaterial.setTexelSize(1/n,1/r),this.convolutionMaterial.setResolution(new b(n,r)),this.scene=new d,this.camera=new g,this.convolutionMaterial.uniforms.minDepthThreshold.value=i,this.convolutionMaterial.uniforms.maxDepthThreshold.value=o,this.convolutionMaterial.uniforms.depthScale.value=s,this.convolutionMaterial.uniforms.depthToBlurRatioBias.value=c,this.convolutionMaterial.defines.USE_DEPTH=s>0;let l=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),u=new Float32Array([0,0,2,0,0,2]),f=new _;f.setAttribute(`position`,new a(l,3)),f.setAttribute(`uv`,new a(u,2)),this.screen=new C(f,this.convolutionMaterial),this.screen.frustumCulled=!1,this.scene.add(this.screen)}render(e,t,n){let r=this.scene,i=this.camera,a=this.renderTargetA,o=this.renderTargetB,s=this.convolutionMaterial,c=s.uniforms;c.depthBuffer.value=t.depthTexture;let l=s.kernel,u=t,d,f,p;for(f=0,p=l.length-1;f<p;++f)d=f&1?o:a,c.kernel.value=l[f],c.inputBuffer.value=u.texture,e.setRenderTarget(d),e.render(r,i),u=d;c.kernel.value=l[f],c.inputBuffer.value=u.texture,e.setRenderTarget(this.renderToScreen?null:n),e.render(r,i)}},se=class extends m{constructor(e={}){super(e),this._tDepth={value:null},this._distortionMap={value:null},this._tDiffuse={value:null},this._tDiffuseBlur={value:null},this._textureMatrix={value:null},this._hasBlur={value:!1},this._mirror={value:0},this._mixBlur={value:0},this._blurStrength={value:.5},this._minDepthThreshold={value:.9},this._maxDepthThreshold={value:1},this._depthScale={value:0},this._depthToBlurRatioBias={value:.25},this._distortion={value:1},this._mixContrast={value:1},this.setValues(e)}onBeforeCompile(e){var t;(t=e.defines)!=null&&t.USE_UV||(e.defines.USE_UV=``),e.uniforms.hasBlur=this._hasBlur,e.uniforms.tDiffuse=this._tDiffuse,e.uniforms.tDepth=this._tDepth,e.uniforms.distortionMap=this._distortionMap,e.uniforms.tDiffuseBlur=this._tDiffuseBlur,e.uniforms.textureMatrix=this._textureMatrix,e.uniforms.mirror=this._mirror,e.uniforms.mixBlur=this._mixBlur,e.uniforms.mixStrength=this._blurStrength,e.uniforms.minDepthThreshold=this._minDepthThreshold,e.uniforms.maxDepthThreshold=this._maxDepthThreshold,e.uniforms.depthScale=this._depthScale,e.uniforms.depthToBlurRatioBias=this._depthToBlurRatioBias,e.uniforms.distortion=this._distortion,e.uniforms.mixContrast=this._mixContrast,e.vertexShader=`
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
      `)}get tDiffuse(){return this._tDiffuse.value}set tDiffuse(e){this._tDiffuse.value=e}get tDepth(){return this._tDepth.value}set tDepth(e){this._tDepth.value=e}get distortionMap(){return this._distortionMap.value}set distortionMap(e){this._distortionMap.value=e}get tDiffuseBlur(){return this._tDiffuseBlur.value}set tDiffuseBlur(e){this._tDiffuseBlur.value=e}get textureMatrix(){return this._textureMatrix.value}set textureMatrix(e){this._textureMatrix.value=e}get hasBlur(){return this._hasBlur.value}set hasBlur(e){this._hasBlur.value=e}get mirror(){return this._mirror.value}set mirror(e){this._mirror.value=e}get mixBlur(){return this._mixBlur.value}set mixBlur(e){this._mixBlur.value=e}get mixStrength(){return this._blurStrength.value}set mixStrength(e){this._blurStrength.value=e}get minDepthThreshold(){return this._minDepthThreshold.value}set minDepthThreshold(e){this._minDepthThreshold.value=e}get maxDepthThreshold(){return this._maxDepthThreshold.value}set maxDepthThreshold(e){this._maxDepthThreshold.value=e}get depthScale(){return this._depthScale.value}set depthScale(e){this._depthScale.value=e}get depthToBlurRatioBias(){return this._depthToBlurRatioBias.value}set depthToBlurRatioBias(e){this._depthToBlurRatioBias.value=e}get distortion(){return this._distortion.value}set distortion(e){this._distortion.value=e}get mixContrast(){return this._mixContrast.value}set mixContrast(e){this._mixContrast.value=e}},W=t(n()),G=W.forwardRef(({mixBlur:e=0,mixStrength:t=1,resolution:n=256,blur:r=[0,0],minDepthThreshold:i=.9,maxDepthThreshold:a=1,depthScale:l=0,depthToBlurRatioBias:u=.25,mirror:d=0,distortion:f=1,mixContrast:m=1,distortionMap:g,reflectorOffset:_=0,...v},y)=>{s({MeshReflectorMaterialImpl:se});let b=S(({gl:e})=>e),C=S(({camera:e})=>e),ie=S(({scene:e})=>e);r=Array.isArray(r)?r:[r,r];let O=r[0]+r[1]>0,k=r[0],A=r[1],j=W.useRef(null);W.useImperativeHandle(y,()=>j.current,[]);let[M]=W.useState(()=>new o),[N]=W.useState(()=>new x),[P]=W.useState(()=>new x),[F]=W.useState(()=>new x),[I]=W.useState(()=>new p),[L]=W.useState(()=>new x(0,0,-1)),[R]=W.useState(()=>new E),[z]=W.useState(()=>new x),[B]=W.useState(()=>new x),[V]=W.useState(()=>new E),[H]=W.useState(()=>new p),[U]=W.useState(()=>new re),ae=W.useCallback(()=>{var e;let t=j.current.parent||((e=j.current)==null||(e=e.__r3f.parent)==null?void 0:e.object);if(!t||(P.setFromMatrixPosition(t.matrixWorld),F.setFromMatrixPosition(C.matrixWorld),I.extractRotation(t.matrixWorld),N.set(0,0,1),N.applyMatrix4(I),P.addScaledVector(N,_),z.subVectors(P,F),z.dot(N)>0))return;z.reflect(N).negate(),z.add(P),I.extractRotation(C.matrixWorld),L.set(0,0,-1),L.applyMatrix4(I),L.add(F),B.subVectors(P,L),B.reflect(N).negate(),B.add(P),U.position.copy(z),U.up.set(0,1,0),U.up.applyMatrix4(I),U.up.reflect(N),U.lookAt(B),U.far=C.far,U.updateMatrixWorld(),U.projectionMatrix.copy(C.projectionMatrix),H.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),H.multiply(U.projectionMatrix),H.multiply(U.matrixWorldInverse),H.multiply(t.matrixWorld),M.setFromNormalAndCoplanarPoint(N,P),M.applyMatrix4(U.matrixWorldInverse),R.set(M.normal.x,M.normal.y,M.normal.z,M.constant);let n=U.projectionMatrix;V.x=(Math.sign(R.x)+n.elements[8])/n.elements[0],V.y=(Math.sign(R.y)+n.elements[9])/n.elements[5],V.z=-1,V.w=(1+n.elements[10])/n.elements[14],R.multiplyScalar(2/R.dot(V)),n.elements[2]=R.x,n.elements[6]=R.y,n.elements[10]=R.z+1,n.elements[14]=R.w},[C,_]),[G,K,q,J]=W.useMemo(()=>{let r={minFilter:D,magFilter:D,type:w},o=new T(n,n,r);o.depthBuffer=!0,o.depthTexture=new ee(n,n),o.depthTexture.format=h,o.depthTexture.type=ne;let s=new T(n,n,r);return[o,s,new oe({gl:b,resolution:n,width:k,height:A,minDepthThreshold:i,maxDepthThreshold:a,depthScale:l,depthToBlurRatioBias:u}),{mirror:d,textureMatrix:H,mixBlur:e,tDiffuse:o.texture,tDepth:o.depthTexture,tDiffuseBlur:s.texture,hasBlur:O,mixStrength:t,minDepthThreshold:i,maxDepthThreshold:a,depthScale:l,depthToBlurRatioBias:u,distortion:f,distortionMap:g,mixContrast:m,"defines-USE_BLUR":O?``:void 0,"defines-USE_DEPTH":l>0?``:void 0,"defines-USE_DISTORTION":g?``:void 0}]},[b,k,A,H,n,d,O,e,t,i,a,l,u,f,g,m]);return c(()=>{var e;let t=j.current.parent||((e=j.current)==null||(e=e.__r3f.parent)==null?void 0:e.object);if(!t)return;t.visible=!1;let n=b.xr.enabled,r=b.shadowMap.autoUpdate;ae(),b.xr.enabled=!1,b.shadowMap.autoUpdate=!1,b.setRenderTarget(G),b.state.buffers.depth.setMask(!0),b.autoClear||b.clear(),b.render(ie,U),O&&q.render(b,G,K),b.xr.enabled=n,b.shadowMap.autoUpdate=r,t.visible=!0,b.setRenderTarget(null)}),W.createElement(`meshReflectorMaterialImpl`,te({attach:`material`,key:`key`+J[`defines-USE_BLUR`]+J[`defines-USE_DEPTH`]+J[`defines-USE_DISTORTION`],ref:j},J,v))}),K=class extends v{constructor(){super({uniforms:{time:{value:0},pixelRatio:{value:1}},vertexShader:`
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
          #include <${O>=154?`colorspace_fragment`:`encodings_fragment`}>
        }
      `})}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}get pixelRatio(){return this.uniforms.pixelRatio.value}set pixelRatio(e){this.uniforms.pixelRatio.value=e}},q=e=>e&&e.constructor===Float32Array,J=e=>[e.r,e.g,e.b],ce=e=>e instanceof b||e instanceof x||e instanceof E,le=e=>Array.isArray(e)?e:ce(e)?e.toArray():[e,e,e];function Y(e,t,n){return W.useMemo(()=>{if(t!==void 0){if(q(t))return t;if(t instanceof f){let n=Array.from({length:e*3},()=>J(t)).flat();return Float32Array.from(n)}if(ce(t)||Array.isArray(t)){let n=Array.from({length:e*3},()=>le(t)).flat();return Float32Array.from(n)}return Float32Array.from({length:e},()=>t)}return Float32Array.from({length:e},n)},[t])}var ue=W.forwardRef(({noise:e=1,count:t=100,speed:n=1,opacity:r=1,scale:i=1,size:a,color:o,children:u,...d},p)=>{W.useMemo(()=>s({SparklesImplMaterial:K}),[]);let m=W.useRef(null),h=S(e=>e.viewport.dpr),g=le(i),_=W.useMemo(()=>Float32Array.from(Array.from({length:t},()=>g.map(l.randFloatSpread)).flat()),[t,...g]),v=Y(t,a,Math.random),y=Y(t,r),b=Y(t,n),ee=Y(t*3,e),x=Y(o===void 0?t*3:t,q(o)?o:new f(o),()=>1);return c(e=>{m.current&&m.current.material&&(m.current.material.time=e.clock.elapsedTime)}),W.useImperativeHandle(p,()=>m.current,[]),W.createElement(`points`,te({key:`particle-${t}-${JSON.stringify(i)}`},d,{ref:m}),W.createElement(`bufferGeometry`,null,W.createElement(`bufferAttribute`,{attach:`attributes-position`,args:[_,3]}),W.createElement(`bufferAttribute`,{attach:`attributes-size`,args:[v,1]}),W.createElement(`bufferAttribute`,{attach:`attributes-opacity`,args:[y,1]}),W.createElement(`bufferAttribute`,{attach:`attributes-speed`,args:[b,1]}),W.createElement(`bufferAttribute`,{attach:`attributes-color`,args:[x,3]}),W.createElement(`bufferAttribute`,{attach:`attributes-noise`,args:[ee,3]})),u||W.createElement(`sparklesImplMaterial`,{transparent:!0,pixelRatio:h,depthWrite:!1}))}),X=e(),Z=`#3fb654`;function de({onFrame:e}){return c((t,n)=>e(Math.min(n,.1))),null}function fe({getFrame:e,instant:t}){let n=(0,W.useRef)(new x(0,0,170)),i=(0,W.useRef)(new x),a=(0,W.useRef)(new x),o=(0,W.useRef)(!0),s=S(e=>e.size),l=S(e=>e.camera);return(0,W.useEffect)(()=>{s.width/s.height>1.25&&s.width>=900?l.setViewOffset(s.width,s.height,-s.width*.2,0,s.width,s.height):l.clearViewOffset(),l.updateProjectionMatrix()},[l,s.width,s.height]),c((s,c)=>{let{shot:u}=e();i.current.set(...r(u));let d=t||o.current?1:1-Math.exp(-Math.min(c,.1)*1.6);o.current=!1,l.position.lerp(i.current,d),n.current.lerp(a.current.set(0,0,u.targetZ),d),l.lookAt(n.current)}),null}var pe=new x(0,1,0),me=z.map(e=>new i({color:new f(e).multiplyScalar(2.2),transparent:!0,opacity:0,toneMapped:!1,depthWrite:!1,depthTest:!1})),Q={a:new x,b:new x,d:new x,q:new u},he=new i({color:`#ffffff`,toneMapped:!1,transparent:!0,opacity:.95}),$={color:new f,q:new u,dir:new x,z:new x(0,0,1)};function ge({geometry:e,getFrame:t}){let n=(0,W.useRef)([]);return c((r,i)=>{let{pose:a,legs:o}=t(),s=R(a,e.platform_points_local);for(let t=0;t<6;t++){let r=n.current[t];if(!r)continue;let a=o===`all`||o===t,c=me[t];if(c.opacity+=((a?.7:0)-c.opacity)*Math.min(1,i*5),r.visible=c.opacity>.02,!r.visible)continue;Q.a.set(...e.base_points[t]),Q.b.set(...s[t]),Q.d.subVectors(Q.b,Q.a);let l=Q.d.length();r.position.addVectors(Q.a,Q.b).multiplyScalar(.5),r.quaternion.copy(Q.q.setFromUnitVectors(pe,Q.d.normalize())),r.scale.set(1,l,1)}}),(0,X.jsx)(`group`,{children:me.map((e,t)=>(0,X.jsx)(`mesh`,{ref:e=>{n.current[t]=e},material:e,renderOrder:20,children:(0,X.jsx)(`cylinderGeometry`,{args:[10,10,1,16,1,!0]})},t))})}var _e={x:[1,0,0],y:[0,1,0],z:[0,0,1],roll:[1,0,0],pitch:[0,1,0],yaw:[0,0,1]},ve={x:`#ff5a5a`,y:`#5dff7a`,z:`#5aa8ff`,roll:`#ff5a5a`,pitch:`#5dff7a`,yaw:`#5aa8ff`};function ye({getFrame:e}){let t=(0,W.useRef)(null),n=(0,W.useRef)(null),r=he;return c(()=>{let{pose:r,axis:i}=e(),a=i===`roll`||i===`pitch`||i===`yaw`;if(t.current&&(t.current.visible=!!i&&!a),n.current&&(n.current.visible=!!i&&a),!i)return;he.color.copy($.color.set(ve[i]).multiplyScalar(1.8)),$.dir.set(..._e[i]);let o=a?n.current:t.current;o&&(o.position.set(r.x,r.y,r.z+70),o.quaternion.copy($.q.setFromUnitVectors(a?$.z:pe,$.dir)))}),(0,X.jsxs)(X.Fragment,{children:[(0,X.jsxs)(`group`,{ref:t,visible:!1,children:[(0,X.jsx)(`mesh`,{material:r,position:[0,0,0],children:(0,X.jsx)(`cylinderGeometry`,{args:[6,6,300,16]})}),(0,X.jsx)(`mesh`,{material:r,position:[0,175,0],children:(0,X.jsx)(`coneGeometry`,{args:[20,50,24]})}),(0,X.jsx)(`mesh`,{material:r,position:[0,-175,0],rotation:[Math.PI,0,0],children:(0,X.jsx)(`coneGeometry`,{args:[20,50,24]})})]}),(0,X.jsxs)(`group`,{ref:n,visible:!1,children:[(0,X.jsx)(`mesh`,{material:r,children:(0,X.jsx)(`torusGeometry`,{args:[230,6,12,96,Math.PI*1.6]})}),(0,X.jsx)(`mesh`,{material:r,position:[230*Math.cos(Math.PI*1.6),230*Math.sin(Math.PI*1.6),0],rotation:[0,0,Math.PI*1.6],children:(0,X.jsx)(`coneGeometry`,{args:[18,46,24]})})]})]})}function be({color:e}){return(0,X.jsxs)(`group`,{position:[0,0,B],children:[(0,X.jsxs)(`mesh`,{position:[0,0,-1],receiveShadow:!0,children:[(0,X.jsx)(`circleGeometry`,{args:[9e3,96]}),(0,X.jsx)(G,{resolution:512,blur:[400,120],mixBlur:1,mixStrength:1.6,roughness:.85,depthScale:.6,minDepthThreshold:.4,maxDepthThreshold:1.2,color:e,metalness:.4,mirror:.4})]}),(0,X.jsx)(ie,{rotation:[Math.PI/2,0,0],scale:2400,far:1e3,blur:2.6,opacity:.7,resolution:1024}),(0,X.jsxs)(`mesh`,{position:[0,0,1],children:[(0,X.jsx)(`ringGeometry`,{args:[520,560,128]}),(0,X.jsx)(`meshBasicMaterial`,{color:new f(Z).multiplyScalar(1.6),toneMapped:!1,transparent:!0,opacity:.55})]})]})}function xe({geometry:e,getFrame:t,onFrame:n,reducedMotion:r,bg:i,floor:a,dark:o}){let[s,c]=(0,W.useState)(!0);return(0,X.jsxs)(k,{shadows:!0,dpr:s?[1,2]:[1,1.25],camera:{position:[1650,-1900,1150],up:[0,0,1],fov:30,near:5,far:3e4},gl:{antialias:!s,toneMapping:6,toneMappingExposure:1.1},children:[(0,X.jsx)(`color`,{attach:`background`,args:[i]}),(0,X.jsx)(`fog`,{attach:`fog`,args:[i,4800,11e3]}),(0,X.jsx)(j,{onDecline:()=>c(!1)}),n&&(0,X.jsx)(de,{onFrame:n}),(0,X.jsx)(fe,{getFrame:t,instant:r}),(0,X.jsx)(U,{high:s}),(0,X.jsx)(`spotLight`,{position:[-1400,1500,1500],angle:.5,penumbra:.8,intensity:o?5e6:25e5,distance:0,decay:2,color:Z}),(0,X.jsx)(`spotLight`,{position:[1800,1200,600],angle:.45,penumbra:.9,intensity:o?5e6:25e5,distance:0,decay:2,color:`#6aa8ff`}),(0,X.jsx)(V,{geometry:e,getPose:()=>t().pose}),(0,X.jsx)(ge,{geometry:e,getFrame:t}),(0,X.jsx)(ye,{getFrame:t}),!r&&(0,X.jsx)(ue,{count:70,scale:[2600,2600,1200],position:[0,0,500],size:6,speed:.25,opacity:o?.5:.35,color:Z}),s?(0,X.jsx)(be,{color:a}):(0,X.jsx)(H,{color:i,high:!1}),s&&(0,X.jsxs)(N,{multisampling:0,children:[(0,X.jsx)(F,{aoRadius:90,intensity:2,distanceFalloff:.7,halfRes:!0}),(0,X.jsx)(L,{luminanceThreshold:.9,luminanceSmoothing:.2,intensity:r||!o?.4:.9,mipmapBlur:!0}),(0,X.jsx)(A,{mode:I.AGX}),(0,X.jsx)(P,{offset:.25,darkness:o?.75:.3}),(0,X.jsx)(M,{})]})]})}export{xe as ExhibitCanvas};