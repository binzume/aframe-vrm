// @ts-nocheck
import { VRMAvatar, VRMLoader } from "./vrm/avatar";
import { VRMPhysicsCannonJS } from "./utils/physics-cannon";
import { IKNode, IKSolver } from "./utils/simpleik";
import { VMDLoaderWrapper } from "./utils/vmd";
import { BVHLoaderWrapper } from "./utils/bvh";

AFRAME.registerComponent('vrm', {
    schema: {
        src: { default: '' },
        firstPerson: { default: false },
        blink: { default: true },
        blinkInterval: { default: 5 },
        lookAt: { type: 'selector' },
        enablePhysics: { default: false },
    },
    init() {
        this.avatar = null;
    },
    update(oldData) {
        if (this.data.src !== oldData.src) {
            this.remove();
            this._loadAvatar();
        }
        this._updateAvatar();
    },
    tick(time, timeDelta) {
        if (!this.avatar) {
            this.pause();
            return;
        }
        this.avatar.update(timeDelta / 1000);
    },
    remove() {
        if (this.avatar) {
            this.el.removeObject3D('avatar');
            this.avatar.dispose();
        }
    },
    async _loadAvatar() {
        let el = this.el;
        let url = this.data.src;
        if (!url) {
            return;
        }
        try {
            let moduleSpecs = [];
            if (globalThis.CANNON) {
                moduleSpecs.push({ name: 'physics', instantiate: (a, ctx) => new VRMPhysicsCannonJS(ctx) });
            }
            let avatar = await new VRMLoader().load(url, moduleSpecs);
            if (url != this.data.src) {
                avatar.dispose();
                return;
            }
            this.avatar = avatar;
            el.setObject3D('avatar', avatar.model);
            this._updateAvatar();
            this.play();
            el.emit('model-loaded', { format: 'vrm', model: avatar.model, avatar: avatar }, false);
        } catch (e) {
            el.emit('model-error', { format: 'vrm', src: url, cause: e }, false);
        }
    },
    _updateAvatar() {
        if (!this.avatar) {
            return;
        }
        let data = this.data;
        this.avatar.setFirstPerson(data.firstPerson);
        if (data.lookAt) {
            if (data.lookAt.tagName == 'A-CAMERA') {
                this.avatar.lookAtTarget = this.el.sceneEl.camera;
            } else {
                this.avatar.lookAtTarget = data.lookAt.object3D;
            }
        } else {
            this.avatar.lookAtTarget = null;
        }
        if (data.blink) {
            this.avatar.startBlink(data.blinkInterval);
        } else {
            this.avatar.stopBlink();
        }
        /** @type {VRMPhysicsCannonJS} */
        let physics = this.avatar.modules.physics;
        if (physics) {
            if (data.enablePhysics && physics.world == null) {
                let engine = this.el.sceneEl.systems.physics;
                // @ts-ignore
                physics.attach(engine && engine.driver && engine.driver.world);
            }
            physics.enable = data.enablePhysics;
        }
    }
});

