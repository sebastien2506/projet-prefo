import { EventDispatcher, Vector3, MOUSE, TOUCH, Quaternion, Spherical, Vector2, WebGLRenderer, PerspectiveCamera, Scene, PointLight, DirectionalLight, AmbientLight, SplineCurve, Color, OrthographicCamera, PlaneGeometry, ShaderMaterial, Mesh, Camera, WebGLRenderTarget, RGBAFormat, DataTexture, FloatType, NearestFilter, ClampToEdgeWrapping, HalfFloatType, BufferGeometry, BufferAttribute, AdditiveBlending, Points, MathUtils, CanvasTexture, InstancedBufferAttribute, DoubleSide, TextureLoader, MeshBasicMaterial, MeshPhongMaterial, MeshStandardMaterial, InstancedMesh, Float32BufferAttribute, UniformsUtils, Clock, SphereGeometry, OctahedronGeometry, ConeGeometry, CapsuleGeometry, BoxGeometry, FogExp2 } from 'https://unpkg.com/three@0.140.0/build/three.module.js';

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

const _changeEvent = { type: 'change' };
const _startEvent = { type: 'start' };
const _endEvent = { type: 'end' };

class OrbitControls extends EventDispatcher {

	constructor( object, domElement ) {

		super();

		if ( domElement === undefined ) console.warn( 'THREE.OrbitControls: The second parameter "domElement" is now mandatory.' );
		if ( domElement === document ) console.error( 'THREE.OrbitControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.' );

		this.object = object;
		this.domElement = domElement;
		this.domElement.style.touchAction = 'none'; // disable touch scroll

		// Set to false to disable this control
		this.enabled = true;

		// "target" sets the location of focus, where the object orbits around
		this.target = new Vector3();

		// How far you can dolly in and out ( PerspectiveCamera only )
		this.minDistance = 0;
		this.maxDistance = Infinity;

		// How far you can zoom in and out ( OrthographicCamera only )
		this.minZoom = 0;
		this.maxZoom = Infinity;

		// How far you can orbit vertically, upper and lower limits.
		// Range is 0 to Math.PI radians.
		this.minPolarAngle = 0; // radians
		this.maxPolarAngle = Math.PI; // radians

		// How far you can orbit horizontally, upper and lower limits.
		// If set, the interval [ min, max ] must be a sub-interval of [ - 2 PI, 2 PI ], with ( max - min < 2 PI )
		this.minAzimuthAngle = - Infinity; // radians
		this.maxAzimuthAngle = Infinity; // radians

		// Set to true to enable damping (inertia)
		// If damping is enabled, you must call controls.update() in your animation loop
		this.enableDamping = false;
		this.dampingFactor = 0.05;

		// This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
		// Set to false to disable zooming
		this.enableZoom = true;
		this.zoomSpeed = 1.0;

		// Set to false to disable rotating
		this.enableRotate = true;
		this.rotateSpeed = 1.0;

		// Set to false to disable panning
		this.enablePan = true;
		this.panSpeed = 1.0;
		this.screenSpacePanning = true; // if false, pan orthogonal to world-space direction camera.up
		this.keyPanSpeed = 7.0;	// pixels moved per arrow key push

		// Set to true to automatically rotate around the target
		// If auto-rotate is enabled, you must call controls.update() in your animation loop
		this.autoRotate = false;
		this.autoRotateSpeed = 2.0; // 30 seconds per orbit when fps is 60

		// The four arrow keys
		this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

		// Mouse buttons
		this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };

		// Touch fingers
		this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

		// for reset
		this.target0 = this.target.clone();
		this.position0 = this.object.position.clone();
		this.zoom0 = this.object.zoom;

		// the target DOM element for key events
		this._domElementKeyEvents = null;

		//
		// public methods
		//

		this.getPolarAngle = function () {

			return spherical.phi;

		};

		this.getAzimuthalAngle = function () {

			return spherical.theta;

		};

		this.getDistance = function () {

			return this.object.position.distanceTo( this.target );

		};

		this.listenToKeyEvents = function ( domElement ) {

			domElement.addEventListener( 'keydown', onKeyDown );
			this._domElementKeyEvents = domElement;

		};

		this.saveState = function () {

			scope.target0.copy( scope.target );
			scope.position0.copy( scope.object.position );
			scope.zoom0 = scope.object.zoom;

		};

		this.reset = function () {

			scope.target.copy( scope.target0 );
			scope.object.position.copy( scope.position0 );
			scope.object.zoom = scope.zoom0;

			scope.object.updateProjectionMatrix();
			scope.dispatchEvent( _changeEvent );

			scope.update();

			state = STATE.NONE;

		};

		// this method is exposed, but perhaps it would be better if we can make it private...
		this.update = function () {

			const offset = new Vector3();

			// so camera.up is the orbit axis
			const quat = new Quaternion().setFromUnitVectors( object.up, new Vector3( 0, 1, 0 ) );
			const quatInverse = quat.clone().invert();

			const lastPosition = new Vector3();
			const lastQuaternion = new Quaternion();

			const twoPI = 2 * Math.PI;

			return function update() {

				const position = scope.object.position;

				offset.copy( position ).sub( scope.target );

				// rotate offset to "y-axis-is-up" space
				offset.applyQuaternion( quat );

				// angle from z-axis around y-axis
				spherical.setFromVector3( offset );

				if ( scope.autoRotate && state === STATE.NONE ) {

					rotateLeft( getAutoRotationAngle() );

				}

				if ( scope.enableDamping ) {

					spherical.theta += sphericalDelta.theta * scope.dampingFactor;
					spherical.phi += sphericalDelta.phi * scope.dampingFactor;

				} else {

					spherical.theta += sphericalDelta.theta;
					spherical.phi += sphericalDelta.phi;

				}

				// restrict theta to be between desired limits

				let min = scope.minAzimuthAngle;
				let max = scope.maxAzimuthAngle;

				if ( isFinite( min ) && isFinite( max ) ) {

					if ( min < - Math.PI ) min += twoPI; else if ( min > Math.PI ) min -= twoPI;

					if ( max < - Math.PI ) max += twoPI; else if ( max > Math.PI ) max -= twoPI;

					if ( min <= max ) {

						spherical.theta = Math.max( min, Math.min( max, spherical.theta ) );

					} else {

						spherical.theta = ( spherical.theta > ( min + max ) / 2 ) ?
							Math.max( min, spherical.theta ) :
							Math.min( max, spherical.theta );

					}

				}

				// restrict phi to be between desired limits
				spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );

				spherical.makeSafe();


				spherical.radius *= scale;

				// restrict radius to be between desired limits
				spherical.radius = Math.max( scope.minDistance, Math.min( scope.maxDistance, spherical.radius ) );

				// move target to panned location

				if ( scope.enableDamping === true ) {

					scope.target.addScaledVector( panOffset, scope.dampingFactor );

				} else {

					scope.target.add( panOffset );

				}

				offset.setFromSpherical( spherical );

				// rotate offset back to "camera-up-vector-is-up" space
				offset.applyQuaternion( quatInverse );

				position.copy( scope.target ).add( offset );

				scope.object.lookAt( scope.target );

				if ( scope.enableDamping === true ) {

					sphericalDelta.theta *= ( 1 - scope.dampingFactor );
					sphericalDelta.phi *= ( 1 - scope.dampingFactor );

					panOffset.multiplyScalar( 1 - scope.dampingFactor );

				} else {

					sphericalDelta.set( 0, 0, 0 );

					panOffset.set( 0, 0, 0 );

				}

				scale = 1;

				// update condition is:
				// min(camera displacement, camera rotation in radians)^2 > EPS
				// using small-angle approximation cos(x/2) = 1 - x^2 / 8

				if ( zoomChanged ||
					lastPosition.distanceToSquared( scope.object.position ) > EPS ||
					8 * ( 1 - lastQuaternion.dot( scope.object.quaternion ) ) > EPS ) {

					scope.dispatchEvent( _changeEvent );

					lastPosition.copy( scope.object.position );
					lastQuaternion.copy( scope.object.quaternion );
					zoomChanged = false;

					return true;

				}

				return false;

			};

		}();

		this.dispose = function () {

			scope.domElement.removeEventListener( 'contextmenu', onContextMenu );

			scope.domElement.removeEventListener( 'pointerdown', onPointerDown );
			scope.domElement.removeEventListener( 'pointercancel', onPointerCancel );
			scope.domElement.removeEventListener( 'wheel', onMouseWheel );

			scope.domElement.removeEventListener( 'pointermove', onPointerMove );
			scope.domElement.removeEventListener( 'pointerup', onPointerUp );


			if ( scope._domElementKeyEvents !== null ) {

				scope._domElementKeyEvents.removeEventListener( 'keydown', onKeyDown );

			}

			//scope.dispatchEvent( { type: 'dispose' } ); // should this be added here?

		};

		//
		// internals
		//

		const scope = this;

		const STATE = {
			NONE: - 1,
			ROTATE: 0,
			DOLLY: 1,
			PAN: 2,
			TOUCH_ROTATE: 3,
			TOUCH_PAN: 4,
			TOUCH_DOLLY_PAN: 5,
			TOUCH_DOLLY_ROTATE: 6
		};

		let state = STATE.NONE;

		const EPS = 0.000001;

		// current position in spherical coordinates
		const spherical = new Spherical();
		const sphericalDelta = new Spherical();

		let scale = 1;
		const panOffset = new Vector3();
		let zoomChanged = false;

		const rotateStart = new Vector2();
		const rotateEnd = new Vector2();
		const rotateDelta = new Vector2();

		const panStart = new Vector2();
		const panEnd = new Vector2();
		const panDelta = new Vector2();

		const dollyStart = new Vector2();
		const dollyEnd = new Vector2();
		const dollyDelta = new Vector2();

		const pointers = [];
		const pointerPositions = {};

		function getAutoRotationAngle() {

			return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;

		}

		function getZoomScale() {

			return Math.pow( 0.95, scope.zoomSpeed );

		}

		function rotateLeft( angle ) {

			sphericalDelta.theta -= angle;

		}

		function rotateUp( angle ) {

			sphericalDelta.phi -= angle;

		}

		const panLeft = function () {

			const v = new Vector3();

			return function panLeft( distance, objectMatrix ) {

				v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
				v.multiplyScalar( - distance );

				panOffset.add( v );

			};

		}();

		const panUp = function () {

			const v = new Vector3();

			return function panUp( distance, objectMatrix ) {

				if ( scope.screenSpacePanning === true ) {

					v.setFromMatrixColumn( objectMatrix, 1 );

				} else {

					v.setFromMatrixColumn( objectMatrix, 0 );
					v.crossVectors( scope.object.up, v );

				}

				v.multiplyScalar( distance );

				panOffset.add( v );

			};

		}();

		// deltaX and deltaY are in pixels; right and down are positive
		const pan = function () {

			const offset = new Vector3();

			return function pan( deltaX, deltaY ) {

				const element = scope.domElement;

				if ( scope.object.isPerspectiveCamera ) {

					// perspective
					const position = scope.object.position;
					offset.copy( position ).sub( scope.target );
					let targetDistance = offset.length();

					// half of the fov is center to top of screen
					targetDistance *= Math.tan( ( scope.object.fov / 2 ) * Math.PI / 180.0 );

					// we use only clientHeight here so aspect ratio does not distort speed
					panLeft( 2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix );
					panUp( 2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix );

				} else if ( scope.object.isOrthographicCamera ) {

					// orthographic
					panLeft( deltaX * ( scope.object.right - scope.object.left ) / scope.object.zoom / element.clientWidth, scope.object.matrix );
					panUp( deltaY * ( scope.object.top - scope.object.bottom ) / scope.object.zoom / element.clientHeight, scope.object.matrix );

				} else {

					// camera neither orthographic nor perspective
					console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
					scope.enablePan = false;

				}

			};

		}();

		function dollyOut( dollyScale ) {

			if ( scope.object.isPerspectiveCamera ) {

				scale /= dollyScale;

			} else if ( scope.object.isOrthographicCamera ) {

				scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom * dollyScale ) );
				scope.object.updateProjectionMatrix();
				zoomChanged = true;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				scope.enableZoom = false;

			}

		}

		function dollyIn( dollyScale ) {

			if ( scope.object.isPerspectiveCamera ) {

				scale *= dollyScale;

			} else if ( scope.object.isOrthographicCamera ) {

				scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom / dollyScale ) );
				scope.object.updateProjectionMatrix();
				zoomChanged = true;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				scope.enableZoom = false;

			}

		}

		//
		// event callbacks - update the object state
		//

		function handleMouseDownRotate( event ) {

			rotateStart.set( event.clientX, event.clientY );

		}

		function handleMouseDownDolly( event ) {

			dollyStart.set( event.clientX, event.clientY );

		}

		function handleMouseDownPan( event ) {

			panStart.set( event.clientX, event.clientY );

		}

		function handleMouseMoveRotate( event ) {

			rotateEnd.set( event.clientX, event.clientY );

			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

			const element = scope.domElement;

			rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

			rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

			rotateStart.copy( rotateEnd );

			scope.update();

		}

		function handleMouseMoveDolly( event ) {

			dollyEnd.set( event.clientX, event.clientY );

			dollyDelta.subVectors( dollyEnd, dollyStart );

			if ( dollyDelta.y > 0 ) {

				dollyOut( getZoomScale() );

			} else if ( dollyDelta.y < 0 ) {

				dollyIn( getZoomScale() );

			}

			dollyStart.copy( dollyEnd );

			scope.update();

		}

		function handleMouseMovePan( event ) {

			panEnd.set( event.clientX, event.clientY );

			panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

			pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

			scope.update();

		}

		function handleMouseWheel( event ) {

			if ( event.deltaY < 0 ) {

				dollyIn( getZoomScale() );

			} else if ( event.deltaY > 0 ) {

				dollyOut( getZoomScale() );

			}

			scope.update();

		}

		function handleKeyDown( event ) {

			let needsUpdate = false;

			switch ( event.code ) {

				case scope.keys.UP:
					pan( 0, scope.keyPanSpeed );
					needsUpdate = true;
					break;

				case scope.keys.BOTTOM:
					pan( 0, - scope.keyPanSpeed );
					needsUpdate = true;
					break;

				case scope.keys.LEFT:
					pan( scope.keyPanSpeed, 0 );
					needsUpdate = true;
					break;

				case scope.keys.RIGHT:
					pan( - scope.keyPanSpeed, 0 );
					needsUpdate = true;
					break;

			}

			if ( needsUpdate ) {

				// prevent the browser from scrolling on cursor keys
				event.preventDefault();

				scope.update();

			}


		}

		function handleTouchStartRotate() {

			if ( pointers.length === 1 ) {

				rotateStart.set( pointers[ 0 ].pageX, pointers[ 0 ].pageY );

			} else {

				const x = 0.5 * ( pointers[ 0 ].pageX + pointers[ 1 ].pageX );
				const y = 0.5 * ( pointers[ 0 ].pageY + pointers[ 1 ].pageY );

				rotateStart.set( x, y );

			}

		}

		function handleTouchStartPan() {

			if ( pointers.length === 1 ) {

				panStart.set( pointers[ 0 ].pageX, pointers[ 0 ].pageY );

			} else {

				const x = 0.5 * ( pointers[ 0 ].pageX + pointers[ 1 ].pageX );
				const y = 0.5 * ( pointers[ 0 ].pageY + pointers[ 1 ].pageY );

				panStart.set( x, y );

			}

		}

		function handleTouchStartDolly() {

			const dx = pointers[ 0 ].pageX - pointers[ 1 ].pageX;
			const dy = pointers[ 0 ].pageY - pointers[ 1 ].pageY;

			const distance = Math.sqrt( dx * dx + dy * dy );

			dollyStart.set( 0, distance );

		}

		function handleTouchStartDollyPan() {

			if ( scope.enableZoom ) handleTouchStartDolly();

			if ( scope.enablePan ) handleTouchStartPan();

		}

		function handleTouchStartDollyRotate() {

			if ( scope.enableZoom ) handleTouchStartDolly();

			if ( scope.enableRotate ) handleTouchStartRotate();

		}

		function handleTouchMoveRotate( event ) {

			if ( pointers.length == 1 ) {

				rotateEnd.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				rotateEnd.set( x, y );

			}

			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

			const element = scope.domElement;

			rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

			rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

			rotateStart.copy( rotateEnd );

		}

		function handleTouchMovePan( event ) {

			if ( pointers.length === 1 ) {

				panEnd.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				panEnd.set( x, y );

			}

			panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

			pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

		}

		function handleTouchMoveDolly( event ) {

			const position = getSecondPointerPosition( event );

			const dx = event.pageX - position.x;
			const dy = event.pageY - position.y;

			const distance = Math.sqrt( dx * dx + dy * dy );

			dollyEnd.set( 0, distance );

			dollyDelta.set( 0, Math.pow( dollyEnd.y / dollyStart.y, scope.zoomSpeed ) );

			dollyOut( dollyDelta.y );

			dollyStart.copy( dollyEnd );

		}

		function handleTouchMoveDollyPan( event ) {

			if ( scope.enableZoom ) handleTouchMoveDolly( event );

			if ( scope.enablePan ) handleTouchMovePan( event );

		}

		function handleTouchMoveDollyRotate( event ) {

			if ( scope.enableZoom ) handleTouchMoveDolly( event );

			if ( scope.enableRotate ) handleTouchMoveRotate( event );

		}

		//
		// event handlers - FSM: listen for events and reset state
		//

		function onPointerDown( event ) {

			if ( scope.enabled === false ) return;

			if ( pointers.length === 0 ) {

				scope.domElement.setPointerCapture( event.pointerId );

				scope.domElement.addEventListener( 'pointermove', onPointerMove );
				scope.domElement.addEventListener( 'pointerup', onPointerUp );

			}

			//

			addPointer( event );

			if ( event.pointerType === 'touch' ) {

				onTouchStart( event );

			} else {

				onMouseDown( event );

			}

		}

		function onPointerMove( event ) {

			if ( scope.enabled === false ) return;

			if ( event.pointerType === 'touch' ) {

				onTouchMove( event );

			} else {

				onMouseMove( event );

			}

		}

		function onPointerUp( event ) {

		    removePointer( event );

		    if ( pointers.length === 0 ) {

		        scope.domElement.releasePointerCapture( event.pointerId );

		        scope.domElement.removeEventListener( 'pointermove', onPointerMove );
		        scope.domElement.removeEventListener( 'pointerup', onPointerUp );

		    }

		    scope.dispatchEvent( _endEvent );

		    state = STATE.NONE;

		}

		function onPointerCancel( event ) {

			removePointer( event );

		}

		function onMouseDown( event ) {

			let mouseAction;

			switch ( event.button ) {

				case 0:

					mouseAction = scope.mouseButtons.LEFT;
					break;

				case 1:

					mouseAction = scope.mouseButtons.MIDDLE;
					break;

				case 2:

					mouseAction = scope.mouseButtons.RIGHT;
					break;

				default:

					mouseAction = - 1;

			}

			switch ( mouseAction ) {

				case MOUSE.DOLLY:

					if ( scope.enableZoom === false ) return;

					handleMouseDownDolly( event );

					state = STATE.DOLLY;

					break;

				case MOUSE.ROTATE:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( scope.enablePan === false ) return;

						handleMouseDownPan( event );

						state = STATE.PAN;

					} else {

						if ( scope.enableRotate === false ) return;

						handleMouseDownRotate( event );

						state = STATE.ROTATE;

					}

					break;

				case MOUSE.PAN:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( scope.enableRotate === false ) return;

						handleMouseDownRotate( event );

						state = STATE.ROTATE;

					} else {

						if ( scope.enablePan === false ) return;

						handleMouseDownPan( event );

						state = STATE.PAN;

					}

					break;

				default:

					state = STATE.NONE;

			}

			if ( state !== STATE.NONE ) {

				scope.dispatchEvent( _startEvent );

			}

		}

		function onMouseMove( event ) {

			if ( scope.enabled === false ) return;

			switch ( state ) {

				case STATE.ROTATE:

					if ( scope.enableRotate === false ) return;

					handleMouseMoveRotate( event );

					break;

				case STATE.DOLLY:

					if ( scope.enableZoom === false ) return;

					handleMouseMoveDolly( event );

					break;

				case STATE.PAN:

					if ( scope.enablePan === false ) return;

					handleMouseMovePan( event );

					break;

			}

		}

		function onMouseWheel( event ) {

			if ( scope.enabled === false || scope.enableZoom === false || state !== STATE.NONE ) return;

			event.preventDefault();

			scope.dispatchEvent( _startEvent );

			handleMouseWheel( event );

			scope.dispatchEvent( _endEvent );

		}

		function onKeyDown( event ) {

			if ( scope.enabled === false || scope.enablePan === false ) return;

			handleKeyDown( event );

		}

		function onTouchStart( event ) {

			trackPointer( event );

			switch ( pointers.length ) {

				case 1:

					switch ( scope.touches.ONE ) {

						case TOUCH.ROTATE:

							if ( scope.enableRotate === false ) return;

							handleTouchStartRotate();

							state = STATE.TOUCH_ROTATE;

							break;

						case TOUCH.PAN:

							if ( scope.enablePan === false ) return;

							handleTouchStartPan();

							state = STATE.TOUCH_PAN;

							break;

						default:

							state = STATE.NONE;

					}

					break;

				case 2:

					switch ( scope.touches.TWO ) {

						case TOUCH.DOLLY_PAN:

							if ( scope.enableZoom === false && scope.enablePan === false ) return;

							handleTouchStartDollyPan();

							state = STATE.TOUCH_DOLLY_PAN;

							break;

						case TOUCH.DOLLY_ROTATE:

							if ( scope.enableZoom === false && scope.enableRotate === false ) return;

							handleTouchStartDollyRotate();

							state = STATE.TOUCH_DOLLY_ROTATE;

							break;

						default:

							state = STATE.NONE;

					}

					break;

				default:

					state = STATE.NONE;

			}

			if ( state !== STATE.NONE ) {

				scope.dispatchEvent( _startEvent );

			}

		}

		function onTouchMove( event ) {

			trackPointer( event );

			switch ( state ) {

				case STATE.TOUCH_ROTATE:

					if ( scope.enableRotate === false ) return;

					handleTouchMoveRotate( event );

					scope.update();

					break;

				case STATE.TOUCH_PAN:

					if ( scope.enablePan === false ) return;

					handleTouchMovePan( event );

					scope.update();

					break;

				case STATE.TOUCH_DOLLY_PAN:

					if ( scope.enableZoom === false && scope.enablePan === false ) return;

					handleTouchMoveDollyPan( event );

					scope.update();

					break;

				case STATE.TOUCH_DOLLY_ROTATE:

					if ( scope.enableZoom === false && scope.enableRotate === false ) return;

					handleTouchMoveDollyRotate( event );

					scope.update();

					break;

				default:

					state = STATE.NONE;

			}

		}

		function onContextMenu( event ) {

			if ( scope.enabled === false ) return;

			event.preventDefault();

		}

		function addPointer( event ) {

			pointers.push( event );

		}

		function removePointer( event ) {

			delete pointerPositions[ event.pointerId ];

			for ( let i = 0; i < pointers.length; i ++ ) {

				if ( pointers[ i ].pointerId == event.pointerId ) {

					pointers.splice( i, 1 );
					return;

				}

			}

		}

		function trackPointer( event ) {

			let position = pointerPositions[ event.pointerId ];

			if ( position === undefined ) {

				position = new Vector2();
				pointerPositions[ event.pointerId ] = position;

			}

			position.set( event.pageX, event.pageY );

		}

		function getSecondPointerPosition( event ) {

			const pointer = ( event.pointerId === pointers[ 0 ].pointerId ) ? pointers[ 1 ] : pointers[ 0 ];

			return pointerPositions[ pointer.pointerId ];

		}

		//

		scope.domElement.addEventListener( 'contextmenu', onContextMenu );

		scope.domElement.addEventListener( 'pointerdown', onPointerDown );
		scope.domElement.addEventListener( 'pointercancel', onPointerCancel );
		scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );

		// force an update at start

		this.update();

	}

}

