import "three"
import "cannon"
import { } from "aframe"


interface VecXYZ { x: number, y: number, z: number }
interface VecXYZW { x: number, y: number, z: number, w: number }

declare module "cannon" {
    export interface Vec3 {
        copy(v: VecXYZ): Vec3;
        length(): number;
    }
    export interface Quaternion {
        copy(v: VecXYZW): Quaternion;
    }
}

declare module "three" {
    export interface Vector3 {
        copy(v: VecXYZ): Vector3;
        sub(v: VecXYZ): Vector3;
        add(v: VecXYZ): Vector3;
    }
    export interface Quaternion {
        copy(v: VecXYZW): Quaternion;
    }
    // export { GLTFLoader }
}

declare global {
    const THREE: typeof THREE;

    type VRMExtension = {
        meta: Record<string, any>,
        humanoid: {
            humanBones: { bone: number, node: number }[]
        },
        firstPerson: { firstPersonBone: number, meshAnnotations: { firstPersonFlag: string, mesh: number }[] },
        blendShapeMaster: { blendShapeGroups: { presetName: string, name: string, binds: any[] }[] },
        secondaryAnimation: { colliderGroups: any[], boneGroups: any[] },
    };

    type InitCtx = { [key: string]: any, vrm: VRMExtension, meshes: THREE.SkinnedMesh[], nodes: THREE.Object3D[] };

    interface VRMModule {
        update(timeDelta: number): void;
        dispose?(): void;
    }

    interface ModuleSpec {
        name: string;
        instantiate: (avatar: import('./vrm/avatar').VRMAvatar, initCtx: InitCtx) => VRMModule;
    }
}
