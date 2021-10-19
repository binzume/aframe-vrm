'use strict';

AFRAME.registerComponent('camera-control', {
    schema: {
        homePosition: { type: 'vec3', default: { x: 0, y: 0, z: 4 } },
        vrHomePosition: { type: 'vec3', default: { x: 0, y: 0, z: 0.5 } }
    },
    init() {
        this.dragging = false;
        this.el.sceneEl.addEventListener('exit-vr', ev => this.resetPosition());
        this.el.sceneEl.addEventListener('enter-vr', ev => this.resetPosition());
        this.resetPosition();
        let cursorEl = document.getElementById('mouse-cursor');
        let canvasEl = this.el.sceneEl.canvas;
        let dragX = 0, dragY = 0;
        let lookAt = new THREE.Vector3(0, 0, 0);
        let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        let distance = lookAt.clone().sub(this.el.getAttribute('position')).length();
        let updateCamera = () => {
            if (this.el.sceneEl.is('vr-mode')) {
                return;
            }
            let cameraObj = this.el.object3D;
            let cameraRot = new THREE.Quaternion().setFromEuler(rotation);
            let cameraVec = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraRot).multiplyScalar(distance);
            let cameraPos = lookAt.clone().add(cameraVec);
            cameraObj.position.copy(cameraObj.parent.worldToLocal(cameraPos));
            cameraObj.quaternion.copy(cameraRot.multiply(cameraObj.parent.getWorldQuaternion(new THREE.Quaternion())));
        };
        this.onMouseMove = (ev) => {
            let targetObj = this.el.object3D;

            let speedFactor = 0.005;
            if (ev.buttons & 6) {
                let v = new THREE.Vector3(dragX - ev.offsetX, -(dragY - ev.offsetY), 0).applyQuaternion(targetObj.quaternion);
                lookAt.add(v.multiplyScalar(speedFactor));
            } else {
                rotation.x += (dragY - ev.offsetY) * speedFactor;
                rotation.y += (dragX - ev.offsetX) * speedFactor;
            }
            updateCamera();
            dragX = ev.offsetX;
            dragY = ev.offsetY;
        };
        canvasEl.addEventListener('mousedown', (ev) => {
            if (!this.dragging && cursorEl.components.cursor.intersectedEl == null) {
                this.dragging = true;
                dragX = ev.offsetX;
                dragY = ev.offsetY;
                canvasEl.addEventListener('mousemove', this.onMouseMove);
            }
        });
        canvasEl.addEventListener('mouseup', (ev) => {
            this.dragging = false;
            canvasEl.removeEventListener('mousemove', this.onMouseMove);
        });
        canvasEl.addEventListener('wheel', ev => {
            let speedFactor = 0.005;
            distance = Math.max(0.1, distance + ev.deltaY * speedFactor);
            updateCamera();
        });
    },
    resetPosition() {
        let sky = this.el.sceneEl.querySelector('a-sky');
        if (sky) {
            sky.object3D.visible = !this.el.sceneEl.is('ar-mode');
        }
        if (this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode')) {
            this.el.setAttribute('position', this.data.vrHomePosition);
        } else {
            this.el.setAttribute('position', this.data.homePosition);
        }
        this.el.setAttribute('rotation', { x: 0, y: 0, z: 0 });
    }
});