function pointer(params) {
  const {
    domElement,
    onClick = () => {
    },
    onEnter = () => {
    },
    onMove = () => {
    },
    onLeave = () => {
    },
    onDragStart = () => {
    },
    onDragMove = () => {
    },
    onDragStop = () => {
    }
  } = params;
  const position = new Vector2();
  const nPosition = new Vector2();
  const startPosition = new Vector2();
  const lastPosition = new Vector2();
  const delta = new Vector2();
  const obj = { position, nPosition, hover: false, down: false, removeListeners };
  addListeners();
  return obj;
  function pointerClick(e) {
    if (startPosition.distanceTo(position) < 20) {
      updatePosition(e);
      onClick({ position, nPosition });
    }
  }
  function pointerEnter(e) {
    obj.hover = e.pointerType === "mouse";
    updatePosition(e);
    onEnter({ position, nPosition });
  }
  function pointerDown(e) {
    obj.down = true;
    updatePosition(e);
    startPosition.copy(position);
    lastPosition.copy(position);
    onDragStart({ position, nPosition });
  }
  function pointerMove(e) {
    updatePosition(e);
    delta.copy(position).sub(lastPosition);
    if (obj.down) {
      onDragMove({ position, nPosition, startPosition, lastPosition, delta });
    } else {
      if (!obj.hover)
        obj.hover = true;
    }
    onMove({ position, nPosition, startPosition, lastPosition, delta });
    lastPosition.copy(position);
  }
  function pointerUp(e) {
    obj.down = false;
    onDragStop();
  }
  function pointerLeave(e) {
    if (obj.down) {
      obj.down = false;
      onDragStop();
    }
    obj.hover = false;
    onLeave();
  }
  function updatePosition(e) {
    const rect = domElement.getBoundingClientRect();
    position.x = e.clientX - rect.left;
    position.y = e.clientY - rect.top;
    nPosition.x = position.x / rect.width * 2 - 1;
    nPosition.y = -(position.y / rect.height) * 2 + 1;
  }
  function addListeners() {
    domElement.addEventListener("click", pointerClick);
    domElement.addEventListener("pointerenter", pointerEnter);
    domElement.addEventListener("pointerdown", pointerDown);
    domElement.addEventListener("pointermove", pointerMove);
    domElement.addEventListener("pointerup", pointerUp);
    domElement.addEventListener("pointerleave", pointerLeave);
  }
  function removeListeners() {
    domElement.removeEventListener("click", pointerClick);
    domElement.removeEventListener("pointerenter", pointerEnter);
    domElement.removeEventListener("pointerdown", pointerDown);
    domElement.removeEventListener("pointermove", pointerMove);
    domElement.removeEventListener("pointerup", pointerUp);
    domElement.removeEventListener("pointerleave", pointerLeave);
  }
}

function three(params) {
  const options = {
    el: null,
    canvas: null,
    eventsEl: null,
    width: null,
    height: null,
    resize: true,
    alpha: false,
    antialias: false,
    orbitControls: false,
    init() {
    },
    initCamera() {
    },
    initScene() {
    },
    afterResize() {
    },
    beforeRender() {
    },
    ...params
  };
  const three = {
    renderer: null,
    camera: null,
    scene: null,
    pointer: null,
    width: 0,
    height: 0,
    wWidth: 0,
    wHeight: 0,
    clock: {
      startTime: 0,
      time: 0,
      elapsed: 0
    },
    options
  };
  let render;
  let cameraCtrl;
  init();
  return three;
  function init() {
    var _a, _b, _c, _d, _e;
    let canvas;
    if (options.el) {
      canvas = document.createElement("canvas");
      options.el.appendChild(canvas);
    } else if (options.canvas) {
      canvas = options.canvas;
    } else {
      throw new Error("Missing parameter : el or canvas is required");
    }
    (_a = options.init) == null ? void 0 : _a.call(options, three);
    three.renderer = new WebGLRenderer({ canvas, alpha: options.alpha, antialias: options.antialias });
    (_b = options.initRenderer) == null ? void 0 : _b.call(options, three);
    three.camera = new PerspectiveCamera();
    three.camera.position.z = 50;
    (_c = options.initCamera) == null ? void 0 : _c.call(options, three);
    if (options.orbitControls) {
      cameraCtrl = new OrbitControls(three.camera, (_d = options.eventsEl) != null ? _d : three.renderer.domElement);
      cameraCtrl.enableDamping = true;
      cameraCtrl.dampingFactor = 0.1;
      if (typeof options.orbitControls === "object") {
        Object.keys(options.orbitControls).forEach((key) => {
          cameraCtrl[key] = options.orbitControls[key];
        });
      }
    }
    resize();
    if (options.resize && !options.width && !options.height) {
      window.addEventListener("resize", resize);
    }
    three.scene = new Scene();
    (_e = options.initScene) == null ? void 0 : _e.call(options, three);
    initPointer();
    render = options.render ? options.render : () => {
      three.renderer.render(three.scene, three.camera);
    };
    requestAnimationFrame((timestamp) => {
      three.clock.startTime = three.clock.time = timestamp;
      requestAnimationFrame(animate);
    });
  }
  function initPointer() {
    var _a, _b;
    const pointerOptions = {};
    if (options.onPointerEnter) {
      pointerOptions.onEnter = options.onPointerEnter;
    }
    if (options.onPointerMove) {
      pointerOptions.onMove = options.onPointerMove;
    }
    if (options.onPointerMove) {
      pointerOptions.onLeave = options.onPointerLeave;
    }
    if (Object.keys(pointerOptions).length > 0) {
      three.pointer = pointer({ domElement: (_b = options.eventsEl) != null ? _b : (_a = options.el) != null ? _a : options.canvas, ...pointerOptions });
    }
  }
  function animate(timestamp) {
    const { clock } = three;
    clock.elapsed = timestamp - clock.time;
    clock.time = timestamp;
    options.beforeRender(three);
    if (cameraCtrl)
      cameraCtrl.update();
    render(three);
    requestAnimationFrame(animate);
  }
  function resize() {
    var _a;
    if (options.width && options.height) {
      three.width = options.width;
      three.height = options.height;
    } else if (options.resize === "window") {
      three.width = window.innerWidth;
      three.height = window.innerHeight;
    } else {
      const parent = three.renderer.domElement.parentElement;
      three.width = parent.clientWidth;
      three.height = parent.clientHeight;
    }
    three.renderer.setSize(three.width, three.height);
    three.camera.aspect = three.width / three.height;
    three.camera.updateProjectionMatrix();
    if (three.camera instanceof PerspectiveCamera) {
      const wsize = getCameraViewSize();
      three.wWidth = wsize[0];
      three.wHeight = wsize[1];
    } else {
      three.wWidth = three.camera.top - three.camera.bottom;
      three.wHeight = three.camera.right - three.camera.left;
    }
    (_a = options.afterResize) == null ? void 0 : _a.call(options, three);
  }
  function getCameraViewSize() {
    const vFOV = three.camera.fov * Math.PI / 180;
    const h = 2 * Math.tan(vFOV / 2) * Math.abs(three.camera.position.z);
    const w = h * three.camera.aspect;
    return [w, h];
  }
}
function commonConfig$1(params) {
  const config = {};
  const keys = ["el", "canvas", "eventsEl", "width", "height", "resize", "orbitControls"];
  keys.forEach((key) => {
    if (params[key] !== void 0)
      config[key] = params[key];
  });
  return config;
}
function initLights(scene, lightsConfig) {
  const lights = [];
  if (Array.isArray(lightsConfig) && lightsConfig.length > 0) {
    let light;
    lightsConfig.forEach((lightConfig) => {
      switch (lightConfig.type) {
        case "ambient":
          light = new AmbientLight(...lightConfig.params);
          break;
        case "directional":
          light = new DirectionalLight(...lightConfig.params);
          break;
        case "point":
          light = new PointLight(...lightConfig.params);
          break;
        default:
          console.error(`Unknown light type ${lightConfig.type}`);
      }
      if (light) {
        if (typeof lightConfig.props === "object") {
          Object.keys(lightConfig.props).forEach((key) => {
            if (key === "position") {
              light.position.set(...lightConfig.props[key]);
            } else
              light[key] = lightConfig.props[key];
          });
        }
        scene.add(light);
        lights.push(light);
      }
    });
  }
  return lights;
}