AFRAME.registerComponent('vrm-anim', {
    schema: {
        src: { default: '' },
        format: { default: '' },
        loop: { default: true },
        enableIK: { default: true },
        convertBone: { default: true },
    },
    init() {
        /** @type {VRMAvatar} */
        this.avatar = null;
        if (this.el.components.vrm && this.el.components.vrm.avatar) {
            this.avatar = this.el.components.vrm.avatar;
        }
        this.onVrmLoaded = (ev) => {
            this.avatar = ev.detail.avatar;
            if (this.data.src != '') {
                this._loadClip(this.data.src);
            } else if (this.avatar.animations.length > 0) {
                this.playClip(this.avatar.animations[0]);
            } else {
                this.playTestMotion();
            }
        };
        this.el.addEventListener('model-loaded', this.onVrmLoaded);
    },
    update(oldData) {
        if (oldData.src != this.data.src && this.avatar) {
            this._loadClip(this.data.src);
        }
    },
    /**
     * 
     * @param {string} url 
     * @returns 
     */
    async _loadClip(url) {
        this.stopAnimation();
        this.avatar.restPose();
        if (url === '') {
            return;
        }
        let loop = this.data.loop ? THREE.LoopRepeat : THREE.LoopOnce;
        let format = this.data.format || (url.toLowerCase().endsWith('.bvh') ? 'bvh' : '');
        let loader = format == 'bvh' ? new BVHLoaderWrapper() : new VMDLoaderWrapper()
        let clip = await loader.load(url, this.avatar, this.data);
        if (!this.avatar) {
            return;
        }
        this.playClip(clip);
    },
    stopAnimation() {
        if (this.animation) {
            this.animation.stop();
            this.avatar.mixer.uncacheClip(this.clip);
            this.avatar.removeModule('MMDIK');
            this.animation = null;
        }
    },
    playTestMotion() {
        let q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180));
        let tracks = {
            leftUpperArm: {
                keys: [
                    { rot: q(0, 0, 65), time: 0 },
                    { rot: q(0, 0, 63), time: 1 },
                    { rot: q(0, 0, 65), time: 2 },
                ]
            },
            rightUpperArm: {
                keys: [
                    { rot: q(0, 0, -65), time: 0 },
                    { rot: q(0, 0, -60), time: 1 },
                    { rot: q(0, 0, -65), time: 2 },
                ]
            },
            spine: {
                keys: [
                    { rot: q(0, 2, 0), time: 0 },
                    { rot: q(2, 0, -2), time: 1 },
                    { rot: q(2, -2, 0), time: 2 },
                    { rot: q(0, 0, 2), time: 3 },
                    { rot: q(0, 2, 0), time: 4 },
                ]
            }
        };
        let clip = THREE.AnimationClip.parseAnimation(
            {
                name: 'testAnimation',
                hierarchy: Object.values(tracks),
            },
            Object.keys(tracks).map(k => this.avatar.bones[k] || { name: k })
        );
        this.playClip(clip);
    },
    playClip(clip) {
        let loop = this.data.loop ? THREE.LoopRepeat : THREE.LoopOnce;
        this.stopAnimation();
        this.clip = clip;
        this.avatar.mixer.setTime(0);
        this.animation = this.avatar.mixer.clipAction(clip).setLoop(loop).setEffectiveWeight(1.0).play();
        this.animation.clampWhenFinished = true;
    },
    remove() {
        this.el.removeEventListener('model-loaded', this.onVrmLoaded);
        this.stopAnimation();
        this.avatar = null;
    }
});

AFRAME.registerComponent('vrm-skeleton', {
    schema: {
        physicsOffset: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
    },
    init() {
        this.physicsBodies = [];
        this.sceneObj = this.el.sceneEl.object3D;
        if (this.el.components.vrm && this.el.components.vrm.avatar) {
            this._onAvatarUpdated(this.el.components.vrm.avatar);
        }
        this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar);
        this.el.addEventListener('model-loaded', this.onVrmLoaded);
    },
    _onAvatarUpdated(avatar) {
        if (this.helper) {
            this.sceneObj.remove(this.helper);
        }
        this.helper = new THREE.SkeletonHelper(avatar.model);
        this.sceneObj.add(this.helper);
        this._updatePhysicsBody(avatar);
    },
    _updatePhysicsBody(avatar) {
        this._clearPhysicsBody();
        /** @type {VRMPhysicsCannonJS} */
        let physics = avatar.modules.physics;
        if (!physics || !physics.world) {
            return;
        }
        let geometry = new THREE.SphereGeometry(1, 6, 3);
        let material = new THREE.MeshBasicMaterial({ color: new THREE.Color("red"), wireframe: true, depthTest: false });
        physics.bodies.forEach(body => {
            let obj = new THREE.Group();
            body.shapes.forEach((shape, i) => {
                let sphere = new THREE.Mesh(geometry, material);
                sphere.position.copy(body.shapeOffsets[i]);
                sphere.scale.multiplyScalar(shape.boundingSphereRadius || 0.01);
                obj.add(sphere);

            });
            this.sceneObj.add(obj);
            this.physicsBodies.push([body, obj]);
        });
    },
    _clearPhysicsBody() {
        this.physicsBodies.forEach(([body, obj]) => obj.parent.remove(obj));
        this.physicsBodies = [];
    },
    tick() {
        this.physicsBodies.forEach(([body, obj]) => {
            obj.position.copy(body.position).add(this.data.physicsOffset);
            obj.quaternion.copy(body.quaternion);
        });
    },
    remove() {
        this.el.removeEventListener('model-loaded', this.onVrmLoaded);
        this._clearPhysicsBody();
        if (this.helper) {
            this.sceneObj.remove(this.helper);
        }
    }
});

