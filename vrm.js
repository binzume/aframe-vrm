'use strict';

AFRAME.registerComponent('vrm', {
	schema: {
		src: { default: '' },
		blink: { default: true },
		blinkInterval: { default: 5 },
	},
	init() {
		this.avatar = null;
		this.lookAtTarget = null;

		this.morph = {};
	},
	update(oldData) {
		if (this.data.src !== oldData.src) {
			new THREE.GLTFLoader(THREE.DefaultLoadingManager).load(this.data.src, async (gltf) => {
				let model = gltf.scene;
				let bones = {}; // VRMBoneName => Object3D
				let blendShapes = {};
				let mixer = new THREE.AnimationMixer(model);
				this.avatar = { model: model, mixer: mixer, bones: bones, blendShapes: blendShapes };
				this.el.setObject3D('avatar', model);

				let vrmExt = gltf.userData?.gltfExtensions?.VRM;
				if (vrmExt) {
					await Promise.all(
						Object.values(vrmExt.humanoid.humanBones).map(async (humanBone) => {
							bones[humanBone.bone] = await gltf.parser.getDependency('node', humanBone.node);
						})
					);
					vrmExt.blendShapeMaster.blendShapeGroups.forEach(bg => {
						let binds = bg.binds.flatMap(bind => {
							let mesh = gltf.parser.json.meshes[bind.mesh];
							if (mesh.primitives.length == 1) {
								let node = gltf.parser.json.nodes.find(n => n.mesh === bind.mesh);
								let obj = gltf.scene.getObjectByName(node.name.replace(' ', '_').replace('.', ''), true);
								return [{ target: obj, index: bind.index, weight: bind.weight / 100 }];
							}
							return mesh.primitives.map((p, i) =>
								({ target: gltf.scene.getObjectByName(mesh.name + '_' + i, true), index: bind.index, weight: bind.weight / 100 })
							);
						});
						blendShapes[bg.name.toUpperCase()] = { binds: binds };
					});
					if (vrmExt.firstPerson?.firstPersonBone) {
						this.avatar.firstPersonBone = await gltf.parser.getDependency('node', vrmExt.firstPerson.firstPersonBone);
					}
				}
				model.skeleton = new THREE.Skeleton(Object.values(bones));
				this.el.emit('vrmload', this.avatar, false);
				this.blinkAction = null;
				if (this.data.blink) {
					this.startBlink();
				}
			});
		}
		if (this.avatar && this.data.blink) {
			this.startBlink();
		} else {
			this.stopBlink();
		}
	},
	makeBlendShapeTracks(name, times, weights) {
		let blend = this.avatar.blendShapes[name];
		if (!blend) {
			return [];
		}
		return blend.binds.map(bind => {
			let values = new Array(bind.target.morphTargetInfluences.length * times.length).fill(0);
			for (let t = 0; t < times.length; t++) {
				values[t * bind.target.morphTargetInfluences.length + bind.index] = bind.weight * weights[t];
			}
			return new THREE.NumberKeyframeTrack(bind.target.name + '.morphTargetInfluences', times, values);
		});
	},
	startBlink() {
		if (this.blinkAction) {
			return;
		}
		let duration = this.data.blinkInterval;
		let tt = [0, duration - 0.2, duration - 0.1, duration];
		let ww = [0, 0, 1, 0];
		let clip = new THREE.AnimationClip('blink', undefined, this.makeBlendShapeTracks('BLINK', tt, ww));
		this.blinkAction = this.avatar.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
	},
	stopBlink() {
		this.blinkAction?.stop();
		this.blinkAction = null;
	},
	setMorph(name, value) {
		this.morph[name] = value;
		let tracks = Object.keys(this.morph).reduce(
			(tracks, n) => tracks.concat(this.makeBlendShapeTracks(n, [0], [this.morph[n]])),
			[]);
		let clip = new THREE.AnimationClip('morph', undefined, tracks);
		this.morphAction?.stop();
		this.morphAction = this.avatar.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
	},
	resetMorph() {
		this.morph = {};
		this.morphAction?.stop();
		this.morphAction = null;
	},
	tick(time, timeDelta) {
		this.avatar?.mixer.update(timeDelta / 1000);
		if (this.lookAtTarget && this.avatar?.firstPersonBone) {
			let b = this.avatar.firstPersonBone;
			let targetPos = this.lookAtTarget.getWorldPosition(new THREE.Vector3());
			b.worldToLocal(targetPos).normalize();
			var rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), targetPos);
			let angle = 2 * Math.acos(rot.w);
			if (angle > Math.PI / 2) {
				rot.set(0, 0, 0, 1);
			} else if (angle > Math.PI / 4) {
				rot.slerp(new THREE.Quaternion(), 1 - Math.PI / 4 / angle);
			}
			b.quaternion.slerp(rot, 0.05);
		}
	},
	remove() {
		if (this.avatar) {
			this.stopBlink();
			this.el.removeObject3D('avatar', this.avatar.model);
		}
	}
});