const defaultConfig$6 = {
  shaderPoints: 8,
  curvePoints: 80,
  curveLerp: 0.75,
  radius1: 3,
  radius2: 5,
  velocityTreshold: 10,
  sleepRadiusX: 150,
  sleepRadiusY: 150,
  sleepTimeCoefX: 25e-4,
  sleepTimeCoefY: 25e-4
};
function index$5(params) {
  const config = { ...defaultConfig$6, ...params };
  const points = new Array(config.curvePoints).fill(0).map(() => new Vector2());
  const spline = new SplineCurve(points);
  const velocity = new Vector3();
  const velocityTarget = new Vector3();
  const uRatio = { value: new Vector2() };
  const uSize = { value: new Vector2() };
  const uPoints = { value: new Array(config.shaderPoints).fill(0).map(() => new Vector2()) };
  const uColor = { value: new Color(16711935) };
  let material;
  let plane;
  let hover = false;
  const threeConfig = {};
  const keys = ["el", "canvas", "width", "height", "resize"];
  keys.forEach((key) => {
    if (params[key] !== void 0)
      threeConfig[key] = params[key];
  });
  three({
    ...threeConfig,
    antialias: false,
    initCamera(three2) {
      three2.camera = new OrthographicCamera();
    },
    initScene({ scene }) {
      const geometry = new PlaneGeometry(2, 2);
      material = new ShaderMaterial({
        uniforms: { uRatio, uSize, uPoints, uColor },
        defines: {
          SHADER_POINTS: config.shaderPoints
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          // https://www.shadertoy.com/view/wdy3DD
          // https://www.shadertoy.com/view/MlKcDD
          // Signed distance to a quadratic bezier
          float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
            vec2 a = B - A;
            vec2 b = A - 2.0*B + C;
            vec2 c = a * 2.0;
            vec2 d = A - pos;
            float kk = 1.0 / dot(b,b);
            float kx = kk * dot(a,b);
            float ky = kk * (2.0*dot(a,a)+dot(d,b)) / 3.0;
            float kz = kk * dot(d,a);
            float res = 0.0;
            float p = ky - kx*kx;
            float p3 = p*p*p;
            float q = kx*(2.0*kx*kx - 3.0*ky) + kz;
            float h = q*q + 4.0*p3;
            if(h >= 0.0){
              h = sqrt(h);
              vec2 x = (vec2(h, -h) - q) / 2.0;
              vec2 uv = sign(x)*pow(abs(x), vec2(1.0/3.0));
              float t = uv.x + uv.y - kx;
              t = clamp( t, 0.0, 1.0 );
              // 1 root
              vec2 qos = d + (c + b*t)*t;
              res = length(qos);
            } else {
              float z = sqrt(-p);
              float v = acos( q/(p*z*2.0) ) / 3.0;
              float m = cos(v);
              float n = sin(v)*1.732050808;
              vec3 t = vec3(m + m, -n - m, n - m) * z - kx;
              t = clamp( t, 0.0, 1.0 );
              // 3 roots
              vec2 qos = d + (c + b*t.x)*t.x;
              float dis = dot(qos,qos);
              res = dis;
              qos = d + (c + b*t.y)*t.y;
              dis = dot(qos,qos);
              res = min(res,dis);
              qos = d + (c + b*t.z)*t.z;
              dis = dot(qos,qos);
              res = min(res,dis);
              res = sqrt( res );
            }
            return res;
          }

          uniform vec2 uRatio;
          uniform vec2 uSize;
          uniform vec2 uPoints[SHADER_POINTS];
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float intensity = 1.0;
            float radius = 0.015;

            vec2 pos = (vUv - 0.5) * uRatio;

            vec2 c = (uPoints[0] + uPoints[1]) / 2.0;
            vec2 c_prev;
            float dist = 10000.0;
            for(int i = 0; i < SHADER_POINTS - 1; i++){
              c_prev = c;
              c = (uPoints[i] + uPoints[i + 1]) / 2.0;
              dist = min(dist, sdBezier(pos, c_prev, uPoints[i], c));
            }
            dist = max(0.0, dist);

            float glow = pow(uSize.y / dist, intensity);
            vec3 col = vec3(0.0);
            col += 10.0 * vec3(smoothstep(uSize.x, 0.0, dist));
            col += glow * uColor;

            // Tone mapping
            col = 1.0 - exp(-col);
            col = pow(col, vec3(0.4545));
  
            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
      plane = new Mesh(geometry, material);
      scene.add(plane);
    },
    afterResize({ width, height }) {
      uSize.value.set(config.radius1, config.radius2);
      if (width >= height) {
        uRatio.value.set(1, height / width);
        uSize.value.multiplyScalar(1 / width);
      } else {
        uRatio.value.set(width / height, 1);
        uSize.value.multiplyScalar(1 / height);
      }
    },
    beforeRender({ clock, width, height, wWidth }) {
      for (let i = 1; i < config.curvePoints; i++) {
        points[i].lerp(points[i - 1], config.curveLerp);
      }
      for (let i = 0; i < config.shaderPoints; i++) {
        spline.getPoint(i / (config.shaderPoints - 1), uPoints.value[i]);
      }
      if (!hover) {
        const t1 = clock.time * config.sleepTimeCoefX;
        const t2 = clock.time * config.sleepTimeCoefY;
        const cos = Math.cos(t1);
        const sin = Math.sin(t2);
        const r1 = config.sleepRadiusX * wWidth / width;
        const r2 = config.sleepRadiusY * wWidth / width;
        const x = r1 * cos;
        const y = r2 * sin;
        spline.points[0].set(x, y);
        uColor.value.r = 0.5 + 0.5 * Math.cos(clock.time * 15e-4);
        uColor.value.g = 0;
        uColor.value.b = 1 - uColor.value.r;
      } else {
        uColor.value.r = velocity.z;
        uColor.value.g = 0;
        uColor.value.b = 1 - velocity.z;
        velocity.multiplyScalar(0.95);
      }
    },
    onPointerMove({ nPosition, delta }) {
      hover = true;
      const x = 0.5 * nPosition.x * uRatio.value.x;
      const y = 0.5 * nPosition.y * uRatio.value.y;
      spline.points[0].set(x, y);
      velocityTarget.x = Math.min(velocity.x + Math.abs(delta.x) / config.velocityTreshold, 1);
      velocityTarget.y = Math.min(velocity.y + Math.abs(delta.y) / config.velocityTreshold, 1);
      velocityTarget.z = Math.sqrt(velocityTarget.x * velocityTarget.x + velocityTarget.y * velocityTarget.y);
      velocity.lerp(velocityTarget, 0.05);
    },
    onPointerLeave() {
      hover = false;
    }
  });
  return { config };
}

/**
 * GPUComputationRenderer, based on SimulationRenderer by zz85
 *
 * The GPUComputationRenderer uses the concept of variables. These variables are RGBA float textures that hold 4 floats
 * for each compute element (texel)
 *
 * Each variable has a fragment shader that defines the computation made to obtain the variable in question.
 * You can use as many variables you need, and make dependencies so you can use textures of other variables in the shader
 * (the sampler uniforms are added automatically) Most of the variables will need themselves as dependency.
 *
 * The renderer has actually two render targets per variable, to make ping-pong. Textures from the current frame are used
 * as inputs to render the textures of the next frame.
 *
 * The render targets of the variables can be used as input textures for your visualization shaders.
 *
 * Variable names should be valid identifiers and should not collide with THREE GLSL used identifiers.
 * a common approach could be to use 'texture' prefixing the variable name; i.e texturePosition, textureVelocity...
 *
 * The size of the computation (sizeX * sizeY) is defined as 'resolution' automatically in the shader. For example:
 * #DEFINE resolution vec2( 1024.0, 1024.0 )
 *
 * -------------
 *
 * Basic use:
 *
 * // Initialization...
 *
 * // Create computation renderer
 * const gpuCompute = new GPUComputationRenderer( 1024, 1024, renderer );
 *
 * // Create initial state float textures
 * const pos0 = gpuCompute.createTexture();
 * const vel0 = gpuCompute.createTexture();
 * // and fill in here the texture data...
 *
 * // Add texture variables
 * const velVar = gpuCompute.addVariable( "textureVelocity", fragmentShaderVel, pos0 );
 * const posVar = gpuCompute.addVariable( "texturePosition", fragmentShaderPos, vel0 );
 *
 * // Add variable dependencies
 * gpuCompute.setVariableDependencies( velVar, [ velVar, posVar ] );
 * gpuCompute.setVariableDependencies( posVar, [ velVar, posVar ] );
 *
 * // Add custom uniforms
 * velVar.material.uniforms.time = { value: 0.0 };
 *
 * // Check for completeness
 * const error = gpuCompute.init();
 * if ( error !== null ) {
 *		console.error( error );
  * }
 *
 *
 * // In each frame...
 *
 * // Compute!
 * gpuCompute.compute();
 *
 * // Update texture uniforms in your visualization materials with the gpu renderer output
 * myMaterial.uniforms.myTexture.value = gpuCompute.getCurrentRenderTarget( posVar ).texture;
 *
 * // Do your rendering
 * renderer.render( myScene, myCamera );
 *
 * -------------
 *
 * Also, you can use utility functions to create ShaderMaterial and perform computations (rendering between textures)
 * Note that the shaders can have multiple input textures.
 *
 * const myFilter1 = gpuCompute.createShaderMaterial( myFilterFragmentShader1, { theTexture: { value: null } } );
 * const myFilter2 = gpuCompute.createShaderMaterial( myFilterFragmentShader2, { theTexture: { value: null } } );
 *
 * const inputTexture = gpuCompute.createTexture();
 *
 * // Fill in here inputTexture...
 *
 * myFilter1.uniforms.theTexture.value = inputTexture;
 *
 * const myRenderTarget = gpuCompute.createRenderTarget();
 * myFilter2.uniforms.theTexture.value = myRenderTarget.texture;
 *
 * const outputRenderTarget = gpuCompute.createRenderTarget();
 *
 * // Now use the output texture where you want:
 * myMaterial.uniforms.map.value = outputRenderTarget.texture;
 *
 * // And compute each frame, before rendering to screen:
 * gpuCompute.doRenderTarget( myFilter1, myRenderTarget );
 * gpuCompute.doRenderTarget( myFilter2, outputRenderTarget );
 *
 *
 *
 * @param {int} sizeX Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {int} sizeY Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {WebGLRenderer} renderer The renderer
  */

class GPUComputationRenderer {

	constructor( sizeX, sizeY, renderer ) {

		this.variables = [];

		this.currentTextureIndex = 0;

		let dataType = FloatType;

		const scene = new Scene();

		const camera = new Camera();
		camera.position.z = 1;

		const passThruUniforms = {
			passThruTexture: { value: null }
		};

		const passThruShader = createShaderMaterial( getPassThroughFragmentShader(), passThruUniforms );

		const mesh = new Mesh( new PlaneGeometry( 2, 2 ), passThruShader );
		scene.add( mesh );


		this.setDataType = function ( type ) {

			dataType = type;
			return this;

		};

		this.addVariable = function ( variableName, computeFragmentShader, initialValueTexture ) {

			const material = this.createShaderMaterial( computeFragmentShader );

			const variable = {
				name: variableName,
				initialValueTexture: initialValueTexture,
				material: material,
				dependencies: null,
				renderTargets: [],
				wrapS: null,
				wrapT: null,
				minFilter: NearestFilter,
				magFilter: NearestFilter
			};

			this.variables.push( variable );

			return variable;

		};

		this.setVariableDependencies = function ( variable, dependencies ) {

			variable.dependencies = dependencies;

		};

		this.init = function () {

			if ( renderer.capabilities.isWebGL2 === false && renderer.extensions.has( 'OES_texture_float' ) === false ) {

				return 'No OES_texture_float support for float textures.';

			}

			if ( renderer.capabilities.maxVertexTextures === 0 ) {

				return 'No support for vertex shader textures.';

			}

			for ( let i = 0; i < this.variables.length; i ++ ) {

				const variable = this.variables[ i ];

				// Creates rendertargets and initialize them with input texture
				variable.renderTargets[ 0 ] = this.createRenderTarget( sizeX, sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter );
				variable.renderTargets[ 1 ] = this.createRenderTarget( sizeX, sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter );
				this.renderTexture( variable.initialValueTexture, variable.renderTargets[ 0 ] );
				this.renderTexture( variable.initialValueTexture, variable.renderTargets[ 1 ] );

				// Adds dependencies uniforms to the ShaderMaterial
				const material = variable.material;
				const uniforms = material.uniforms;

				if ( variable.dependencies !== null ) {

					for ( let d = 0; d < variable.dependencies.length; d ++ ) {

						const depVar = variable.dependencies[ d ];

						if ( depVar.name !== variable.name ) {

							// Checks if variable exists
							let found = false;

							for ( let j = 0; j < this.variables.length; j ++ ) {

								if ( depVar.name === this.variables[ j ].name ) {

									found = true;
									break;

								}

							}

							if ( ! found ) {

								return 'Variable dependency not found. Variable=' + variable.name + ', dependency=' + depVar.name;

							}

						}

						uniforms[ depVar.name ] = { value: null };

						material.fragmentShader = '\nuniform sampler2D ' + depVar.name + ';\n' + material.fragmentShader;

					}

				}

			}

			this.currentTextureIndex = 0;

			return null;

		};

		this.compute = function () {

			const currentTextureIndex = this.currentTextureIndex;
			const nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;

			for ( let i = 0, il = this.variables.length; i < il; i ++ ) {

				const variable = this.variables[ i ];

				// Sets texture dependencies uniforms
				if ( variable.dependencies !== null ) {

					const uniforms = variable.material.uniforms;

					for ( let d = 0, dl = variable.dependencies.length; d < dl; d ++ ) {

						const depVar = variable.dependencies[ d ];

						uniforms[ depVar.name ].value = depVar.renderTargets[ currentTextureIndex ].texture;

					}

				}

				// Performs the computation for this variable
				this.doRenderTarget( variable.material, variable.renderTargets[ nextTextureIndex ] );

			}

			this.currentTextureIndex = nextTextureIndex;

		};

		this.getCurrentRenderTarget = function ( variable ) {

			return variable.renderTargets[ this.currentTextureIndex ];

		};

		this.getAlternateRenderTarget = function ( variable ) {

			return variable.renderTargets[ this.currentTextureIndex === 0 ? 1 : 0 ];

		};

		function addResolutionDefine( materialShader ) {

			materialShader.defines.resolution = 'vec2( ' + sizeX.toFixed( 1 ) + ', ' + sizeY.toFixed( 1 ) + ' )';

		}

		this.addResolutionDefine = addResolutionDefine;


		// The following functions can be used to compute things manually

		function createShaderMaterial( computeFragmentShader, uniforms ) {

			uniforms = uniforms || {};

			const material = new ShaderMaterial( {
				uniforms: uniforms,
				vertexShader: getPassThroughVertexShader(),
				fragmentShader: computeFragmentShader
			} );

			addResolutionDefine( material );

			return material;

		}

		this.createShaderMaterial = createShaderMaterial;

		this.createRenderTarget = function ( sizeXTexture, sizeYTexture, wrapS, wrapT, minFilter, magFilter ) {

			sizeXTexture = sizeXTexture || sizeX;
			sizeYTexture = sizeYTexture || sizeY;

			wrapS = wrapS || ClampToEdgeWrapping;
			wrapT = wrapT || ClampToEdgeWrapping;

			minFilter = minFilter || NearestFilter;
			magFilter = magFilter || NearestFilter;

			const renderTarget = new WebGLRenderTarget( sizeXTexture, sizeYTexture, {
				wrapS: wrapS,
				wrapT: wrapT,
				minFilter: minFilter,
				magFilter: magFilter,
				format: RGBAFormat,
				type: dataType,
				depthBuffer: false
			} );

			return renderTarget;

		};

		this.createTexture = function () {

			const data = new Float32Array( sizeX * sizeY * 4 );
			const texture = new DataTexture( data, sizeX, sizeY, RGBAFormat, FloatType );
			texture.needsUpdate = true;
			return texture;

		};

		this.renderTexture = function ( input, output ) {

			// Takes a texture, and render out in rendertarget
			// input = Texture
			// output = RenderTarget

			passThruUniforms.passThruTexture.value = input;

			this.doRenderTarget( passThruShader, output );

			passThruUniforms.passThruTexture.value = null;

		};

		this.doRenderTarget = function ( material, output ) {

			const currentRenderTarget = renderer.getRenderTarget();

			mesh.material = material;
			renderer.setRenderTarget( output );
			renderer.render( scene, camera );
			mesh.material = passThruShader;

			renderer.setRenderTarget( currentRenderTarget );

		};

		// Shaders

		function getPassThroughVertexShader() {

			return	'void main()	{\n' +
					'\n' +
					'	gl_Position = vec4( position, 1.0 );\n' +
					'\n' +
					'}\n';

		}

		function getPassThroughFragmentShader() {

			return	'uniform sampler2D passThruTexture;\n' +
					'\n' +
					'void main() {\n' +
					'\n' +
					'	vec2 uv = gl_FragCoord.xy / resolution.xy;\n' +
					'\n' +
					'	gl_FragColor = texture2D( passThruTexture, uv );\n' +
					'\n' +
					'}\n';

		}

	}

}

function colorScale(colors) {
  let range = [];
  setColors(colors);
  const dummy = new Color();
  return { setColors, getColorAt };
  function setColors(colors2) {
    range = [];
    colors2.forEach((color) => {
      range.push(new Color(color));
    });
  }
  function getColorAt(progress) {
    const p = Math.max(0, Math.min(1, progress)) * (colors.length - 1);
    const i1 = Math.floor(p);
    const c1 = range[i1];
    if (i1 === colors.length - 1) {
      return c1.getHex();
    }
    const p1 = p - i1;
    const c2 = range[i1 + 1];
    dummy.r = c1.r + p1 * (c2.r - c1.r);
    dummy.g = c1.g + p1 * (c2.g - c1.g);
    dummy.b = c1.b + p1 * (c2.b - c1.b);
    return dummy.clone();
  }
}

var psrdnoise$1 = "vec4 permute(vec4 x){vec4 xm=mod(x,289.0);return mod(((xm*34.0)+10.0)*xm,289.0);}float psrdnoise(vec3 x,vec3 period,float alpha,out vec3 gradient){\n#ifndef PERLINGRID\nconst mat3 M=mat3(0.0,1.0,1.0,1.0,0.0,1.0,1.0,1.0,0.0);const mat3 Mi=mat3(-0.5,0.5,0.5,0.5,-0.5,0.5,0.5,0.5,-0.5);\n#endif\nvec3 uvw;\n#ifndef PERLINGRID\nuvw=M*x;\n#else\nuvw=x+dot(x,vec3(1.0/3.0));\n#endif\nvec3 i0=floor(uvw);vec3 f0=fract(uvw);vec3 g_=step(f0.xyx,f0.yzz);vec3 l_=1.0-g_;vec3 g=vec3(l_.z,g_.xy);vec3 l=vec3(l_.xy,g_.z);vec3 o1=min(g,l);vec3 o2=max(g,l);vec3 i1=i0+o1;vec3 i2=i0+o2;vec3 i3=i0+vec3(1.0);vec3 v0,v1,v2,v3;\n#ifndef PERLINGRID\nv0=Mi*i0;v1=Mi*i1;v2=Mi*i2;v3=Mi*i3;\n#else\nv0=i0-dot(i0,vec3(1.0/6.0));v1=i1-dot(i1,vec3(1.0/6.0));v2=i2-dot(i2,vec3(1.0/6.0));v3=i3-dot(i3,vec3(1.0/6.0));\n#endif\nvec3 x0=x-v0;vec3 x1=x-v1;vec3 x2=x-v2;vec3 x3=x-v3;if(any(greaterThan(period,vec3(0.0)))){vec4 vx=vec4(v0.x,v1.x,v2.x,v3.x);vec4 vy=vec4(v0.y,v1.y,v2.y,v3.y);vec4 vz=vec4(v0.z,v1.z,v2.z,v3.z);if(period.x>0.0)vx=mod(vx,period.x);if(period.y>0.0)vy=mod(vy,period.y);if(period.z>0.0)vz=mod(vz,period.z);\n#ifndef PERLINGRID\ni0=M*vec3(vx.x,vy.x,vz.x);i1=M*vec3(vx.y,vy.y,vz.y);i2=M*vec3(vx.z,vy.z,vz.z);i3=M*vec3(vx.w,vy.w,vz.w);\n#else\nv0=vec3(vx.x,vy.x,vz.x);v1=vec3(vx.y,vy.y,vz.y);v2=vec3(vx.z,vy.z,vz.z);v3=vec3(vx.w,vy.w,vz.w);i0=v0+dot(v0,vec3(1.0/3.0));i1=v1+dot(v1,vec3(1.0/3.0));i2=v2+dot(v2,vec3(1.0/3.0));i3=v3+dot(v3,vec3(1.0/3.0));\n#endif\ni0=floor(i0+0.5);i1=floor(i1+0.5);i2=floor(i2+0.5);i3=floor(i3+0.5);}vec4 hash=permute(permute(permute(vec4(i0.z,i1.z,i2.z,i3.z))+vec4(i0.y,i1.y,i2.y,i3.y))+vec4(i0.x,i1.x,i2.x,i3.x));vec4 theta=hash*3.883222077;vec4 sz=hash*-0.006920415+0.996539792;vec4 psi=hash*0.108705628;vec4 Ct=cos(theta);vec4 St=sin(theta);vec4 sz_prime=sqrt(1.0-sz*sz);vec4 gx,gy,gz;\n#ifdef FASTROTATION\nvec4 qx=St;vec4 qy=-Ct;vec4 qz=vec4(0.0);vec4 px=sz*qy;vec4 py=-sz*qx;vec4 pz=sz_prime;psi+=alpha;vec4 Sa=sin(psi);vec4 Ca=cos(psi);gx=Ca*px+Sa*qx;gy=Ca*py+Sa*qy;gz=Ca*pz+Sa*qz;\n#else\nif(alpha!=0.0){vec4 Sp=sin(psi);vec4 Cp=cos(psi);vec4 px=Ct*sz_prime;vec4 py=St*sz_prime;vec4 pz=sz;vec4 Ctp=St*Sp-Ct*Cp;vec4 qx=mix(Ctp*St,Sp,sz);vec4 qy=mix(-Ctp*Ct,Cp,sz);vec4 qz=-(py*Cp+px*Sp);vec4 Sa=vec4(sin(alpha));vec4 Ca=vec4(cos(alpha));gx=Ca*px+Sa*qx;gy=Ca*py+Sa*qy;gz=Ca*pz+Sa*qz;}else{gx=Ct*sz_prime;gy=St*sz_prime;gz=sz;}\n#endif\nvec3 g0=vec3(gx.x,gy.x,gz.x);vec3 g1=vec3(gx.y,gy.y,gz.y);vec3 g2=vec3(gx.z,gy.z,gz.z);vec3 g3=vec3(gx.w,gy.w,gz.w);vec4 w=0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3));w=max(w,0.0);vec4 w2=w*w;vec4 w3=w2*w;vec4 gdotx=vec4(dot(g0,x0),dot(g1,x1),dot(g2,x2),dot(g3,x3));float n=dot(w3,gdotx);vec4 dw=-6.0*w2*gdotx;vec3 dn0=w3.x*g0+dw.x*x0;vec3 dn1=w3.y*g1+dw.y*x1;vec3 dn2=w3.z*g2+dw.z*x2;vec3 dn3=w3.w*g3+dw.w*x3;gradient=39.5*(dn0+dn1+dn2+dn3);return 39.5*n;}";

const { randFloat: rnd$3, randFloatSpread: rndFS$3 } = MathUtils;
const defaultConfig$5 = {
  gpgpuSize: 256,
  colors: [65280, 255],
  color: 16711680,
  coordScale: 1.5,
  noiseIntensity: 1e-3,
  noiseTimeCoef: 1e-4,
  pointSize: 5,
  pointDecay: 5e-3,
  sleepRadiusX: 250,
  sleepRadiusY: 250,
  sleepTimeCoefX: 1e-3,
  sleepTimeCoefY: 2e-3
};
function index$4(params) {
  const config = { ...defaultConfig$5, ...params };
  const WIDTH = config.gpgpuSize;
  const COUNT = WIDTH * WIDTH;
  let gpu;
  let dtPosition, dtVelocity;
  let velocityVariable, positionVariable;
  const uTime = { value: 0 };
  const uCoordScale = { value: config.coordScale };
  const uNoiseIntensity = { value: config.noiseIntensity };
  const uPointSize = { value: config.pointSize };
  const uPointDecay = { value: config.pointDecay };
  const uColor = { value: new Color(config.color) };
  const uMouse = { value: new Vector2() };
  const uMouseDirection = { value: new Vector2() };
  const uniforms = { uTime, uCoordScale, uNoiseIntensity, uPointSize, uPointDecay, uColor, uMouse, uMouseDirection };
  let geometry, material, mesh;
  let hover = false;
  const mouseTarget = new Vector2();
  three({
    ...commonConfig(params),
    antialias: false,
    initRenderer({ renderer }) {
      initGPU(renderer);
    },
    initScene({ scene }) {
      initParticles();
      scene.add(mesh);
    },
    beforeRender({ width, wWidth, wHeight, clock, pointer }) {
      if (!hover) {
        const t1 = clock.time * config.sleepTimeCoefX;
        const t2 = clock.time * config.sleepTimeCoefY;
        const cos = Math.cos(t1);
        const sin = Math.sin(t2);
        const r1 = config.sleepRadiusX * wWidth / width;
        const r2 = config.sleepRadiusY * wWidth / width;
        mouseTarget.x = r1 * cos;
        mouseTarget.y = r2 * sin;
      } else {
        mouseTarget.x = pointer.nPosition.x * 0.5 * wWidth;
        mouseTarget.y = pointer.nPosition.y * 0.5 * wHeight;
      }
      uMouse.value.lerp(mouseTarget, 0.05);
      uTime.value = clock.time * config.noiseTimeCoef;
      gpu.compute();
      material.uniforms.texturePosition.value = gpu.getCurrentRenderTarget(positionVariable).texture;
      material.uniforms.textureVelocity.value = gpu.getCurrentRenderTarget(velocityVariable).texture;
    },
    onPointerMove({ delta }) {
      hover = true;
      uMouseDirection.value.copy(delta);
    },
    onPointerLeave() {
      hover = false;
    }
  });
  return { config, uniforms };
  function initGPU(renderer) {
    gpu = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    if (!renderer.capabilities.isWebGL2) {
      gpu.setDataType(HalfFloatType);
    }
    dtPosition = gpu.createTexture();
    dtVelocity = gpu.createTexture();
    initTextures(dtPosition, dtVelocity);
    velocityVariable = gpu.addVariable("textureVelocity", `
      ${psrdnoise$1}
      uniform float uTime;
      uniform float uCoordScale;
      uniform float uNoiseIntensity;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);

        if (pos.w < 0.0) {
          vel.x = 0.0;
          vel.y = 0.0;
          vel.z = 0.0;
        } else {
          vec3 grad;
          vec3 p = vec3(0.0);
          float n = psrdnoise(pos.xyz * uCoordScale, p, uTime, grad);
          vel.xyz += grad * uNoiseIntensity * pos.w;
        }
        gl_FragColor = vel;
      }
    `, dtVelocity);
    positionVariable = gpu.addVariable("texturePosition", `
      uniform float uPointDecay;
      uniform vec2 uMouse;
      uniform vec2 uMouseDirection;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        if (pos.w < 0.0) { pos.w = vel.w; }
        pos.w -= uPointDecay;
        if (pos.w <= 0.0) {
          pos.xy = uMouse.xy;
          pos.z = 0.0;
        } else {
          pos.xyz += vel.xyz;
        }
        gl_FragColor = pos;
      }
    `, dtPosition);
    gpu.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
    gpu.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
    Object.keys(uniforms).forEach((key) => {
      velocityVariable.material.uniforms[key] = uniforms[key];
      positionVariable.material.uniforms[key] = uniforms[key];
    });
    const error = gpu.init();
    if (error !== null) {
      console.error(error);
    }
  }
  function initParticles() {
    geometry = new BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const uvs = new Float32Array(COUNT * 2);
    const colors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT * 3; i += 3) {
      positions[i] = 0;
      positions[i + 1] = 0;
      positions[i + 2] = 0;
    }
    let index = 0;
    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        uvs[index++] = i / (WIDTH - 1);
        uvs[index++] = j / (WIDTH - 1);
      }
    }
    const cscale = colorScale(config.colors);
    for (let i = 0; i < COUNT * 3; i += 3) {
      const color = cscale.getColorAt(Math.random());
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      transparent: true,
      vertexColors: true,
      uniforms: {
        texturePosition: { value: null },
        textureVelocity: { value: null },
        uPointSize,
        uColor
      },
      vertexShader: `
        uniform sampler2D texturePosition;
        uniform sampler2D textureVelocity;
        uniform float uPointSize;
        varying vec4 vPos;
        varying vec4 vVel;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vPos = texture2D(texturePosition, uv);
          vVel = texture2D(textureVelocity, uv);
          vec4 mvPosition = modelViewMatrix * vec4(vPos.xyz, 1.0);
          // gl_PointSize = smoothstep(0.0, 2.0, vPos.w) * uPointSize;
          gl_PointSize = vPos.w * (vVel.w + 0.5) * uPointSize;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec4 vPos;
        varying vec4 vVel;
        varying vec3 vCol;
        void main() {
          float dist = length(gl_PointCoord - 0.5);
          if (dist > 0.5) discard;
          // float a = smoothstep(0.0, 1.0, vPos.w);
          gl_FragColor = vec4(mix(vCol, uColor, vPos.w), vPos.w);
        }
      `
    });
    mesh = new Points(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
  }
  function initTextures(texturePosition, textureVelocity) {
    const posArray = texturePosition.image.data;
    const velArray = textureVelocity.image.data;
    for (let k = 0, kl = posArray.length; k < kl; k += 4) {
      posArray[k + 0] = rndFS$3(1);
      posArray[k + 1] = rndFS$3(1);
      posArray[k + 2] = -1e5;
      posArray[k + 3] = rnd$3(0.1, 1);
      velArray[k + 0] = 0;
      velArray[k + 1] = 0;
      velArray[k + 2] = 0;
      velArray[k + 3] = rnd$3(0.1, 1);
    }
  }
}
function commonConfig(params) {
  const config = {};
  const keys = ["el", "canvas", "width", "height", "resize"];
  keys.forEach((key) => {
    if (params[key] !== void 0)
      config[key] = params[key];
  });
  return config;
}

