import { VRMAvatar } from "../vrm/avatar"

export class VMDLoaderWrapper {
    boneMapping: { bone: string, nodeNames: string[] }[] = [
        { "bone": "hips", "nodeNames": ["センター", "center"] },
        { "bone": "spine", "nodeNames": ["上半身", "upper body"] },
        { "bone": "chest", "nodeNames": ["上半身2", "upper body2"] },
        { "bone": "neck", "nodeNames": ["首", "neck"] },
        { "bone": "head", "nodeNames": ["頭", "head"] },
        { "bone": "leftShoulder", "nodeNames": ["左肩", "shoulder_L"] },
        { "bone": "leftUpperArm", "nodeNames": ["左腕", "arm_L"] },
        { "bone": "leftLowerArm", "nodeNames": ["左ひじ", "elbow_L"] },
        { "bone": "leftHand", "nodeNames": ["左手首", "wrist_L"] },
        { "bone": "rightShoulder", "nodeNames": ["右肩", "shoulder_R"] },
        { "bone": "rightUpperArm", "nodeNames": ["右腕", "arm_R"] },
        { "bone": "rightLowerArm", "nodeNames": ["右ひじ", "elbow_R"] },
        { "bone": "rightHand", "nodeNames": ["右手首", "wrist_R"] },
        { "bone": "leftUpperLeg", "nodeNames": ["左足", "leg_L"] },
        { "bone": "leftLowerLeg", "nodeNames": ["左ひざ", "knee_L"] },
        { "bone": "leftFoot", "nodeNames": ["左足首", "ankle_L"] },
        { "bone": "leftToes", "nodeNames": ["左つま先", "L toe"] },
        { "bone": "rightUpperLeg", "nodeNames": ["右足", "leg_R"] },
        { "bone": "rightLowerLeg", "nodeNames": ["右ひざ", "knee_R"] },
        { "bone": "rightFoot", "nodeNames": ["右足首", "ankle_R"] },
        { "bone": "rightToes", "nodeNames": ["右つま先", "R toe"] },
        { "bone": "leftEye", "nodeNames": ["左目", "eye_L"] },
        { "bone": "rightEye", "nodeNames": ["右目", "eye_R"] },
        { "bone": "leftThumbProximal", "nodeNames": ["左親指０", "thumb0_L"] },
        { "bone": "leftThumbIntermediate", "nodeNames": ["左親指１", "thumb1_L"] },
        { "bone": "leftThumbDistal", "nodeNames": ["左親指２", "thumb2_L"] },
        { "bone": "leftIndexProximal", "nodeNames": ["左人指１", "fore1_L"] },
        { "bone": "leftIndexIntermediate", "nodeNames": ["左人指２", "fore2_L"] },
        { "bone": "leftIndexDistal", "nodeNames": ["左人指３", "fore3_L"] },
        { "bone": "leftMiddleProximal", "nodeNames": ["左中指１", "middle1_L"] },
        { "bone": "leftMiddleIntermediate", "nodeNames": ["左中指２", "middle2_L"] },
        { "bone": "leftMiddleDistal", "nodeNames": ["左中指３", "middle3_L"] },
        { "bone": "leftRingProximal", "nodeNames": ["左薬指１", "third1_L"] },
        { "bone": "leftRingIntermediate", "nodeNames": ["左薬指２", "third2_L"] },
        { "bone": "leftRingDistal", "nodeNames": ["左薬指３", "third3_L"] },
        { "bone": "leftLittleProximal", "nodeNames": ["左小指１", "little1_L"] },
        { "bone": "leftLittleIntermediate", "nodeNames": ["左小指２", "little2_L"] },
        { "bone": "leftLittleDistal", "nodeNames": ["左小指３", "little3_L"] },
        { "bone": "rightThumbProximal", "nodeNames": ["右親指０", "thumb0_R"] },
        { "bone": "rightThumbIntermediate", "nodeNames": ["右親指１", "thumb1_R"] },
        { "bone": "rightThumbDistal", "nodeNames": ["右親指２", "thumb2_R"] },
        { "bone": "rightIndexProximal", "nodeNames": ["右人指１", "fore1_R"] },
        { "bone": "rightIndexIntermediate", "nodeNames": ["右人指２", "fore2_R"] },
        { "bone": "rightIndexDistal", "nodeNames": ["右人指３", "fore3_R"] },
        { "bone": "rightMiddleProximal", "nodeNames": ["右中指１", "middle1_R"] },
        { "bone": "rightMiddleIntermediate", "nodeNames": ["右中指２", "middle2_R"] },
        { "bone": "rightMiddleDistal", "nodeNames": ["右中指３", "middle3_R"] },
        { "bone": "rightRingProximal", "nodeNames": ["右薬指１", "third1_R"] },
        { "bone": "rightRingIntermediate", "nodeNames": ["右薬指２", "third2_R"] },
        { "bone": "rightRingDistal", "nodeNames": ["右薬指３", "third3_R"] },
        { "bone": "rightLittleProximal", "nodeNames": ["右小指１", "little1_R"] },
        { "bone": "rightLittleIntermediate", "nodeNames": ["右小指２", "little2_R"] },
        { "bone": "rightLittleDistal", "nodeNames": ["右小指３", "little3_R"] },
    ];
    blendShapeMap = {
        "A": "あ",
        "I": "い",
        "U": "う",
        "E": "え",
        "O": "お",
        "BLINK": "まばたき",
    };
    rotationOffsets = {
        "leftUpperArm": -38 * THREE.MathUtils.DEG2RAD,
        "rightUpperArm": 38 * THREE.MathUtils.DEG2RAD,
    };
    ikConfigs = [
        { target: "左足ＩＫ", bones: [`leftFoot`, 'leftLowerLeg', 'leftUpperLeg'] },
        { target: "右足ＩＫ", bones: [`rightFoot`, 'rightLowerLeg', 'rightUpperLeg'] },
        { target: "左つま先ＩＫ", parent: 0, bones: [`leftToes`, `leftFoot`] },
        { target: "右つま先ＩＫ", parent: 1, bones: [`rightToes`, `rightFoot`] },
    ];
    boneConstraints: Record<string, any> = {
        'leftLowerLeg': { min: new THREE.Vector3(-175 * Math.PI / 180, 0, 0), max: new THREE.Vector3(0, 0, 0) },
        'rightLowerLeg': { min: new THREE.Vector3(-175 * Math.PI / 180, 0, 0), max: new THREE.Vector3(0, 0, 0) },
        'leftUpperLeg': { min: new THREE.Vector3(-Math.PI / 2, -Math.PI / 2, -Math.PI / 2), max: new THREE.Vector3(Math.PI, Math.PI / 2, Math.PI / 2) },
        'rightUpperLeg': { min: new THREE.Vector3(-Math.PI / 2, -Math.PI / 2, -Math.PI / 2), max: new THREE.Vector3(Math.PI, Math.PI / 2, Math.PI / 2) },
    };

