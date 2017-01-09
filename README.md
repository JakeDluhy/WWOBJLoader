New OBJLoader prototyping for three.js
===

Welcome to the prototyping repository for OBJLoader2 a new loader for the OBJ file format that is additionally executable within a web worker.

## Repository structure
The directory structure is organized as follows:
- **src**: Contains sources: Loader and test application support code
- **test**: Contains Tests/HTML Examples
- **resource**: Contains OBJs, MTLs and textures
- **examples**: Redirect instructions (backward compatibility)

External libraries (three.js, dat.gui and jszip) are initialized with npm. Therefore, **npm** installation is required.
Before you can start to play around after checkout please run:<br>
`npm update`

You require gulp to be able to build the bundles. If you have not yet installed the cli, execute this:<br>
`npm install --global gulp-cli`

From the project's root run `gulp` to create the bundles in the **build** directory:
- **OBJLoader2[.min].js**: Contains all code required for the loader to work
- **WWOBJLoader2[.min].js**: Consists of web worker, web worker proxy and director code

## Implementation Overview
In contrast to the existing [OBJLoader](https://github.com/mrdoob/three.js/blob/dev/examples/js/loaders/OBJLoader.js) the new `OBJLoader2` consists of three pieces:
- `OBJLoader2Control`: Is the class to interact with for setting up, for loading data from a given file or for directly forwarding data to the parser
- `OBJLoader2Parser`: Is invoked by `OBJLoader2Control` or `WWOBJLoader2` to parse the data and transform it into a "raw" representation
- `OBJLoader2MeshCreator`: Builds meshes from the "raw" representation that can be incorporared into the scenegraph.

##### What is the reason for separation?
The loader should be easily usable within a web worker. But each web worker has its own scope which means any imported code needs to be re-loaded and some things cannot be accessed (e.g. DOM). The aim is to be able to enwrap the parser with two different **cloaks**:
1. Standard direct usage
2. Embedded within a web worker

As `OBJLoader2Parser` is independent of any other code piece of [three.js](https://threejs.org) or any other library, the surrounding code either needs to directly do the required three.js integration (`OBJLoader2Control` and `OBJLoader2MeshCreator`) or `WWOBJLoader2` and the communication and data proxy (`WWOBJLoader2Proxy`) ensure it. `WWOBJLoader2Proxy` basically provides the same functionality as `OBJLoader2Control` and `OBJLoader2MeshCreator`, but the work is done by the web worker.

`WWOBJLoader2Proxy` could be seen as a template for other proxies of yet non-existingr web worker based loaders.

##### Directing the symphony
`WWLoaderDirector` is introduced to ease usage of multiple `WWOBJLoader2Proxy`. It is able to create a configurable amount of loader proxies via reflection just by providing parameters. An instruction queue is fed and all workers created will work to deplete it once they have been started. The usage of `WWLoaderDirector` is not required.

##### Parser POIs
The parser and mesh creation functions have reached full feature parity with the existing OBJ loader. These are some interesting POIs:
- Per default `OBJLoader2Control` parse method requires arraybuffer as input. A fallback method for parsing text directly still exists, but it is approx. 15-20 pecent slower
- Face N-Gons are not supported identically to the old parser
- Direct re-usage of all involved classes is fully supported. I took care in resource clean-up and re-validation of status on all involved objects
- "o name" (object), "g name" (group) and new vertex definition without any other declaration lead to new object creation
- Multi-Materials are created when needed
- Flat smoothing defined by "s 0" or "s off" is supported and Multi-Material is created when one object/group defines both smoothing groups equal and not equal to zero.

##### Bundle Details
The web worker code is contained in `WWOBJLoader2.js`. At worker init a string is built from code within the bundle that contains all code of `OBJLoader2Parser` and `WWOBJLoader2` for the worker to run. The string is put to a blob that is used to create the worker. This reliefs the user of the bundle to care about path issues and static imports within the worker are no longer required

##### Improvements
- Objects are streamed to the scene when `WWOBJLoader2Proxy` is used. Add-only-when-fully-loaded should be added
- Test automation with focus on batch execution of tests for retrival of more robust performance numbers
- Improve documentation further

## Examples:
[Web Worker OBJ Parallels Demo](https://kaisalmen.de/proto/test/webgl_loader_ww_parallels.min.html)<br>
[WWOBJLoader](http://kaisalmen.de/proto/test/webgl_loader_wwobjloader2.min.html)<br>
[OBJLoader2](http://kaisalmen.de/proto/test/webgl_loader_objloader2.min.html)<br>
[Original OBJLoader](http://kaisalmen.de/proto/test/three.js.old/webgl_loader_objloader_direct.html)<br>
<br>
Larger models not in the prototype repository:<br>
[Compressed PTV1 Model](http://kaisalmen.de/proto/resource/obj/PTV1/PTV1.zip) (150MB)<br>
Models by Cornelius Dämmrich [zomax.net](https://zomax.net/free-stuff/):
[Compressed Sink Model](http://kaisalmen.de/proto/resource/obj/zomax/zomax-net_haze-sink-scene.zip) (178MB)<br>
[Compressed Oven Model](http://kaisalmen.de/proto/resource/obj/zomax/zomax-net_haze-oven-scene.zip) (150MB)<br>
<br>
#### Originally defined Objectives (2016-09-29)

##### Objectives for new OBJLoader:
- Support different input types for parsing:
 - string
 - arraybuffer
- Low memory usage:
 - Process file content serially and per line
 - Minimize internal data-structure/object usage
- Support inline-processing:
 - Add mesh and material to scene when it becomes available
 - Only intermediate data of current input mesh shall be kept in memory
- Provide hooks for web worker extension
 - Mesh creation shall be isolated within a function
 - Material creation shall be isolated within a function

##### Objectives for web worker wrapper/worker controller:
- Establish lifecycle:
 - init (controller feeds worker)
 - send material information (bi-directional)
 - parse (pass-back buffers)
- Use transferables wherever possible:
 - Construct BufferGeometry on main thread (worker controller)
 - Texture loading must be done on main thread (worker controller). As I understand it the TextureLoader needs document access and web workers are unable to.
- Keep the worker as generic as possible:
 - Already now the WWOBJLoader is not very OBJLoader specific
 - Porting the web worker to other loaders should be straightforward if mesh and material hooks are in loader
- Think about worker management:
 - worker pool (construction cost, device limitations, etc.)


Kai
