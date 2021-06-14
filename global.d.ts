import { THREE } from "three"
import { AFRAME } from "aframe"
import { CANNON } from "cannon"

interface VecXYZ { x: number, y: number, z: number };

declare module "cannon" {
    export interface Vec3 {
        copy(v: VecXYZ): Vec3;
    }
}

declare module "three" {
    export interface Vector3 {
        copy(v: VecXYZ): Vector3;
        sub(v: VecXYZ): Vector3;
        add(v: VecXYZ): Vector3;
    }
}

declare global {
    const THREE: THREE;
    const AFRAME: AFRAME;
    const CANNON: CANNON;

    type VRMExtension = {
        meta: Record<string, any>,
        humanoid: {
            humanBones: { bone: number, node: number }[]
        },
        firstPerson: { firstPersonBone: number, meshAnnotations: any[] },
        blendShapeMaster: { blendShapeGroups: any[], blendShapeGroups: any[] },
    };

    type InitCtx = Record<string, any>;

    interface VRMModule {
        update(timeDelta: number): void;
        dispose?(): void;
    }

    interface VRMModuleSpec {
        name: string;
        instantiate: (avatar: VRMAvatar, initCtx: InitCtx) => VRMModule;
    }
}