    async load(url: string, vrm: VRMAvatar, options: any): Promise<THREE.AnimationClip> {
        /** @ts-ignore */
        let { MMDLoader } = await import('https://threejs.org/examples/jsm/loaders/MMDLoader.js');
        /** @ts-ignore */
        let { CCDIKSolver } = await import('https://threejs.org/examples/jsm/animation/CCDIKSolver.js');
        let loader = new MMDLoader();

        let nameMap: Record<string, string> = {};
        for (let m of this.boneMapping) {
            let boneObj = vrm.bones[m.bone];
            if (boneObj) {
                for (let name of m.nodeNames) {
                    nameMap[name] = boneObj.name;
                }
            }
        }
        let rotationOffsets: Record<string, THREE.Quaternion> = {};
        let boneTransforms: Record<string, [number, number]> = {};
        for (let [name, r] of Object.entries(this.rotationOffsets)) {
            let boneObj = vrm.bones[name];
            if (boneObj) {
                rotationOffsets[boneObj.name] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r);
                boneObj.traverse(o => {
                    boneTransforms[o.name] = [Math.cos(r), Math.sin(r)]; // TODO matrix
                });
            }
        }
        let morphTargetDictionary: Record<string, string> = {};
        for (let [name, morph] of Object.entries(this.blendShapeMap)) {
            let b = vrm.blendShapes[name];
            if (b) {
                morphTargetDictionary[morph] = name;
            }
        }

