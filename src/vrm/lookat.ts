import { VRMAvatar } from "./avatar" // TODO: remove circular dependency

export class VRMLookAt {
    target: THREE.Bone | null = null;
    angleLimit: number = 60 * Math.PI / 180;
    _avatar: VRMAvatar;
    _identQ = new THREE.Quaternion();
    _zV = new THREE.Vector3(0, 0, -1);
    _tmpQ0 = new THREE.Quaternion();
    _tmpV0 = new THREE.Vector3();

    constructor(avatar: VRMAvatar, initCtx: InitCtx) {
        this._avatar = avatar;
    }
    update(t: number) {
        let target = this.target;
        if (target == null) {
            return;
        }
        let bone = this._avatar.firstPersonBone;
        if (bone == null) {
            return;
        }
        let targetDirection = bone.worldToLocal(this._tmpV0.setFromMatrixPosition(target.matrixWorld)).normalize();
        let rot = this._tmpQ0.setFromUnitVectors(this._zV, targetDirection);
        let boneLimit = this.angleLimit;
        let speedFactor = 0.08;
        let angle = 2 * Math.acos(rot.w);
        if (angle > boneLimit * 1.5) {
            rot = this._identQ;
            speedFactor = 0.04;
        } else if (angle > boneLimit) {
            rot.setFromAxisAngle(this._tmpV0.set(rot.x, rot.y, rot.z).normalize(), boneLimit);
        }
        bone.quaternion.slerp(rot, speedFactor);
    }
}