const defaultConfig$4 = {
  width: 256,
  height: 256
};
function useCanvasTexture(params) {
  const config = { ...defaultConfig$4, ...params };
  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(ctx.canvas);
  return { canvas, ctx, texture };
}

var psrdnoise = "float psrdnoise(vec2 x,vec2 period,float alpha,out vec2 gradient){vec2 uv=vec2(x.x+x.y*0.5,x.y);vec2 i0=floor(uv);vec2 f0=fract(uv);float cmp=step(f0.y,f0.x);vec2 o1=vec2(cmp,1.0-cmp);vec2 i1=i0+o1;vec2 i2=i0+vec2(1.0,1.0);vec2 v0=vec2(i0.x-i0.y*0.5,i0.y);vec2 v1=vec2(v0.x+o1.x-o1.y*0.5,v0.y+o1.y);vec2 v2=vec2(v0.x+0.5,v0.y+1.0);vec2 x0=x-v0;vec2 x1=x-v1;vec2 x2=x-v2;vec3 iu,iv;vec3 xw,yw;if(any(greaterThan(period,vec2(0.0)))){xw=vec3(v0.x,v1.x,v2.x);yw=vec3(v0.y,v1.y,v2.y);if(period.x>0.0)xw=mod(vec3(v0.x,v1.x,v2.x),period.x);if(period.y>0.0)yw=mod(vec3(v0.y,v1.y,v2.y),period.y);iu=floor(xw+0.5*yw+0.5);iv=floor(yw+0.5);}else{iu=vec3(i0.x,i1.x,i2.x);iv=vec3(i0.y,i1.y,i2.y);}vec3 hash=mod(iu,289.0);hash=mod((hash*51.0+2.0)*hash+iv,289.0);hash=mod((hash*34.0+10.0)*hash,289.0);vec3 psi=hash*0.07482+alpha;vec3 gx=cos(psi);vec3 gy=sin(psi);vec2 g0=vec2(gx.x,gy.x);vec2 g1=vec2(gx.y,gy.y);vec2 g2=vec2(gx.z,gy.z);vec3 w=0.8-vec3(dot(x0,x0),dot(x1,x1),dot(x2,x2));w=max(w,0.0);vec3 w2=w*w;vec3 w4=w2*w2;vec3 gdotx=vec3(dot(g0,x0),dot(g1,x1),dot(g2,x2));float n=dot(w4,gdotx);vec3 w3=w2*w;vec3 dw=-8.0*w3*gdotx;vec2 dn0=w4.x*g0+dw.x*x0;vec2 dn1=w4.y*g1+dw.y*x1;vec2 dn2=w4.z*g2+dw.z*x2;gradient=10.9*(dn0+dn1+dn2);return 10.9*n;}";

