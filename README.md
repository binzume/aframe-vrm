# [WIP] VRM Components for WebVR

[A-Frame](https://aframe.io/) で [VRM](https://vrm.dev/) のモデルを動かすコンポーネントです.

アニメーションとかブレンドシェイプ(Morph)が簡単に使えます．

## Demo

- https://binzume.github.io/aframe-vrm/demo/
- VRM/BVHファイルをブラウザにドラッグ＆ドロップするとプレビューできます(アップロードはされません)
- WebVRはOculus Questでテストしています

![AliciaSolid](./demo/alicia1.gif)

## Usage

```html
<html>
<head>
  <script src="https://cdn.jsdelivr.net/gh/aframevr/aframe@v1.0.4/dist/aframe-master.min.js"></script>
  <script src="https://binzume.github.io/aframe-vrm/vrm.js"></script>
</head>
<body style="background-color: black; color:white;">
  <a-scene>
    <a-entity vrm="src:assets/AliciaSolid/AliciaSolid.vrm;blink:true" vrm-bvh="" rotation="0 180 0"></a-entity>
    <a-camera position="0 1.6 2"></a-camera>
  </a-scene>
</body>
</html>
```

## Components

- vrm: Load vrm model
- vrm-bvh: Play BVH animation
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

### vrm-bvh

Play bvh animation.

Attributes:

| name        | type     | default | desc |
| ----------- | -------- | ------- | ---- |
| src         | URL      | None    | BVH file url |
| convertBone | boolean  | true    | Convert bone name |

srcを空にするとアイドルアニメーションが再生されます(テスト用)．

### VRMAvatar

See: [vrm.js](vrm.js)

Property:

- VRMAvatar.model : THREE.Object3D
- VRMAvatar.mixer : AnimationMixer
- VRMAvatar.bones : VRM bones
- VRMAvatar.blendShapes : blend shapes

Methods:

- VRMAvatar.init(gltf) : initialize(async)
- VRMAvatar.setBlendShapeWeight(name, value) : Set blend shape weight for name.
- VRMAvatar.getBlendShapeWeight(name) : Returns blend shape values.
- VRMAvatar.resetBlendShape() : Reset all blend shapes.
- VRMAvatar.startBlink(intervalSec)
- VRMAvatar.stopBlink()
- VRMAvatar.setFirstPerson(firstPerson)
- VRMAvatar.tick(timeDelta)
- VRMAvatar.destroy()

# TODO

- https://github.com/pixiv/three-vrm を使う．

# License

MIT License