AFRAME.registerComponent('vrm-poser', {
    schema: {
        color: { default: '#00ff00' },
        enableConstraints: { default: true },
    },
    init() {
        this.binds = [];
        this._tmpV0 = new THREE.Vector3();
        this._tmpV1 = new THREE.Vector3();
        this._tmpQ0 = new THREE.Quaternion();
        this._tmpQ1 = new THREE.Quaternion();
        this._tmpM0 = new THREE.Matrix4();
        if (this.el.components.vrm && this.el.components.vrm.avatar) {
            this._onAvatarUpdated(this.el.components.vrm.avatar);
        }
        this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar);
        this.el.addEventListener('model-loaded', this.onVrmLoaded);
    },
    remove() {
        this.el.removeEventListener('model-loaded', this.onVrmLoaded);
        this._removeHandles();
    },
    getPoseData(exportMorph) {
        if (!this.avatar) {
            return;
        }
        return this.avatar.getPose(exportMorph);
    },
    setPoseData(pose) {
        if (!this.avatar) {
            return;
        }
        this.avatar.setPose(pose);
        this._updateHandlePosition();
    },
    _onAvatarUpdated(avatar) {
        this._removeHandles();
        this.avatar = avatar;
        let geometry = new THREE.BoxGeometry(1, 1, 1);
        let material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(this.data.color),
            transparent: true, opacity: 0.4, depthTest: false,
        });
        let _v0 = this._tmpV0, _v1 = this._tmpV1, _m = this._tmpM0, _q = this._tmpQ0;
        let rootNode = avatar.bones['hips'];
        let boneNameByUUID = {};
        for (let name of Object.keys(avatar.bones)) {
            let bone = avatar.bones[name];
            let isRoot = bone == rootNode;
            let cube = new THREE.Mesh(geometry, material);
            let targetEl = document.createElement('a-entity');
            targetEl.classList.add('collidable');
            targetEl.setAttribute('xy-drag-control', {});
            targetEl.setObject3D('handle', cube);
            let targetObject = targetEl.object3D;
            let minDist = bone.children.reduce((d, b) => Math.min(d, b.position.length()), bone.position.length());
            targetObject.scale.multiplyScalar(Math.max(Math.min(minDist / 2, 0.05), 0.01));
            boneNameByUUID[bone.uuid] = name;
            targetEl.addEventListener('mousedown', ev => {
                this.el.emit('vrm-poser-select', { name: name, node: bone });
            });
            let parentBone = bone.parent;
            while (!boneNameByUUID[parentBone.uuid] && parentBone.parent && parentBone.parent.isBone) {
                parentBone = parentBone.parent;
            }
            targetEl.addEventListener('xy-drag', ev => {
                if (isRoot) {
                    // TODO
                    let d = targetObject.parent.worldToLocal(bone.getWorldPosition(_v0)).sub(targetObject.position)
                    avatar.model.position.sub(d);
                }
                parentBone.updateMatrixWorld(false);
                targetObject.updateMatrixWorld(false);
                _m.getInverse(parentBone.matrixWorld).multiply(targetObject.matrixWorld).decompose(_v1, _q, _v0);
                bone.quaternion.copy(this._applyConstraintQ(name, _q));
                _q.setFromUnitVectors(_v0.copy(bone.position).normalize(), _v1.normalize());
                if (parentBone.children.length == 1) {
                    parentBone.quaternion.multiply(_q);
                    this._applyConstraintQ(boneNameByUUID[parentBone.uuid], parentBone.quaternion)
                }
                this._updateHandlePosition(isRoot ? null : bone);
            });
            targetEl.addEventListener('xy-dragend', ev => {
                this._updateHandlePosition();
                console.log(parentBone.name, name);
            });
            this.el.appendChild(targetEl);
            this.binds.push([bone, targetObject]);
        }
        this._updateHandlePosition();
    },
    _applyConstraintQ(name, q) {
        if (!this.data.enableConstraints) {
            return q;
        }
        let _q = this._tmpQ1, _v = this._tmpV0;
        let constraint = this.avatar.boneConstraints[name];
        if (constraint && constraint.type == 'ball') {
            let angle = 2 * Math.acos(q.w);
            if (constraint.twistAxis) {
                let tangle = angle * Math.acos(q.w) * _v.copy(q).normalize().dot(constraint.twistAxis); // TODO
                tangle = this._normalizeAngle(tangle);
                if (Math.abs(tangle) > constraint.twistLimit) {
                    let e = tangle < 0 ? (tangle + constraint.twistLimit) : (tangle - constraint.twistLimit);
                    q.multiply(_q.setFromAxisAngle(constraint.twistAxis, -e));
                    angle = 2 * Math.acos(q.w);
                }
            }
            if (Math.abs(this._normalizeAngle(angle)) > constraint.limit) {
                q.setFromAxisAngle(_v.copy(q).normalize(), constraint.limit);
            }
        } else if (constraint && constraint.type == 'hinge') {
            let m = (constraint.min + constraint.max) / 2;
            let angle = 2 * Math.acos(q.w) * _v.copy(q).normalize().dot(constraint.axis); // TODO
            angle = THREE.MathUtils.clamp(this._normalizeAngle(angle - m), constraint.min - m, constraint.max - m);
            q.setFromAxisAngle(constraint.axis, angle + m);
        }
        return q;
    },
    _normalizeAngle(angle) {
        return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
    },
    _removeHandles() {
        this.binds.forEach(([b, t]) => {
            this.el.removeChild(t.el);
            let obj = t.el.getObject3D('handle');
            if (obj) {
                obj.material.dispose();
                obj.geometry.dispose();
            }
            t.el.destroy();
        });
        this.binds = [];
    },
    _updateHandlePosition(skipNode) {
        let _v = this._tmpV0;
        let container = this.el.object3D;
        container.updateMatrixWorld(false);
        let base = container.matrixWorld.clone().invert();
        this.binds.forEach(([node, target]) => {
            let pos = node == skipNode ? _v : target.position;
            node.updateMatrixWorld(false);
            target.matrix.copy(node.matrixWorld).premultiply(base).decompose(pos, target.quaternion, _v);
        });
    }
});

