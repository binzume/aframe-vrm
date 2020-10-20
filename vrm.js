'use strict';

class VRMAvatar {
	constructor(gltf) {
		/** @type {THREE.Object3D} */
		this.model = gltf.scene;
		/** @type {THREE.AnimationMixer} */
		this.mixer = new THREE.AnimationMixer(this.model);
		/** @type {Record<string, THREE.Object3D>} */
		this.bones = {};
		/** @type {Record<string, { name:string, binds:object[]}>} */
		this.blendShapes = {};
		/** @type {VRMPhysicsCannonJS | null} */
		this.physics = null;
		/** @type {Record<string, any>} */
		this.meta = {};
		/** @type {boolean} */
		this.isVRM = (gltf.userData.gltfExtensions || {}).VRM != null;

		this.lookAtTarget = null;
		this._currentShape = {};
		this._identQ = new THREE.Quaternion();
		this._zV = new THREE.Vector3(0, 0, -1);
		this._tmpQ0 = new THREE.Quaternion();
		this._tmpV0 = new THREE.Vector3();
		this._annotatedMeshes = [];
		this._gltf = gltf;

		// TODO: configurable constraints
		this.boneConstraints = {
			'head': { type: 'ball', limit: 60 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 60 * Math.PI / 180 },
			'neck': { type: 'ball', limit: 30 * Math.PI / 180, twistAxis: new THREE.Vector3(0, 1, 0), twistLimit: 10 * Math.PI / 180 },
			'leftUpperLeg': { type: 'ball', limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
			'rightUpperLeg': { type: 'ball', limit: 170 * Math.PI / 180, twistAxis: new THREE.Vector3(0, -1, 0), twistLimit: Math.PI / 2 },
			'leftLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 },
			'rightLowerLeg': { type: 'hinge', axis: new THREE.Vector3(1, 0, 0), min: -170 * Math.PI / 180, max: 0 * Math.PI / 180 }
		};
	}
	async init() {
		let gltf = this._gltf;
		this._gltf = null;
		if (!this.isVRM) {
			return this;
		}
		let vrmExt = gltf.userData.gltfExtensions.VRM;
		let bones = this.bones;
		let nodes = await gltf.parser.getDependencies('node');
		let meshes = await gltf.parser.getDependencies('mesh');

		this.meta = vrmExt.meta;
		Object.values(vrmExt.humanoid.humanBones).forEach((humanBone) => {
			bones[humanBone.bone] = nodes[humanBone.node];
		});
		if (vrmExt.firstPerson && vrmExt.firstPerson.firstPersonBone) {
			this.firstPersonBone = nodes[vrmExt.firstPerson.firstPersonBone];
		}
		if (vrmExt.firstPerson && vrmExt.firstPerson.meshAnnotations) {
			this._annotatedMeshes =
				vrmExt.firstPerson.meshAnnotations.map(ma => ({ flag: ma.firstPersonFlag, mesh: meshes[ma.mesh] }));
		}
		if (vrmExt.blendShapeMaster) {
			this._initBlendShapes(vrmExt.blendShapeMaster, meshes);
		}
		if (vrmExt.secondaryAnimation && globalThis.CANNON) {
			console.log('init physics', vrmExt.secondaryAnimation);
			this.physics = new VRMPhysicsCannonJS(vrmExt.secondaryAnimation, nodes);
		}
		this.model.skeleton = new THREE.Skeleton(Object.values(bones));
		this._fixBoundingBox();
		return this;
	}
	_initBlendShapes(blendShapeMaster, meshes) {
		this.blendShapes = (blendShapeMaster.blendShapeGroups || []).reduce((blendShapes, bg) => {
			let binds = bg.binds.flatMap(bind => {
				let meshObj = meshes[bind.mesh];
				return (meshObj.isSkinnedMesh ? [meshObj] : meshObj.children.filter(obj => obj.isSkinnedMesh))
					.map(obj => ({ target: obj, index: bind.index, weight: bind.weight / 100 }));
			});
			blendShapes[(bg.presetName || bg.name).toUpperCase()] = { name: bg.name, binds: binds };
			return blendShapes;
		}, {});
	}
	_fixBoundingBox() {
		let bones = this.bones;
		if (!bones.hips) {
			return;
		}
		// Extends bounding box.
		let center = bones.hips.getWorldPosition(this._tmpV0).clone();
		this.model.traverse(obj => {
			if (obj.isSkinnedMesh) {
				let pos = obj.getWorldPosition(this._tmpV0).sub(center).multiplyScalar(-1);
				let r = (pos.clone().sub(obj.geometry.boundingSphere.center).length() + obj.geometry.boundingSphere.radius);
				obj.geometry.boundingSphere.center.copy(pos);
				obj.geometry.boundingSphere.radius = r;
				obj.geometry.boundingBox.min.set(pos.x - r, pos.y - r, pos.z - r);
				obj.geometry.boundingBox.max.set(pos.x + r, pos.y + r, pos.z + r);
			}
		});
	}
	tick(timeDelta) {
		this.mixer.update(timeDelta);
		if (this.lookAtTarget && this.firstPersonBone) {
			let b = this.firstPersonBone;
			let targetDirection = b.worldToLocal(this.lookAtTarget.getWorldPosition(this._tmpV0)).normalize();
			let rot = this._tmpQ0.setFromUnitVectors(this._zV, targetDirection);
			let boneLimit = this.boneConstraints.head.limit;
			let speedFactor = 0.08;
			let angle = 2 * Math.acos(rot.w);
			if (angle > boneLimit * 1.5) {
				rot = this._identQ;
				speedFactor = 0.04;
			} else if (angle > boneLimit) {
				rot.setFromAxisAngle(this._tmpV0.copy(rot).normalize(), boneLimit);
			}
			b.quaternion.slerp(rot, speedFactor);
		}
		if (this.physics && this.physics.world) {
			this.physics.update(timeDelta);
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
					this._genFirstPersonMesh(a.mesh);
				} else {
					this._resetFirstPersonMesh(a.mesh);
				}
			}
		});
	}
	getPose(exportMorph) {
		let poseData = {}
		poseData.bones = Object.keys(this.bones).map((name) =>
			({ name: name, q: this.bones[name].quaternion.toArray() })
		);
		if (exportMorph) {
			poseData.blendShape = Object.keys(this.blendShapes).map((name) =>
				({ name: name, value: this.getBlendShapeWeight(name) })
			);
		}
		return poseData
	}
	setPose(pose) {
		if (pose.bones) {
			for (let boneParam of pose.bones) {
				if (this.bones[boneParam.name]) {
					this.bones[boneParam.name].quaternion.fromArray(boneParam.q);
				}
			}
		}
		if (pose.blendShape) {
			for (let morph of pose.blendShape) {
				this.setBlendShapeWeight(morph.name, morph.value)
			}
		}
	}
	restPose() {
		for (let b of Object.values(this.bones)) {
			b.quaternion.set(0, 0, 0, 1);
		}
	}
	_genFirstPersonMesh(mesh) {
		mesh.children.forEach(c => this._genFirstPersonMesh(c));
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
	_resetFirstPersonMesh(mesh) {
		mesh.children.forEach(c => this._resetFirstPersonMesh(c));
		mesh.visible = true;
	}
	_updateBlendShape() {
		// TODO: refactoring. use THREE.AnimationBlendMode.
		let addWeights = (data, name, weights) => {
			let blend = this.blendShapes[name];
			blend && blend.binds.forEach(bind => {
				let tname = bind.target.name;
				let values = data[tname] || (data[tname] = new Array(bind.target.morphTargetInfluences.length * weights.length).fill(0));
				for (let t = 0; t < weights.length; t++) {
					let i = t * bind.target.morphTargetInfluences.length + bind.index;
					values[i] += Math.max(bind.weight * weights[t], values[i]); // blend func : max
				}
			});
		};
		let times = [0], trackdata = {};
		if (this.animatedMorph) {
			times = this.animatedMorph.times;
			addWeights(trackdata, this.animatedMorph.name, this.animatedMorph.values);
		}
		for (let [name, value] of Object.entries(this._currentShape)) {
			if (this.blendShapes[name]) {
				addWeights(trackdata, name, new Array(times.length).fill(value));
			}
		}
		let tracks = Object.entries(trackdata).map(([tname, values]) =>
			new THREE.NumberKeyframeTrack(tname + '.morphTargetInfluences', times, values));
		let nextAction = null;
		if (tracks.length > 0) {
			let clip = new THREE.AnimationClip('morph', undefined, tracks);
			nextAction = this.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
		}
		this.morphAction && this.morphAction.stop();
		this.morphAction = nextAction;
	}
	dispose() {
		this.physics && this.physics.detach();
		this.physics = null;
		this.model.traverse(obj => {
			obj.geometry && obj.geometry.dispose();
			obj.material && obj.material.dispose();
			obj.material && obj.material.map && obj.material.map.dispose();
			obj.skeleton && obj.skeleton.dispose();
		});
	}
}

