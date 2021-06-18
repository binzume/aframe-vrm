
export class IKNode {
    position: THREE.Vector3;
    constraint: { [key: string]: any };
    userData: any;

    quaternion = new THREE.Quaternion();
    worldMatrix = new THREE.Matrix4();
    worldPosition = new THREE.Vector3();

    constructor(position: THREE.Vector3, constraint: { [key: string]: any }, userData: any) {
        this.position = position;
        this.constraint = constraint;
        this.userData = userData;
    }
}
export class IKSolver {
    iterationLimit = 50;
    thresholdSq = 0.0001;
    _iv = new THREE.Vector3(1, 1, 1);
    _tmpV0 = new THREE.Vector3();
    _tmpV1 = new THREE.Vector3();
    _tmpV2 = new THREE.Vector3();
    _tmpQ0 = new THREE.Quaternion();
    _tmpQ1 = new THREE.Quaternion();

    _updateChain(bones: IKNode[], parentMat: THREE.Matrix4) {
        for (let bone of bones) {
            bone.worldMatrix.compose(bone.position, bone.quaternion, this._iv).premultiply(parentMat);
            bone.worldPosition.setFromMatrixPosition(bone.worldMatrix);
            parentMat = bone.worldMatrix;
        }
    }
    solve(bones: IKNode[], target: THREE.Vector3, boneSpaceMat: THREE.Matrix4) {
        this._updateChain(bones, boneSpaceMat);
        let endPosition = bones[bones.length - 1].worldPosition;
        let startDistance = endPosition.distanceToSquared(target);
        let targetDir = this._tmpV2;
        let endDir = this._tmpV1;
        let rotation = this._tmpQ1;
        for (let i = 0; i < this.iterationLimit; i++) {
            if (endPosition.distanceToSquared(target) < this.thresholdSq) {
                break;
            }
            let currentTarget = this._tmpV0.copy(target);
            for (let j = bones.length - 2; j >= 0; j--) {
                let bone = bones[j];
                let endPos = bones[j + 1].position;
                bone.worldMatrix.decompose(this._tmpV1, this._tmpQ0, this._tmpV2);
                targetDir.copy(currentTarget).sub(this._tmpV1).applyQuaternion(rotation.copy(this._tmpQ0).invert()).normalize();
                endDir.copy(endPos).normalize();
                rotation.setFromUnitVectors(endDir, targetDir);
                bone.quaternion.multiply(rotation);
                let v = endDir.copy(endPos).applyQuaternion(this._tmpQ0.multiply(rotation));
                if (bone.constraint) {
                    rotation.copy(bone.quaternion).invert();
                    if (bone.constraint.apply(bone)) {
                        // TODO
                        rotation.premultiply(bone.quaternion);
                        v.copy(endPos).applyQuaternion(this._tmpQ0.multiply(rotation));
                    }
                }
                currentTarget.sub(v);
            }
            this._updateChain(bones, boneSpaceMat);
        }
        return endPosition.distanceToSquared(target) < startDistance;
    }
}