AFRAME.registerComponent('vrm-mimic', {
    schema: {
        leftHandTarget: { type: 'selector', default: '' },
        leftHandOffsetPosition: { type: 'vec3' },
        leftHandOffsetRotation: { type: 'vec3', default: { x: 0, y: -Math.PI / 2, z: 0 } },
        rightHandTarget: { type: 'selector', default: '' },
        rightHandOffsetPosition: { type: 'vec3' },
        rightHandOffsetRotation: { type: 'vec3', default: { x: 0, y: Math.PI / 2, z: 0 } },
        leftLegTarget: { type: 'selector', default: '' },
        rightLegTarget: { type: 'selector', default: '' },
        headTarget: { type: 'selector', default: '' },
        avatarOffset: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
    },
    init() {
        this._tmpV0 = new THREE.Vector3();
        this._tmpV1 = new THREE.Vector3();
        this._tmpQ0 = new THREE.Quaternion();
        this._tmpQ1 = new THREE.Quaternion();
        this._tmpM0 = new THREE.Matrix4();
        this.targetEls = [];
        if (this.el.components.vrm && this.el.components.vrm.avatar) {
            this._onAvatarUpdated(this.el.components.vrm.avatar);
        }
        this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar);
        this.el.addEventListener('model-loaded', this.onVrmLoaded);
    },
    update() {
        if (this.data.headTarget) {
            if (this.data.headTarget.tagName == 'A-CAMERA') {
                this.headTarget = this.el.sceneEl.camera;
            } else {
                this.headTarget = this.data.headTarget.object3D;
            }
        } else {
            this.headTarget = null;
        }

        this.rightHandOffset = new THREE.Matrix4().compose(
            this.data.rightHandOffsetPosition,
            new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(this.data.rightHandOffsetRotation)),
            new THREE.Vector3(1, 1, 1));
        this.leftHandOffset = new THREE.Matrix4().compose(
            this.data.leftHandOffsetPosition,
            new THREE.Quaternion().setFromEuler(new THREE.Euler().setFromVector3(this.data.leftHandOffsetRotation)),
            new THREE.Vector3(1, 1, 1));
    },
    _onAvatarUpdated(avatar) {
        this.avatar = avatar;
        for (let el of this.targetEls) {
            this.el.removeChild(el);
        }
        this.targetEls = [];
        this.update();
        this.startAvatarIK_simpleIK(avatar);
    },
    startAvatarIK_simpleIK(avatar) {
        let solver = new IKSolver();
        this.qbinds = [];
        let setupIkChain = (boneNames, targetEl, offset) => {
            if (targetEl == null) {
                targetEl = document.createElement('a-box');
                targetEl.classList.add('collidable');
                targetEl.setAttribute('xy-drag-control', {});
                targetEl.setAttribute('geometry', { width: 0.05, depth: 0.05, height: 0.05 });
                targetEl.setAttribute('material', { color: 'blue', depthTest: false, transparent: true, opacity: 0.4 });
                this.el.appendChild(targetEl);
                this.targetEls.push(targetEl);
            }
            let pos = (b, p) => p.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
            boneNames = boneNames.filter(name => avatar.bones[name]);
            let boneList = boneNames.map(name => avatar.bones[name]);
            let bones = boneList.map((b, i) => {
                let position = i == 0 ? b.position : pos(b, boneList[i - 1]);
                let constraintConf = avatar.boneConstraints[boneNames[i]];
                let constraint = constraintConf ? {
                    apply: ikbone => {
                        return this._applyConstraintQ(constraintConf, ikbone.quaternion);
                    }
                } : null;
                return new IKNode(position, constraint, b);
            });
            this.qbinds.push([boneList[boneList.length - 1], targetEl.object3D, offset]);
            return { root: boneList[0], ikbones: bones, bones: boneList, target: targetEl.object3D };
        };

        this.chains = [
            setupIkChain(['leftUpperArm', 'leftLowerArm', 'leftHand'], this.data.leftHandTarget, this.leftHandOffset),
            setupIkChain(['rightUpperArm', 'rightLowerArm', 'rightHand'], this.data.rightHandTarget, this.rightHandOffset),
            setupIkChain(['leftUpperLeg', 'leftLowerLeg', 'leftFoot'], this.data.leftLegTarget),
            setupIkChain(['rightUpperLeg', 'rightLowerLeg', 'rightFoot'], this.data.rightLegTarget),
        ];

        this.simpleIK = solver;
    },
    _applyConstraintQ(constraint, q) {
        let _q = this._tmpQ1, _v = this._tmpV0, fixed = false;;
        if (constraint && constraint.type == 'ball') {
            let angle = 2 * Math.acos(q.w);
            if (constraint.twistAxis) {
                let tangle = angle * Math.acos(q.w) * _v.copy(q).normalize().dot(constraint.twistAxis); // TODO
                tangle = this._normalizeAngle(tangle);
                if (Math.abs(tangle) > constraint.twistLimit) {
                    let e = tangle < 0 ? (tangle + constraint.twistLimit) : (tangle - constraint.twistLimit);
                    q.multiply(_q.setFromAxisAngle(constraint.twistAxis, -e));
                    angle = 2 * Math.acos(q.w);
                    fixed = true;
                }
            }
            if (Math.abs(this._normalizeAngle(angle)) > constraint.limit) {
                q.setFromAxisAngle(_v.copy(q).normalize(), constraint.limit);
                fixed = true;
            }
        } else if (constraint && constraint.type == 'hinge') {
            let m = (constraint.min + constraint.max) / 2;
            let dot = _v.copy(q).normalize().dot(constraint.axis);
            let angle = 2 * Math.acos(q.w) * dot; // TODO
            angle = THREE.MathUtils.clamp(this._normalizeAngle(angle - m), constraint.min - m, constraint.max - m);
            q.setFromAxisAngle(constraint.axis, angle + m);
            fixed = true;
        }
        return fixed;
    },
    _normalizeAngle(angle) {
        return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
    },
    tick(time, timeDelta) {
        if (!this.avatar) {
            return;
        }
        if (this.headTarget) {
            let position = this._tmpV0;
            let headRot = this._tmpQ0;
            this.headTarget.matrixWorld.decompose(position, headRot, this._tmpV1)
            position.y = 0;
            this.avatar.model.position.copy(position.add(this.data.avatarOffset));
            let head = this.avatar.firstPersonBone;
            if (head) {
                let r = this._tmpQ1.setFromRotationMatrix(head.parent.matrixWorld).invert();
                head.quaternion.copy(headRot.premultiply(r));
            }
        }
        if (this.simpleIK) {
            let pm = this.el.object3D.matrixWorld.clone().invert();
            for (let chain of this.chains) {
                // TODO: add chain.root.position
                let baseMat = chain.root.parent.matrixWorld.clone().premultiply(pm);
                if (this.simpleIK.solve(chain.ikbones, chain.target.position, baseMat) || true) {
                    chain.ikbones.forEach((ikbone, i) => {
                        if (i == chain.ikbones.length - 1) return;
                        let a = ikbone.userData.quaternion.angleTo(ikbone.quaternion);
                        if (a > 0.2) {
                            ikbone.userData.quaternion.slerp(ikbone.quaternion, 0.2 / a);
                        } else {
                            ikbone.userData.quaternion.copy(ikbone.quaternion);
                        }
                    });

                }
            }
            this.qbinds.forEach(([bone, t, offset]) => {
                let m = offset ? t.matrixWorld.clone().multiply(offset) : t.matrixWorld;
                let r = this._tmpQ0.setFromRotationMatrix(bone.parent.matrixWorld).invert();
                bone.quaternion.copy(this._tmpQ1.setFromRotationMatrix(m).premultiply(r));
            });
        }
    },
    remove() {
        this.el.removeEventListener('model-loaded', this.onVrmLoaded);
        for (let el of this.targetEls) {
            this.el.removeChild(el);
        }
    }
});
