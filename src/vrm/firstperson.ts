import { VRMAvatar } from "./avatar" // TODO: remove circular dependency

export class FirstPersonMeshUtil {
    _firstPersonBone: THREE.Bone;
    _annotatedMeshes: { flag: string, mesh: THREE.SkinnedMesh }[]
    constructor(avatar: VRMAvatar, initCtx: InitCtx) {
        this._firstPersonBone = avatar.firstPersonBone!;
        this._annotatedMeshes =
            initCtx.vrm.firstPerson.meshAnnotations.map(ma => ({ flag: ma.firstPersonFlag, mesh: initCtx.meshes[ma.mesh] }));
    }
    setFirstPerson(firstPerson: boolean) {
        this._annotatedMeshes.forEach(a => {
            if (a.flag == 'ThirdPersonOnly') {
                a.mesh.visible = !firstPerson;
            } else if (a.flag == 'FirstPersonOnly') {
                a.mesh.visible = firstPerson;
            } else if (a.flag == 'Auto' && this._firstPersonBone) {
                if (firstPerson) {
                    this._genFirstPersonMesh(a.mesh);
                } else {
                    this._resetFirstPersonMesh(a.mesh);
                }
            }
        });
    }
    _genFirstPersonMesh(mesh: THREE.SkinnedMesh) {
        mesh.children.forEach(c => this._genFirstPersonMesh(c as THREE.SkinnedMesh));
        if (!mesh.isSkinnedMesh) {
            return;
        }
        let firstPersonBones: Record<string, boolean> = {};
        this._firstPersonBone.traverse(b => {
            firstPersonBones[b.uuid] = true;
        });
        let skeletonBones = mesh.skeleton.bones;
        let skinIndex = mesh.geometry.attributes.skinIndex;
        let skinWeight = mesh.geometry.attributes.skinWeight;
        let index = mesh.geometry.index!;
        let vertexErase = [];
        let vcount = 0, fcount = 0;
        for (let i = 0; i < skinIndex.array.length; i++) {
            let b = skinIndex.array[i];
            if (skinWeight.array[i] > 0 && firstPersonBones[skeletonBones[b].uuid]) {
                if (!vertexErase[i / skinIndex.itemSize | 0]) {
                    vcount++;
                    vertexErase[i / skinIndex.itemSize | 0] = true;
                }
            }
        }
        let trinagleErase = [];
        for (let i = 0; i < index.count; i++) {
            if (vertexErase[index.array[i]] && !trinagleErase[i / 3 | 0]) {
                trinagleErase[i / 3 | 0] = true;
                fcount++;
            }
        }
        if (fcount == 0) {
            return;
        } else if (fcount * 3 == index.count) {
            mesh.visible = false;
            return;
        }
        // TODO: erase triangle.
    }
    _resetFirstPersonMesh(mesh: THREE.SkinnedMesh) {
        mesh.children.forEach(c => this._resetFirstPersonMesh(c as THREE.SkinnedMesh));
        mesh.visible = true;
    }
}