const defaultConfig$3 = {
  colors: [16777215, 0],
  minStroke: 5,
  maxStroke: 5,
  timeCoef: 5e-4,
  coordScale: 2,
  displacementScale: 2e-3,
  mouseScale: 0.25,
  mouseLerp: 0.025
};
function index$3(params) {
  const config = { ...defaultConfig$3, ...params };
  const canvasTexture = useCanvasTexture({ width: 1, height: 4096 });
  drawTexture();
  const uniforms = {
    uMap: { value: canvasTexture.texture },
    uTime: { value: 0 },
    uCoordScale: { value: config.coordScale },
    uDisplacementScale: { value: config.displacementScale },
    uMouse: { value: new Vector2() }
  };
  const geometry = new PlaneGeometry();
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uCoordScale;
      uniform float uDisplacementScale;
      uniform vec2 uMouse;
      varying vec2 vUv;
      ${psrdnoise}
      void main() {
        vec2 p = vec2(0.0);
        vec2 grad;
        float n = psrdnoise(vUv * uCoordScale + uMouse, p, uTime, grad);
        // grad *= uCoordScale;
        vec2 uv = vUv + uDisplacementScale * grad;
        gl_FragColor = texture2D(uMap, uv.yx);
      }
    `
  });
  const mesh = new Mesh(geometry, material);
  const mouseTarget = new Vector2();
  const threeConfig = {};
  const keys = ["el", "canvas", "width", "height", "resize"];
  keys.forEach((key) => {
    if (params[key] !== void 0)
      threeConfig[key] = params[key];
  });
  three({
    ...threeConfig,
    antialias: true,
    initScene({ camera, scene, wWidth, wHeight }) {
      mesh.scale.set(wWidth * 2, wHeight * 2, 1);
      scene.add(mesh);
      camera.position.set(0, -30, 7);
      camera.lookAt(0, -19, 0);
    },
    beforeRender({ clock }) {
      uniforms.uTime.value = clock.time * config.timeCoef;
      uniforms.uMouse.value.lerp(mouseTarget, config.mouseLerp);
    },
    onPointerMove({ nPosition }) {
      mouseTarget.set(-nPosition.x, nPosition.y).multiplyScalar(config.mouseScale);
    },
    onPointerLeave() {
      mouseTarget.set(0, 0);
    }
  });
  return { config, uniforms, drawTexture };
  function drawTexture() {
    const ctx = canvasTexture.ctx;
    ctx.lineWidth = 0;
    const { width, height } = canvasTexture.canvas;
    const cscale = colorScale(config.colors);
    let y = 0;
    let dy;
    while (y < height) {
      dy = config.minStroke + Math.random() * (config.maxStroke - config.minStroke);
      ctx.fillStyle = cscale.getColorAt(Math.random()).getStyle();
      ctx.beginPath();
      ctx.rect(0, y - 1, width, dy + 1);
      ctx.fill();
      ctx.closePath();
      y += dy;
    }
    canvasTexture.texture.needsUpdate = true;
  }
}

const { randFloat: rnd$2, randFloatSpread: rndFS$2 } = MathUtils;
const defaultConfig$2 = {
  gpgpuSize: 64,
  background: 16777215,
  material: "basic",
  materialParams: {},
  texture: null,
  textureCount: 1,
  colors: [16777215, 16777215],
  lights: [
    { type: "ambient", params: [16777215, 0.5] },
    { type: "directional", params: [16777215, 1], props: { position: [0, 10, 0] } }
  ],
  wingsScale: [1, 1, 1],
  wingsWidthSegments: 8,
  wingsHeightSegments: 8,
  wingsSpeed: 0.75,
  wingsDisplacementScale: 1.25,
  noiseCoordScale: 0.01,
  noiseTimeCoef: 5e-4,
  noiseIntensity: 25e-4,
  attractionRadius1: 100,
  attractionRadius2: 150,
  maxVelocity: 0.1
};
function index$2(params) {
  const config = { ...defaultConfig$2, ...params };
  if (!["basic", "phong", "standard"].includes(config.material)) {
    throw new Error(`Invalid material ${config.material}`);
  }
  if (!Number.isInteger(config.wingsWidthSegments) || config.wingsWidthSegments % 2 !== 0) {
    throw new Error(`Invalid wingsWidthSegments ${config.wingsWidthSegments}`);
  }
  const WIDTH = config.gpgpuSize;
  const COUNT = WIDTH * WIDTH;
  let gpu;
  let dtPosition, dtVelocity;
  let velocityVariable, positionVariable;
  const uTexturePosition = { value: null };
  const uOldTexturePosition = { value: null };
  const uTextureVelocity = { value: null };
  const uTime = { value: 0 };
  const uNoiseCoordScale = { value: config.noiseCoordScale };
  const uNoiseIntensity = { value: config.noiseIntensity };
  const uMaxVelocity = { value: config.maxVelocity };
  const uAttractionRadius1 = { value: config.attractionRadius1 };
  const uAttractionRadius2 = { value: config.attractionRadius2 };
  const uWingsScale = { value: new Vector3(...config.wingsScale) };
  const uWingsSpeed = { value: config.wingsSpeed };
  const uWingsDisplacementScale = { value: config.wingsDisplacementScale };
  const gpuTexturesUniforms = { uTexturePosition, uOldTexturePosition, uTextureVelocity };
  const commonUniforms = { uTime, uNoiseCoordScale, uNoiseIntensity, uMaxVelocity, uAttractionRadius1, uAttractionRadius2, uWingsScale, uWingsSpeed, uWingsDisplacementScale };
  const uniforms = { ...gpuTexturesUniforms, ...commonUniforms };
  let geometry, material, iMesh;
  const _three = three({
    ...commonConfig$1(params),
    antialias: true,
    orbitControls: true,
    initRenderer({ renderer }) {
      initGPU(renderer);
    },
    initCamera({ camera }) {
      camera.position.set(0, 50, 70);
    },
    initScene({ scene }) {
      initScene(scene);
    },
    beforeRender({ clock }) {
      uTime.value = clock.time * config.noiseTimeCoef;
      gpu.compute();
      uTexturePosition.value = positionVariable.renderTargets[gpu.currentTextureIndex].texture;
      uOldTexturePosition.value = positionVariable.renderTargets[gpu.currentTextureIndex === 0 ? 1 : 0].texture;
      uTextureVelocity.value = velocityVariable.renderTargets[gpu.currentTextureIndex].texture;
    }
  });
  return { three: _three, config, uniforms, setColors };
  function initGPU(renderer) {
    gpu = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    if (!renderer.capabilities.isWebGL2) {
      gpu.setDataType(HalfFloatType);
    }
    dtPosition = gpu.createTexture();
    dtVelocity = gpu.createTexture();
    initTextures(dtPosition, dtVelocity);
    velocityVariable = gpu.addVariable("textureVelocity", `
      ${psrdnoise$1}
      uniform float uTime;
      uniform float uNoiseCoordScale;
      uniform float uNoiseIntensity;
      uniform float uMaxVelocity;
      uniform float uAttractionRadius1;
      uniform float uAttractionRadius2;
      uniform float uWingsSpeed;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);

        vec3 grad;
        float n = psrdnoise(pos.xyz * uNoiseCoordScale, vec3(0), uTime, grad);
        grad = grad * uNoiseIntensity;
        vel.xyz = vel.xyz + (pos.w * 0.75) * grad;

        vec3 dv = -pos.xyz;
        float coef = smoothstep(uAttractionRadius1, uAttractionRadius2, length(dv));
        vel.xyz = vel.xyz + pos.w * coef * normalize(dv);
        vel.xyz = clamp(vel.xyz, -uMaxVelocity, uMaxVelocity);

        vel.w = mod(vel.w + length(vel.xyz) * (0.5 + pos.w) * uWingsSpeed, 6.2831853071);
        gl_FragColor = vel;
      }
    `, dtVelocity);
    positionVariable = gpu.addVariable("texturePosition", `
      ${psrdnoise$1}
      uniform float uTime;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        pos.xyz += vel.xyz;
        gl_FragColor = pos;
      }
    `, dtPosition);
    gpu.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
    gpu.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
    Object.keys(commonUniforms).forEach((key) => {
      velocityVariable.material.uniforms[key] = uniforms[key];
      positionVariable.material.uniforms[key] = uniforms[key];
    });
    const error = gpu.init();
    if (error !== null) {
      throw new Error(error);
    }
  }
  function initScene(scene) {
    if (config.background !== void 0) {
      scene.background = new Color(config.background);
    }
    initLights(scene, config.lights);
    geometry = new PlaneGeometry(2, 2, config.wingsWidthSegments, config.wingsHeightSegments).rotateX(Math.PI / 2);
    const gpuUvs = new Float32Array(COUNT * 2);
    const mapIndexes = new Float32Array(COUNT);
    let i1 = 0;
    let i2 = 0;
    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        gpuUvs[i1++] = i / (WIDTH - 1);
        gpuUvs[i1++] = j / (WIDTH - 1);
        mapIndexes[i2++] = Math.floor(Math.random() * config.textureCount);
      }
    }
    geometry.setAttribute("gpuUv", new InstancedBufferAttribute(gpuUvs, 2));
    geometry.setAttribute("mapIndex", new InstancedBufferAttribute(mapIndexes, 1));
    const materialParams = { side: DoubleSide, ...config.materialParams };
    if (config.texture) {
      materialParams.map = new TextureLoader().load(config.texture);
    }
    materialParams.onBeforeCompile = (shader) => {
      shader.defines = {
        COMPUTE_NORMALS: config.material !== "basic",
        WINGS_WIDTH_SEGMENTS: config.wingsWidthSegments,
        WINGS_HEIGHT_SEGMENTS: config.wingsHeightSegments,
        WINGS_DX: (2 / config.wingsWidthSegments).toFixed(10),
        WINGS_DZ: (2 / config.wingsHeightSegments).toFixed(10),
        TEXTURE_COUNT: config.textureCount.toFixed(10)
      };
      Object.keys(uniforms).forEach((key) => {
        shader.uniforms[key] = uniforms[key];
      });
      shader.vertexShader = `
        uniform sampler2D uTexturePosition;
        uniform sampler2D uOldTexturePosition;
        uniform sampler2D uTextureVelocity;
        uniform vec3 uWingsScale;
        uniform float uWingsDisplacementScale;
        attribute vec2 gpuUv;
        attribute float mapIndex;
        varying vec4 vPos;
        varying vec4 vVel;
        varying float vMapIndex;

        mat3 lookAt(vec3 origin, vec3 target, vec3 up) {
          vec3 z = target - origin;
          if (z.x * z.x + z.y * z.y + z.z * z.z == 0.0) { z.z = 1.0; }
          z = normalize(z);
          vec3 x = cross(up, z);
          if (x.x * x.x + x.y * x.y + x.z * x.z == 0.0) {
            if (abs(up.z) == 1.0) { z.x += 0.0001; }
            else { z.z += 0.0001; }
            x = cross(up, z);
          }
          x = normalize(x);
          vec3 y = cross(z, x);
          return mat3(x, y, z);
        }

        mat4 iMatrix(vec3 pos, mat3 rmat, vec3 scale) {
          return mat4(
            rmat[0][0] * scale.x, rmat[0][1] * scale.x, rmat[0][2] * scale.x, 0.0,
            rmat[1][0] * scale.y, rmat[1][1] * scale.y, rmat[1][2] * scale.y, 0.0,
            rmat[2][0] * scale.z, rmat[2][1] * scale.z, rmat[2][2] * scale.z, 0.0,
            pos.x, pos.y, pos.z, 1.0
          );
        }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <defaultnormal_vertex>", "");
      shader.vertexShader = shader.vertexShader.replace("#include <normal_vertex>", "");
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        vPos = texture2D(uTexturePosition, gpuUv);
        vec4 oldPos = texture2D(uOldTexturePosition, gpuUv);
        vVel = texture2D(uTextureVelocity, gpuUv);
        vMapIndex = float(mapIndex);

        mat3 rmat = lookAt(oldPos.xyz, vPos.xyz, vec3(0, 1, 0));
        mat4 im = iMatrix(vPos.xyz, rmat, (0.5 + vPos.w) * uWingsScale);

        vec3 transformed = vec3(position);

        #ifdef COMPUTE_NORMALS
          vec3 transformedNormal = objectNormal; 
        #endif

        float dx = abs(transformed.x);
        if (dx > 0.0) {
          float sdx = smoothstep(0.0, 1.0 + WINGS_DX, dx);
          #if WINGS_HEIGHT_SEGMENTS > 1
            float dz = transformed.z + 1.0;
            float sdz = smoothstep(0.0, 2.0 + WINGS_DZ, dz);
            transformed.y = sin(vVel.w - sdx + sdz) * sdx * uWingsDisplacementScale;
          #else
            transformed.y = sin(vVel.w - sdx) * sdx * uWingsDisplacementScale;
          #endif

          #ifdef COMPUTE_NORMALS
            #if WINGS_HEIGHT_SEGMENTS > 1
              float s = sign(transformed.x);
              float sdx1 = smoothstep(0.0, 1.0 + WINGS_DX, dx + WINGS_DX);
              float sdz1 = smoothstep(0.0, 2.0 + WINGS_DZ, dz + WINGS_DZ);
              float dvy1 = sin(vVel.w - sdx + sdz1) * sdx * uWingsDisplacementScale - transformed.y;
              float dvy2 = sin(vVel.w - sdx1 + sdz) * sdx1 * uWingsDisplacementScale - transformed.y;
              vec3 v1 = vec3(0.0, dvy1, s * WINGS_DZ);
              vec3 v2 = vec3(s * WINGS_DX, dvy2, 0.0);
              transformedNormal = -normalize(cross(v1, v2));
            #else
              float s = sign(transformed.x);
              float sdx1 = smoothstep(0.0, 1.0 + WINGS_DX, dx + WINGS_DX);
              float dvy1 = sin(vVel.w - sdx1) * sdx * uWingsDisplacementScale - transformed.y;
              vec3 v1 = vec3(0.0, 0.0, s);
              vec3 v2 = vec3(s * WINGS_DX, dvy1, 0.0);
              transformedNormal = -normalize(cross(v1, v2));
            #endif  
          #endif
        }

        #ifdef COMPUTE_NORMALS
          #ifdef USE_INSTANCING
            mat3 m = mat3( im );
            transformedNormal /= vec3( dot( m[ 0 ], m[ 0 ] ), dot( m[ 1 ], m[ 1 ] ), dot( m[ 2 ], m[ 2 ] ) );
            transformedNormal = m * transformedNormal;
          #endif
          transformedNormal = normalMatrix * transformedNormal;
          #ifdef FLIP_SIDED
            transformedNormal = - transformedNormal;
          #endif
          #ifdef USE_TANGENT
            vec3 transformedTangent = ( modelViewMatrix * vec4( objectTangent, 0.0 ) ).xyz;
            #ifdef FLIP_SIDED
              transformedTangent = - transformedTangent;
            #endif
          #endif
          #ifndef FLAT_SHADED
            vNormal = normalize( transformedNormal );
            #ifdef USE_TANGENT
              vTangent = normalize( transformedTangent );
              vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
            #endif
          #endif
        #endif
      `);
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = im * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
      shader.fragmentShader = `
        varying float vMapIndex;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          vec2 uv = vUv;
          uv.x = (vMapIndex + vUv.x) / TEXTURE_COUNT;
          vec4 sampledDiffuseColor = texture2D(map, uv);
          diffuseColor *= sampledDiffuseColor;
        #endif
      `);
    };
    switch (config.material) {
      case "standard":
        material = new MeshStandardMaterial(materialParams);
        break;
      case "phong":
        material = new MeshPhongMaterial(materialParams);
        break;
      default:
        material = new MeshBasicMaterial(materialParams);
    }
    iMesh = new InstancedMesh(geometry, material, COUNT);
    setColors(config.colors);
    scene.add(iMesh);
  }
  function setColors(colors) {
    if (Array.isArray(colors) && colors.length > 1) {
      const cscale = colorScale(colors);
      for (let i = 0; i < COUNT; i++) {
        iMesh.setColorAt(i, cscale.getColorAt(i / COUNT));
      }
      iMesh.instanceColor.needsUpdate = true;
    }
  }
  function initTextures(texturePosition, textureVelocity) {
    const posArray = texturePosition.image.data;
    const velArray = textureVelocity.image.data;
    for (let k = 0, kl = posArray.length; k < kl; k += 4) {
      posArray[k + 0] = rndFS$2(150);
      posArray[k + 1] = rndFS$2(150);
      posArray[k + 2] = rndFS$2(150);
      posArray[k + 3] = rnd$2(0.1, 1);
      velArray[k + 0] = rndFS$2(0.5);
      velArray[k + 1] = rndFS$2(0.5);
      velArray[k + 2] = rndFS$2(0.5);
      velArray[k + 3] = 0;
    }
  }
}

/**
 * Full-screen textured quad shader
 */

const CopyShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'opacity': { value: 1.0 }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader: /* glsl */`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );
			gl_FragColor.a *= opacity;


		}`

};

class Pass {

	constructor() {

		// if set to true, the pass is processed by the composer
		this.enabled = true;

		// if set to true, the pass indicates to swap read and write buffer after rendering
		this.needsSwap = true;

		// if set to true, the pass clears its buffer before rendering
		this.clear = false;

		// if set to true, the result of the pass is rendered to screen. This is set automatically by EffectComposer.
		this.renderToScreen = false;

	}

	setSize( /* width, height */ ) {}

	render( /* renderer, writeBuffer, readBuffer, deltaTime, maskActive */ ) {

		console.error( 'THREE.Pass: .render() must be implemented in derived pass.' );

	}

}

// Helper for passes that need to fill the viewport with a single quad.

const _camera = new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

// https://github.com/mrdoob/three.js/pull/21358

const _geometry$1 = new BufferGeometry();
_geometry$1.setAttribute( 'position', new Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
_geometry$1.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

class FullScreenQuad {

	constructor( material ) {

		this._mesh = new Mesh( _geometry$1, material );

	}

	dispose() {

		this._mesh.geometry.dispose();

	}

	render( renderer ) {

		renderer.render( this._mesh, _camera );

	}

	get material() {

		return this._mesh.material;

	}

	set material( value ) {

		this._mesh.material = value;

	}

}

class ShaderPass extends Pass {

	constructor( shader, textureID ) {

		super();

		this.textureID = ( textureID !== undefined ) ? textureID : 'tDiffuse';

		if ( shader instanceof ShaderMaterial ) {

			this.uniforms = shader.uniforms;

			this.material = shader;

		} else if ( shader ) {

			this.uniforms = UniformsUtils.clone( shader.uniforms );

			this.material = new ShaderMaterial( {

				defines: Object.assign( {}, shader.defines ),
				uniforms: this.uniforms,
				vertexShader: shader.vertexShader,
				fragmentShader: shader.fragmentShader

			} );

		}

		this.fsQuad = new FullScreenQuad( this.material );

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		if ( this.uniforms[ this.textureID ] ) {

			this.uniforms[ this.textureID ].value = readBuffer.texture;

		}

		this.fsQuad.material = this.material;

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			// TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
			if ( this.clear ) renderer.clear( renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil );
			this.fsQuad.render( renderer );

		}

	}

}

class MaskPass extends Pass {

	constructor( scene, camera ) {

		super();

		this.scene = scene;
		this.camera = camera;

		this.clear = true;
		this.needsSwap = false;

		this.inverse = false;

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		const context = renderer.getContext();
		const state = renderer.state;

		// don't update color or depth

		state.buffers.color.setMask( false );
		state.buffers.depth.setMask( false );

		// lock buffers

		state.buffers.color.setLocked( true );
		state.buffers.depth.setLocked( true );

		// set up stencil

		let writeValue, clearValue;

		if ( this.inverse ) {

			writeValue = 0;
			clearValue = 1;

		} else {

			writeValue = 1;
			clearValue = 0;

		}

		state.buffers.stencil.setTest( true );
		state.buffers.stencil.setOp( context.REPLACE, context.REPLACE, context.REPLACE );
		state.buffers.stencil.setFunc( context.ALWAYS, writeValue, 0xffffffff );
		state.buffers.stencil.setClear( clearValue );
		state.buffers.stencil.setLocked( true );

		// draw into the stencil buffer

		renderer.setRenderTarget( readBuffer );
		if ( this.clear ) renderer.clear();
		renderer.render( this.scene, this.camera );

		renderer.setRenderTarget( writeBuffer );
		if ( this.clear ) renderer.clear();
		renderer.render( this.scene, this.camera );

		// unlock color and depth buffer for subsequent rendering

		state.buffers.color.setLocked( false );
		state.buffers.depth.setLocked( false );

		// only render where stencil is set to 1

		state.buffers.stencil.setLocked( false );
		state.buffers.stencil.setFunc( context.EQUAL, 1, 0xffffffff ); // draw if == 1
		state.buffers.stencil.setOp( context.KEEP, context.KEEP, context.KEEP );
		state.buffers.stencil.setLocked( true );

	}

}

class ClearMaskPass extends Pass {

	constructor() {

		super();

		this.needsSwap = false;

	}

	render( renderer /*, writeBuffer, readBuffer, deltaTime, maskActive */ ) {

		renderer.state.buffers.stencil.setLocked( false );
		renderer.state.buffers.stencil.setTest( false );

	}

}

class EffectComposer {

	constructor( renderer, renderTarget ) {

		this.renderer = renderer;

		if ( renderTarget === undefined ) {

			const size = renderer.getSize( new Vector2() );
			this._pixelRatio = renderer.getPixelRatio();
			this._width = size.width;
			this._height = size.height;

			renderTarget = new WebGLRenderTarget( this._width * this._pixelRatio, this._height * this._pixelRatio );
			renderTarget.texture.name = 'EffectComposer.rt1';

		} else {

			this._pixelRatio = 1;
			this._width = renderTarget.width;
			this._height = renderTarget.height;

		}

		this.renderTarget1 = renderTarget;
		this.renderTarget2 = renderTarget.clone();
		this.renderTarget2.texture.name = 'EffectComposer.rt2';

		this.writeBuffer = this.renderTarget1;
		this.readBuffer = this.renderTarget2;

		this.renderToScreen = true;

		this.passes = [];

		// dependencies

		if ( CopyShader === undefined ) {

			console.error( 'THREE.EffectComposer relies on CopyShader' );

		}

		if ( ShaderPass === undefined ) {

			console.error( 'THREE.EffectComposer relies on ShaderPass' );

		}

		this.copyPass = new ShaderPass( CopyShader );

		this.clock = new Clock();

	}

	swapBuffers() {

		const tmp = this.readBuffer;
		this.readBuffer = this.writeBuffer;
		this.writeBuffer = tmp;

	}

	addPass( pass ) {

		this.passes.push( pass );
		pass.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

	}

	insertPass( pass, index ) {

		this.passes.splice( index, 0, pass );
		pass.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

	}

	removePass( pass ) {

		const index = this.passes.indexOf( pass );

		if ( index !== - 1 ) {

			this.passes.splice( index, 1 );

		}

	}

	isLastEnabledPass( passIndex ) {

		for ( let i = passIndex + 1; i < this.passes.length; i ++ ) {

			if ( this.passes[ i ].enabled ) {

				return false;

			}

		}

		return true;

	}

	render( deltaTime ) {

		// deltaTime value is in seconds

		if ( deltaTime === undefined ) {

			deltaTime = this.clock.getDelta();

		}

		const currentRenderTarget = this.renderer.getRenderTarget();

		let maskActive = false;

		for ( let i = 0, il = this.passes.length; i < il; i ++ ) {

			const pass = this.passes[ i ];

			if ( pass.enabled === false ) continue;

			pass.renderToScreen = ( this.renderToScreen && this.isLastEnabledPass( i ) );
			pass.render( this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive );

			if ( pass.needsSwap ) {

				if ( maskActive ) {

					const context = this.renderer.getContext();
					const stencil = this.renderer.state.buffers.stencil;

					//context.stencilFunc( context.NOTEQUAL, 1, 0xffffffff );
					stencil.setFunc( context.NOTEQUAL, 1, 0xffffffff );

					this.copyPass.render( this.renderer, this.writeBuffer, this.readBuffer, deltaTime );

					//context.stencilFunc( context.EQUAL, 1, 0xffffffff );
					stencil.setFunc( context.EQUAL, 1, 0xffffffff );

				}

				this.swapBuffers();

			}

			if ( MaskPass !== undefined ) {

				if ( pass instanceof MaskPass ) {

					maskActive = true;

				} else if ( pass instanceof ClearMaskPass ) {

					maskActive = false;

				}

			}

		}

		this.renderer.setRenderTarget( currentRenderTarget );

	}

	reset( renderTarget ) {

		if ( renderTarget === undefined ) {

			const size = this.renderer.getSize( new Vector2() );
			this._pixelRatio = this.renderer.getPixelRatio();
			this._width = size.width;
			this._height = size.height;

			renderTarget = this.renderTarget1.clone();
			renderTarget.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

		}

		this.renderTarget1.dispose();
		this.renderTarget2.dispose();
		this.renderTarget1 = renderTarget;
		this.renderTarget2 = renderTarget.clone();

		this.writeBuffer = this.renderTarget1;
		this.readBuffer = this.renderTarget2;

	}

	setSize( width, height ) {

		this._width = width;
		this._height = height;

		const effectiveWidth = this._width * this._pixelRatio;
		const effectiveHeight = this._height * this._pixelRatio;

		this.renderTarget1.setSize( effectiveWidth, effectiveHeight );
		this.renderTarget2.setSize( effectiveWidth, effectiveHeight );

		for ( let i = 0; i < this.passes.length; i ++ ) {

			this.passes[ i ].setSize( effectiveWidth, effectiveHeight );

		}

	}

	setPixelRatio( pixelRatio ) {

		this._pixelRatio = pixelRatio;

		this.setSize( this._width, this._height );

	}

}

// Helper for passes that need to fill the viewport with a single quad.

new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

// https://github.com/mrdoob/three.js/pull/21358

const _geometry = new BufferGeometry();
_geometry.setAttribute( 'position', new Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
_geometry.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

class RenderPass extends Pass {

	constructor( scene, camera, overrideMaterial, clearColor, clearAlpha ) {

		super();

		this.scene = scene;
		this.camera = camera;

		this.overrideMaterial = overrideMaterial;

		this.clearColor = clearColor;
		this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 0;

		this.clear = true;
		this.clearDepth = false;
		this.needsSwap = false;
		this._oldClearColor = new Color();

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		const oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		let oldClearAlpha, oldOverrideMaterial;

		if ( this.overrideMaterial !== undefined ) {

			oldOverrideMaterial = this.scene.overrideMaterial;

			this.scene.overrideMaterial = this.overrideMaterial;

		}

		if ( this.clearColor ) {

			renderer.getClearColor( this._oldClearColor );
			oldClearAlpha = renderer.getClearAlpha();

			renderer.setClearColor( this.clearColor, this.clearAlpha );

		}

		if ( this.clearDepth ) {

			renderer.clearDepth();

		}

		renderer.setRenderTarget( this.renderToScreen ? null : readBuffer );

		// TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
		if ( this.clear ) renderer.clear( renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil );
		renderer.render( this.scene, this.camera );

		if ( this.clearColor ) {

			renderer.setClearColor( this._oldClearColor, oldClearAlpha );

		}

		if ( this.overrideMaterial !== undefined ) {

			this.scene.overrideMaterial = oldOverrideMaterial;

		}

		renderer.autoClear = oldAutoClear;

	}

}

/**
 * Luminosity
 * http://en.wikipedia.org/wiki/Luminosity
 */

const LuminosityHighPassShader = {

	shaderID: 'luminosityHighPass',

	uniforms: {

		'tDiffuse': { value: null },
		'luminosityThreshold': { value: 1.0 },
		'smoothWidth': { value: 1.0 },
		'defaultColor': { value: new Color( 0x000000 ) },
		'defaultOpacity': { value: 0.0 }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			vec3 luma = vec3( 0.299, 0.587, 0.114 );

			float v = dot( texel.xyz, luma );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`

};

