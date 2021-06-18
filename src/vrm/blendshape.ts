import { VRMAvatar } from "./avatar" // TODO: remove circular dependency

export class VRMBlendShapeUtil {
    _avatar: VRMAvatar;
    _currentShape: any = {};
    animatedMorph: any;
    morphAction: any;

    constructor(avatar: VRMAvatar) {
        this._avatar = avatar;
    }

    setBlendShapeWeight(name: string, value: number) {
        this._currentShape[name] = value;
        if (value == 0) {
            delete this._currentShape[name];
        }
        this._updateBlendShape()
    }

    getBlendShapeWeight(name: string) {
        return this._currentShape[name] || 0;
    }

    resetBlendShape() {
        this._currentShape = {};
        this._updateBlendShape();
    }

    startBlink(blinkInterval: number) {
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

    _updateBlendShape() {
        // TODO: refactoring. use THREE.AnimationBlendMode.
        let addWeights = (data: Record<string, any>, name: string, weights: number[]) => {
            let blend = this._avatar.blendShapes[name];
            blend && blend.binds.forEach(bind => {
                let tname = bind.target.name;
                let values = data[tname] || (data[tname] = new Array(bind.target.morphTargetInfluences.length * weights.length).fill(0));
                for (let t = 0; t < weights.length; t++) {
                    let i = t * bind.target.morphTargetInfluences.length + bind.index;
                    values[i] += Math.max(bind.weight * weights[t], values[i]); // blend func : max
                }
            });
        };
        let times = [0], trackdata: Record<string, any[]> = {};
        if (this.animatedMorph) {
            times = this.animatedMorph.times;
            addWeights(trackdata, this.animatedMorph.name, this.animatedMorph.values);
        }
        for (let [name, value] of Object.entries(this._currentShape)) {
            if (this._avatar.blendShapes[name]) {
                addWeights(trackdata, name, new Array(times.length).fill(value));
            }
        }
        let tracks = Object.entries(trackdata).map(([tname, values]) =>
            new THREE.NumberKeyframeTrack(tname + '.morphTargetInfluences', times, values));
        let nextAction = null;
        if (tracks.length > 0) {
            let clip = new THREE.AnimationClip('morph', undefined, tracks);
            nextAction = this._avatar.mixer.clipAction(clip).setEffectiveWeight(1.0).play();
        }
        this.morphAction && this.morphAction.stop();
        this.morphAction = nextAction;
    }
}
