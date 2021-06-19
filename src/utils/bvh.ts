import { VRMAvatar } from '../vrm/avatar';

export class BVHLoaderWrapper {
    public async load(url: string, avatar: VRMAvatar, options: any): Promise<THREE.AnimationClip> {
        /** @ts-ignore */
        let { BVHLoader } = await import('https://threejs.org/examples/jsm/loaders/BVHLoader.js');
        return await new Promise((resolve, reject) => {
            new BVHLoader().load(url, (result: any) => {
                if (options.convertBone) {
                    this.fixTrackName(result.clip, avatar);
                }
                result.clip.tracks = result.clip.tracks.filter((t: any) => !t.name.match(/position/) || t.name.match(avatar.bones.hips.name));
                resolve(result.clip);
            });
        });
    }

    protected convertBoneName(name: string): string {
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
        return name.charAt(0).toLowerCase() + name.slice(1);
    }

    protected fixTrackName(clip: THREE.AnimationClip, avatar: VRMAvatar): void {
        clip.tracks.forEach(t => {
            // '.bones[Chest].quaternion'
            t.name = t.name.replace(/bones\[(\w+)\]/, (m, name) => {
                let bone = avatar.bones[this.convertBoneName(name)];
                return 'bones[' + (bone != null ? bone.name : 'NODE_NOT_FOUND') + ']';
            });
            t.name = t.name.replace('ToeBase', 'Foot');
            if (t.name.match(/quaternion/)) {
                t.values = t.values.map((v, i) => i % 2 === 0 ? -v : v);
            }
            if (t.name.match(/position/)) {
                t.values = t.values.map((v, i) => (i % 3 === 1 ? v : -v) * 0.09); // TODO
            }
        });
        clip.tracks = clip.tracks.filter(t => !t.name.match(/NODE_NOT_FOUND/));
    }
}
