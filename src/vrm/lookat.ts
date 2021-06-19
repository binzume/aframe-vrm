export class VRMLookAt implements VRMModule {
    public target: THREE.Object3D | null = null;
    public angleLimit: number = 60 * Math.PI / 180;
    private readonly _bone: THREE.Object3D;
    private readonly _identQ = new THREE.Quaternion();
    private readonly _zV = new THREE.Vector3(0, 0, -1);
    private readonly _tmpQ0 = new THREE.Quaternion();
    private readonly _tmpV0 = new THREE.Vector3();

    constructor(initCtx: InitCtx) {
        this._bone = initCtx.nodes[initCtx.vrm.firstPerson.firstPersonBone];
    }

    public update(t: number): void {
        let target = this.target;
        let bone = this._bone;
        if (target == null || bone == null) {
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