/**
 * UnrealBloomPass is inspired by the bloom pass of Unreal Engine. It creates a
 * mip map chain of bloom textures and blurs them with different radii. Because
 * of the weighted combination of mips, and because larger blurs are done on
 * higher mips, this effect provides good quality and performance.
 *
 * Reference:
 * - https://docs.unrealengine.com/latest/INT/Engine/Rendering/PostProcessEffects/Bloom/
 */
class UnrealBloomPass extends Pass {

	constructor( resolution, strength, radius, threshold ) {

		super();

		this.strength = ( strength !== undefined ) ? strength : 1;
		this.radius = radius;
		this.threshold = threshold;
		this.resolution = ( resolution !== undefined ) ? new Vector2( resolution.x, resolution.y ) : new Vector2( 256, 256 );

		// create color only once here, reuse it later inside the render function
		this.clearColor = new Color( 0, 0, 0 );

		// render targets
		this.renderTargetsHorizontal = [];
		this.renderTargetsVertical = [];
		this.nMips = 5;
		let resx = Math.round( this.resolution.x / 2 );
		let resy = Math.round( this.resolution.y / 2 );

		this.renderTargetBright = new WebGLRenderTarget( resx, resy );
		this.renderTargetBright.texture.name = 'UnrealBloomPass.bright';
		this.renderTargetBright.texture.generateMipmaps = false;

		for ( let i = 0; i < this.nMips; i ++ ) {

			const renderTargetHorizonal = new WebGLRenderTarget( resx, resy );

			renderTargetHorizonal.texture.name = 'UnrealBloomPass.h' + i;
			renderTargetHorizonal.texture.generateMipmaps = false;

			this.renderTargetsHorizontal.push( renderTargetHorizonal );

			const renderTargetVertical = new WebGLRenderTarget( resx, resy );

			renderTargetVertical.texture.name = 'UnrealBloomPass.v' + i;
			renderTargetVertical.texture.generateMipmaps = false;

			this.renderTargetsVertical.push( renderTargetVertical );

			resx = Math.round( resx / 2 );

			resy = Math.round( resy / 2 );

		}

		// luminosity high pass material

		if ( LuminosityHighPassShader === undefined )
			console.error( 'THREE.UnrealBloomPass relies on LuminosityHighPassShader' );

		const highPassShader = LuminosityHighPassShader;
		this.highPassUniforms = UniformsUtils.clone( highPassShader.uniforms );

		this.highPassUniforms[ 'luminosityThreshold' ].value = threshold;
		this.highPassUniforms[ 'smoothWidth' ].value = 0.01;

		this.materialHighPassFilter = new ShaderMaterial( {
			uniforms: this.highPassUniforms,
			vertexShader: highPassShader.vertexShader,
			fragmentShader: highPassShader.fragmentShader,
			defines: {}
		} );

		// Gaussian Blur Materials
		this.separableBlurMaterials = [];
		const kernelSizeArray = [ 3, 5, 7, 9, 11 ];
		resx = Math.round( this.resolution.x / 2 );
		resy = Math.round( this.resolution.y / 2 );

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.separableBlurMaterials.push( this.getSeperableBlurMaterial( kernelSizeArray[ i ] ) );

			this.separableBlurMaterials[ i ].uniforms[ 'texSize' ].value = new Vector2( resx, resy );

			resx = Math.round( resx / 2 );

			resy = Math.round( resy / 2 );

		}