        /** @ts-ignore */
        vrm.model.morphTargetDictionary = morphTargetDictionary;
        let scale = 0.08; // MMD unit: 8cm
        let rotY = (p: number[], t: number[]) => {
            [p[0], p[2]] = [
                p[0] * t[0] - p[2] * t[1],
                p[0] * t[1] + p[2] * t[0]
            ];
        };
        let rotZ = (p: number[], t: number[]) => {
            [p[0], p[1]] = [
                p[0] * t[0] - p[1] * t[1],
                p[0] * t[1] + p[1] * t[0]
            ];
        };
        let rot = new THREE.Quaternion();
        let rot2 = new THREE.Quaternion();
        return await new Promise((resolve, reject) => {
            loader.loadVMD(url, async (vmd: { motions: any[] }) => {
                // Cancel lower body rotation
                let lowerBody = vmd.motions.filter(m => m.boneName == "下半身");
                if (lowerBody.length) {
                    lowerBody.sort((a, b) => a.frameNum - b.frameNum);
                    let update = (target: any[], inv: boolean) => {
                        target.sort((a, b) => a.frameNum - b.frameNum);
                        let i = 0;
                        for (let m of target) {
                            while (i < lowerBody.length - 1 && m.frameNum > lowerBody[i].frameNum) {
                                i++;
                            }
                            let r = rot2.fromArray(lowerBody[i].rotation);
                            if (i > 0 && m.frameNum < lowerBody[i].frameNum) {
                                let t = (m.frameNum - lowerBody[i - 1].frameNum) / (lowerBody[i].frameNum - lowerBody[i - 1].frameNum);
                                // TOOD: bezier interpolation.
                                r.slerp(rot.fromArray(lowerBody[i - 1].rotation), 1 - t);
                            }
                            if (inv) r.invert();
                            m.rotation = rot.fromArray(m.rotation).multiply(r).toArray();
                        }
                    };
                    update(vmd.motions.filter(m => m.boneName == "センター"), false);
                    update(vmd.motions.filter(m => m.boneName == "上半身"), true);
                    lowerBody.forEach(m => m.rotation = [0, 0, 0, 1]);
                }
                // convert bones
                for (let m of vmd.motions) {
                    if (nameMap[m.boneName]) {
                        m.boneName = nameMap[m.boneName];
                    }
                    let r = rotationOffsets[m.boneName];
                    if (r) {
                        m.rotation = rot.fromArray(m.rotation).premultiply(r).toArray();
                    }
                    m.position[0] *= scale;
                    m.position[1] *= scale;
                    m.position[2] *= scale;
                    rotY(m.position, [-1, 0]);
                    rotY(m.rotation, [-1, 0]);
                    let t = boneTransforms[m.boneName];
                    if (t) {
                        rotZ(m.position, t);
                        rotZ(m.rotation, t);
                    }
                }

                if (options.enableIK) {
                    /** @type {THREE.Bone[]} */
                    // @ts-ignore
                    let skeletonBones = vrm.model.skeleton.bones as any[];
                    let getTargetBone = (config: { target: string, parent?: any, bones: any[] }) => {
                        let targetIndex = skeletonBones.findIndex(b => b.name == config.target);
                        if (targetIndex >= 0) {
                            return targetIndex;
                        }
                        let parentObj = config.parent != null ? skeletonBones[getTargetBone(this.ikConfigs[config.parent])] : vrm.model;
                        let dummyBone = new THREE.Bone();
                        dummyBone.name = config.target;
                        skeletonBones.push(dummyBone);
                        parentObj.add(dummyBone);
                        parentObj.updateMatrixWorld();
                        let initPos = vrm.bones[config.bones[0]].getWorldPosition(new THREE.Vector3());
                        dummyBone.position.copy(initPos.applyMatrix4(parentObj.matrixWorld.clone().invert()));

                        // DEBUG
                        //let geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
                        //let material = new THREE.MeshBasicMaterial({
                        //	color: new THREE.Color("red"),
                        //	transparent: true, opacity: 0.4, depthTest: false,
                        //});
                        //dummyBone.add(new THREE.Mesh(geometry, material));
                        return skeletonBones.length - 1;
                    }
                    let iks = [];
                    for (let config of this.ikConfigs) {
                        // TODO: IK on/off setting from vmd.
                        if (vmd.motions.find(m => m.boneName == config.target) == undefined) {
                            continue;
                        }
                        let boneIndex = (name: string) => skeletonBones.findIndex(b => b == vrm.bones[name]);
                        let effectorIndex = boneIndex(config.bones[0]);
                        if (effectorIndex < 0) {
                            continue;
                        }
                        let links: any[] = [];
                        config.bones.slice(1).forEach(name => {
                            let index = boneIndex(name);
                            if (index >= 0) {
                                let link: { index: number, rotationMax?: any, rotationMin?: any } = { index: index };
                                let constraint = this.boneConstraints[name];
                                if (constraint) {
                                    link.rotationMax = constraint.max;
                                    link.rotationMin = constraint.min;
                                }
                                links.push(link);
                            }
                        });
                        let ik = {
                            target: getTargetBone(config),
                            effector: effectorIndex,
                            links: links,
                            maxAngle: 1,
                            iteration: 4,
                        };
                        iks.push(ik);
                    }
                    if (iks.length > 0) {
                        console.log(iks);
                        let ikSolver = new CCDIKSolver(vrm.model, iks);
                        vrm.setModule('MMDIK', { update: (t) => ikSolver.update() });
                    }
                }

                let clip = loader.animationBuilder.build(vmd, vrm.model) as THREE.AnimationClip;
                clip.tracks.forEach(tr => {
                    let m = tr.name.match(/.morphTargetInfluences\[(\w+)\]/);
                    if (m) {
                        let b = vrm.blendShapes[m[1]];
                        if (b && b.binds.length > 0) {
                            // todo clone track.
                            tr.name = b.binds[0].target.uuid + ".morphTargetInfluences[" + b.binds[0].index + "]";
                        }
                    }
                });
                resolve(clip);
            }, () => { }, reject);
        });
    }
}
