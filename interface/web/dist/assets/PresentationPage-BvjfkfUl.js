import{A as e,F as t,M as n,l as r,s as i}from"./geometry-BrpsfnPP.js";import{o as a,r as o}from"./kinematics-CNUPpluH.js";import{a as s,d as c,i as l,r as u,s as d,t as f,u as p}from"./telemetry-DXzB-hsN.js";import{n as m,t as ee}from"./chevron-right-Csas7PUQ.js";import{a as te,i as ne,n as re,o as ie,r as ae,t as h}from"./Stage-1SBjpA7R.js";import{n as g,r as oe,t as _}from"./routines-DiZwiBRW.js";import{i as se,n as ce,r as le,t as ue}from"./dist-aZOFP_RL.js";import{A as de,D as fe,F as pe,I as me,N as he,S as v,T as ge,V as _e,X as ve,at as y,b as ye,i as be,nt as b,o as xe,rt as Se,tt as x}from"./index-C_kYcuTo.js";import{A as Ce,C as S,F as C,Ft as we,Gt as Te,I as Ee,Kt as w,Mt as T,P as De,Q as E,R as D,S as O,Tt as Oe,U as k,Vt as A,Xt as ke,Yt as j,at as Ae,gt as M,ht as je,it as N,j as P,mt as Me,nt as Ne,pt as Pe,qt as F,rt as I}from"./PremiumParts-DRv_kfB-.js";import{t as Fe}from"./Html-B2c4D7BG.js";import{a as Ie,c as Le,i as Re,n as ze,r as Be,s as Ve}from"./dist-C6zn_7sd.js";import{t as He}from"./OrbitControls-CPCQOBY2.js";import{n as Ue,t as We}from"./Studio-CQmS2LvZ.js";import{t as Ge}from"./PremiumRig-D11bKjIw.js";import{n as Ke,t as qe}from"./showcase-CCWIMMiH.js";import{n as Je}from"./PoseEditor-Cq_4Xq6h.js";import{t as Ye}from"./TimelinePlot-B9LGQk_i.js";var Xe={name:`graduation-cap`,size:24,node:[[`path`,{d:`M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z`,key:`j76jl0`}],[`path`,{d:`M22 10v6`,key:`1lu8f3`}],[`path`,{d:`M6 12.5V16a6 3 0 0 0 12 0v-3.5`,key:`1r8lef`}]]};Xe.node;var Ze=c(Xe),Qe={name:`monitor-play`,size:24,node:[[`path`,{d:`M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z`,key:`vbtd3f`}],[`path`,{d:`M12 17v4`,key:`1riwvh`}],[`path`,{d:`M8 21h8`,key:`1ev6f3`}],[`rect`,{x:`2`,y:`3`,width:`20`,height:`14`,rx:`2`,key:`x3v2xh`}]]};Qe.node;var $e=c(Qe),et=Ce>=125?`uv1`:`uv2`,tt=new D,L=new w,R=class extends Ne{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new E([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new E([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new I(t,6,1);return this.setAttribute(`instanceStart`,new N(n,3,0)),this.setAttribute(`instanceEnd`,new N(n,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e,t=3){let n;e instanceof Float32Array?n=e:Array.isArray(e)&&(n=new Float32Array(e));let r=new I(n,t*2,1);return this.setAttribute(`instanceColorStart`,new N(r,t,0)),this.setAttribute(`instanceColorEnd`,new N(r,t,t)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new j(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new D);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),tt.setFromBufferAttribute(t),this.boundingBox.union(tt))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new we),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)L.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(L)),L.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(L));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}applyMatrix(e){return console.warn(`THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4().`),this.applyMatrix4(e)}},nt=class extends R{constructor(){super(),this.isLineGeometry=!0,this.type=`LineGeometry`}setPositions(e){let t=e.length-3,n=new Float32Array(2*t);for(let r=0;r<t;r+=3)n[2*r]=e[r],n[2*r+1]=e[r+1],n[2*r+2]=e[r+2],n[2*r+3]=e[r+3],n[2*r+4]=e[r+4],n[2*r+5]=e[r+5];return super.setPositions(n),this}setColors(e,t=3){let n=e.length-t,r=new Float32Array(2*n);if(t===3)for(let i=0;i<n;i+=t)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5];else for(let i=0;i<n;i+=t)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5],r[2*i+6]=e[i+6],r[2*i+7]=e[i+7];return super.setColors(r,t),this}fromLine(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}},z=class extends T{constructor(e){super({type:`LineMaterial`,uniforms:A.clone(A.merge([Ee.common,Ee.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new Te(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${Ce>=154?`colorspace_fragment`:`encodings_fragment`}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA=`1`:delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(e){this.uniforms.diffuse.value=e}},worldUnits:{enumerable:!0,get:function(){return`WORLD_UNITS`in this.defines},set:function(e){e===!0?this.defines.WORLD_UNITS=``:delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(e){this.uniforms.linewidth.value=e}},dashed:{enumerable:!0,get:function(){return`USE_DASH`in this.defines},set(e){!!e!=`USE_DASH`in this.defines&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH=``:delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(e){this.uniforms.dashScale.value=e}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(e){this.uniforms.dashSize.value=e}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(e){this.uniforms.dashOffset.value=e}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(e){this.uniforms.gapSize.value=e}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(e){this.uniforms.opacity.value=e}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(e){this.uniforms.resolution.value.copy(e)}},alphaToCoverage:{enumerable:!0,get:function(){return`USE_ALPHA_TO_COVERAGE`in this.defines},set:function(e){!!e!=`USE_ALPHA_TO_COVERAGE`in this.defines&&(this.needsUpdate=!0),e===!0?(this.defines.USE_ALPHA_TO_COVERAGE=``,this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(e)}},rt=new F,it=new w,at=new w,B=new F,V=new F,H=new F,ot=new w,st=new Me,U=new Ae,ct=new w,W=new D,G=new we,K=new F,q,J;function lt(e,t,n){return K.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),K.multiplyScalar(1/K.w),K.x=J/n.width,K.y=J/n.height,K.applyMatrix4(e.projectionMatrixInverse),K.multiplyScalar(1/K.w),Math.abs(Math.max(K.x,K.y))}function ut(e,t){let n=e.matrixWorld,r=e.geometry,i=r.attributes.instanceStart,a=r.attributes.instanceEnd,o=Math.min(r.instanceCount,i.count);for(let r=0,s=o;r<s;r++){U.start.fromBufferAttribute(i,r),U.end.fromBufferAttribute(a,r),U.applyMatrix4(n);let o=new w,s=new w;q.distanceSqToSegment(U.start,U.end,s,o),s.distanceTo(o)<J*.5&&t.push({point:s,pointOnLine:o,distance:q.origin.distanceTo(s),object:e,face:null,faceIndex:r,uv:null,[et]:null})}}function dt(e,t,n){let r=t.projectionMatrix,i=e.material.resolution,a=e.matrixWorld,o=e.geometry,s=o.attributes.instanceStart,c=o.attributes.instanceEnd,l=Math.min(o.instanceCount,s.count),u=-t.near;q.at(1,H),H.w=1,H.applyMatrix4(t.matrixWorldInverse),H.applyMatrix4(r),H.multiplyScalar(1/H.w),H.x*=i.x/2,H.y*=i.y/2,H.z=0,ot.copy(H),st.multiplyMatrices(t.matrixWorldInverse,a);for(let t=0,o=l;t<o;t++){if(B.fromBufferAttribute(s,t),V.fromBufferAttribute(c,t),B.w=1,V.w=1,B.applyMatrix4(st),V.applyMatrix4(st),B.z>u&&V.z>u)continue;if(B.z>u){let e=B.z-V.z,t=(B.z-u)/e;B.lerp(V,t)}else if(V.z>u){let e=V.z-B.z,t=(V.z-u)/e;V.lerp(B,t)}B.applyMatrix4(r),V.applyMatrix4(r),B.multiplyScalar(1/B.w),V.multiplyScalar(1/V.w),B.x*=i.x/2,B.y*=i.y/2,V.x*=i.x/2,V.y*=i.y/2,U.start.copy(B),U.start.z=0,U.end.copy(V),U.end.z=0;let o=U.closestPointToPointParameter(ot,!0);U.at(o,ct);let l=Pe.lerp(B.z,V.z,o),d=l>=-1&&l<=1,f=ot.distanceTo(ct)<J*.5;if(d&&f){U.start.fromBufferAttribute(s,t),U.end.fromBufferAttribute(c,t),U.start.applyMatrix4(a),U.end.applyMatrix4(a);let r=new w,i=new w;q.distanceSqToSegment(U.start,U.end,i,r),n.push({point:i,pointOnLine:r,distance:q.origin.distanceTo(i),object:e,face:null,faceIndex:t,uv:null,[et]:null})}}}var ft=class extends je{constructor(e=new R,t=new z({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type=`LineSegments2`}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,n=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let e=0,i=0,a=t.count;e<a;e++,i+=2)it.fromBufferAttribute(t,e),at.fromBufferAttribute(n,e),r[i]=i===0?0:r[i-1],r[i+1]=r[i]+it.distanceTo(at);let i=new I(r,2,1);return e.setAttribute(`instanceDistanceStart`,new N(i,1,0)),e.setAttribute(`instanceDistanceEnd`,new N(i,1,1)),this}raycast(e,t){let n=this.material.worldUnits,r=e.camera;r===null&&!n&&console.error(`LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.`);let i=e.params.Line2===void 0?0:e.params.Line2.threshold||0;q=e.ray;let a=this.matrixWorld,o=this.geometry,s=this.material;J=s.linewidth+i,o.boundingSphere===null&&o.computeBoundingSphere(),G.copy(o.boundingSphere).applyMatrix4(a);let c;if(c=n?J*.5:lt(r,Math.max(r.near,G.distanceToPoint(q.origin)),s.resolution),G.radius+=c,q.intersectsSphere(G)===!1)return;o.boundingBox===null&&o.computeBoundingBox(),W.copy(o.boundingBox).applyMatrix4(a);let l;l=n?J*.5:lt(r,Math.max(r.near,W.distanceToPoint(q.origin)),s.resolution),W.expandByScalar(l),q.intersectsBox(W)!==!1&&(n?ut(this,t):dt(this,r,t))}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(rt),this.material.uniforms.resolution.value.set(rt.z,rt.w))}},pt=class extends ft{constructor(e=new nt,t=new z({color:Math.random()*16777215})){super(e,t),this.isLine2=!0,this.type=`Line2`}},Y=t(n()),mt=Y.forwardRef(function({points:e,color:t=16777215,vertexColors:n,linewidth:r,lineWidth:i,segments:a,dashed:o,...s},c){var l;let u=C(e=>e.size),d=Y.useMemo(()=>a?new ft:new pt,[a]),[f]=Y.useState(()=>new z),p=(n==null||(l=n[0])==null?void 0:l.length)===4?4:3,m=Y.useMemo(()=>{let r=a?new R:new nt,i=e.map(e=>{let t=Array.isArray(e);return e instanceof w||e instanceof F?[e.x,e.y,e.z]:e instanceof Te?[e.x,e.y,0]:t&&e.length===3?[e[0],e[1],e[2]]:t&&e.length===2?[e[0],e[1],0]:e});if(r.setPositions(i.flat()),n){t=16777215;let e=n.map(e=>e instanceof k?e.toArray():e);r.setColors(e.flat(),p)}return r},[e,a,n,p]);return Y.useLayoutEffect(()=>{d.computeLineDistances()},[e,d]),Y.useLayoutEffect(()=>{o?f.defines.USE_DASH=``:delete f.defines.USE_DASH,f.needsUpdate=!0},[o,f]),Y.useEffect(()=>()=>{m.dispose(),f.dispose()},[m]),Y.createElement(`primitive`,ke({object:d,ref:c},s),Y.createElement(`primitive`,{object:m,attach:`geometry`}),Y.createElement(`primitive`,ke({object:f,attach:`material`,color:t,vertexColors:!!n,resolution:[u.width,u.height],linewidth:r??i??1,dashed:o,transparent:p===4},s)))}),ht=(e,t)=>[e[0]+t[0],e[1]+t[1],e[2]+t[2]],gt=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],_t=e=>Math.hypot(e[0],e[1],e[2]);function vt(e){return[e.x,e.y,e.z]}function yt(e){let t=o(e.roll,e.pitch,e.yaw);return[[t[0],t[3],t[6]],[t[1],t[4],t[7]],[t[2],t[5],t[8]]]}function bt(e,t){let n=o(e.roll,e.pitch,e.yaw),r=vt(e);return t.platform_points_local.map((e,i)=>{let a=[n[0]*e[0]+n[1]*e[1]+n[2]*e[2],n[3]*e[0]+n[4]*e[1]+n[5]*e[2],n[6]*e[0]+n[7]*e[1]+n[8]*e[2]],o=ht(r,a),s=t.base_points[i],c=gt(o,s),l=_t(c);return{b:s,p:e,Rp:a,P:o,L:c,length:l,inStroke:l>=t.stroke_min&&l<=t.stroke_max}})}function xt(e,t){let n=e=>Math.min(1,Math.max(0,t*3-e)),r=e=>e*e*(3-2*e);return{...e,yaw:e.yaw*r(n(0))+0,pitch:e.pitch*r(n(1))+0,roll:e.roll*r(n(2))+0}}var X=e(),St={x:[-80,80],y:[-80,80],z:[400,720],roll:[-25,25],pitch:[-25,25],yaw:[-25,25]},Z=e=>`(${e.map(e=>S(e,1)).join(`; `)})`;function Ct({q:e,answer:t,onAnswer:n}){let r=(0,Y.useId)(),[i,a]=(0,Y.useState)(t),o=t!==void 0,c=t===e.correct;return(0,X.jsxs)(`fieldset`,{className:`rounded-lg border border-border p-3`,children:[(0,X.jsx)(`legend`,{className:`px-1 text-sm font-semibold`,children:e.q}),(0,X.jsx)(`div`,{className:`mt-1 space-y-1.5`,children:e.options.map((e,t)=>(0,X.jsxs)(`label`,{className:`flex cursor-pointer items-center gap-2 text-sm`,children:[(0,X.jsx)(`input`,{type:`radio`,name:r,value:t,checked:i===t,onChange:()=>a(t),className:`size-4 accent-[var(--c-brand)]`}),e]},t))}),(0,X.jsxs)(`div`,{className:`mt-2 flex flex-wrap items-center gap-3`,children:[(0,X.jsx)(s,{size:`sm`,variant:`secondary`,disabled:i===void 0,onClick:()=>i!==void 0&&n(i),children:`Conferir`}),(0,X.jsx)(`p`,{role:`status`,className:p(`text-sm`,!o&&`sr-only`),children:o&&(0,X.jsxs)(`span`,{className:p(`inline-flex items-start gap-1.5 font-medium`,c?`text-brand-text`:`text-danger`),children:[c?(0,X.jsx)(Se,{"aria-hidden":!0,className:`mt-0.5 size-4 shrink-0`}):(0,X.jsx)(b,{"aria-hidden":!0,className:`mt-0.5 size-4 shrink-0`}),(0,X.jsxs)(`span`,{children:[c?`Isso! `:`Ainda não. `,(0,X.jsx)(`span`,{className:`font-normal text-fg`,children:e.explain})]})]})})]})]})}function wt({step:e,pose:t,onPose:n,leg:r,onLeg:i,geometry:a,animating:o,onAnimate:c,answers:l,onAnswer:u}){let d=bt(t,a),f=d[r],m=d.filter(e=>!e.inStroke).length;return(0,X.jsxs)(`div`,{className:`space-y-4`,children:[(0,X.jsx)(`h2`,{className:`text-lg font-semibold`,children:e.title}),e.paragraphs.map((e,t)=>(0,X.jsx)(`p`,{className:`text-sm leading-relaxed`,children:e},t)),(0,X.jsxs)(`p`,{className:`rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted`,children:[(0,X.jsx)(`span`,{className:`font-semibold text-fg`,children:`No modelo: `}),e.sceneSummary]}),e.overlays.legs===`one`&&(0,X.jsxs)(`div`,{className:`space-y-2`,children:[(0,X.jsx)(`div`,{role:`group`,"aria-label":`Perna mostrada`,className:`flex flex-wrap gap-1.5`,children:O.map((e,t)=>(0,X.jsxs)(s,{size:`sm`,variant:r===t?`primary`:`secondary`,"aria-pressed":r===t,onClick:()=>i(t),children:[(0,X.jsx)(`span`,{"aria-hidden":!0,className:`size-2 rounded-full`,style:{background:e}}),`P`,t+1]},t))}),f&&e.overlays.decomposition&&(0,X.jsxs)(`dl`,{className:`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-xs tabular-nums`,children:[(0,X.jsx)(`dt`,{className:`font-semibold`,children:`T`}),(0,X.jsxs)(`dd`,{children:[Z([t.x,t.y,t.z]),` mm`]}),(0,X.jsxs)(`dt`,{className:`font-semibold`,children:[`R·p`,r+1]}),(0,X.jsxs)(`dd`,{children:[Z(f.Rp),` mm`]}),(0,X.jsxs)(`dt`,{className:`font-semibold`,children:[`b`,r+1]}),(0,X.jsxs)(`dd`,{children:[Z(f.b),` mm`]}),(0,X.jsxs)(`dt`,{className:`font-semibold`,children:[`L`,r+1]}),(0,X.jsxs)(`dd`,{children:[Z(f.L),` mm → `,(0,X.jsxs)(`span`,{className:p(`font-semibold`,!f.inStroke&&`text-danger`),children:[`‖L`,r+1,`‖ = `,S(f.length,1),` mm`]})]})]})]}),e.overlays.legs===`all`&&(0,X.jsx)(`p`,{role:`status`,className:p(`text-sm font-medium`,m?`text-danger`:`text-brand-text`),children:m?`${m} perna(s) fora do curso (${S(a.stroke_min,0)}–${S(a.stroke_max,0)} mm): pose impossível.`:`Todas as pernas dentro do curso (${S(a.stroke_min,0)}–${S(a.stroke_max,0)} mm).`}),(0,X.jsx)(Je,{pose:t,onChange:n,fields:e.axes,limits:e.wide?St:void 0,disabled:o}),e.animateZyx&&(0,X.jsxs)(s,{variant:`secondary`,onClick:c,disabled:o,children:[(0,X.jsx)(x,{"aria-hidden":!0}),o?`Animando…`:`Animar ZYX`]}),e.id===`ik-fk`&&(0,X.jsxs)(`p`,{className:`text-sm`,children:[`Experimente a direta na`,` `,(0,X.jsx)(y,{to:`/bancada-3d`,className:`font-medium text-brand-text underline`,children:`Bancada 3D`}),`: mude o comprimento de um pistão e veja o tampo se acomodar.`]}),(0,X.jsxs)(`div`,{className:`space-y-3`,children:[(0,X.jsx)(`h3`,{className:`text-sm font-semibold uppercase tracking-wide text-muted`,children:`Perguntas rápidas`}),e.quiz.map((t,n)=>{let r=`${e.id}:${n}`;return(0,X.jsx)(Ct,{q:t,answer:l[r],onAnswer:e=>u(r,e)},r)})]})]})}var Tt=`#f5b400`,Et=`#b55cf2`,Dt=`#e5484d`;function Ot({at:e,children:t,color:n}){return(0,X.jsx)(Fe,{position:e,center:!0,zIndexRange:[20,0],style:{pointerEvents:`none`},children:(0,X.jsx)(`span`,{className:`whitespace-nowrap rounded-md border border-border bg-surface/90 px-1.5 py-0.5 text-xs font-semibold text-fg shadow`,style:n?{borderColor:n}:void 0,children:t})})}var kt=e=>new M({color:e,depthTest:!1,transparent:!0,opacity:.95});function Q({from:e,to:t,color:n,label:r,width:i=3}){let a=(0,Y.useMemo)(()=>kt(n),[n]),o=(0,Y.useMemo)(()=>{let n=new w(...e),r=new w(...t),i=r.clone().sub(n),a=i.length(),o=Math.min(18,a*.3),s=a>0?i.clone().divideScalar(a):new w(0,0,1);return{len:a,head:o,tip:r.clone().sub(s.clone().multiplyScalar(o/2)),quat:new Oe().setFromUnitVectors(new w(0,1,0),s)}},[e,t]);if(o.len<1e-6)return null;let s=[(e[0]+t[0])/2,(e[1]+t[1])/2,(e[2]+t[2])/2];return(0,X.jsxs)(`group`,{children:[(0,X.jsx)(mt,{points:[e,t],color:n,lineWidth:i,depthTest:!1,renderOrder:10}),(0,X.jsx)(`mesh`,{position:o.tip,quaternion:o.quat,material:a,renderOrder:11,children:(0,X.jsx)(`coneGeometry`,{args:[o.head*.38,o.head,16]})}),r&&(0,X.jsx)(Ot,{at:s,color:n,children:r})]})}function At({at:e,color:t,label:n}){let r=(0,Y.useMemo)(()=>kt(t),[t]);return(0,X.jsxs)(`group`,{children:[(0,X.jsx)(`mesh`,{position:e,material:r,renderOrder:12,children:(0,X.jsx)(`sphereGeometry`,{args:[9,20,14]})}),n&&(0,X.jsx)(Ot,{at:[e[0],e[1],e[2]+26],children:n})]})}var jt=[`x`,`y`,`z`];function Mt({origin:e,axes:t,size:n=140}){return(0,X.jsx)(`group`,{children:t.map((t,r)=>(0,X.jsx)(Q,{from:e,to:[e[0]+t[0]*n,e[1]+t[1]*n,e[2]+t[2]*n],color:Ye[jt[r]],label:jt[r].toUpperCase()},r))})}var Nt=e=>`${e.toLocaleString(`pt-BR`,{maximumFractionDigits:1})} mm`,Pt=[0,0,0];function Ft({pose:e,geometry:t,flags:n,leg:r}){let i=(0,Y.useMemo)(()=>bt(e,t),[e,t]),a=(0,Y.useMemo)(()=>vt(e),[e]),o=(0,Y.useMemo)(()=>yt(e),[e]),s=i[r];return(0,X.jsxs)(`group`,{children:[n.plateFrame&&(0,X.jsx)(Mt,{origin:a,axes:o}),n.translation&&(0,X.jsx)(Q,{from:Pt,to:a,color:Tt,label:`T`,width:4}),n.base&&i.map((e,t)=>(0,X.jsx)(At,{at:e.b,color:`#dfe3e6`,label:`b${t+1}`},t)),n.plate&&i.map((e,t)=>(0,X.jsx)(At,{at:e.P,color:`#2f9e41`,label:`p${t+1}`},t)),n.legs===`all`&&i.map((e,t)=>(0,X.jsx)(Q,{from:e.b,to:e.P,color:e.inStroke?O[t]:Dt,label:`L${t+1} = ${Nt(e.length)}`},t)),n.legs===`one`&&s&&(0,X.jsxs)(X.Fragment,{children:[n.decomposition&&(0,X.jsxs)(X.Fragment,{children:[(0,X.jsx)(Q,{from:Pt,to:a,color:Tt,label:`T`,width:4}),(0,X.jsx)(Q,{from:a,to:s.P,color:Et,label:`R·p${r+1}`,width:4}),(0,X.jsx)(Q,{from:Pt,to:s.b,color:`#9aa3ab`,label:`b${r+1}`,width:2})]}),(0,X.jsx)(Q,{from:s.b,to:s.P,color:s.inStroke?O[r]:Dt,label:`L${r+1} = ${Nt(s.length)}`,width:5})]})]})}var $=[{id:`gdl`,title:`1. Seis graus de liberdade`,paragraphs:[`A plataforma de Stewart move o tampo em seis graus de liberdade: três translações (X, Y e Z) e três rotações (roll em torno de X, pitch em torno de Y e yaw em torno de Z).`,`Mexa cada controle e veja como os seis pistões trabalham juntos: nenhum movimento do tampo usa um pistão só.`],axes:[`x`,`y`,`z`,`roll`,`pitch`,`yaw`],overlays:{plateFrame:!0},sceneSummary:`Modelo da bancada com os eixos X (vermelho), Y (verde) e Z (azul) desenhados no centro do tampo.`,quiz:[{q:`Quantos graus de liberdade o tampo tem?`,options:[`3`,`6`,`12`],correct:1,explain:`Três translações e três rotações: seis no total, um para cada pistão.`},{q:`O roll é uma rotação em torno de qual eixo?`,options:[`X`,`Y`,`Z`],correct:0,explain:`Roll gira em torno de X, pitch em torno de Y e yaw em torno de Z.`}]},{id:`base`,title:`2. As juntas da base (bᵢ)`,paragraphs:[`Cada pistão está preso à base por uma junta universal (cardã). Os seis pontos bᵢ ficam em pares, sob os três blocos azuis.`,`Eles são medidos no sistema da base: origem no centro, Z para cima. Como a base não se mexe, os bᵢ são constantes.`],axes:[`x`,`y`,`z`,`roll`,`pitch`,`yaw`],overlays:{base:!0},sceneSummary:`Esferas rotuladas b1 a b6 marcam as seis juntas da base, em três pares.`,quiz:[{q:`Os pontos bᵢ mudam quando o tampo se move?`,options:[`Sim`,`Não`],correct:1,explain:`A base é fixa: os bᵢ são sempre os mesmos.`}]},{id:`plate`,title:`3. As juntas do tampo (pᵢ)`,paragraphs:[`No tampo há outras seis juntas. Os pontos pᵢ são escritos no sistema do próprio tampo, com origem no centro dele.`,`Nesse sistema local eles nunca mudam. O que muda é onde o tampo está e como está girado em relação à base.`],axes:[`x`,`y`,`z`,`roll`,`pitch`,`yaw`],overlays:{plate:!0,plateFrame:!0},sceneSummary:`Esferas rotuladas p1 a p6 nas juntas do tampo, com o sistema de eixos local no centro do tampo.`,quiz:[{q:`Em qual sistema de coordenadas os pᵢ são constantes?`,options:[`No da base`,`No do tampo`],correct:1,explain:`Os pᵢ são fixos no tampo; vistos da base, eles se movem junto com ele.`}]},{id:`translation`,title:`4. A translação T`,paragraphs:[`T = (x, y, z) é o vetor que vai do centro da base até o centro do tampo.`,`No home o tampo está nivelado e centrado: x = y = 0 e z é a altura de home. Mova X, Y e Z e acompanhe a seta T.`],axes:[`x`,`y`,`z`],overlays:{translation:!0,plateFrame:!0},sceneSummary:`Uma seta T sai do centro da base e termina no centro do tampo.`,quiz:[{q:`No home, o vetor T vale…`,options:[`(0, 0, 0)`,`(0, 0, altura de home)`,`depende do yaw`],correct:1,explain:`No home o tampo está centrado, só elevado na altura de home.`}]},{id:`rotation`,title:`5. A rotação R`,paragraphs:[`A orientação do tampo é a matriz R = Rz(yaw) · Ry(pitch) · Rx(roll): primeiro gira o yaw, depois o pitch e por fim o roll, cada um em torno do eixo já girado do tampo.`,`Use "Animar ZYX" para ver as três rotações uma depois da outra. A ordem importa: trocá-la dá outra orientação.`],axes:[`roll`,`pitch`,`yaw`],overlays:{plateFrame:!0},animateZyx:!0,sceneSummary:`Os eixos do tampo giram conforme roll, pitch e yaw; a animação aplica yaw, depois pitch, depois roll.`,quiz:[{q:`Trocar a ordem das rotações muda a orientação final?`,options:[`Sim, em geral`,`Nunca`],correct:0,explain:`Rotações em 3D não comutam: Rz·Ry·Rx é diferente de Rx·Ry·Rz, exceto em casos especiais.`}]},{id:`leg`,title:`6. A perna: Lᵢ = T + R·pᵢ − bᵢ`,paragraphs:[`Juntando tudo: a junta i do tampo, vista da base, está em Pᵢ = T + R·pᵢ. O vetor da perna vai da junta da base até ela: Lᵢ = T + R·pᵢ − bᵢ.`,`O comprimento que o pistão precisa ter é ‖Lᵢ‖. Escolha uma perna e veja cada termo da soma desenhado.`],axes:[`x`,`y`,`z`,`roll`,`pitch`,`yaw`],overlays:{base:!0,legs:`one`,decomposition:!0},sceneSummary:`Setas desenham T (base até o centro do tampo), R·pᵢ (centro do tampo até a junta) e Lᵢ (junta da base até a do tampo).`,quiz:[{q:`O que o controle manda para cada pistão?`,options:[`O comprimento ‖Lᵢ‖`,`O ângulo da perna`,`A pose inteira`],correct:0,explain:`Cada pistão só controla o próprio comprimento; a pose sai da combinação dos seis.`}]},{id:`limits`,title:`7. Limites de curso`,paragraphs:[`Cada pistão só vai de um comprimento mínimo a um máximo (o curso). Se qualquer um dos seis precisar sair dessa faixa, a pose é impossível.`,`Aqui os controles vão além do normal: force uma pose e veja a perna ficar vermelha.`],axes:[`x`,`y`,`z`,`roll`,`pitch`,`yaw`],wide:!0,overlays:{legs:`all`},sceneSummary:`As seis pernas aparecem com o comprimento; ficam vermelhas quando saem do curso.`,quiz:[{q:`Se só um pistão sair do curso, a pose…`,options:[`é impossível`,`funciona com um erro pequeno`],correct:0,explain:`Basta uma perna fora do curso para a pose não ser alcançável: o backend recusa.`}]},{id:`ik-fk`,title:`8. Inversa × direta`,paragraphs:[`O que você fez até aqui é a cinemática inversa: da pose para os seis comprimentos. Ela tem fórmula fechada e é rápida.`,`O caminho contrário, dos seis comprimentos medidos para a pose, é a cinemática direta. Ela não tem fórmula fechada: o sistema resolve por iteração numérica (mínimos quadrados, Levenberg–Marquardt). É assim que a telemetria e a Bancada 3D estimam a pose real.`],axes:[`x`,`y`,`z`,`roll`,`pitch`,`yaw`],overlays:{legs:`all`},sceneSummary:`As seis pernas com os comprimentos calculados pela cinemática inversa.`,quiz:[{q:`Qual das duas é resolvida por iteração numérica?`,options:[`A inversa`,`A direta`],correct:1,explain:`A direta: dados os comprimentos, o solver procura a pose que os explica.`}]}];function It({onFrame:e}){return De((t,n)=>e(Math.min(n,.1))),null}function Lt({geometry:e,getPose:t,background:n,onFrame:r,autoRotate:i=!1,effects:a=!0,children:o}){let[s,c]=(0,Y.useState)(!0);return(0,X.jsxs)(P,{shadows:!0,dpr:s?[1,2]:[1,1.25],camera:{position:[1650,-1900,1150],up:[0,0,1],fov:30,near:5,far:2e4},gl:{antialias:!(s&&a),toneMapping:6,toneMappingExposure:1.05},children:[(0,X.jsx)(`color`,{attach:`background`,args:[n]}),(0,X.jsx)(`fog`,{attach:`fog`,args:[n,4200,9e3]}),(0,X.jsx)(Le,{onDecline:()=>c(!1)}),r&&(0,X.jsx)(It,{onFrame:r}),(0,X.jsx)(He,{makeDefault:!0,target:[0,0,150],enablePan:!1,minDistance:700,maxDistance:4200,autoRotate:i,autoRotateSpeed:.45,enableDamping:!0,maxPolarAngle:1.5}),(0,X.jsx)(We,{high:s}),(0,X.jsx)(Ge,{geometry:e,getPose:t}),(0,X.jsx)(Ue,{color:n,high:s}),o,s&&a&&(0,X.jsxs)(ze,{multisampling:0,children:[(0,X.jsx)(Be,{aoRadius:90,intensity:2.2,distanceFalloff:.7,halfRes:!0}),(0,X.jsx)(Ie,{mode:Ve.AGX}),(0,X.jsx)(Re,{})]})]})}var Rt=.5,zt=120,Bt=new Set([`amp`,`ax`,`ay`,`z_amp_mm`]);function Vt(e,t=[]){let n=[];for(let t of _){let r={};for(let e of t.params)r[e.name]=Bt.has(e.name)?e.value*Rt:e.value;r.duration_s=30;let i=oe(t,r),a=g(i,e);a.peakSpeed>10&&(i={...i,hz:Math.floor(i.hz*10/a.peakSpeed*.95*100)/100},a=g(i,e)),a.withinStroke&&a.peakSpeed<=10&&i.hz>0&&n.push({kind:`routine`,name:t.title,req:i,peak:a.peakSpeed})}for(let r of[...v,...t]){let t=de(r.keys,r.interp);if(t[t.length-1].t>zt)continue;let i=fe(t,e,r.speed);i.valid&&i.peakSpeed<=10&&n.push({kind:`trajectory`,name:r.name,samples:t,peak:i.peakSpeed})}return n}var Ht=e=>new Promise(t=>setTimeout(t,e));function Ut(e,t,n,i){let[a,o]=(0,Y.useState)({current:null,phase:`idle`,startedAt:null});return(0,Y.useEffect)(()=>{if(!e||!t.length)return;let a=!1,s=Date.now(),c=n*6e4;return(async()=>{for(let e=0;!a&&Date.now()-s<c;e++){let n=t[e%t.length];o({current:n.name,phase:`playing`,startedAt:s});try{n.kind===`routine`?await r.motionStart(n.req):await r.trajectoryStart({samples:n.samples,name:n.name})}catch(e){a||u.error(`Quiosque interrompido`,{description:e.message});break}let i=Date.now();for(;!a&&Date.now()-i<3e4&&(await Ht(500),(await r.motionStatus().catch(()=>null))?.running););if(a||((await r.motionStatus().catch(()=>null))?.running&&await r.motionStop().catch(()=>void 0),a))return;o({current:null,phase:`resting`,startedAt:s}),await Ht(5e3)}a||(await r.motionStop().catch(()=>void 0),u.info(`Sessão do quiosque encerrada`,{description:`A plataforma voltou ao home.`}),i())})(),()=>{a=!0,o({current:null,phase:`idle`,startedAt:null})}},[e,t,n]),a}var Wt=`stewart-lesson`;function Gt(){try{let e=localStorage.getItem(Wt);if(e)return{step:0,answers:{},...JSON.parse(e)}}catch{}return{step:0,answers:{}}}function Kt(e){(0,Y.useEffect)(()=>{if(!e||!(`wakeLock`in navigator))return;let t=null,n=()=>navigator.wakeLock.request(`screen`).then(e=>t=e).catch(()=>void 0);n();let r=()=>document.visibilityState===`visible`&&void n();return document.addEventListener(`visibilitychange`,r),()=>{document.removeEventListener(`visibilitychange`,r),t?.release()}},[e])}function qt(e){let[t,n]=(0,Y.useState)(!1);return(0,Y.useEffect)(()=>{if(!e)return;let t,r=()=>{n(!1),clearTimeout(t),t=setTimeout(()=>n(!0),3e3)};return r(),window.addEventListener(`pointermove`,r),window.addEventListener(`keydown`,r),()=>{clearTimeout(t),window.removeEventListener(`pointermove`,r),window.removeEventListener(`keydown`,r)}},[e]),e&&t}function Jt(){let e=i(),t=f(e=>e.telemetry),n=e.stroke_max-e.stroke_min;if(!t)return(0,X.jsx)(`p`,{className:`text-sm text-muted`,children:`Sem telemetria: conecte o simulador ou a bancada para ver os valores ao vivo.`});let r=t.pose_live;return(0,X.jsxs)(`div`,{className:`space-y-3`,children:[r&&(0,X.jsx)(`dl`,{className:`grid grid-cols-3 gap-2 text-center`,children:[[`X`,r.x,`mm`],[`Y`,r.y,`mm`],[`Z`,r.z,`mm`],[`Roll`,r.roll,`°`],[`Pitch`,r.pitch,`°`],[`Yaw`,r.yaw,`°`]].map(([e,t,n])=>(0,X.jsxs)(`div`,{className:`rounded-lg bg-surface-2/80 px-2 py-1.5`,children:[(0,X.jsx)(`dt`,{className:`text-xs uppercase text-muted`,children:e}),(0,X.jsxs)(`dd`,{className:`text-xl font-semibold tabular-nums`,children:[S(t,+(n===`°`)),(0,X.jsxs)(`span`,{className:`text-sm font-normal text-muted`,children:[` `,n]})]})]},e))}),(0,X.jsx)(`ul`,{className:`space-y-1.5`,"aria-label":`Curso de cada pistão`,children:t.Y.map((e,t)=>(0,X.jsxs)(`li`,{className:`flex items-center gap-2 text-sm`,children:[(0,X.jsxs)(`span`,{className:`w-7 font-semibold`,children:[`P`,t+1]}),(0,X.jsx)(`span`,{className:`h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3`,"aria-hidden":!0,children:(0,X.jsx)(`span`,{className:`block h-full rounded-full`,style:{width:`${Math.max(0,Math.min(100,e/n*100))}%`,background:O[t]}})}),(0,X.jsxs)(`span`,{className:`w-16 text-right tabular-nums`,children:[S(e,1),` mm`]})]},t))})]})}function Yt(){let e=i(),t=l(e=>e.theme),n=me(),o=d(e=>e.serial.simulated),c=ge(e=>e.items),u=(0,Y.useRef)(null),[g,oe]=ne(u),[_,de]=(0,Y.useState)(`demo`);(0,Y.useEffect)(()=>{document.title=`Apresentação · Plataforma de Stewart · IFSP`},[]);let fe=(0,Y.useMemo)(()=>re(),[t]),[v,y]=(0,Y.useState)(!1),[b,Se]=(0,Y.useState)(10),[x,Ce]=(0,Y.useState)(0),S=(0,Y.useMemo)(()=>Vt(e,c),[e,c]);pe(v,()=>y(!1));let C=Ut(v&&_===`demo`,S,b,()=>y(!1)),[we,Te]=(0,Y.useState)(()=>Date.now());(0,Y.useEffect)(()=>{if(!C.startedAt)return;let e=setInterval(()=>Te(Date.now()),1e3);return()=>clearInterval(e)},[C.startedAt]);function Ee(e){y(e),e||r.motionStop().catch(()=>void 0)}let[w,T]=(0,Y.useState)(Gt),De=$[Math.min(w.step,$.length-1)],[E,D]=(0,Y.useState)(()=>a(e.home_z)),[O,Oe]=(0,Y.useState)(0),[k,A]=(0,Y.useState)(null),[ke,j]=(0,Y.useState)(1),Ae=k!==null;(0,Y.useEffect)(()=>{try{localStorage.setItem(Wt,JSON.stringify(w))}catch{}},[w]);let M=(0,Y.useCallback)(e=>{T(t=>({...t,step:Math.max(0,Math.min($.length-1,e))})),A(null)},[]);(0,Y.useEffect)(()=>{if(_!==`aula`)return;let e=e=>{e.target.closest(`input, select, textarea, [role="slider"], [contenteditable="true"]`)||(e.key===`ArrowRight`?M(w.step+1):e.key===`ArrowLeft`&&M(w.step-1))};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[_,w.step,M]);let je=(0,Y.useRef)(0),N=(0,Y.useRef)(a(e.home_z)),P=Ae?xt(E,ke):E,Me=(0,Y.useCallback)(t=>{if(_===`demo`){if(v)N.current=f.getState().telemetry?.pose_live??a(e.home_z);else{je.current+=t;let n=Ke(je.current,e.home_z);N.current=n.pose,n.index!==x&&Ce(n.index)}}else if(N.current=P,k!==null){let e=(performance.now()-k)/4500;e>=1?(A(null),j(1)):j(e)}},[_,v,e.home_z,x,P,k]),Ne=(0,Y.useCallback)(()=>N.current,[]),Pe=qt(_===`demo`);Kt(_===`demo`);let F=qe[x],I=C.startedAt?Math.max(0,b*60-(we-C.startedAt)/1e3):null;return(0,X.jsxs)(`div`,{ref:u,className:p(ae,Pe&&`cursor-none`),children:[(0,X.jsx)(`div`,{className:`absolute inset-0`,"aria-hidden":!0,children:(0,X.jsx)(Lt,{geometry:e,getPose:Ne,background:fe,onFrame:Me,autoRotate:_===`demo`,effects:_===`demo`,children:_===`aula`&&(0,X.jsx)(Ft,{pose:P,geometry:e,flags:De.overlays,leg:O})})}),(0,X.jsxs)(le,{value:_,onValueChange:e=>de(e),children:[(0,X.jsxs)(`div`,{className:p(h,`absolute left-3 top-3 space-y-3 p-3 sm:left-4 sm:top-4`),children:[(0,X.jsxs)(`div`,{className:`flex items-center gap-3`,children:[(0,X.jsx)(`h1`,{className:`text-xl font-semibold`,children:`Apresentação`}),g&&(0,X.jsx)(_e,{})]}),(0,X.jsxs)(ce,{"aria-label":`Modo`,className:`flex gap-1 rounded-lg bg-surface-2 p-1`,children:[(0,X.jsxs)(se,{value:`demo`,className:`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary`,children:[(0,X.jsx)($e,{"aria-hidden":!0,className:`size-4`}),`Demonstração`]}),(0,X.jsxs)(se,{value:`aula`,className:`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary`,children:[(0,X.jsx)(Ze,{"aria-hidden":!0,className:`size-4`}),`Aula`]})]}),(0,X.jsxs)(s,{size:`sm`,variant:`secondary`,onClick:oe,"aria-pressed":g,children:[g?(0,X.jsx)(te,{"aria-hidden":!0}):(0,X.jsx)(ie,{"aria-hidden":!0}),g?`Sair da tela cheia`:`Tela cheia`]})]}),(0,X.jsxs)(ue,{value:`demo`,className:`outline-none`,children:[(0,X.jsxs)(`div`,{className:p(h,`absolute right-3 top-3 max-h-[calc(100%-7rem)] w-[min(24rem,calc(100%-1.5rem))] space-y-4 overflow-y-auto p-4 sm:right-4 sm:top-4`),children:[v?(0,X.jsxs)(`div`,{role:`status`,"aria-live":`polite`,children:[(0,X.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wide text-muted`,children:o?`No simulador`:`Na plataforma`}),(0,X.jsx)(`p`,{className:`text-2xl font-semibold`,children:C.phase===`resting`?`Pausa no home`:C.current??`Preparando…`}),I!==null&&(0,X.jsxs)(`p`,{className:`text-sm text-muted tabular-nums`,children:[`Sessão termina em `,he(I)]})]}):(0,X.jsxs)(`div`,{role:`status`,"aria-live":`polite`,children:[(0,X.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wide text-muted`,children:`Demonstração no modelo`}),(0,X.jsx)(`p`,{className:`text-2xl font-semibold`,children:F.name}),(0,X.jsx)(`p`,{className:`text-sm text-muted`,children:F.description})]}),(0,X.jsx)(Jt,{}),(0,X.jsxs)(`div`,{className:`space-y-3 border-t border-border pt-3`,children:[(0,X.jsx)(xe,{label:`Mover a plataforma de verdade`,description:`Toca ${S.length} movimentos com amplitude reduzida (até ~10 mm/s), 30 s cada, com pausa no home entre eles.`,checked:v,onCheckedChange:Ee,disabled:!n,tone:`danger`}),(0,X.jsx)(be,{label:`Duração da sessão`,value:String(b),onChange:e=>Se(Number(e.target.value)),disabled:v,children:[5,10,15,20,30].map(e=>(0,X.jsxs)(`option`,{value:e,children:[e,` minutos`]},e))}),!n&&(0,X.jsx)(`p`,{className:`text-xs text-muted`,children:`Conecte o simulador ou a bancada no topo para mover de verdade.`})]})]}),(0,X.jsxs)(`div`,{className:p(h,`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 px-4 py-2 sm:bottom-4`),children:[(0,X.jsxs)(`p`,{className:`text-sm font-semibold`,children:[`Pressione `,(0,X.jsx)(`kbd`,{className:`rounded border border-border-strong bg-surface-2 px-1.5 py-0.5`,children:`Esc`}),` para parar`]}),(0,X.jsx)(ye,{})]})]}),(0,X.jsxs)(ue,{value:`aula`,className:`outline-none`,children:[(0,X.jsx)(`div`,{className:p(h,`absolute right-3 top-3 max-h-[calc(100%-6.5rem)] w-[min(28rem,calc(100%-1.5rem))] overflow-y-auto p-4 sm:right-4 sm:top-4`),children:(0,X.jsx)(wt,{step:De,pose:E,onPose:D,leg:O,onLeg:Oe,geometry:e,animating:Ae,onAnimate:()=>{j(0),A(performance.now())},answers:w.answers,onAnswer:(e,t)=>T(n=>({...n,answers:{...n.answers,[e]:t}}))})}),(0,X.jsxs)(`nav`,{"aria-label":`Etapas da aula`,className:p(h,`absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 p-2 sm:inset-x-4 sm:bottom-4`),children:[(0,X.jsxs)(s,{size:`sm`,variant:`secondary`,onClick:()=>M(w.step-1),disabled:w.step===0,"aria-keyshortcuts":`ArrowLeft`,children:[(0,X.jsx)(m,{"aria-hidden":!0}),`Anterior`]}),(0,X.jsx)(`ol`,{className:`flex flex-1 flex-wrap justify-center gap-1.5`,children:$.map((e,t)=>{let n=e.quiz.every((t,n)=>w.answers[`${e.id}:${n}`]===t.correct);return(0,X.jsx)(`li`,{children:(0,X.jsx)(`button`,{type:`button`,onClick:()=>M(t),"aria-current":t===w.step?`step`:void 0,"aria-label":`${e.title}${n?` (concluída)`:``}`,className:p(`grid size-8 place-items-center rounded-full border text-sm font-semibold transition`,t===w.step?`border-primary bg-primary text-on-primary`:n?`border-brand bg-success-soft text-brand-text`:`border-border bg-surface hover:border-brand`),children:t+1})},e.id)})}),(0,X.jsxs)(s,{size:`sm`,variant:`ghost`,onClick:()=>D(a(e.home_z)),children:[(0,X.jsx)(ve,{"aria-hidden":!0}),`Home`]}),(0,X.jsxs)(s,{size:`sm`,variant:`primary`,onClick:()=>M(w.step+1),disabled:w.step===$.length-1,"aria-keyshortcuts":`ArrowRight`,children:[`Próxima`,(0,X.jsx)(ee,{"aria-hidden":!0})]})]})]})]})]})}export{Yt as default};