AFRAME.registerComponent('vrm-bvh', {
	schema: {
		src: { default: '' },
	},
	init() {
		this.avatar = null;
		if (this.el.components.vrm && this.el.components.vrm.avatar) {
			this.avatar = this.el.components.vrm.avatar;
		}
		this.onVrmLoaded = (ev) => {
			this.avatar = ev.detail;
			if (this.data.src != '') {
				this._loadBVH(this.data.src, THREE.LoopRepeat);
			} else {
				this.playTestMotion();
			}
		};
		this.el.addEventListener('vrmload', this.onVrmLoaded);
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
		console.log("testAnimaton:", THREE.AnimationClip.toJSON(clip));
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
		this.el.removeEventListener('vrmload', this.onVrmLoaded);
		this.stopAnimation();
		this.avatar = null;
	}
});

AFRAME.registerComponent('vrm-skeleton', {
	schema: {
	},
	init() {
		if (this.el.components.vrm && this.el.components.vrm.avatar) {
			this.onAvatarUpdated(this.el.components.vrm.avatar);
		}
		this.onVrmLoaded = (ev) => this.onAvatarUpdated(ev.detail);
		this.el.addEventListener('vrmload', this.onVrmLoaded);
	},
	onAvatarUpdated(avatar) {
		let scene = this.el.sceneEl.object3D;
		if (this.helper) {
			scene.remove(this.helper);
		}
		this.helper = new THREE.SkeletonHelper(avatar.model);
		scene.add(this.helper);
	},
	remove() {
		this.el.removeEventListener('vrmload', this.onVrmLoaded);
		if (this.helper) {
			let scene = this.el.sceneEl.object3D;
			scene.remove(this.helper);
		}
	}
});


AFRAME.registerComponent('vrm-poser', {
	schema: {
	},
	init() {
		this.binds = [];
		if (this.el.components.vrm && this.el.components.vrm.avatar) {
			this.onAvatarUpdated(this.el.components.vrm.avatar);
		}
		this.onVrmLoaded = (ev) => this.onAvatarUpdated(ev.detail);
		this.el.addEventListener('vrmload', this.onVrmLoaded);
	},
	onAvatarUpdated(avatar) {
		this.remove();
		let size = 1;
		let geometry = new THREE.BoxGeometry(size, size, size);
		let material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
		for (let b of Object.values(avatar.bones)) {
			var cube = new THREE.Mesh(geometry, material);
			material.depthTest = false;
			material.transparent = true;
			material.opacity = 0.4;
			let targetEl = document.createElement('a-entity');
			targetEl.classList.add('collidable');
			targetEl.setAttribute('xy-drag-control', {});
			targetEl.setObject3D('handle', cube);
			let minDist = b.children.reduce((d, b) => Math.min(d, b.position.distanceTo(b.parent.position)), b.position.distanceTo(b.parent.position));
			targetEl.object3D.scale.multiplyScalar(Math.max(Math.min(minDist / 2, 0.05), 0.01));
			let bone = b;
			targetEl.addEventListener('xy-drag', ev => {
				let p = bone.parent.worldToLocal(targetEl.object3D.getWorldPosition(new THREE.Vector3())).normalize();
				let q = new THREE.Quaternion().setFromUnitVectors(bone.position.clone().normalize(), p);
				bone.parent.quaternion.multiply(q);
				bone.quaternion.copy(targetEl.object3D.quaternion);
				this.updateHandlePosition(bone);
			});
			targetEl.addEventListener('xy-dragend', ev => {
				this.updateHandlePosition();
			});
			this.el.appendChild(targetEl);
			this.binds.push([b, targetEl]);
		}
		this.updateHandlePosition();
	},
	remove() {
		this.el.removeEventListener('vrmload', this.onVrmLoaded);
		this.binds.forEach(bind => this.el.removeChild(bind[1]));
		this.binds = [];
	},
	updateHandlePosition(ignore) {
		this.binds.forEach(([b, t]) => {
			if (b == ignore) {
				return;
			}
			let p = this.el.object3D.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
			t.object3D.position.copy(p);
			t.object3D.quaternion.copy(b.quaternion);
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
			this.onAvatarUpdated(this.el.components.vrm.avatar);
		}
		this.onVrmLoaded = (ev) => this.onAvatarUpdated(ev.detail);
		this.el.addEventListener('vrmload', this.onVrmLoaded);
	},
	onAvatarUpdated(avatar) {
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
		this.el.removeEventListener('vrmload', this.onVrmLoaded);
		for (let el of this.targetEls) {
			this.el.removeChild(el);
		}
	}
});