AFRAME.registerComponent('pose-editor-window', {
    schema: {
        vrm: { type: 'selector', default: '[vrm]' },
    },
    init() {
        let listEl = this.el.querySelector('[name=item-list]');
        let list = this.list = listEl.components.xylist;
        let self = this;
        list.setAdapter({
            create() {
                let el = document.createElement('a-plane');
                el.setAttribute('width', 3);
                el.setAttribute('height', 0.48);
                el.setAttribute('color', 'black');
                el.setAttribute('xyrect', {});
                let sliderEl = document.createElement('a-xyrange');
                sliderEl.setAttribute('width', 1.5);
                sliderEl.setAttribute('position', { x: 0.8, y: 0, z: 0.05 });
                sliderEl.addEventListener('change', (ev) => {
                    self.vrm.setBlendShapeWeight(el.getAttribute('xylabel').value, ev.detail.value * 0.01);
                });
                el.appendChild(sliderEl);
                return el;
            },
            bind(position, el, contents) {
                el.setAttribute('xylabel', { value: contents[position], wrapCount: 16, renderingMode: 'canvas' });
                el.querySelector('a-xyrange').value = self.vrm.getBlendShapeWeight(contents[position]) * 100;
            }
        });
        this.el.querySelector('[name=reset-all-morph]').addEventListener('click', (ev) => {
            self.vrm.resetBlendShape();
            this.list.setContents(this.blendShapeNames);
        });
        this.onModelLoaded = (ev) => this.updateAvatar(ev.detail.avatar);
    },
    update() {
        this.remove();
        this.vrmEl = this.data.vrm;
        this.vrmEl.addEventListener('model-loaded', this.onModelLoaded);
        if (this.vrmEl.components.vrm.avatar) {
            this.updateAvatar(this.vrmEl.components.vrm.avatar);
        }
    },
    updateAvatar(avatar) {
        this.vrm = avatar;
        this.blendShapeNames = Object.keys(avatar.blendShapes);
        this.list.setContents(this.blendShapeNames);
    },
    remove() {
        if (this.vrmEl) {
            this.vrmEl.removeEventListener('model-loaded', this.onModelLoaded);
        }
    }
});

AFRAME.registerComponent('hand-controller', {
    schema: {
        color: { default: '#00ff00' }
    },
    init() {
        this.hands = {};
        this.physics = null;
        this._tmpQ0 = new THREE.Quaternion();
        this._tmpV0 = new THREE.Vector3();
        this._tmpV1 = new THREE.Vector3();
        if (this.el.sceneEl.systems.webxr) {
            this.el.sceneEl.setAttribute('webxr', 'optionalFeatures:bounded-floor,hand-tracking');
            let hand0 = this.el.sceneEl.renderer.xr.getHand(0);
            hand0.addEventListener('connected', ev => this._handConnected(hand0, ev, 'leftHand'));
            hand0.addEventListener('disconnected', ev => this._handDisconnected(hand0, ev, 'leftHand'));
            let hand1 = this.el.sceneEl.renderer.xr.getHand(1);
            hand1.addEventListener('connected', ev => this._handConnected(hand1, ev, 'rightHand'));
            hand1.addEventListener('disconnected', ev => this._handDisconnected(hand1, ev, 'rightHand'));
        }
    },
    tick() {
        let hands = Object.values(this.hands);
        if (hands.length == 0) {
            this.pause();
        }
        hands.forEach(hand => {
            hand.binds.forEach(([node, obj, body]) => {
                if (body) {
                    body.position.copy(node.getWorldPosition(this._tmpV0));
                    body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
                }
            });
            hand.fingerLen = hand.fingers.map(n => {
                let len = 0;
                for (let i = n - 3; i < n; i++) {
                    len += this._tmpV0.copy(hand.hand.joints[i + 1].position).sub(hand.hand.joints[i].position).length();
                }
                return len;
            });
            let dd = hand.fingers.map((n, i) => { // 4
                let tip = hand.hand.joints[n];
                let root = hand.hand.joints[n - 3];
                let tipPos = tip.getWorldPosition(this._tmpV0);
                let rootPos = root.getWorldPosition(this._tmpV1);
                if (hand.fingerLen[i] > 0.01) {
                    let r = tipPos.sub(rootPos).length() / hand.fingerLen[i];
                    if (r < 0.6 || r > 0.9) {
                        return r < 0.6;
                    }
                }
                return undefined;
            });
            hand.fingerState = dd;
            let open = dd[0] == false && dd[1] == false && dd[2] == false && dd[3] == false && dd[4] == false;
            if (!hand.open && open) {
                let el = document.getElementById(hand.name);
                if (el) {
                    el.setAttribute('raycaster', 'far', 0.04);
                }
            }
            hand.open = open;
            let pointing = dd[1] == false && dd[2] == true && dd[3] == true && dd[4] == true;
            if (!hand.pointing && pointing) {
                hand.pointing = pointing;
                let el = document.getElementById(hand.name);
                if (el) {
                    el.setAttribute('raycaster', 'far', Infinity);
                }
            }
            hand.pointing = pointing;
        });
    },
    remove() {
        let names = Object.keys(this.hands);
        names.forEach(name => {
            this.el.removeObject3D(name);
        });
    },
    _handConnected(hand, ev, name) {
        if (!ev.data.hand || this.hands[name]) {
            return;
        }
        if (globalThis.CANNON && this.el.sceneEl.systems.physics && this.el.sceneEl.systems.physics.driver) {
            this.physics = { driver: this.el.sceneEl.systems.physics.driver };
        }
        console.log("hand", hand, ev);
        let geometry = new THREE.BoxGeometry(1, 1, 1);
        let material = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.data.color) });
        material.transparent = true;
        material.opacity = 0.4;

        this.el.setObject3D(name, hand);
        let handData = { hand: hand, name: name, binds: [], fingers: [4, 9, 14, 19, 24] };
        this.hands[name] = handData;
        for (let joint of hand.joints) {
            let cube = new THREE.Mesh(geometry, material);
            let scale = Math.min(joint.jointRadius || 0.015, 0.05);
            cube.scale.set(scale, scale, scale);
            joint.add(cube);
            let body = null;
            if (this.physics) {
                body = new CANNON.Body({
                    mass: 0,
                    collisionFilterGroup: 4,
                    collisionFilterMask: ~4
                });
                body.addShape(new CANNON.Sphere(scale * 0.5));
                this.physics.driver.addBody(body);
            }
            handData.binds.push([joint, cube, body]);
        }
        this.play();

        for (let controllerEl of this.el.sceneEl.querySelectorAll('[generic-tracked-controller-controls]')) {
            controllerEl.setAttribute('generic-tracked-controller-controls', { defaultModel: false });
            if (this.physics) {
                controllerEl.removeAttribute('static-body');
            }
            console.log(controllerEl);
        }
    },
    _handDisconnected(hand, ev, name) {
        this.el.removeObject3D(name);
        if (this.hands[name]) {
            this.hands[name].binds.forEach(([node, obj, body]) => {
                obj.parent.remove(obj);
                if (body) {
                    this.physics.driver.removeBody(body);
                }
            });
            delete this.hands[name];
        }
    }
});


