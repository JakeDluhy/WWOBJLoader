if ( THREE.OBJLoader2.WW === undefined ) { THREE.OBJLoader2.WW = {} };

THREE.OBJLoader2.WW.WWLoader2Proxy = (function () {

	function WWOBJLoader2Proxy( params ) {
		this.init( params );
	}

	WWOBJLoader2Proxy.prototype.init = function ( webWorkerName ) {
		// check worker support first
		if ( window.Worker === undefined ) throw "This browser does not support web workers!";

		this.webWorkerName = webWorkerName;

		this.instanceNo = 0;
		this.worker = null;
		this.workerCode = null;
		this.debug = false;

		this.sceneGraphBaseNode = null;
		this.modelName = 'none';
		this.validated = false;
		this.running = false;
		this.requestTerminate = false;

		this.callbacks = {
			progress: null,
			completedLoading: null,
			errorWhileLoading: null,
			materialsLoaded: null,
			meshLoaded: null,
			director: {
				completedLoading: null,
				errorWhileLoading: null
			}
		};

		this.manager = THREE.DefaultLoadingManager;
		this.fileLoader = new THREE.FileLoader( this.manager );
		this.mtlLoader = null;

		this.dataAvailable = false;
		this.objAsArrayBuffer = null;
		this.fileObj = null;
		this.pathObj = null;

		this.fileMtl = null;
		this.mtlAsString = null;
		this.texturePath = null;

		this.materials = [];
		this.counter = 0;
	};

	WWOBJLoader2Proxy.prototype.setDebug = function ( enabled ) {
		this.debug = enabled;
	};

	WWOBJLoader2Proxy.prototype.getWebWorkerName = function () {
		return this.webWorkerName;
	};

	WWOBJLoader2Proxy.prototype.getModelName = function () {
		return this.modelName;
	};

	WWOBJLoader2Proxy.prototype.registerProgressCallback = function ( callbackProgress ) {
		if ( callbackProgress != null ) this.callbacks.progress = callbackProgress;
	};

	WWOBJLoader2Proxy.prototype.registerHookCompletedLoading = function ( callbackCompletedLoading ) {
		if ( callbackCompletedLoading != null ) this.callbacks.completedLoading = callbackCompletedLoading;
	};

	WWOBJLoader2Proxy.prototype.registerHookMaterialsLoaded = function ( callbackMaterialsLoaded ) {
		if ( callbackMaterialsLoaded != null ) this.callbacks.materialsLoaded = callbackMaterialsLoaded;
	};

	WWOBJLoader2Proxy.prototype.registerHookMeshLoaded = function ( callbackMeshLoaded ) {
		if ( callbackMeshLoaded != null ) this.callbacks.meshLoaded = callbackMeshLoaded;
	};

	WWOBJLoader2Proxy.prototype.buildWebWorkerCode = function ( existingWorkerCode ) {
		if ( existingWorkerCode != null ) this.workerCode = existingWorkerCode;
		if ( this.workerCode == null ) {

			console.time( 'buildWebWorkerCode' );
			var buildObject = function ( fullName, object ) {
				var objectString = fullName + ' = {\n';
				var part;
				for ( var name in object ) {

					part = object[ name ];
					if ( typeof( part ) === 'string' || part instanceof String ) {

						part = part.replace( '\n', '\\n' );
						part = part.replace( '\r', '\\r' );
						objectString += '\t' + name + ': "' + part + '",\n';

					} else if ( part instanceof Array ) {

						objectString += '\t' + name + ': [' + part + '],\n';

					} else if ( Number.isInteger( part ) ) {

						objectString += '\t' + name + ': ' + part + ',\n';

					} else if ( typeof part === 'function' ) {

						objectString += '\t' + name + ': ' + part + ',\n';

					}

				}
				objectString += '}\n';

				return objectString;
			};

			var buildSingelton = function ( fullName, internalName, object ) {
				var objectString = fullName + ' = (function () {\n\n';

				var constructorString = object.prototype.constructor.toString();
				constructorString = constructorString.replace( /function\s[a-z]/g, 'function ' + internalName );
				objectString += constructorString;

				var funcString;
				var objectPart;
				for ( var name in object.prototype ) {

					objectPart = object.prototype[ name ];
					if ( typeof objectPart === 'function' ) {

						funcString = objectPart.toString();
						funcString = funcString.replace( /new\s[a-z]/g, 'new ' + internalName );
						objectString += '\t' + internalName + '.prototype.' + name + ' = ' + funcString + ';\n\n';

					}

				}
				objectString += '\treturn ' + internalName + ';\n';
				objectString += '})();\n';

				return objectString;
			};

			this.workerCode = '';
			this.workerCode += '/**\n';
			this.workerCode += '  * This code was re-constructed for web worker usage\n';
			this.workerCode += '  */\n\n';
			this.workerCode += 'if ( THREE === undefined ) { var THREE = {} };\n';
			this.workerCode += 'if ( THREE.OBJLoader2 === undefined ) { THREE.OBJLoader2 = {} };\n\n';

			this.workerCode += buildObject( 'THREE.OBJLoader2.consts', THREE.OBJLoader2.consts );

			this.workerCode += buildSingelton( 'THREE.OBJLoader2.Parser', 'Parser', THREE.OBJLoader2.Parser );
			this.workerCode += buildSingelton( 'THREE.OBJLoader2.RawObject', 'RawObject', THREE.OBJLoader2.RawObject );
			this.workerCode += buildSingelton( 'THREE.OBJLoader2.RawObjectDescription', 'RawObjectDescription', THREE.OBJLoader2.RawObjectDescription );

			this.workerCode += 'if ( THREE.OBJLoader2.WW === undefined ) { THREE.OBJLoader2.WW = {} };\n\n';
			this.workerCode += buildSingelton( 'THREE.OBJLoader2.WW.WWOBJLoader', 'WWOBJLoader', wwDef );
			this.workerCode += buildSingelton( 'THREE.OBJLoader2.WW.WWMeshCreator', 'WWMeshCreator', wwMeshCreatorDef );
			this.workerCode += 'THREE.OBJLoader2.WW.WWOBJLoaderRef = new THREE.OBJLoader2.WW.WWOBJLoader();\n\n';
			this.workerCode += buildSingelton( 'THREE.OBJLoader2.WW.WWOBJLoaderRunner', 'WWOBJLoaderRunner', wwLoaderRunnerDef );
			this.workerCode += 'new THREE.OBJLoader2.WW.WWOBJLoaderRunner();\n\n';

			console.timeEnd( 'buildWebWorkerCode' );
		}

		return this.workerCode;
	};

	WWOBJLoader2Proxy.prototype.validate = function () {
		if ( this.validated ) return;
		if ( this.worker == null ) {

			this.buildWebWorkerCode();
			var blob = new Blob( [ this.workerCode ], { type: 'text/plain' } );
			this.worker = new Worker( window.URL.createObjectURL( blob ) );

			var scope = this;
			var scopeFunction = function ( e ) {
				scope.receiveWorkerMessage( e );
			};
			this.worker.addEventListener( 'message', scopeFunction, false );

		}

		this.sceneGraphBaseNode = null;
		this.modelName = 'none';
		this.validated = true;
		this.running = true;
		this.requestTerminate = false;

		this.fileLoader = ( this.fileLoader == null ) ? new THREE.FileLoader( this.manager ) : this.fileLoader;
		this.mtlLoader = ( this.mtlLoader == null ) ?  new THREE.MTLLoader() : this.mtlLoader;

		this.dataAvailable = false;
		this.fileObj = null;
		this.pathObj = null;
		this.fileMtl = null;
		this.texturePath = null;

		this.objAsArrayBuffer = null;
		this.mtlAsString = null;

		this.materials = [];
		var defaultMaterial = new THREE.MeshStandardMaterial( { color: 0xDCF1FF } );
		defaultMaterial.name = 'defaultMaterial';
		this.materials[ defaultMaterial.name ] = defaultMaterial;

		this.counter = 0;
	};

	WWOBJLoader2Proxy.prototype.prepareRun = function ( params ) {
		this.validate();
		this.dataAvailable = params.dataAvailable;
		this.modelName = params.modelName;
		console.time( 'WWOBJLoader2Proxy' );
		if ( this.dataAvailable ) {

			// fast-fail on bad type
			if ( ! ( params.objAsArrayBuffer instanceof ArrayBuffer || params.objAsArrayBuffer instanceof Uint8Array ) ) {
				throw 'Provided input is not of type arraybuffer! Aborting...';
			}

			this.worker.postMessage( {
				cmd: 'init',
				debug: this.debug
			} );

			this.objAsArrayBuffer = params.objAsArrayBuffer;
			this.mtlAsString = params.mtlAsString;

		} else {

			// fast-fail on bad type
			if ( ! ( typeof( params.fileObj ) === 'string' || params.fileObj instanceof String ) ) {
				throw 'Provided file is not properly defined! Aborting...';
			}

			this.worker.postMessage( {
				cmd: 'init',
				debug: this.debug
			} );

			this.fileObj = params.fileObj;
			this.pathObj = params.pathObj;
			this.fileMtl = params.fileMtl;

		}
		this.pathTexture = params.pathTexture;
		this.sceneGraphBaseNode = params.sceneGraphBaseNode;
	};

	WWOBJLoader2Proxy.prototype.run = function () {
		var scope = this;
		var processLoadedMaterials = function ( materialCreator ) {
			var materialCreatorMaterials = [];
			var materialNames = [];
			if ( materialCreator != null ) {

				materialCreator.preload();
				materialCreatorMaterials = materialCreator.materials;
				for ( var materialName in materialCreatorMaterials ) {

					if ( materialCreatorMaterials.hasOwnProperty( materialName ) ) {

						materialNames.push( materialName );
						scope.materials[ materialName ] = materialCreatorMaterials[ materialName ];

					}

				}

			}
			scope.worker.postMessage( {
				cmd: 'setMaterials',
				materialNames: materialNames
			} );

			if ( scope.callbacks.materialsLoaded != null ) scope.materials = scope.callbacks.materialsLoaded( scope.materials );

			if ( scope.dataAvailable && scope.objAsArrayBuffer ) {

				scope.worker.postMessage({
					cmd: 'run',
					objAsArrayBuffer: scope.objAsArrayBuffer
				}, [ scope.objAsArrayBuffer.buffer ] );

			} else {

				var refPercentComplete = 0;
				var percentComplete = 0;
				var output;
				var onLoad = function ( objAsArrayBuffer ) {

					scope.announceProgress( 'Running web worker!' );
					scope.objAsArrayBuffer = new Uint8Array( objAsArrayBuffer );
					scope.worker.postMessage( {
						cmd: 'run',
						objAsArrayBuffer: scope.objAsArrayBuffer
					}, [ scope.objAsArrayBuffer.buffer ] );

				};

				var onProgress = function ( event ) {
					if ( ! event.lengthComputable ) return;

					percentComplete = Math.round( event.loaded / event.total * 100 );
					if ( percentComplete > refPercentComplete ) {

						refPercentComplete = percentComplete;
						output = 'Download of "' + scope.fileObj + '": ' + percentComplete + '%';
						console.log( output );
						scope.announceProgress( output );

					}
				};

				var onError = function ( event ) {
					output = 'Error occurred while downloading "' + scope.fileObj + '"';
					console.error( output + ': ' + event );
					scope.announceProgress( output );
					scope.finalize( 'error' );

				};

				scope.fileLoader.setPath( scope.pathObj );
				scope.fileLoader.setResponseType( 'arraybuffer' );
				scope.fileLoader.load( scope.fileObj, onLoad, onProgress, onError );
			}
			console.timeEnd( 'Loading MTL textures' );
		};

		if ( this.dataAvailable ) {

			processLoadedMaterials( ( this.mtlAsString != null ) ? this.mtlLoader.parse( this.mtlAsString ) : null );

		} else {

			if ( this.fileMtl == null ) {

				processLoadedMaterials();

			} else {

				this.mtlLoader.setPath( this.pathTexture );
				this.mtlLoader.load( this.fileMtl, processLoadedMaterials );

			}

		}
	};

	WWOBJLoader2Proxy.prototype.receiveWorkerMessage = function ( event ) {
		var payload = event.data;

		switch ( payload.cmd ) {
			case 'objData':

				this.counter ++;
				var bufferGeometry = new THREE.BufferGeometry();

				bufferGeometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array( payload.vertices ), 3 ) );
				if ( payload.normals !== null ) {

					bufferGeometry.addAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( payload.normals ), 3 ) );

				} else {

					bufferGeometry.computeVertexNormals();

				}
				if ( payload.uvs !== null ) {

					bufferGeometry.addAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( payload.uvs ), 2 ) );

				}

				var materialDescriptions = payload.materialDescriptions;
				var materialDescription;
				var material;
				var materialName;
				var createMultiMaterial = payload.multiMaterial;
				var multiMaterials = [];

				for ( var key in materialDescriptions ) {

					materialDescription = materialDescriptions[ key ];
					material = this.materials[ materialDescription.name ];

					if ( materialDescription.default ) {

						material = this.materials[ 'defaultMaterial' ];

					} else if ( materialDescription.clone ) {

						materialName = material.name + '_flat';
						var materialClone = this.materials[ materialName ];
						if ( ! materialClone ) {

							materialClone = material.clone();
							materialClone.name = materialName;
							materialClone.shading = THREE.FlatShading;
							this.materials[ materialName ] = name;

						}

					} else if ( ! material ) {

						material = this.materials[ 'defaultMaterial' ];

					}
					if ( createMultiMaterial ) multiMaterials.push( material );

				}

				if ( createMultiMaterial ) {

					material = new THREE.MultiMaterial( multiMaterials );
					var materialGroups = payload.materialGroups;
					var materialGroup;
					for ( var key in materialGroups ) {

						materialGroup = materialGroups[ key ];
						bufferGeometry.addGroup( materialGroup.start, materialGroup.count, materialGroup.index );

					}

				}
				if ( this.callbacks.meshLoaded !== null ) {

					var materialOverride = this.callbacks.meshLoaded( payload.meshName, material );
					if ( materialOverride != null ) material = materialOverride;

				}
				var mesh = new THREE.Mesh( bufferGeometry, material );
				mesh.name = payload.meshName;
				this.sceneGraphBaseNode.add( mesh );

				var output = '(' + this.counter + '): ' + payload.meshName;
				this.announceProgress( 'Adding mesh', output );
				break;

			case 'complete':

				console.timeEnd( 'WWOBJLoader2Proxy' );
				if ( payload.msg != null ) {

					this.announceProgress( payload.msg );

				} else {

					this.announceProgress( '' );

				}

				this.finalize( 'complete' );
				break;

			case 'report_progress':
				this.announceProgress( '', payload.output );
				break;

			default:
				console.error( 'Received unknown command: ' + payload.cmd );
				break;

		}
	};

	WWOBJLoader2Proxy.prototype.finalize = function ( reason ) {
		this.running = false;
		if ( reason === 'complete' ) {

			if ( this.callbacks.completedLoading != null ) this.callbacks.completedLoading( this.webWorkerName, this.modelName, this.instanceNo, this.requestTerminate );
			if ( this.callbacks.director.completedLoading != null ) this.callbacks.director.completedLoading( this.webWorkerName, this.modelName, this.instanceNo, this.requestTerminate );

		} else if ( reason === 'error' ) {

			if ( this.callbacks.errorWhileLoading != null ) this.callbacks.errorWhileLoading( this.webWorkerName, this.modelName, this.instanceNo, this.requestTerminate );
			if ( this.callbacks.director.errorWhileLoading != null ) this.callbacks.director.errorWhileLoading( this.webWorkerName, this.modelName, this.instanceNo, this.requestTerminate );

		}
		this.validated = false;

		if ( this.requestTerminate ) {
			this.terminate();
		}
	};

	WWOBJLoader2Proxy.prototype.setRequestTerminate = function () {
		this.requestTerminate = true;
	};

	WWOBJLoader2Proxy.prototype.terminate = function () {
		if ( this.worker != null ) {

			if ( this.running ) throw 'Unable to gracefully terminate worker as it is currently running!';

			this.worker.terminate();
			this.worker = null;
			this.workerCode = null;
			this.finalize( 'terminate' );

		}
		this.fileLoader = null;
		this.mtlLoader = null;
	};

	WWOBJLoader2Proxy.prototype.announceProgress = function ( baseText, text ) {
		var output = "";
		if ( baseText !== null && baseText !== undefined ) {

			output = baseText;

		}
		if ( text !== null && text !== undefined ) {

			output = output + " " + text;

		}
		if ( this.callbacks.progress !== null ) {

			this.callbacks.progress( output );

		}
		if ( this.debug ) {

			console.log( output );

		}
	};

	WWOBJLoader2Proxy.prototype.addMaterial = function ( name, material ) {
		if ( material.name !== name ) material.name = name;
		this.materials[ name ] = material;
	};

	WWOBJLoader2Proxy.prototype.getMaterial = function ( name ) {
		var material = this.materials[ name ];
		if ( ! material ) material = null;
		return material;
	};

	var wwDef = (function () {

		function WWOBJLoader() {
			this.meshCreator = new THREE.OBJLoader2.WW.WWMeshCreator();
			this.parser = new THREE.OBJLoader2.Parser( this.meshCreator );
			this.parser.debug = false;
			this.validated = false;
			this.cmdState = 'created';

			this.debug = false;
		}

		/**
		 * Allows to set debug mode for the parser and the meshCreatorDebug
		 *
		 * @param parserDebug
		 * @param meshCreatorDebug
		 */
		WWOBJLoader.prototype.setDebug = function ( parserDebug, meshCreatorDebug ) {
			this.parser.debug = parserDebug;
			this.meshCreator.debug = meshCreatorDebug;
		};

		/**
		 * Validate status, then parse arrayBuffer, finalize and return objGroup
		 *
		 * @param arrayBuffer
		 */
		WWOBJLoader.prototype.parse = function ( arrayBuffer ) {
			console.log( 'Parsing arrayBuffer...' );
			console.time( 'parseArrayBuffer' );

			this.validate();
			this.parser.parseArrayBuffer( arrayBuffer );
			var objGroup = this.finalize();

			console.timeEnd( 'parseArrayBuffer' );

			return objGroup;
		};

		/**
		 * Check initialization status: Used for init and re-init
		 */
		WWOBJLoader.prototype.validate = function () {
			if ( this.validated ) return;

			this.parser.validate();
			this.meshCreator.validate();

			this.validated = true;
		};

		WWOBJLoader.prototype.finalize = function () {
			console.log( 'Global output object count: ' + this.meshCreator.globalObjectCount );
			this.parser.finalize();
			this.meshCreator.finalize();
			this.validated = false;
		};

		WWOBJLoader.prototype.init = function ( payload ) {
			this.cmdState = 'init';
			this.setDebug( payload.debug, payload.debug );
		};

		WWOBJLoader.prototype.setMaterials = function ( payload ) {
			this.cmdState = 'setMaterials';
			this.meshCreator.setMaterials( payload.materialNames );
		};

		WWOBJLoader.prototype.run = function ( payload ) {
			this.cmdState = 'run';

			this.parse( payload.objAsArrayBuffer );
			console.log( 'OBJ loading complete!' );

			this.cmdState = 'complete';
			self.postMessage( {
				cmd: this.cmdState,
				msg: null
			} );
		};

		return WWOBJLoader;
	})();

	var wwMeshCreatorDef = (function () {

		function WWMeshCreator() {
			this.materials = null;
			this.debug = false;
			this.globalObjectCount = 1;
			this.validated = false;
		}

		WWMeshCreator.prototype.setMaterials = function ( materials ) {
			this.materials = ( materials == null ) ? ( this.materials == null ? { materials: [] } : this.materials ) : materials;
		};

		WWMeshCreator.prototype.setDebug = function ( debug ) {
			this.debug = ( debug == null ) ? this.debug : debug;
		};

		WWMeshCreator.prototype.validate = function () {
			if ( this.validated ) return;

			this.setMaterials( null );
			this.setDebug( null );
			this.globalObjectCount = 1;
		};

		WWMeshCreator.prototype.finalize = function () {
			this.materials = null;
			this.validated = false;
		};

		/**
		 * It is ensured that rawObjectDescriptions only contain objects with vertices (no need to check)
		 * @param rawObjectDescriptions
		 * @param inputObjectCount
		 * @param absoluteVertexCount
		 * @param absoluteNormalCount
		 * @param absoluteUvCount
		 */
		WWMeshCreator.prototype.buildMesh = function ( rawObjectDescriptions, inputObjectCount, absoluteVertexCount, absoluteNormalCount, absoluteUvCount ) {
			if ( this.debug ) console.log( 'WWOBJLoader.buildRawMeshData:\nInput object no.: ' + inputObjectCount );

			var vertexFa = new Float32Array( absoluteVertexCount );
			var normalFA = ( absoluteNormalCount > 0 ) ? new Float32Array( absoluteNormalCount ) : null;
			var uvFA = ( absoluteUvCount > 0 ) ? new Float32Array( absoluteUvCount ) : null;

			var rawObjectDescription;
			var materialDescription;
			var materialDescriptions = [];

			var createMultiMaterial = ( rawObjectDescriptions.length > 1 ) ? true : false;
			var materialIndex = 0;
			var materialIndexMapping = [];
			var selectedMaterialIndex;
			var materialGroup;
			var materialGroups = [];

			var vertexBAOffset = 0;
			var vertexGroupOffset = 0;
			var vertexLength;
			var normalOffset = 0;
			var uvOffset = 0;

			for ( var oodIndex in rawObjectDescriptions ) {
				rawObjectDescription = rawObjectDescriptions[ oodIndex ];

				materialDescription = { name: rawObjectDescription.materialName, flat: false, default: false };
				if ( this.materials[ materialDescription.name ] === null ) {

					materialDescription.default = true;
					console.warn( 'object_group "' + rawObjectDescription.objectName + '_' + rawObjectDescription.groupName + '" was defined without material! Assigning "defaultMaterial".' );

				}
				// Attach '_flat' to materialName in case flat shading is needed due to smoothingGroup 0
				if ( rawObjectDescription.smoothingGroup === 0 ) materialDescription.flat = true;

				vertexLength = rawObjectDescription.vertices.length;
				if ( createMultiMaterial ) {

					// re-use material if already used before. Reduces materials array size and eliminates duplicates

					selectedMaterialIndex = materialIndexMapping[ materialDescription.name ];
					if ( ! selectedMaterialIndex ) {

						selectedMaterialIndex = materialIndex;
						materialIndexMapping[ materialDescription.name ] = materialIndex;
						materialDescriptions.push( materialDescription );
						materialIndex++;

					}
					materialGroup = {
						start: vertexGroupOffset,
						count: vertexLength / 3,
						index: selectedMaterialIndex
					};
					materialGroups.push( materialGroup );
					vertexGroupOffset += vertexLength / 3;

				} else {

					materialDescriptions.push( materialDescription );

				}

				vertexFa.set( rawObjectDescription.vertices, vertexBAOffset );
				vertexBAOffset += vertexLength;

				if ( normalFA ) {

					normalFA.set( rawObjectDescription.normals, normalOffset );
					normalOffset += rawObjectDescription.normals.length;

				}
				if ( uvFA ) {

					uvFA.set( rawObjectDescription.uvs, uvOffset );
					uvOffset += rawObjectDescription.uvs.length;

				}
				if ( this.debug ) this.printReport( rawObjectDescription, selectedMaterialIndex );

			}

			self.postMessage( {
				cmd: 'objData',
				meshName: rawObjectDescription.objectName,
				multiMaterial: createMultiMaterial,
				materialDescriptions: materialDescriptions,
				materialGroups: materialGroups,
				vertices: vertexFa,
				normals: normalFA,
				uvs: uvFA
			}, [ vertexFa.buffer ], normalFA !== null ? [ normalFA.buffer ] : null, uvFA !== null ? [ uvFA.buffer ] : null );

			this.globalObjectCount++;
		};

		return WWMeshCreator;
	})();

	var wwLoaderRunnerDef = (function () {

		function WWOBJLoaderRunner() {
			self.addEventListener( 'message', this.runner, false );
		}

		WWOBJLoaderRunner.prototype.runner = function ( event ) {
			var payload = event.data;

			console.log( 'Command state before: ' + THREE.OBJLoader2.WW.WWOBJLoaderRef.cmdState );

			switch ( payload.cmd ) {
				case 'init':

					THREE.OBJLoader2.WW.WWOBJLoaderRef.init( payload );
					break;

				case 'setMaterials':

					THREE.OBJLoader2.WW.WWOBJLoaderRef.setMaterials( payload );
					break;

				case 'run':

					THREE.OBJLoader2.WW.WWOBJLoaderRef.run( payload );
					break;

				default:

					console.error( 'WWOBJLoader: Received unknown command: ' + payload.cmd );
					break;

			}

			console.log( 'Command state after: ' + THREE.OBJLoader2.WW.WWOBJLoaderRef.cmdState );
		};

		return WWOBJLoaderRunner;
	})();

	return WWOBJLoader2Proxy;

})();
