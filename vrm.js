'use strict';

class VRMAvatar {
	constructor() {
		this.isVRM = false;
		this.model = null;
		this.mixer = null;
		this.bones = {}; // : { boneName : Object3D }
		this.blendShapes = {}; // : { key : { name:string, binds:[] } }
		this._currentShape = {};
		this._identQ = new THREE.Quaternion();
		this._zV = new THREE.Vector3(0, 0, -1);
		this._tmpQ0 = new THREE.Quaternion();
		this._tmpV0 = new THREE.Vector3();
		this._annotatedMeshes = [];
		// TODO: configurable constraints
		this.boneConstraints = {
			'leftUpperLeg': { type: 'ball', limit: 160 * Math.PI / 180 },
			'rightUpperLeg': { type: 'ball', limit: 160 * Math.PI / 180 },
			'leftLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 10 * Math.PI / 180 },
			'rightLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 10 * Math.PI / 180 }
		};
	}
	async init(gltf) {
		let vrmExt = gltf.userData?.gltfExtensions?.VRM;
		this.model = gltf.scene;
		this.mixer = new THREE.AnimationMixer(this.model);
		if (!vrmExt) {
			this.model.skeleton = new THREE.Skeleton([]);
			return this;
		}
		let bones = this.bones;
		let nodes = await gltf.parser.getDependencies('node');
		let meshes = await gltf.parser.getDependencies('mesh');

		Object.values(vrmExt.humanoid.humanBones).forEach((humanBone) => {
			bones[humanBone.bone] = nodes[humanBone.node];
		});
		if (vrmExt.blendShapeMaster?.blendShapeGroups) {
			this.blendShapes = vrmExt.blendShapeMaster.blendShapeGroups.reduce((blendShapes, bg) => {
				let binds = bg.binds.flatMap(bind => {
					let meshObj = meshes[bind.mesh];
					return (meshObj.isSkinnedMesh ? [meshObj] : meshObj.children.filter(obj => obj.isSkinnedMesh))
						.map(obj => ({ target: obj, index: bind.index, weight: bind.weight / 100 }));
				});
				blendShapes[(bg.presetName || bg.name).toUpperCase()] = { name: bg.name, binds: binds };
				return blendShapes;
			}, {});
		}
		if (vrmExt.firstPerson?.firstPersonBone) {
			this.firstPersonBone = nodes[vrmExt.firstPerson.firstPersonBone];
		}
		if (vrmExt.firstPerson?.meshAnnotations) {
			this._annotatedMeshes =
				vrmExt.firstPerson.meshAnnotations.map(ma => ({ flag: ma.firstPersonFlag, mesh: meshes[ma.mesh] }));
		}
		this.model.skeleton = new THREE.Skeleton(Object.values(bones));
		this.isVRM = true;
		return this;
	}
	tick(timeDelta) {
		this.mixer.update(timeDelta / 1000);
		if (this.lookAtTarget) {
			let b = this.firstPersonBone || this.bones['head'];
			if (!b) {
				return;
			}
			let targetDirection = b.worldToLocal(this.lookAtTarget.getWorldPosition(this._tmpV0)).normalize();
			let rot = this._tmpQ0.setFromUnitVectors(this._zV, targetDirection);
			const boneLimit = Math.PI / 4;
			let angle = 2 * Math.acos(rot.w);
			if (angle > boneLimit * 2) {
				rot = this._identQ;
			} else if (angle > boneLimit) {
				rot.setFromAxisAngle(this._tmpV0.copy(rot).normalize(), boneLimit);
			}
			b.quaternion.slerp(rot, 0.08);
		}
	}
	setBlendShapeWeight(name, value) {
		this._currentShape[name] = value;
		if (value == 0) {
			delete this._currentShape[name];
		}
		this._updateBlendShape()
	}
	getBlendShapeWeight(name) {
		return this._currentShape[name] || 0;
	}
	resetBlendShape() {
		this._currentShape = {};
		this._updateBlendShape();
	}
	startBlink(blinkInterval) {
		if (this.animatedMorph) {
			return;
		}
		this.animatedMorph = {
			name: 'BLINK',
			times: [0, blinkInterval - 0.2, blinkInterval - 0.1, blinkInterval],
			values: [0, 0, 1, 0]
		};
		this._updateBlendShape();
	}
	stopBlink() {
		this.animatedMorph = null;
		this._updateBlendShape();
	}
	setFirstPerson(firstPerson) {
		this._annotatedMeshes.forEach(a => {
			if (a.flag == 'ThirdPersonOnly') {
				a.mesh.visible = !firstPerson;
			} else if (a.flag == 'FirstPersonOnly') {
				a.mesh.visible = firstPerson;
			} else if (a.flag == 'Auto' && this.firstPersonBone) {
				if (firstPerson) {
					this.genFirstPersonMesh(a.mesh);
				} else {
					this.resetFirstPersonMesh(a.mesh);
				}
			}
		});
	}
	genFirstPersonMesh(mesh) {
		mesh.children.forEach(c => this.genFirstPersonMesh(c));
		// TODO
		if (mesh.isSkinnedMesh) {
			let firstPersonBones = {};
			this.firstPersonBone.traverse(b => {
				firstPersonBones[b.uuid] = true;
			});
			let skeletonBones = mesh.skeleton.bones;
			let skinIndex = mesh.geometry.attributes.skinIndex;
			let skinWeight = mesh.geometry.attributes.skinWeight;
			let index = mesh.geometry.index;
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
	}
	resetFirstPersonMesh(mesh) {
		mesh.children.forEach(c => this.resetFirstPersonMesh(c));
		mesh.visible = true;
	}
	_updateBlendShape() {
		// TODO: refactoring. use THREE.AnimationBlendMode.
		let times = [0];
		if (this.animatedMorph) {
			times = this.animatedMorph.times;
			this._currentShape[this.animatedMorph.name] = this._currentShape[this.animatedMorph.name] || 0;
		}
		let trackdata = Object.entries(this._currentShape).reduce(
			(data, [name, value]) => {
				let blend = this.blendShapes[name];
				if (!blend) {
					return data;
				}
				let weights = new Array(times.length).fill(value);
				if (this.animatedMorph?.name == name) {
					weights = this.animatedMorph.values.map(w => Math.max(w, value));
				}
				blend.binds.forEach(bind => {
					let tname = bind.target.name;
					let values = data[tname] || (data[tname] = new Array(bind.target.morphTargetInfluences.length * weights.length).fill(0));
					for (let t = 0; t < weights.length; t++) {
						values[t * bind.target.morphTargetInfluences.length + bind.index] = bind.weight * weights[t];
					}
				});
				return data;
			},
			{});
		let tracks = Object.entries(trackdata).map(([tname, values]) =>
			new THREE.NumberKeyframeTrack(tname + '.morphTargetInfluences', times, values));
		if (this.morphAction) {
			let action = this.morphAction;
			setTimeout(() => action.stop(), 0);
		}
		if (tracks.length == 0) {
			this.morphAction = null;
			return;
		}
		let clip = new THREE.AnimationClip('morph', undefined, tracks);
		this.morphAction = this.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
	}
	dispose() {
		// TODO
	}
}

AFRAME.registerComponent('vrm', {
	schema: {
		src: { default: '' },
		firstPerson: { default: false },
		blink: { default: true },
		blinkInterval: { default: 5 },
		lookAt: { type: 'selector' },
	},
	init() {
		this.avatar = null;
	},
	update(oldData) {
		let el = this.el;
		let data = this.data;
		if (data.src !== oldData.src) {
			this.remove();
			new THREE.GLTFLoader(THREE.DefaultLoadingManager).load(data.src, async (gltf) => {
				this.avatar = await new VRMAvatar().init(gltf);
				el.setObject3D('avatar', this.avatar.model);
				el.emit('vrmload', this.avatar, false); // Deprecated
				el.emit('model-loaded', { format: 'vrm', model: this.avatar.model, avatar: this.avatar }, false);
				this._updateAvatar();
			}, undefined, (error) => {
				el.emit('model-error', { format: 'vrm', src: data.src, cause: error }, false);
			});
		}
		this._updateAvatar();
	},
	tick(time, timeDelta) {
		this.avatar?.tick(timeDelta);
	},
	remove() {
		if (this.avatar) {
			this.el.removeObject3D('avatar', this.avatar.model);
			this.avatar.dispose();
		}
	},
	_updateAvatar() {
		if (!this.avatar) {
			return;
		}
		this.avatar.setFirstPerson(this.data.firstPerson);
		if (this.data.lookAt?.tagName == 'A-CAMERA') {
			this.avatar.lookAtTarget = this.el.sceneEl.camera;
		} else {
			this.avatar.lookAtTarget = this.data.lookAt?.object3D;
		}
		if (this.data.blink) {
			this.avatar.startBlink(this.data.blinkInterval);
		} else {
			this.avatar.stopBlink();
		}
	}
});

AFRAME.registerComponent('vrm-bvh', {
	schema: {
		src: { default: '' },
		convertBone: { default: true },
	},
	init() {
		this.avatar = null;
		if (this.el.components.vrm && this.el.components.vrm.avatar) {
			this.avatar = this.el.components.vrm.avatar;
		}
		this.onVrmLoaded = (ev) => {
			this.avatar = ev.detail.avatar;
			if (this.data.src != '') {
				this._loadBVH(this.data.src, THREE.LoopRepeat);
			} else {
				this.playTestMotion();
			}
		};
		this.el.addEventListener('model-loaded', this.onVrmLoaded);
	},
	update(oldData) {
		if (oldData.src != this.data.src && this.avatar) {
			this._loadBVH(this.data.src, THREE.LoopRepeat);
		}
	},
	playTestMotion() {
		let q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180));
		let tracks = {
			leftUpperArm: {
				keys: [
					{ rot: q(0, 0, 65), time: 0 },
					{ rot: q(0, 0, 60), time: 1 },
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
					{ rot: q(0, 0, -3), time: 1 },
					{ rot: q(0, -2, 0), time: 2 },
					{ rot: q(0, 0, 3), time: 3 },
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
		clip.tracks.forEach(t => t.setInterpolation(THREE.InterpolateSmooth));
		this.clip = clip;
		this.animation = this.avatar.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
	},
	async _loadBVH(path, loop = THREE.LoopOnce) {
		this.stopAnimation();
		if (path === '') {
			return;
		}
		let { BVHLoader } = await import('https://threejs.org/examples/jsm/loaders/BVHLoader.js');
		new BVHLoader().load(path, result => {
			if (!this.avatar) {
				return;
			}
			if (this.data.convertBone) {
				result.clip.tracks.forEach(t => {
					// '.bones[Chest].quaternion'/
					t.name = t.name.replace(/bones\[(\w+)\]/, (m, name) => {
						name = name.replace('Spin1', 'Spin');
						name = name.replace('Chest1', 'Chest');
						name = name.replace('Chest2', 'UpperChest');
						name = name.replace('UpLeg', 'UpperLeg');
						name = name.replace('LeftLeg', 'LeftLowerLeg');
						name = name.replace('RightLeg', 'RightLowerLeg');
						name = name.replace('ForeArm', 'UpperArm');
						name = name.replace('LeftArm', 'LeftLowerArm');
						name = name.replace('RightArm', 'RightLowerArm');
						name = name.replace('Collar', 'Shoulder');
						name = name.replace('Elbow', 'LowerArm');
						name = name.replace('Wrist', 'Hand');
						name = name.replace('LeftHip', 'LeftUpperLeg');
						name = name.replace('RightHip', 'RightUpperLeg');
						name = name.replace('Knee', 'LowerLeg');
						name = name.replace('Ankle', 'Foot');
						let bone = this.avatar.bones[name.charAt(0).toLowerCase() + name.slice(1)];
						return 'bones[' + (bone != null ? bone.name : 'NOT_FOUND') + ']';
					});
					if (t.name.match(/quaternion/)) {
						t.values = t.values.map((v, i) => i % 2 === 0 ? -v : v);
					}
					t.name = t.name.replace('ToeBase', 'Foot');
					if (t.name.match(/position/)) {
						t.values = t.values.map((v, i) => (i % 3 === 1 ? v : -v) * 0.09); // TODO
					}
				});
				result.clip.tracks = result.clip.tracks.filter(t => !t.name.match(/NOT_FOUND/));
			}
			result.clip.tracks = result.clip.tracks.filter(t => !t.name.match(/position/) || t.name.match(this.avatar.bones.hips.name));
			this.clip = result.clip;
			this.animation = this.avatar.mixer.clipAction(result.clip).setLoop(loop).setEffectiveWeight(1.0).play();
		});
	},
	stopAnimation() {
		if (this.animation) {
			this.animation.stop();
			this.avatar.mixer.uncacheClip(this.clip);
		}
	},
	remove() {
		this.el.removeEventListener('model-loaded', this.onVrmLoaded);
		this.stopAnimation();
		this.avatar = null;
	}
});

AFRAME.registerComponent('vrm-skeleton', {
	schema: {
	},
	init() {
		if (this.el.components.vrm && this.el.components.vrm.avatar) {
			this._onAvatarUpdated(this.el.components.vrm.avatar);
		}
		this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar);
		this.el.addEventListener('model-loaded', this.onVrmLoaded);
	},
	_onAvatarUpdated(avatar) {
		let scene = this.el.sceneEl.object3D;
		if (this.helper) {
			scene.remove(this.helper);
		}
		this.helper = new THREE.SkeletonHelper(avatar.model);
		scene.add(this.helper);
	},
	remove() {
		this.el.removeEventListener('model-loaded', this.onVrmLoaded);
		if (this.helper) {
			let scene = this.el.sceneEl.object3D;
			scene.remove(this.helper);
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
		let poseData = {}
		poseData.bones = Object.keys(this.avatar.bones).map((name) =>
			({ name: name, q: this.avatar.bones[name].quaternion.toArray() })
		);
		if (exportMorph) {
			poseData.blendShape = Object.keys(this.avatar.blendShapes).map((name) =>
				({ name: name, value: this.avatar.getBlendShapeWeight(name) })
			);
		}
		return poseData
	},
	setPoseData(pose) {
		if (!this.avatar) {
			return;
		}
		if (pose.bones) {
			for (let boneParam of pose.bones) {
				if (this.avatar.bones[boneParam.name]) {
					this.avatar.bones[boneParam.name].quaternion.fromArray(boneParam.q);
				}
			}
		}
		if (pose.blendShape) {
			for (let morph of pose.blendShape) {
				this.avatar.setBlendShapeWeight(morph.name, morph.value)
			}
		}
		this._updateHandlePosition();
	},
	_onAvatarUpdated(avatar) {
		this._removeHandles();
		this.avatar = avatar;
		let geometry = new THREE.BoxGeometry(1, 1, 1);
		let material = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.data.color) });
		let _v0 = this._tmpV0, _v1 = this._tmpV1, _m = this._tmpM0, _q = this._tmpQ0;
		let rootNode = avatar.bones['hips'];
		let boneNameByUUID = {};
		for (let name of Object.keys(avatar.bones)) {
			let bone = avatar.bones[name];
			let isRoot = bone == rootNode;
			let cube = new THREE.Mesh(geometry, material);
			material.depthTest = false;
			material.transparent = true;
			material.opacity = 0.4;
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
			targetEl.addEventListener('xy-drag', ev => {
				if (isRoot) {
					// TODO
					let d = targetObject.parent.worldToLocal(bone.getWorldPosition(_v0)).sub(targetObject.position)
					avatar.model.position.sub(d);
				}
				bone.parent.updateMatrixWorld(false);
				targetObject.updateMatrixWorld(false);
				_m.getInverse(bone.parent.matrixWorld).multiply(targetObject.matrixWorld).decompose(_v1, _q, _v0);
				bone.quaternion.copy(this._applyConstraintQ(name, _q));
				_q.setFromUnitVectors(_v0.copy(bone.position).normalize(), _v1.normalize());
				bone.parent.quaternion.multiply(_q);
				this._applyConstraintQ(boneNameByUUID[bone.parent.uuid], bone.parent.quaternion)
				this._updateHandlePosition(isRoot ? null : bone);
			});
			targetEl.addEventListener('xy-dragend', ev => {
				this._updateHandlePosition();
				console.log(bone.parent.name, name);
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
		let constraint = this.avatar.boneConstraints[name];
		if (constraint && constraint.type == 'ball') {
			let angle = 2 * Math.acos(q.w);
			if (angle > constraint.limit) {
				q.setFromAxisAngle(this._tmpV0.copy(q).normalize(), constraint.limit);
			}
		} else if (constraint && constraint.type == 'hinge') {
			let m = (constraint.min + constraint.max) / 2;
			let angle = 2 * Math.acos(q.w) * this._tmpV0.copy(q).normalize().dot(constraint.axis); // TODO
			angle = (angle - m) % (Math.PI * 2);
			if (angle > Math.PI) angle -= Math.PI * 2;
			if (angle < -Math.PI) angle += Math.PI * 2;
			angle = THREE.MathUtils.clamp(angle, constraint.min - m, constraint.max - m);
			q.setFromAxisAngle(constraint.axis, angle + m);
		}
		return q;
	},
	_removeHandles() {
		this.binds.forEach(([b, t]) => {
			this.el.removeChild(t.el);
			t.el.destroy();
		});
		this.binds = [];
	},
	_updateHandlePosition(skipNode) {
		let _v = this._tmpV0;
		let container = this.el.object3D;
		container.updateMatrixWorld(false);
		let base = new THREE.Matrix4().getInverse(container.matrixWorld);
		this.binds.forEach(([node, target]) => {
			let pos = node == skipNode ? _v : target.position;
			node.updateMatrixWorld(false);
			target.matrix.copy(node.matrixWorld).premultiply(base).decompose(pos, target.quaternion, _v);
		});
	}
});


AFRAME.registerComponent('vrm-ik-poser', {
	schema: {
		leftHandTarget: { type: 'selector', default: '' },
		rightHandTarget: { type: 'selector', default: '' },
		leftLegTarget: { type: 'selector', default: '' },
		rightLegTarget: { type: 'selector', default: '' },
		mode: { default: 'fik' },
	},
	init() {
		this.targetEls = [];
		if (this.el.components.vrm && this.el.components.vrm.avatar) {
			this._onAvatarUpdated(this.el.components.vrm.avatar);
		}
		this.onVrmLoaded = (ev) => this._onAvatarUpdated(ev.detail.avatar);
		this.el.addEventListener('model-loaded', this.onVrmLoaded);
	},
	_onAvatarUpdated(avatar) {
		for (let el of this.targetEls) {
			this.el.removeChild(el);
		}
		this.targetEls = [];
		if (this.data.mode === 'fik') {
			this.startAvatarIK(avatar);
		} else {
			this.startAvatarIK_threeIK(avatar);
		}
	},
	async startAvatarIK(avatar) {
		let FIK = await import('./3rdparty/fik.module.js');
		let ik = new FIK.Structure3D(this.el.object3D);

		this.qbinds = [];
		this.binds = [];
		this.targetBinds = [];
		let setupIk = (boneNames, targetEl) => {
			if (targetEl == null) {
				targetEl = document.createElement('a-box');
				targetEl.classList.add('collidable');
				targetEl.setAttribute('xy-drag-control', {});
				targetEl.setAttribute('geometry', { width: 0.05, depth: 0.05, height: 0.05 });
				targetEl.setAttribute('material', { color: 'blue', depthTest: false, transparent: true, opacity: 0.4 });
				this.el.appendChild(targetEl);
				this.targetEls.push(targetEl);
			}
			const chain = new FIK.Chain3D(0xFFFF00);
			boneNames = boneNames.filter(name => avatar.bones[name]);
			let boneList = boneNames.map(name => avatar.bones[name]);
			let pp = b => this.el.object3D.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
			boneList.forEach((bone, i) => {
				let b;
				if (i + 1 < boneList.length) {
					b = new FIK.Bone3D(pp(bone), pp(boneList[i + 1]))
				} else {
					let d = pp(bone).sub(pp(bone.parent)).normalize();
					b = new FIK.Bone3D(pp(bone), undefined, new FIK.V3(d.x, d.y, d.z), 0.01);
				}
				chain.addBone(b);
				this.binds.push([bone, chain, chain.bones.length - 1, b.end.minus(b.start).normalize()]);
			});
			let targetPos = new THREE.Vector3();
			if (boneList.length) {
				targetPos = pp(boneList[boneList.length - 1]);
			}
			ik.add(chain, targetPos, false);
			this.targetBinds.push([targetPos, targetEl.object3D]);
			targetEl.setAttribute('position', targetPos);
			console.log(chain);
			return chain;
		};
		setupIk(['leftUpperArm', 'leftLowerArm', 'leftHand'], this.data.leftHandTarget);
		setupIk(['rightUpperArm', 'rightLowerArm', 'rightHand'], this.data.rightHandTarget);
		setupIk(['leftUpperLeg', 'leftLowerLeg', 'leftFoot'], this.data.leftLegTarget);
		setupIk(['rightUpperLeg', 'rightLowerLeg', 'rightFoot'], this.data.rightLegTarget);

		this.ikSolver = ik;
	},
	async startAvatarIK_threeIK(avatar) {
		await import('./3rdparty/three-ik.module.js');
		console.log(THREE.IK);
		const constraints = [new THREE.IKBallConstraint(150)];

		const ik = new THREE.IK();
		this.qbinds = [];
		let setupIk = (boneNames, targetEl) => {
			const chain = new THREE.IKChain();
			let boneList = boneNames.flatMap(name => avatar.bones[name] ? [avatar.bones[name]] : []);
			boneList.forEach((bone, i) => {
				let target = i === boneList.length - 1 ? targetEl.object3D : null;
				if (target) this.qbinds.push([bone, target]);
				chain.add(new THREE.IKJoint(bone, { constraints }), { target: target });
			});
			ik.add(chain);
		};
		setupIk(['leftUpperArm', 'leftLowerArm', 'leftHand'], this.data.leftHandTarget);
		setupIk(['rightUpperArm', 'rightLowerArm', 'rightHand'], this.data.rightHandTarget);
		setupIk(['leftUpperLeg', 'leftLowerLeg', 'leftFoot'], this.data.leftLegTarget);
		setupIk(['rightUpperLeg', 'rightLowerLeg', 'rightFoot'], this.data.rightLegTarget);

		let scene = this.el.sceneEl.object3D;
		scene.add(ik.getRootBone());
		const helper = new THREE.IKHelper(ik);
		scene.add(helper);

		this.ik = ik;
	},
	tick(time, timeDelta) {
		if (this.ikSolver) {
			this.targetBinds.forEach(([t, o]) => {
				t.copy(this.el.object3D.worldToLocal(o.getWorldPosition(new THREE.Vector3())));
			});
			this.ikSolver.update();
			let wq = this.el.object3D.getWorldQuaternion(new THREE.Quaternion()).inverse();
			let tq = new THREE.Quaternion();
			this.binds.forEach(([b, c, bid, init]) => {
				let t = c.bones[bid];
				let d = t.end.minus(t.start).normalize();
				b.quaternion.setFromUnitVectors(init, d).premultiply(b.parent.getWorldQuaternion(tq).premultiply(wq).inverse());
			});
			this.qbinds.forEach(([b, t]) => {
				let r = new THREE.Quaternion().setFromRotationMatrix(b.matrixWorld).inverse();
				b.quaternion.copy(t.getWorldQuaternion(tq).premultiply(wq).multiply(r));
			});
		}
		if (this.ik) {
			this.ik.solve();
			this.qbinds.forEach(([b, t]) => {
				let r = new THREE.Quaternion().setFromRotationMatrix(b.matrixWorld).inverse();
				b.quaternion.copy(t.getWorldQuaternion(tq).multiply(r));
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