class VRMPhysicsCannonJS {
	constructor(secondaryAnimation, nodes) {
		this.collisionGroup = 2;
		this.binds = [];
		this.fixedBinds = [];
		this.bodies = [];
		this.constraints = [];
		this._tmpQ0 = new THREE.Quaternion();
		this._tmpV0 = new THREE.Vector3();
		this._tmpV1 = new THREE.Vector3();
		this.springBoneSystem = this._springBoneSystem();
		this._init(secondaryAnimation, nodes);
	}
	_init(secondaryAnimation, nodes) {
		let allColliderGroupsMask = 0;
		let colliderMarginFactor = 0.9; // TODO: Remove this.
		(secondaryAnimation.colliderGroups || []).forEach((cc, i) => {
			let node = nodes[cc.node];
			for (let collider of cc.colliders) {
				let body = new CANNON.Body({ mass: 0, collisionFilterGroup: 1 << (this.collisionGroup + i + 1), collisionFilterMask: -1 });
				body.addShape(new CANNON.Sphere(collider.radius * colliderMarginFactor), collider.offset);
				this.bodies.push(body);
				this.fixedBinds.push([node, body]);
				allColliderGroupsMask |= body.collisionFilterGroup;
			}
		});
		for (let bg of secondaryAnimation.boneGroups) {
			let gravity = new CANNON.Vec3().copy(bg.gravityDir || { x: 0, y: -1, z: 0 }).scale(bg.gravityPower || 0);
			let radius = bg.hitRadius || 0.05;
			let collisionFilterMask = ~(this.collisionGroup | allColliderGroupsMask);
			for (let g of bg.colliderGroups || []) {
				collisionFilterMask |= 1 << (this.collisionGroup + g + 1);
			}
			for (let b of bg.bones) {
				let root = new CANNON.Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
				root.position.copy(nodes[b].parent.getWorldPosition(this._tmpV0));
				this.bodies.push(root);
				this.fixedBinds.push([nodes[b].parent, root]);
				let add = (parentBody, node) => {
					let c = node.getWorldPosition(this._tmpV0);
					let wpos = c.clone(); // TODO
					let n = node.children.length + 1;
					if (node.children.length > 0) {
						node.children.forEach(n => {
							c.add(n.getWorldPosition(this._tmpV1));
						});
					} else {
						c.add(node.parent.getWorldPosition(this._tmpV1).sub(c).normalize().multiplyScalar(-0.1).add(c));
						n = 2;
					}
					c.multiplyScalar(1 / n);

					let body = new CANNON.Body({
						mass: 0.5,
						linearDamping: Math.max(bg.dragForce || 0, 0.0001),
						angularDamping: Math.max(bg.dragForce || 0, 0.0001),
						collisionFilterGroup: this.collisionGroup,
						collisionFilterMask: collisionFilterMask,
						position: c,
					});
					body.addShape(new CANNON.Sphere(radius));
					this.bodies.push(body);

					let o = new CANNON.Vec3(0, 0, 0).copy(this._tmpV1.copy(wpos).sub(c));
					let d = new CANNON.Vec3(0, 0, 0).copy(wpos.sub(parentBody.position));
					let joint = new CANNON.PointToPointConstraint(body, o, parentBody, d);
					this.constraints.push(joint);

					this.binds.push([node, body]);
					this.springBoneSystem.objects.push({ body: body, parentBody: parentBody, force: gravity, boneGroup: bg, size: radius });
					node.children.forEach(n => n.isBone && add(body, n));
				};
				add(root, nodes[b], 0);
			}
		}
	}
	_springBoneSystem() {
		let _q0 = new CANNON.Quaternion();
		let _q1 = new CANNON.Quaternion();
		let _v0 = new CANNON.Vec3();
		return {
			world: null,
			objects: [], // : [{body, force, parentBody, boneGroup}]
			update() {
				let g = this.world.gravity, dt = this.world.dt;
				let avlimit = 0.1;
				for (let b of this.objects) {
					let body = b.body, parent = b.parentBody;
					// Cancel world.gravity and apply boneGroup.gravity.
					let f = body.force, m = body.mass, g2 = b.force;
					f.x += m * (-g.x + g2.x);
					f.y += m * (-g.y + g2.y);
					f.z += m * (-g.z + g2.z);

					// angularVelocity limitation
					let av = body.angularVelocity.length();
					if (av > avlimit) {
						body.angularVelocity.scale(avlimit / av, body.angularVelocity);
					}

					// apply spring(?) force.
					let stiffness = b.boneGroup.stiffiness; // stiff'i'ness
					let approxInertia = b.size * b.size * m * 1600;
					let rot = body.quaternion.mult(parent.quaternion.inverse(_q0), _q1);
					let [axis, angle] = rot.toAxisAngle(_v0);
					angle = angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
					let tf = angle * stiffness;
					if (Math.abs(tf) > Math.abs(angle / dt / dt * 0.00025)) {
						tf = angle / dt / dt * 0.00025; // TODO
					}
					let af = axis.scale(-tf * approxInertia, axis);
					body.torque.vadd(af, body.torque);
				}
			}
		};
	}
	attach(world) {
		this.detach();
		this.world = world || new CANNON.World();
		this.internalWorld = world == null;
		this.springBoneSystem.world = this.world;
		this.world.subsystems.push(this.springBoneSystem);
		this.bodies.forEach(b => this.world.add(b));
		this.constraints.forEach(c => this.world.addConstraint(c));
		this.reset();
	}
	detach() {
		if (!this.world) {
			return;
		}
		this.world.subsystems = this.world.subsystems.filter(s => s != this.springBoneSystem);
		this.world.constraints = this.world.constraints.filter(c => !this.constraints.includes(c));
		this.world.bodies = this.world.bodies.filter(b => !this.bodies.includes(b));
		this.world = null;
	}
	reset() {
		this.fixedBinds.forEach(([node, body]) => {
			node.updateWorldMatrix(true);
			body.position.copy(node.getWorldPosition(this._tmpV0));
			body.quaternion.copy(node.parent.getWorldQuaternion(this._tmpQ0));
		});
		this.binds.forEach(([node, body]) => {
			node.updateWorldMatrix(true);
			body.position.copy(node.getWorldPosition(this._tmpV0));
			body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
		});
	}
	update(timeDelta) {
		this.fixedBinds.forEach(([node, body]) => {
			body.position.copy(node.getWorldPosition(this._tmpV0));
			body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
		});
		if (this.internalWorld) {
			this.world.step(1 / 60, timeDelta);
		}
		this.binds.forEach(([node, body]) => {
			node.quaternion.copy(body.quaternion).premultiply(node.parent.getWorldQuaternion(this._tmpQ0).inverse());
		});
	}
}

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
		let el = this.el;
		let data = this.data;
		if (data.src !== oldData.src) {
			this.remove();
			if (data.src) {
				let url = data.src;
				new THREE.GLTFLoader(THREE.DefaultLoadingManager).load(url, async (gltf) => {
					let avatar = await new VRMAvatar(gltf).init();
					if (url != data.src) {
						avatar.dispose();
						return;
					}
					this.avatar = avatar;
					el.setObject3D('avatar', avatar.model);
					this._updateAvatar();
					this.play();
					el.emit('model-loaded', { format: 'vrm', model: avatar.model, avatar: avatar }, false);
				}, undefined, (error) => {
					el.emit('model-error', { format: 'vrm', src: url, cause: error }, false);
				});
			}
		}
		this._updateAvatar();
	},
	tick(time, timeDelta) {
		if (!this.avatar) {
			this.pause();
			return;
		}
		this.avatar.tick(timeDelta / 1000);
	},
	remove() {
		if (this.avatar) {
			this.el.removeObject3D('avatar');
			this.avatar.dispose();
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
		if (data.enablePhysics) {
			if (this.avatar.physics && this.avatar.physics.world == null) {
				let world = null;
				if (this.el.sceneEl.systems.physics && this.el.sceneEl.systems.physics.driver) {
					world = this.el.sceneEl.systems.physics.driver.world;
					// HACK: update collision mask.
					world.bodies.forEach(b => {
						if (b.collisionFilterGroup == 1 && b.collisionFilterMask == 1) {
							b.collisionFilterMask = -1;
						}
					});
				}
				if (this.avatar.physics) {
					this.avatar.physics.attach(world);
				}
			}
		} else {
			if (this.avatar.physics) {
				this.avatar.physics.detach();
			}
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
				this.convertClip(result.clip);
			}
			result.clip.tracks = result.clip.tracks.filter(t => !t.name.match(/position/) || t.name.match(this.avatar.bones.hips.name));
			this.clip = result.clip;
			this.animation = this.avatar.mixer.clipAction(result.clip).setLoop(loop).setEffectiveWeight(1.0).play();
		});
	},
	convertClip(clip) {
		clip.tracks.forEach(t => {
			// '.bones[Chest].quaternion'
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
			t.name = t.name.replace('ToeBase', 'Foot');
			if (t.name.match(/quaternion/)) {
				t.values = t.values.map((v, i) => i % 2 === 0 ? -v : v);
			}
			if (t.name.match(/position/)) {
				t.values = t.values.map((v, i) => (i % 3 === 1 ? v : -v) * 0.09); // TODO
			}
		});
		clip.tracks = clip.tracks.filter(t => !t.name.match(/NOT_FOUND/));
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
		if (!avatar.physics || !avatar.physics.world) {
			return;
		}
		let geometry = new THREE.SphereGeometry(1, 6, 3);
		let material = new THREE.MeshBasicMaterial({ color: new THREE.Color("red"), wireframe: true, depthTest: false });
		avatar.physics.bodies.forEach(body => {
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
		let base = new THREE.Matrix4().getInverse(container.matrixWorld);
		this.binds.forEach(([node, target]) => {
			let pos = node == skipNode ? _v : target.position;
			node.updateMatrixWorld(false);
			target.matrix.copy(node.matrixWorld).premultiply(base).decompose(pos, target.quaternion, _v);
		});
	}
});

