import { VRMLookAt } from "./lookat"
import { VRMBlendShapeUtil } from "./blendshape"
import { FirstPersonMeshUtil } from "./firstperson"
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader" // type only

export type PoseData = { bones: any[], blendShape?: any[] }
export class VRMLoader {
    private readonly gltfLoader: GLTFLoader;
    constructor(gltfLoader?: any) {
        // @ts-ignore
        this.gltfLoader = gltfLoader || new THREE.GLTFLoader(THREE.DefaultLoadingManager);
    }
    public async load(url: string, moduleSpecs: ModuleSpec[] = []): Promise<VRMAvatar> {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(url, async (gltf) => {
                resolve(await new VRMAvatar(gltf).init(gltf, moduleSpecs));
            }, undefined, reject);
        });
    }
}

export class VRMAvatar {
    public readonly model: THREE.Object3D & { skeleton?: THREE.Skeleton };
    public readonly mixer: THREE.AnimationMixer;
    public readonly bones: Record<string, THREE.Bone> = {};
    public blendShapes: Record<string, { name: string, binds: Record<string, any>[] }> = {};
    public readonly modules: Record<string, VRMModule> = {};
    public meta: Record<string, any> = {};
    public readonly isVRM: boolean;
    public readonly animations: THREE.AnimationClip[];
    public firstPersonBone: THREE.Bone | null = null;

    private _firstPersonMeshUtil: FirstPersonMeshUtil | null = null;
    private _blendShapeUtil: VRMBlendShapeUtil;

    // TODO: move to another component.
    public boneConstraints = {
        'head': { type: 'ball', limit: 60 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 60 * Math.PI / 180 },
        'neck': { type: 'ball', limit: 30 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 10 * Math.PI / 180 },
        'leftUpperLeg': { type: 'ball', limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
        'rightUpperLeg': { type: 'ball', limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
        'leftLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 },
        'rightLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 }
    };

    constructor(gltf: GLTF) {
        this.model = gltf.scene;
        this.mixer = new THREE.AnimationMixer(this.model);
        this.isVRM = (gltf.userData.gltfExtensions || {}).VRM != null;
        this.animations = gltf.animations || [];
        this._blendShapeUtil = new VRMBlendShapeUtil(this);
    }

    public async init(gltf: GLTF, moduleSpecs: ModuleSpec[]) {
        if (!this.isVRM) {
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
        if (vrmExt.firstPerson) {
            if (vrmExt.firstPerson.firstPersonBone) {
                this.firstPersonBone = nodes[vrmExt.firstPerson.firstPersonBone];
                this.modules.lookat = new VRMLookAt(initCtx);
            }
            if (vrmExt.firstPerson.meshAnnotations) {
                this._firstPersonMeshUtil = new FirstPersonMeshUtil(initCtx);
            }
        }
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
    private _initBlendShapes(ctx: InitCtx): void {
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
    private _fixBoundingBox(): void {
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
    public update(timeDelta: number): void {
        this.mixer.update(timeDelta);
        for (let m of Object.values(this.modules)) {
            m.update(timeDelta);
        }
    }
    public setModule(name: string, module: VRMModule): void {
        this.removeModule(name);
        this.modules[name] = module;
    }
    public removeModule(name: string): void {
        let module = this.modules[name];
        module && module.dispose && module.dispose();
        delete this.modules[name];
    }
    public dispose(): void {
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
    get lookAtTarget(): THREE.Object3D | null {
        let lookat = this.modules.lookat as VRMLookAt | null;
        return lookat ? lookat.target : null;
    }
    set lookAtTarget(v: THREE.Object3D) {
        let lookat = this.modules.lookat as VRMLookAt | null;
        if (lookat) {
            lookat.target = v;
        }
    }
    public setBlendShapeWeight(name: string, value: number): void {
        this._blendShapeUtil.setBlendShapeWeight(name, value);
    }
    public getBlendShapeWeight(name: string): number {
        return this._blendShapeUtil.getBlendShapeWeight(name);
    }
    public resetBlendShape(): void {
        this._blendShapeUtil.resetBlendShape();
    }
    public startBlink(blinkInterval: number): void {
        this._blendShapeUtil.startBlink(blinkInterval);
    }
    public stopBlink(): void {
        this._blendShapeUtil.stopBlink();
    }
    public getPose(exportMorph: boolean): PoseData {
        let poseData: PoseData = {
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
    public setPose(pose: PoseData): void {
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
    public restPose(): void {
        for (let b of Object.values(this.bones)) {
            b.quaternion.set(0, 0, 0, 1);
        }
    }
    public setFirstPerson(firstPerson: boolean): void {
        if (this._firstPersonMeshUtil) {
            this._firstPersonMeshUtil.setFirstPerson(firstPerson);
        }
    }
}
