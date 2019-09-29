import { BVHLoader } from 'https://threejs.org/examples/jsm/loaders/BVHLoader.js';

AFRAME.registerComponent('vrm', {
	schema: {
		src: { default: "" },
		motionSrc: { default: "" }
	},
	init() {
		this.model = null;
		this.bones = {};
		new THREE.GLTFLoader(THREE.DefaultLoadingManager).load(this.data.src, vrm => {
			this.el.setObject3D("avatar", vrm.scene);

			let bones = {}; // UnityBoneName => Object3D
			Object.values(vrm.userData.gltfExtensions.VRM.humanoid.humanBones).forEach(humanBone => {
				let node = vrm.parser.json.nodes[humanBone.node];
				let boneObj = vrm.scene.getObjectByName(node.name.replace(" ", "_"), true)
				if (boneObj) {
					bones[humanBone.bone] = boneObj;
				}
			});
			this.model = vrm.scene;
			this.bones = bones;
			this.model.skeleton = new THREE.Skeleton(Object.values(bones));
			this.mixer = new THREE.AnimationMixer(this.model);
			this.el.emit("vrmload");

			if (this.data.motionSrc != "") {
				this._loadBVH(this.data.motionSrc, THREE.LoopRepeat);
			} else {
				this.playTestMotion();
			}
		});
	},
	playTestMotion() {
		let rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 20 * Math.PI / 180));
		let tracks = {
			leftUpperArm: {
				keys: [
					{ rot: new THREE.Quaternion(), time: 0 },
					{ rot: rot, time: 1 },
					{ rot: new THREE.Quaternion(), time: 2 }
				]
			}
		};
		let clip = THREE.AnimationClip.parseAnimation(
			{
				name: 'testAnimation',
				hierarchy: Object.values(tracks),
			},
			Object.keys(tracks).map(k => this.bones[k] || { name: k })
		);
		console.log(THREE.AnimationClip.toJSON(clip));
		this.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
	},
	_loadBVH(path, loop = THREE.LoopOnce) {
		new BVHLoader().load(path, result => {
			result.clip.tracks.forEach(t => {
				// ".bones[Chest].quaternion"/
				t.name = t.name.replace(/bones\[(\w+)\]/, (m, name) => {
					name = name.replace("Spin1", "Spin");
					name = name.replace("Chest1", "Chest");
					name = name.replace("Chest2", "UpperChest");
					name = name.replace("UpLeg", "UpperLeg");
					name = name.replace("LeftLeg", "LeftLowerLeg");
					name = name.replace("RightLeg", "RightLowerLeg");
					name = name.replace("ForeArm", "UpperArm");
					name = name.replace("LeftArm", "LeftLowerArm");
					name = name.replace("RightArm", "RightLowerArm");
					name = name.replace("Collar", "Shoulder");
					name = name.replace("Elbow", "LowerArm");
					name = name.replace("Wrist", "Hand");
					name = name.replace("LeftHip", "LeftUpperLeg");
					name = name.replace("RightHip", "RightUpperLeg");
					name = name.replace("Knee", "LowerLeg");
					name = name.replace("Ankle", "Foot");
					let bone = this.bones[name.charAt(0).toLowerCase() + name.slice(1)];
					return "bones[" + (bone != null ? bone.name : "NOT_FOUND") + "]";
				});
				if (t.name.match(/quaternion/)) {
					t.values = t.values.map((v, i) => i % 2 == 0 ? -v : v);
				}
				t.name = t.name.replace("ToeBase", "Foot");
				if (t.name.match(/position/)) {
					t.values = t.values.map((v, i) => (i % 3 == 1 ? v : -v) * 0.09); // TODO
				}
			});
			result.clip.tracks = result.clip.tracks.filter(t => !t.name.match(/NOT_FOUND/));
			result.clip.tracks = result.clip.tracks.filter(t => !t.name.match(/position/) || t.name.match(this.bones.hips.name));
			this.mixer.clipAction(result.clip).setLoop(loop).setEffectiveWeight(1.0).play();
		});
	},
	tick(time, timeDelta) {
		if (this.mixer) {
			this.mixer.update(timeDelta / 1000);
		}
	}
});