// Simple IK
class IKNode {
	constructor(position, constraint, userData) {
		this.position = position;
		this.quaternion = new THREE.Quaternion();
		this.worldMatrix = new THREE.Matrix4();
		this.worldPosition = new THREE.Vector3();
		this.constraint = constraint;
		this.userData = userData;
	}
}
class IKSolver {
	constructor() {
		this.iterationLimit = 50;
		this.thresholdSq = 0.0001;
		this._iv = new THREE.Vector3(1, 1, 1);
		this._tmpV0 = new THREE.Vector3();
		this._tmpV1 = new THREE.Vector3();
		this._tmpV2 = new THREE.Vector3();
		this._tmpQ0 = new THREE.Quaternion();
		this._tmpQ1 = new THREE.Quaternion();
	}
	_updateChain(bones, parentMat) {
		for (let bone of bones) {
			bone.worldMatrix.compose(bone.position, bone.quaternion, this._iv).premultiply(parentMat);
			bone.worldPosition.setFromMatrixPosition(bone.worldMatrix);
			parentMat = bone.worldMatrix;
		}
	}
	solve(bones, target, boneSpaceMat) {
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
				targetDir.copy(currentTarget).sub(this._tmpV1).applyQuaternion(rotation.copy(this._tmpQ0).inverse()).normalize();
				endDir.copy(endPos).normalize();
				rotation.setFromUnitVectors(endDir, targetDir);
				bone.quaternion.multiply(rotation);
				let v = endDir.copy(endPos).applyQuaternion(this._tmpQ0.multiply(rotation));
				if (bone.constraint) {
					rotation.copy(bone.quaternion).inverse();
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
			let position = this.headTarget.getWorldPosition(this._tmpV0);
			let headRot = this.headTarget.getWorldQuaternion(this._tmpQ0);
			position.y = 0;
			this.avatar.model.position.copy(position.add(this.data.avatarOffset));
			let head = this.avatar.firstPersonBone;
			if (head) {
				let r = this._tmpQ1.setFromRotationMatrix(head.parent.matrixWorld).inverse();
				head.quaternion.copy(headRot.premultiply(r));
			}
		}
		if (this.simpleIK) {
			let pm = new THREE.Matrix4().getInverse(this.el.object3D.matrixWorld);
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
				let r = this._tmpQ0.setFromRotationMatrix(bone.parent.matrixWorld).inverse();
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
