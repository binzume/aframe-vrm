import { THREE } from "three"
import { } from "aframe"


interface VecXYZ { x: number, y: number, z: number };
interface VecXYZW { x: number, y: number, z: number, w: number };

declare module "cannon" {
    export interface Vec3 {
        copy(v: VecXYZ): Vec3;
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
}

declare global {
    const THREE: THREE;

    type VRMExtension = {
        meta: Record<string, any>,
        humanoid: {
            humanBones: { bone: number, node: number }[]
        },
        firstPerson: { firstPersonBone: number, meshAnnotations: { firstPersonFlag: string, mesh: number }[] },
        blendShapeMaster: { blendShapeGroups: { presetName: string, name: string, binds: any[] }[] },
        secondaryAnimation: { colliderGroups: any[], boneGroups: any[] },
    };


    type InitCtx = { [key: string]: any, vrm: VRMExtension, meshes: THREE.SkinnedMesh[] };

    interface VRMModule {
        update(timeDelta: number): void;
        dispose?(): void;
    }

    interface ModuleSpec {
        name: string;
        instantiate: (avatar: any, initCtx: InitCtx) => VRMModule;
    }
}