AFRAME.registerComponent('draggable-body', {
    dependencies: ['xy-drag-control'],
    init() {
        let el = this.el;
        let dragging = false;
        el.addEventListener('mousedown', ev => {
            if (dragging) {
                return;
            }
            let velocity = new THREE.Vector3(0, 0, 0);
            let prevPos = el.object3D.position.clone();
            let prevTime = el.sceneEl.time;
            let timer = setInterval(() => {
                let dt = el.sceneEl.time - prevTime;
                if (dt > 0) {
                    velocity.copy(el.object3D.position).sub(prevPos).multiplyScalar(1000 / dt);
                }
                prevPos.copy(el.object3D.position);
                prevTime = el.sceneEl.time;
            }, 50);
            // set mass = 0
            let draggingObjectMass = el.body.mass;
            dragging = true;
            el.body.mass = 0;
            el.addEventListener('mouseup', ev => {
                dragging = false;
                clearInterval(timer);
                // restore mass
                el.body.mass = draggingObjectMass;
                el.body.velocity.copy(velocity);
            }, { once: true });
        });
    }
});


window.addEventListener('DOMContentLoaded', (ev) => {

    let models = [
        { name: 'AliciaSolid', src: 'assets/AliciaSolid/AliciaSolid.vrm' },
        { name: 'AliciaSolid_mmd', src: 'assets/AliciaSolid/AliciaSolid_mmd.vrm' },
        { name: '千駄ヶ谷 渋', src: 'assets/VRoid/8801565727279527051.vrm' },
        { name: '千駄ヶ谷 篠', src: 'assets/VRoid/4537789756845150029.vrm' },
        { name: '東北ずん子', src: 'assets/Zunko/zunko_vrm.vrm' }
    ];
    let motions = [
        'assets/bvhfiles/la_bvh_sample01.bvh',
        'assets/bvhfiles/la_bvh_sample02.bvh',
        'assets/bvhfiles/la_bvh_sample03.bvh'
    ];
    let vrmEl = document.getElementById('avatar');
    let listEl = document.getElementById('model-list');
    let list = listEl.components.xylist;
    list.setAdapter({
        create(parent) {
            let el = document.createElement('a-plane');
            el.setAttribute('width', 3);
            el.setAttribute('height', 0.45);
            el.setAttribute('color', 'black');
            el.setAttribute('xyrect', {});
            return el;
        },
        bind(position, el, contents) {
            el.setAttribute('xylabel', { value: contents[position].name, wrapCount: 16 });
        }
    });
    list.setContents(models);
    listEl.addEventListener('clickitem', (ev) => {
        if (!vrmEl.hasAttribute('vrm-poser')) {
            vrmEl.setAttribute('vrm-anim', { src: '' });
        }
        vrmEl.setAttribute('vrm', { src: models[ev.detail.index].src });
    });

    let files = motions.map(path => { let m = path.match(/([^\/]+)\.\w+$/); return m ? m[1] : path }).join(',');
    document.getElementById('animation-select').setAttribute('values', files);
    document.getElementById('animation-select').addEventListener('change', (ev) => {
        vrmEl.setAttribute('vrm-anim', { src: motions[ev.detail.index], format: '' });
    });

    document.getElementById('skeleton-toggle').addEventListener('change', (ev) => {
        if (ev.detail.value) {
            vrmEl.setAttribute('vrm-skeleton', {});
        } else {
            vrmEl.removeAttribute('vrm-skeleton');
        }
    });

    document.getElementById('blink-toggle').addEventListener('change', (ev) => {
        vrmEl.setAttribute('vrm', 'blink', ev.detail.value);
    });

    document.getElementById('lookat-toggle').addEventListener('change', (ev) => {
        vrmEl.setAttribute('vrm', 'lookAt', ev.detail.value ? 'a-camera' : null);
    });

    document.getElementById('first-person-toggle').addEventListener('change', (ev) => {
        vrmEl.setAttribute('vrm', 'firstPerson', ev.detail.value ? 'a-camera' : null);
    });

    document.getElementById('physics-toggle').value = vrmEl.getAttribute('vrm').enablePhysics;
    document.getElementById('physics-toggle').addEventListener('change', (ev) => {
        vrmEl.setAttribute('vrm', 'enablePhysics', ev.detail.value);
    });

    document.getElementById('bone-toggle').addEventListener('change', (ev) => {
        let containerEl = document.querySelector('#bone-buttons');
        if (ev.detail.value) {
            vrmEl.removeAttribute('vrm-anim');
            vrmEl.setAttribute('vrm-poser', {});
            containerEl.setAttribute('visible', true);
        } else {
            vrmEl.removeAttribute('vrm-poser');
            containerEl.setAttribute('visible', false);
        }
    });

    document.getElementById('bone-save-button').addEventListener('click', (ev) => {
        if (vrmEl.hasAttribute('vrm-poser')) {
            let poseJson = JSON.stringify(vrmEl.components['vrm-poser'].getPoseData(true));
            localStorage.setItem('vrm-pose0', poseJson);
        }
    });

    document.getElementById('bone-load-button').addEventListener('click', (ev) => {
        if (vrmEl.hasAttribute('vrm-poser')) {
            let poseJson = localStorage.getItem('vrm-pose0');
            if (poseJson) {
                vrmEl.components['vrm-poser'].setPoseData(JSON.parse(poseJson));
            }
        }
    });

    document.getElementById('stop-animation-button').addEventListener('click', (ev) => {
        vrmEl.removeAttribute('vrm-anim');
        vrmEl.components.vrm.avatar.restPose();
    });

    window.addEventListener('dragover', (ev) => {
        ev.preventDefault();
    });
    window.addEventListener('drop', (ev) => {
        ev.preventDefault();
        for (let file of ev.dataTransfer.files) {
            let namelc = file.name.toLowerCase();
            if (namelc.endsWith('.vrm') || namelc.endsWith('.glb')) {
                let url = URL.createObjectURL(file);
                vrmEl.removeAttribute('vrm-poser');
                vrmEl.setAttribute('vrm-anim', { src: '' });
                vrmEl.setAttribute('vrm', { 'src': url });
                models.push({ name: file.name, src: url });
                list.setContents(models);
            } else if (namelc.endsWith('.bvh') || namelc.endsWith('.vmd')) {
                vrmEl.setAttribute('vrm-anim', { src: URL.createObjectURL(file), format: namelc.endsWith('.bvh') ? 'bvh' : '' });
            }
        }
    });
}, { once: true });
