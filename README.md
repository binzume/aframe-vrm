# VRM Components for A-Frame

[A-Frame](https://aframe.io/) で [VRM](https://vrm.dev/) のモデルを動かすコンポーネントです.

## Features

- Animation
- BlendShape (Morph)
- Physics (using CANNON.js)

## Demo

- [Live DEMO](https://binzume.github.io/aframe-vrm/demo/)
- [Live DEMO(Physics)](https://binzume.github.io/aframe-vrm/demo/physics.html) (using [aframe-physics-system](https://github.com/n5ro/aframe-physics-system))
- VRM/GLB,BVH/VMDファイルをブラウザにドラッグ＆ドロップするとプレビューできます(アップロードはされません)
- WebVRはOculus Questでテストしています

![AliciaSolid](./demo/alicia1.gif)

## Usage

```html
<html>
<head>
  <script src="https://cdn.jsdelivr.net/gh/aframevr/aframe@v1.0.4/dist/aframe-master.min.js"></script>
  <script src="https://binzume.github.io/aframe-vrm/dist/aframe-vrm.js"></script>
</head>
<body style="background-color: black; color:white;">
  <a-scene>
    <a-entity vrm="src:assets/AliciaSolid/AliciaSolid.vrm;blink:true" vrm-anim="" rotation="0 180 0"></a-entity>
    <a-camera position="0 1.6 2"></a-camera>
  </a-scene>
</body>
</html>
```

npm: [@binzume/aframe-vrm](https://www.npmjs.com/package/@binzume/aframe-vrm)

## Components

- vrm: Load vrm model
- vrm-bvh: Play BVH/VMD animation
- vrm-poser: pose editor for VR
- vrm-skeleton: display skeleton
- vrm-mimic: TODO

### vrm

Attributes:

| name          | type     | default | desc |
| ------------- | -------- | ------- | ---- |
| src           | string   | None    | VRM model URL |
| blink         | boolean  | false   | Auto blink |
| blinkInterval | number   | 5       | Auto blink interval |
| lookAt        | selector | None    | look at target element |
| firstPerson   | boolean  | false   | Hide head meshes |

Properties:

avatar : VRMAvatar

Events:

| name         | event.detail | desc |
| ------------ | ------------ | ---- |
| model-loaded | {format:'vrm', model: Object3D, avatar: VRMAvatar} | Loaded event |
| model-error  | {format:'vrm', src: URL, cause: object} | Error event |

Compatible with gltf-model component: https://aframe.io/docs/1.0.0/components/gltf-model.html

### vrm-poser

Pose editor.

Attributes:

| name              | type    | default | desc        |
| ----------------- | ------- | ------- | ----------- |
| color             | color   | green   | box color   |
| enableConstraints | boolean | true    | Enable bone constraints |

### vrm-anim

Play bvh/vmd animation.

Attributes:

| name        | type     | default | desc |
| ----------- | -------- | ------- | ---- |
| src         | string   | ''      | BVH file url |
| format      | string   | ''      | `vmd` or `bvh` (default: auto detect) |
| convertBone | boolean  | true    | Convert bone name |

srcを空にすると待機アニメーションが再生されます(テスト用)．

## Building aframe-vrm

```sh
cd aframe-vrm
npm install
npm run lint
npm run build
```

### VRMAvatar API

See: [avatar.ts](src/vrm/avatar.ts)

```js
import {VRMLoader} from "./dist/aframe-vrm.module.js"

const scene = new THREE.Scene();
const avatar = await new VRMLoader().load("test.vrm");
scene.add(avatar.model);
```

Property:

- VRMAvatar.model : THREE.Object3D
- VRMAvatar.mixer : THREE.AnimationMixer
- VRMAvatar.lookAtTarget : THREE.Object3D
- VRMAvatar.bones : VRM bones
- VRMAvatar.blendShapes : blend shapes
- VRMAvatar.meta : VRM meta data

Methods:

- VRMAvatar.update(timeDelta)
- VRMAvatar.dispose() : Dispose VRM avatar.

- VRMAvatar.setBlendShapeWeight(name, value) : Set blend shape weight for name.
- VRMAvatar.getBlendShapeWeight(name) : Returns blend shape values.
- VRMAvatar.resetBlendShape() : Reset all blend shapes.
- VRMAvatar.resetPose() : T-Pose
- VRMAvatar.startBlink(intervalSec)
- VRMAvatar.stopBlink()
- VRMAvatar.setFirstPerson(firstPerson)

- VRMAvatar.modules.physics.attach(world : CANNON.World) : Start physics.
- VRMAvatar.modules.physics.detach() : Stop physics.

# TODO

- Use https://github.com/pixiv/three-vrm

# License

MIT License
