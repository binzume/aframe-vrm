import { VRMLookAt } from "./lookat"
import { VRMBlendShapeUtil } from "./blendshape"
import { FirstPersonMeshUtil } from "./firstperson"

export class VRMAvatar {
    model: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    bones: Record<string, THREE.Bone> = {};
    blendShapes: Record<string, { name: string, binds: Record<string, any>[] }> = {};
    modules: Record<string, VRMModule> = {};
    meta: Record<string, any> = {};
    isVRM: boolean;
    animations: THREE.AnimationClip[];
    firstPersonBone: THREE.Bone | null = null;

    _firstPersonMeshUtil: FirstPersonMeshUtil | null = null;
    _blendShapeUtil: VRMBlendShapeUtil;

    boneConstraints = {
        'head': { type: 'ball', limit: 60 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 60 * Math.PI / 180 },
        'neck': { type: 'ball', limit: 30 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 10 * Math.PI / 180 },
        'leftUpperLeg': { type: 'ball', limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
        'rightUpperLeg': { type: 'ball', limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
        'leftLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 },
        'rightLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 }
    };

    constructor(gltf: Record<string, any>) {
        this.model = gltf.scene;
        this.mixer = new THREE.AnimationMixer(this.model);
        this.isVRM = (gltf.userData.gltfExtensions || {}).VRM != null;
        this.animations = gltf.animations || [];
        this._blendShapeUtil = new VRMBlendShapeUtil(this);
    }

    static async load(url: string, moduleSpecs: ModuleSpec[] = []) {
        return new Promise((resolve, reject) => {
            // @ts-ignore
            new THREE.GLTFLoader(THREE.DefaultLoadingManager).load(url, async (gltf) => {
                resolve(await new VRMAvatar(gltf).init(gltf, moduleSpecs));
            }, undefined, reject);
        });
    }

    async init(gltf: Record<string, any>, moduleSpecs: ModuleSpec[]) {
        if (!this.isVRM) {
            // animation test
            if (this.animations.length > 0) {
                let aa = this.mixer.clipAction(this.animations[0]).setLoop(THREE.LoopOnce, 1).play();
                aa.clampWhenFinished = true;
            }
            return this;
        }
        let vrmExt = gltf.userData.gltfExtensions.VRM as VRMExtension;
        let bones = this.bones;
        let nodes = await gltf.parser.getDependencies('node');
        let meshes = await gltf.parser.getDependencies('mesh');
        let initCtx = { nodes: nodes, meshes: meshes, vrm: vrmExt, gltf: gltf };

        this.meta = vrmExt.meta;
        Object.values(vrmExt.humanoid.humanBones).forEach((humanBone) => {
            bones[humanBone.bone] = nodes[humanBone.node];
        });
        if (vrmExt.firstPerson && vrmExt.firstPerson.firstPersonBone) {
            this.firstPersonBone = nodes[vrmExt.firstPerson.firstPersonBone];
            this.modules.lookat = new VRMLookAt(this, initCtx);
        }
        if (vrmExt.firstPerson && vrmExt.firstPerson.meshAnnotations) {
            this._firstPersonMeshUtil = new FirstPersonMeshUtil(this, initCtx);
        }
        // @ts-ignore
        this.model.skeleton = new THREE.Skeleton(Object.values(bones));
        this._fixBoundingBox();
        if (vrmExt.blendShapeMaster) {
            this._initBlendShapes(initCtx);
        }

        for (let spec of moduleSpecs) {
            let mod = spec.instantiate(this, initCtx);
            if (mod) {
                this.modules[spec.name] = mod;
            }
        }
        return this;
    }
    _initBlendShapes(ctx: InitCtx) {
        this.blendShapes = (ctx.vrm.blendShapeMaster.blendShapeGroups || []).reduce((blendShapes: Record<string, any>, bg) => {
            let binds = bg.binds.flatMap(bind => {
                let meshObj = ctx.meshes[bind.mesh];
                return (meshObj.isSkinnedMesh ? [meshObj] : meshObj.children.filter(obj => (<THREE.SkinnedMesh>obj).isSkinnedMesh))
                    .map(obj => ({ target: obj, index: bind.index, weight: bind.weight / 100 }));
            });
            blendShapes[(bg.presetName || bg.name).toUpperCase()] = { name: bg.name, binds: binds };
            return blendShapes;
        }, {});
    }
    _fixBoundingBox() {
        let bones = this.bones;
        if (!bones.hips) {
            return;
        }
        // Extends bounding box.
        let tmpV = new THREE.Vector3();
        let center = bones.hips.getWorldPosition(tmpV).clone();
        this.model.traverse((obj) => {
            let mesh = <THREE.SkinnedMesh>obj;
            if (mesh.isSkinnedMesh) {
                let pos = mesh.getWorldPosition(tmpV).sub(center).multiplyScalar(-1);
                let r = (pos.clone().sub(mesh.geometry.boundingSphere!.center).length() + mesh.geometry.boundingSphere!.radius);
                mesh.geometry.boundingSphere!.center.copy(pos);
                mesh.geometry.boundingSphere!.radius = r;
                mesh.geometry.boundingBox!.min.set(pos.x - r, pos.y - r, pos.z - r);
                mesh.geometry.boundingBox!.max.set(pos.x + r, pos.y + r, pos.z + r);
            }
        });
    }
    tick(timeDelta: number) {
        this.mixer.update(timeDelta);
        for (let m of Object.values(this.modules)) {
            m.update(timeDelta);
        }
    }
    setModule(name: string, module: VRMModule) {
        this.removeModule(name);
        this.modules[name] = module;
    }
    removeModule(name: string) {
        let module = this.modules[name];
        module && module.dispose && module.dispose();
        delete this.modules[name];
    }
    dispose() {
        for (let m of Object.keys(this.modules)) {
            this.removeModule(m);
        }
        this.model.traverse((obj) => {
            let mesh = obj as THREE.Mesh;
            if (mesh.isMesh) {
                mesh.geometry.dispose();
                (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
            }
            // @ts-ignore
            obj.skeleton && obj.skeleton.dispose();
        });
    }

    // Util functions.
    get lookAtTarget() {
        let lookat = this.modules.lookat as VRMLookAt | null;
        return lookat ? lookat.target : null;
    }
    set lookAtTarget(v) {
        let lookat = this.modules.lookat as VRMLookAt | null;
        if (lookat) {
            lookat.target = v;
        }
    }
    setBlendShapeWeight(name: string, value: number) {
        this._blendShapeUtil.setBlendShapeWeight(name, value);
    }
    getBlendShapeWeight(name: string) {
        return this._blendShapeUtil.getBlendShapeWeight(name);
    }
    resetBlendShape() {
        this._blendShapeUtil.resetBlendShape();
    }
    startBlink(blinkInterval: number) {
        this._blendShapeUtil.startBlink(blinkInterval);
    }
    stopBlink() {
        this._blendShapeUtil.stopBlink();
    }
    getPose(exportMorph: boolean) {
        let poseData: { bones: any[], blendShape?: any[] } = {
            bones: Object.keys(this.bones).map((name) =>
                ({ name: name, q: this.bones[name].quaternion.toArray() })
            )
        }
        if (exportMorph) {
            poseData.blendShape = Object.keys(this.blendShapes).map((name) =>
                ({ name: name, value: this.getBlendShapeWeight(name) })
            );
        }
        return poseData
    }
    setPose(pose: { bones: any[], blendShape: any[] }) {
        if (pose.bones) {
            for (let boneParam of pose.bones) {
                if (this.bones[boneParam.name]) {
                    this.bones[boneParam.name].quaternion.fromArray(boneParam.q);
                }
            }
        }
        if (pose.blendShape) {
            for (let morph of pose.blendShape) {
                this.setBlendShapeWeight(morph.name, morph.value)
            }
        }
    }
    restPose() {
        for (let b of Object.values(this.bones)) {
            b.quaternion.set(0, 0, 0, 1);
        }
    }
    setFirstPerson(firstPerson: boolean) {
        if (this._firstPersonMeshUtil) {
            this._firstPersonMeshUtil.setFirstPerson(firstPerson);
        }
    }
}