		// Composite material
		this.compositeMaterial = this.getCompositeMaterial( this.nMips );
		this.compositeMaterial.uniforms[ 'blurTexture1' ].value = this.renderTargetsVertical[ 0 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture2' ].value = this.renderTargetsVertical[ 1 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture3' ].value = this.renderTargetsVertical[ 2 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture4' ].value = this.renderTargetsVertical[ 3 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture5' ].value = this.renderTargetsVertical[ 4 ].texture;
		this.compositeMaterial.uniforms[ 'bloomStrength' ].value = strength;
		this.compositeMaterial.uniforms[ 'bloomRadius' ].value = 0.1;
		this.compositeMaterial.needsUpdate = true;

		const bloomFactors = [ 1.0, 0.8, 0.6, 0.4, 0.2 ];
		this.compositeMaterial.uniforms[ 'bloomFactors' ].value = bloomFactors;
		this.bloomTintColors = [ new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ) ];
		this.compositeMaterial.uniforms[ 'bloomTintColors' ].value = this.bloomTintColors;

		// copy material
		if ( CopyShader === undefined ) {

			console.error( 'THREE.UnrealBloomPass relies on CopyShader' );

		}

		const copyShader = CopyShader;

		this.copyUniforms = UniformsUtils.clone( copyShader.uniforms );
		this.copyUniforms[ 'opacity' ].value = 1.0;

		this.materialCopy = new ShaderMaterial( {
			uniforms: this.copyUniforms,
			vertexShader: copyShader.vertexShader,
			fragmentShader: copyShader.fragmentShader,
			blending: AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			transparent: true
		} );

		this.enabled = true;
		this.needsSwap = false;

		this._oldClearColor = new Color();
		this.oldClearAlpha = 1;

		this.basic = new MeshBasicMaterial();

		this.fsQuad = new FullScreenQuad( null );

	}

	dispose() {

		for ( let i = 0; i < this.renderTargetsHorizontal.length; i ++ ) {

			this.renderTargetsHorizontal[ i ].dispose();

		}

		for ( let i = 0; i < this.renderTargetsVertical.length; i ++ ) {

			this.renderTargetsVertical[ i ].dispose();

		}

		this.renderTargetBright.dispose();

	}

	setSize( width, height ) {

		let resx = Math.round( width / 2 );
		let resy = Math.round( height / 2 );

		this.renderTargetBright.setSize( resx, resy );

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.renderTargetsHorizontal[ i ].setSize( resx, resy );
			this.renderTargetsVertical[ i ].setSize( resx, resy );

			this.separableBlurMaterials[ i ].uniforms[ 'texSize' ].value = new Vector2( resx, resy );

			resx = Math.round( resx / 2 );
			resy = Math.round( resy / 2 );

		}

	}

	render( renderer, writeBuffer, readBuffer, deltaTime, maskActive ) {

		renderer.getClearColor( this._oldClearColor );
		this.oldClearAlpha = renderer.getClearAlpha();
		const oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		renderer.setClearColor( this.clearColor, 0 );

		if ( maskActive ) renderer.state.buffers.stencil.setTest( false );

		// Render input to screen

		if ( this.renderToScreen ) {

			this.fsQuad.material = this.basic;
			this.basic.map = readBuffer.texture;

			renderer.setRenderTarget( null );
			renderer.clear();
			this.fsQuad.render( renderer );

		}

		// 1. Extract Bright Areas

		this.highPassUniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.highPassUniforms[ 'luminosityThreshold' ].value = this.threshold;
		this.fsQuad.material = this.materialHighPassFilter;

		renderer.setRenderTarget( this.renderTargetBright );
		renderer.clear();
		this.fsQuad.render( renderer );

		// 2. Blur All the mips progressively

		let inputRenderTarget = this.renderTargetBright;

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.fsQuad.material = this.separableBlurMaterials[ i ];

			this.separableBlurMaterials[ i ].uniforms[ 'colorTexture' ].value = inputRenderTarget.texture;
			this.separableBlurMaterials[ i ].uniforms[ 'direction' ].value = UnrealBloomPass.BlurDirectionX;
			renderer.setRenderTarget( this.renderTargetsHorizontal[ i ] );
			renderer.clear();
			this.fsQuad.render( renderer );

			this.separableBlurMaterials[ i ].uniforms[ 'colorTexture' ].value = this.renderTargetsHorizontal[ i ].texture;
			this.separableBlurMaterials[ i ].uniforms[ 'direction' ].value = UnrealBloomPass.BlurDirectionY;
			renderer.setRenderTarget( this.renderTargetsVertical[ i ] );
			renderer.clear();
			this.fsQuad.render( renderer );

			inputRenderTarget = this.renderTargetsVertical[ i ];

		}

		// Composite All the mips

		this.fsQuad.material = this.compositeMaterial;
		this.compositeMaterial.uniforms[ 'bloomStrength' ].value = this.strength;
		this.compositeMaterial.uniforms[ 'bloomRadius' ].value = this.radius;
		this.compositeMaterial.uniforms[ 'bloomTintColors' ].value = this.bloomTintColors;

		renderer.setRenderTarget( this.renderTargetsHorizontal[ 0 ] );
		renderer.clear();
		this.fsQuad.render( renderer );

		// Blend it additively over the input texture

		this.fsQuad.material = this.materialCopy;
		this.copyUniforms[ 'tDiffuse' ].value = this.renderTargetsHorizontal[ 0 ].texture;

		if ( maskActive ) renderer.state.buffers.stencil.setTest( true );

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( readBuffer );
			this.fsQuad.render( renderer );

		}

		// Restore renderer settings

		renderer.setClearColor( this._oldClearColor, this.oldClearAlpha );
		renderer.autoClear = oldAutoClear;

	}

	getSeperableBlurMaterial( kernelRadius ) {

		return new ShaderMaterial( {

			defines: {
				'KERNEL_RADIUS': kernelRadius,
				'SIGMA': kernelRadius
			},

			uniforms: {
				'colorTexture': { value: null },
				'texSize': { value: new Vector2( 0.5, 0.5 ) },
				'direction': { value: new Vector2( 0.5, 0.5 ) }
			},

			vertexShader:
				`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,

			fragmentShader:
				`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;

				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}
				void main() {
					vec2 invSize = 1.0 / texSize;
					float fSigma = float(SIGMA);
					float weightSum = gaussianPdf(0.0, fSigma);
					vec3 diffuseSum = texture2D( colorTexture, vUv).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianPdf(x, fSigma);
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`
		} );

	}

	getCompositeMaterial( nMips ) {

		return new ShaderMaterial( {

			defines: {
				'NUM_MIPS': nMips
			},

			uniforms: {
				'blurTexture1': { value: null },
				'blurTexture2': { value: null },
				'blurTexture3': { value: null },
				'blurTexture4': { value: null },
				'blurTexture5': { value: null },
				'bloomStrength': { value: 1.0 },
				'bloomFactors': { value: null },
				'bloomTintColors': { value: null },
				'bloomRadius': { value: 0.0 }
			},

			vertexShader:
				`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,

			fragmentShader:
				`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`
		} );

	}

}

UnrealBloomPass.BlurDirectionX = new Vector2( 1.0, 0.0 );
UnrealBloomPass.BlurDirectionY = new Vector2( 0.0, 1.0 );

const { randFloat: rnd$1, randFloatSpread: rndFS$1 } = MathUtils;
const defaultConfig$1 = {
  gpgpuSize: 256,
  bloomStrength: 1.5,
  bloomRadius: 0.5,
  bloomThreshold: 0.25,
  colors: [Math.random() * 16777215, Math.random() * 16777215, Math.random() * 16777215],
  geometry: "custom",
  geometryScale: [1, 1, 1],
  lights: [
    { type: "ambient", params: [16777215, 0.5] },
    { type: "point", params: [16777215, 1], props: { position: [0, 0, 0] } },
    { type: "point", params: [16748640, 0.75], props: { position: [0, -100, -100] } },
    { type: "point", params: [6328575, 0.75], props: { position: [0, 100, 100] } }
  ],
  materialParams: {},
  noiseCoordScale: 0.01,
  noiseIntensity: 25e-4,
  noiseTimeCoef: 4e-4,
  attractionRadius1: 150,
  attractionRadius2: 250,
  maxVelocity: 0.25
};
function index$1(params) {
  const config = { ...defaultConfig$1, ...params };
  const WIDTH = config.gpgpuSize;
  const COUNT = WIDTH * WIDTH;
  let gpu;
  let dtPosition, dtVelocity;
  let velocityVariable, positionVariable;
  const uTexturePosition = { value: null };
  const uOldTexturePosition = { value: null };
  const uTextureVelocity = { value: null };
  const uScale = { value: new Vector3(...config.geometryScale) };
  const uTime = { value: 0 };
  const uNoiseCoordScale = { value: config.noiseCoordScale };
  const uNoiseIntensity = { value: config.noiseIntensity };
  const uMaxVelocity = { value: config.maxVelocity };
  const uAttractionRadius1 = { value: config.attractionRadius1 };
  const uAttractionRadius2 = { value: config.attractionRadius2 };
  const uMouse = { value: new Vector3() };
  const gpuTexturesUniforms = { uTexturePosition, uOldTexturePosition, uTextureVelocity };
  const commonUniforms = { uScale, uTime, uNoiseCoordScale, uNoiseIntensity, uMaxVelocity, uAttractionRadius1, uAttractionRadius2, uMouse };
  const uniforms = { ...gpuTexturesUniforms, ...commonUniforms };
  let effectComposer;
  let renderPass, bloomPass;
  let camera;
  let geometry, material, iMesh;
  const _three = three({
    ...commonConfig$1(params),
    antialias: false,
    orbitControls: true,
    initRenderer({ renderer }) {
      initGPU(renderer);
    },
    initCamera(three2) {
      camera = three2.camera;
      camera.position.z = 70;
    },
    initScene({ renderer, width, height, camera: camera2, scene }) {
      initScene(scene);
      renderPass = new RenderPass(scene, camera2);
      bloomPass = new UnrealBloomPass(new Vector2(width, height), config.bloomStrength, config.bloomRadius, config.bloomThreshold);
      effectComposer = new EffectComposer(renderer);
      effectComposer.addPass(renderPass);
      effectComposer.addPass(bloomPass);
    },
    afterResize({ width, height }) {
      if (effectComposer)
        effectComposer.setSize(width, height);
    },
    beforeRender({ clock }) {
      uTime.value = clock.time * config.noiseTimeCoef;
      gpu.compute();
      uTexturePosition.value = positionVariable.renderTargets[gpu.currentTextureIndex].texture;
      uOldTexturePosition.value = positionVariable.renderTargets[gpu.currentTextureIndex === 0 ? 1 : 0].texture;
      uTextureVelocity.value = velocityVariable.renderTargets[gpu.currentTextureIndex].texture;
    },
    render() {
      effectComposer.render();
    }
  });
  return { three: _three, config, uniforms, setColors };
  function initGPU(renderer) {
    gpu = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    if (!renderer.capabilities.isWebGL2) {
      gpu.setDataType(HalfFloatType);
    }
    dtPosition = gpu.createTexture();
    dtVelocity = gpu.createTexture();
    initTextures(dtPosition, dtVelocity);
    velocityVariable = gpu.addVariable("textureVelocity", `
      ${psrdnoise$1}
      uniform float uTime;
      uniform vec3 uMouse;
      uniform float uNoiseCoordScale;
      uniform float uNoiseIntensity;
      uniform float uMaxVelocity;
      uniform float uAttractionRadius1;
      uniform float uAttractionRadius2;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);

        vec3 grad;
        float n = psrdnoise(pos.xyz * uNoiseCoordScale, vec3(0), uTime, grad);
        vel.xyz += (pos.w * 0.75) * grad * uNoiseIntensity;

        vec3 dv = -pos.xyz;
        float coef = smoothstep(uAttractionRadius1, uAttractionRadius2, length(dv));
        vel.xyz = vel.xyz + pos.w * coef * normalize(dv);
        vel.xyz = clamp(vel.xyz, -uMaxVelocity, uMaxVelocity);

        gl_FragColor = vel;
      }
    `, dtVelocity);
    positionVariable = gpu.addVariable("texturePosition", `
      ${psrdnoise$1}
      uniform float uTime;
      uniform vec3 uMouse;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        pos.xyz += vel.xyz;
        gl_FragColor = pos;
      }
    `, dtPosition);
    gpu.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
    gpu.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
    Object.keys(commonUniforms).forEach((key) => {
      velocityVariable.material.uniforms[key] = uniforms[key];
      positionVariable.material.uniforms[key] = uniforms[key];
    });
    const error = gpu.init();
    if (error !== null) {
      throw new Error(error);
    }
  }
  function initScene(scene) {
    if (config.background !== void 0) {
      scene.background = new Color(config.background);
    }
    initLights(scene, config.lights);
    switch (config.geometry) {
      case "box":
        geometry = new BoxGeometry();
        break;
      case "capsule":
        geometry = new CapsuleGeometry(0.2, 1, 4, 8).rotateX(Math.PI / 2);
        break;
      case "cone":
        geometry = new ConeGeometry(0.4, 2, 6).rotateX(Math.PI / 2);
        break;
      case "octahedron":
        geometry = new OctahedronGeometry(1, 0).rotateX(Math.PI / 2);
        break;
      case "sphere":
        geometry = new SphereGeometry(0.5, 8, 8);
        break;
      default:
        geometry = customGeometry(1);
    }
    const gpuUvs = new Float32Array(COUNT * 2);
    let index = 0;
    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        gpuUvs[index++] = i / (WIDTH - 1);
        gpuUvs[index++] = j / (WIDTH - 1);
      }
    }
    geometry.setAttribute("gpuUv", new InstancedBufferAttribute(gpuUvs, 2));
    material = new MeshStandardMaterial({
      metalness: 0.75,
      roughness: 0.25,
      side: DoubleSide,
      ...config.materialParams,
      onBeforeCompile: (shader) => {
        Object.keys(uniforms).forEach((key) => {
          shader.uniforms[key] = uniforms[key];
        });
        shader.vertexShader = `
          uniform sampler2D uTexturePosition;
          uniform sampler2D uOldTexturePosition;
          uniform sampler2D uTextureVelocity;
          uniform vec3 uScale;
          attribute vec2 gpuUv;
          varying vec4 vPos;
          varying vec4 vVel;

          mat3 lookAt(vec3 origin, vec3 target, vec3 up) {
            vec3 z = target - origin;
            if (z.x * z.x + z.y * z.y + z.z * z.z == 0.0) { z.z = 1.0; }
            z = normalize(z);
            vec3 x = cross(up, z);
            if (x.x * x.x + x.y * x.y + x.z * x.z == 0.0) {
              if (abs(up.z) == 1.0) { z.x += 0.0001; }
              else { z.z += 0.0001; }
              x = cross(up, z);
            }
            x = normalize(x);
            vec3 y = cross(z, x);
            return mat3(x, y, z);
          }

          mat4 iMatrix(vec3 pos, mat3 rmat, vec3 scale) {
            return mat4(
              rmat[0][0] * scale.x, rmat[0][1] * scale.x, rmat[0][2] * scale.x, 0.0,
              rmat[1][0] * scale.y, rmat[1][1] * scale.y, rmat[1][2] * scale.y, 0.0,
              rmat[2][0] * scale.z, rmat[2][1] * scale.z, rmat[2][2] * scale.z, 0.0,
              pos.x, pos.y, pos.z, 1.0
            );
          }
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <defaultnormal_vertex>", `
          vPos = texture2D(uTexturePosition, gpuUv);
          vec4 oldPos = texture2D(uOldTexturePosition, gpuUv);
          vVel = texture2D(uTextureVelocity, gpuUv);

          mat3 rmat = lookAt(oldPos.xyz, vPos.xyz, vec3(0, 1, 0));
          mat4 im = iMatrix(vPos.xyz, rmat, (0.5 + vPos.w) * uScale);

          vec3 transformedNormal = objectNormal;
          mat3 m = mat3(im);
          transformedNormal /= vec3( dot( m[ 0 ], m[ 0 ] ), dot( m[ 1 ], m[ 1 ] ), dot( m[ 2 ], m[ 2 ] ) );
          transformedNormal = m * transformedNormal;
          transformedNormal = normalMatrix * transformedNormal;
        `);
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
          vec4 mvPosition = modelViewMatrix * im * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        `);
      }
    });
    iMesh = new InstancedMesh(geometry, material, COUNT);
    setColors(config.colors);
    scene.add(iMesh);
  }
  function setColors(colors) {
    if (Array.isArray(colors) && colors.length > 1) {
      const cscale = colorScale(colors);
      for (let i = 0; i < COUNT; i++) {
        iMesh.setColorAt(i, cscale.getColorAt(i / COUNT));
      }
      iMesh.instanceColor.needsUpdate = true;
    }
  }
  function initTextures(texturePosition, textureVelocity) {
    const dummy = new Vector3();
    const posArray = texturePosition.image.data;
    const velArray = textureVelocity.image.data;
    for (let k = 0, kl = posArray.length; k < kl; k += 4) {
      dummy.set(rndFS$1(1), rndFS$1(1), rndFS$1(1)).normalize().multiplyScalar(rndFS$1(config.attractionRadius1 * 2));
      dummy.toArray(posArray, k);
      posArray[k + 3] = rnd$1(0.1, 1);
      dummy.set(0, 0, 0);
      dummy.toArray(velArray, k);
      velArray[k + 3] = 0;
    }
  }
}
function customGeometry(size) {
  const vertices = [
    { p: [size * 0.5, 0, -size], n: [0, 1, 0] },
    { p: [-size * 0.5, 0, -size], n: [0, 1, 0] },
    { p: [0, 0, size], n: [0, 1, 0] },
    { p: [0, -size * 0.5, -size], n: [1, 0, 0] },
    { p: [0, size * 0.5, -size], n: [1, 0, 0] },
    { p: [0, 0, size], n: [1, 0, 0] }
  ];
  const indexes = [0, 1, 2, 3, 4, 5];
  const positions = [];
  const normals = [];
  for (const vertex of vertices) {
    positions.push(...vertex.p);
    normals.push(...vertex.n);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indexes);
  return geometry;
}

const { randFloat: rnd, randFloatSpread: rndFS } = MathUtils;
const defaultConfig = {
  gpgpuSize: 64,
  background: 16777215,
  material: "basic",
  materialParams: {},
  texture: null,
  textureCount: 1,
  colors: [16777215, 16777215],
  lights: [
    { type: "ambient", params: [16777215, 0.5] },
    { type: "directional", params: [16777215, 0.5], props: { position: [20, 50, 100] } }
  ],
  fogDensity: 0.01,
  fishScale: [1, 1, 1],
  fishWidthSegments: 8,
  fishSpeed: 1.5,
  fishDisplacementScale: 0.2,
  noiseCoordScale: 0.02,
  noiseTimeCoef: 5e-4,
  noiseIntensity: 25e-4,
  attractionRadius1: 50,
  attractionRadius2: 100,
  maxVelocity: 0.1
};
function index(params) {
  const config = { ...defaultConfig, ...params };
  if (!["basic", "phong", "standard"].includes(config.material)) {
    throw new Error(`Invalid material ${config.material}`);
  }
  if (!Number.isInteger(config.fishWidthSegments) || config.fishWidthSegments % 2 !== 0) {
    throw new Error(`Invalid fishWidthSegments ${config.fishWidthSegments}`);
  }
  const WIDTH = config.gpgpuSize;
  const COUNT = WIDTH * WIDTH;
  let gpu;
  let dtPosition, dtVelocity;
  let velocityVariable, positionVariable;
  const uTexturePosition = { value: null };
  const uOldTexturePosition = { value: null };
  const uTextureVelocity = { value: null };
  const uTime = { value: 0 };
  const uNoiseCoordScale = { value: config.noiseCoordScale };
  const uNoiseIntensity = { value: config.noiseIntensity };
  const uMaxVelocity = { value: config.maxVelocity };
  const uAttractionRadius1 = { value: config.attractionRadius1 };
  const uAttractionRadius2 = { value: config.attractionRadius2 };
  const uFishScale = { value: new Vector3(...config.fishScale) };
  const uFishSpeed = { value: config.fishSpeed };
  const uFishDisplacementScale = { value: config.fishDisplacementScale };
  const gpuTexturesUniforms = { uTexturePosition, uOldTexturePosition, uTextureVelocity };
  const commonUniforms = { uTime, uNoiseCoordScale, uNoiseIntensity, uMaxVelocity, uAttractionRadius1, uAttractionRadius2, uFishScale, uFishSpeed, uFishDisplacementScale };
  const uniforms = { ...gpuTexturesUniforms, ...commonUniforms };
  let geometry, material, iMesh;
  const _three = three({
    ...commonConfig$1(params),
    antialias: true,
    orbitControls: true,
    initRenderer({ renderer }) {
      initGPU(renderer);
    },
    initCamera({ camera }) {
      camera.position.set(0, 20, 70);
    },
    initScene({ scene }) {
      initScene(scene);
    },
    beforeRender({ clock }) {
      uTime.value = clock.time * config.noiseTimeCoef;
      gpu.compute();
      uTexturePosition.value = positionVariable.renderTargets[gpu.currentTextureIndex].texture;
      uOldTexturePosition.value = positionVariable.renderTargets[gpu.currentTextureIndex === 0 ? 1 : 0].texture;
      uTextureVelocity.value = velocityVariable.renderTargets[gpu.currentTextureIndex].texture;
    }
  });
  return { three: _three, config, uniforms, setColors };
  function initGPU(renderer) {
    gpu = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    if (!renderer.capabilities.isWebGL2) {
      gpu.setDataType(HalfFloatType);
    }
    dtPosition = gpu.createTexture();
    dtVelocity = gpu.createTexture();
    initTextures(dtPosition, dtVelocity);
    velocityVariable = gpu.addVariable("textureVelocity", `
      ${psrdnoise$1}
      uniform float uTime;
      uniform float uNoiseCoordScale;
      uniform float uNoiseIntensity;
      uniform float uMaxVelocity;
      uniform float uAttractionRadius1;
      uniform float uAttractionRadius2;
      uniform float uFishSpeed;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);

        vec3 grad;
        float n = psrdnoise(pos.xyz * uNoiseCoordScale, vec3(0), uTime, grad);
        grad = grad * uNoiseIntensity;
        vel.xyz = vel.xyz + (pos.w * 0.75) * grad;

        vec3 dv = -pos.xyz;
        float coef = smoothstep(uAttractionRadius1, uAttractionRadius2, length(dv));
        vel.xyz = vel.xyz + pos.w * coef * normalize(dv);
        vel.xyz = clamp(vel.xyz, -uMaxVelocity, uMaxVelocity);

        vel.w = mod(vel.w + length(vel.xyz) * (0.5 + pos.w) * uFishSpeed, 6.2831853071);
        gl_FragColor = vel;
      }
    `, dtVelocity);
    positionVariable = gpu.addVariable("texturePosition", `
      ${psrdnoise$1}
      uniform float uTime;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 pos = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        pos.xyz += vel.xyz;
        gl_FragColor = pos;
      }
    `, dtPosition);
    gpu.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
    gpu.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
    Object.keys(commonUniforms).forEach((key) => {
      velocityVariable.material.uniforms[key] = uniforms[key];
      positionVariable.material.uniforms[key] = uniforms[key];
    });
    const error = gpu.init();
    if (error !== null) {
      throw new Error(error);
    }
  }
  function initScene(scene) {
    if (config.background !== void 0) {
      scene.background = new Color(config.background);
      if (config.fogDensity)
        scene.fog = new FogExp2(config.background, config.fogDensity);
    }
    initLights(scene, config.lights);
    geometry = new PlaneGeometry(2, 1, config.fishWidthSegments, 1).rotateY(Math.PI / 2);
    const gpuUvs = new Float32Array(COUNT * 2);
    const mapIndexes = new Float32Array(COUNT);
    let i1 = 0;
    let i2 = 0;
    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        gpuUvs[i1++] = i / (WIDTH - 1);
        gpuUvs[i1++] = j / (WIDTH - 1);
        mapIndexes[i2++] = Math.floor(Math.random() * config.textureCount);
      }
    }
    geometry.setAttribute("gpuUv", new InstancedBufferAttribute(gpuUvs, 2));
    geometry.setAttribute("mapIndex", new InstancedBufferAttribute(mapIndexes, 1));
    const materialParams = { side: DoubleSide, ...config.materialParams };
    if (config.texture) {
      materialParams.map = new TextureLoader().load(config.texture);
    }
    materialParams.onBeforeCompile = (shader) => {
      shader.defines = {
        COMPUTE_NORMALS: config.material !== "basic",
        FISH_DZ: (2 / config.fishWidthSegments).toFixed(10),
        TEXTURE_COUNT: config.textureCount.toFixed(10)
      };
      Object.keys(uniforms).forEach((key) => {
        shader.uniforms[key] = uniforms[key];
      });
      shader.vertexShader = `
        uniform sampler2D uTexturePosition;
        uniform sampler2D uOldTexturePosition;
        uniform sampler2D uTextureVelocity;
        uniform vec3 uFishScale;
        uniform float uFishDisplacementScale;
        attribute vec2 gpuUv;
        attribute float mapIndex;
        varying vec4 vPos;
        varying vec4 vVel;
        varying float vMapIndex;

        mat3 lookAt(vec3 origin, vec3 target, vec3 up) {
          vec3 z = target - origin;
          if (z.x * z.x + z.y * z.y + z.z * z.z == 0.0) { z.z = 1.0; }
          z = normalize(z);
          vec3 x = cross(up, z);
          if (x.x * x.x + x.y * x.y + x.z * x.z == 0.0) {
            if (abs(up.z) == 1.0) { z.x += 0.0001; }
            else { z.z += 0.0001; }
            x = cross(up, z);
          }
          x = normalize(x);
          vec3 y = cross(z, x);
          return mat3(x, y, z);
        }

        mat4 iMatrix(vec3 pos, mat3 rmat, vec3 scale) {
          return mat4(
            rmat[0][0] * scale.x, rmat[0][1] * scale.x, rmat[0][2] * scale.x, 0.0,
            rmat[1][0] * scale.y, rmat[1][1] * scale.y, rmat[1][2] * scale.y, 0.0,
            rmat[2][0] * scale.z, rmat[2][1] * scale.z, rmat[2][2] * scale.z, 0.0,
            pos.x, pos.y, pos.z, 1.0
          );
        }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <defaultnormal_vertex>", "");
      shader.vertexShader = shader.vertexShader.replace("#include <normal_vertex>", "");
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        vPos = texture2D(uTexturePosition, gpuUv);
        vec4 oldPos = texture2D(uOldTexturePosition, gpuUv);
        vVel = texture2D(uTextureVelocity, gpuUv);
        vMapIndex = float(mapIndex);

        mat3 rmat = lookAt(oldPos.xyz, vPos.xyz, vec3(0, 1, 0));
        mat4 im = iMatrix(vPos.xyz, rmat, (0.5 + vPos.w) * uFishScale);

        vec3 transformed = vec3(position);

        #ifdef COMPUTE_NORMALS
          vec3 transformedNormal = objectNormal; 
        #endif

        float dz = transformed.z + 1.0;
        float sdz = smoothstep(2.0, 0.0, dz);
        transformed.x += sin(vVel.w + dz * PI * 1.5) * sdz * uFishDisplacementScale;

        #ifdef COMPUTE_NORMALS
          float dz1 = dz - 0.2;
          float sdz1 = smoothstep(2.0, 0.0, dz1);
          float dx1 = sin(vVel.w + dz1 * PI * 1.5) * sdz1 * uFishDisplacementScale - transformed.x;
          vec3 v1 = vec3(dx1, 0.0, -FISH_DZ);
          vec3 v2 = vec3(0.0, 1.0, 0.0);
          transformedNormal = normalize(cross(v1, v2));
        #endif

        #ifdef COMPUTE_NORMALS
          #ifdef USE_INSTANCING
            mat3 m = mat3( im );
            transformedNormal /= vec3( dot( m[ 0 ], m[ 0 ] ), dot( m[ 1 ], m[ 1 ] ), dot( m[ 2 ], m[ 2 ] ) );
            transformedNormal = m * transformedNormal;
          #endif
          transformedNormal = normalMatrix * transformedNormal;
          #ifdef FLIP_SIDED
            transformedNormal = - transformedNormal;
          #endif
          #ifdef USE_TANGENT
            vec3 transformedTangent = ( modelViewMatrix * vec4( objectTangent, 0.0 ) ).xyz;
            #ifdef FLIP_SIDED
              transformedTangent = - transformedTangent;
            #endif
          #endif
          #ifndef FLAT_SHADED
            vNormal = normalize( transformedNormal );
            #ifdef USE_TANGENT
              vTangent = normalize( transformedTangent );
              vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
            #endif
          #endif
        #endif
      `);
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = im * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
      shader.fragmentShader = `
        varying float vMapIndex;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          vec2 uv = vUv;
          uv.x = (vMapIndex + vUv.x) / TEXTURE_COUNT;
          vec4 sampledDiffuseColor = texture2D(map, uv);
          diffuseColor *= sampledDiffuseColor;
        #endif
      `);
    };
    switch (config.material) {
      case "standard":
        material = new MeshStandardMaterial(materialParams);
        break;
      case "phong":
        material = new MeshPhongMaterial(materialParams);
        break;
      default:
        material = new MeshBasicMaterial(materialParams);
    }
    iMesh = new InstancedMesh(geometry, material, COUNT);
    setColors(config.colors);
    scene.add(iMesh);
  }
  function setColors(colors) {
    if (Array.isArray(colors) && colors.length > 1) {
      const cscale = colorScale(colors);
      for (let i = 0; i < COUNT; i++) {
        iMesh.setColorAt(i, cscale.getColorAt(i / COUNT));
      }
      iMesh.instanceColor.needsUpdate = true;
    }
  }
  function initTextures(texturePosition, textureVelocity) {
    const posArray = texturePosition.image.data;
    const velArray = textureVelocity.image.data;
    for (let k = 0, kl = posArray.length; k < kl; k += 4) {
      posArray[k + 0] = rndFS(100);
      posArray[k + 1] = rndFS(100);
      posArray[k + 2] = rndFS(100);
      posArray[k + 3] = rnd(0.1, 1);
      velArray[k + 0] = rndFS(0.5);
      velArray[k + 1] = rndFS(0.5);
      velArray[k + 2] = rndFS(0.5);
      velArray[k + 3] = 0;
    }
  }
}

export { index$2 as butterfliesBackground, index as fishesBackground, index$5 as neonCursor, index$3 as noisyLinesBackground, index$4 as particlesCursor, index$1 as swarmBackground };
//# sourceMappingURL=threejs-toys.module.cdn.js.map