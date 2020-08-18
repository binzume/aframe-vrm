'use strict';

AFRAME.registerComponent('camera-control', {
    schema: {
        homePosition: { type: 'vec3', default: { x: 0, y: 1.5, z: 0 } },
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
        let lookAt = new THREE.Vector3(0, 1.6, 0);
        let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        let distance = lookAt.clone().sub(this.el.getAttribute('position')).length();
        let updateCamera = () => {
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
        if (this.el.sceneEl.is('vr-mode')) {
            this.el.setAttribute('position', this.data.vrHomePosition);
        } else {
            this.el.setAttribute('position', this.data.homePosition);
        }
    }
});

AFRAME.registerComponent('pose-editor-window', {
    schema: {
    },
    init() {
        this.vrmEl = document.querySelector('[vrm]');
        this.vrmEl.addEventListener('vrmload', (ev) => this.updateAvatar(ev.detail));
        let listEl = this.el.querySelector('#item-list');
        let list = this.list = listEl.components.xylist;
        listEl.setAttribute('xylist', 'itemHeight', 0.5);
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
                    self.vrm.setMorph(el.components.xylabel.data.value, ev.detail.value * 0.01);
                });
                el.appendChild(sliderEl);
                return el;
            },
            bind(position, el, contents) {
                el.setAttribute('xylabel', { value: contents[position], wrapCount: 16, renderingMode: 'canvas' });
                el.querySelector('a-xyrange').value = self.vrm.getMorphValue(contents[position]) * 100;
            }
        });
        this.el.querySelector('#reset-all-morph').addEventListener('click', (ev) => {
            self.vrm.resetAllMorph();
            this.list.setContents(this.blendShapeNames);
        });
    },
    updateAvatar(vrm) {
        this.vrm = vrm;
        this.blendShapeNames = Object.keys(vrm.blendShapes);
        this.list.setContents(this.blendShapeNames);
    },
    remove() {
    }
});

window.addEventListener('DOMContentLoaded', (ev) => {

    let models = [
        { name: 'AliciaSolid', src: 'assets/AliciaSolid/AliciaSolid.vrm' },
        { name: 'AliciaSolid_mmd', src: 'assets/AliciaSolid/AliciaSolid_mmd.vrm' },
        { name: 'Zunko', src: 'assets/Zunko/zunko_vrm.vrm' }
    ];
    let motions = [
        'assets/bvhfiles/la_bvh_sample01.bvh',
        'assets/bvhfiles/la_bvh_sample02.bvh',
        'assets/bvhfiles/la_bvh_sample03.bvh'
    ];
    let listEl = document.getElementById('model-list');
    let list = listEl.components.xylist;
    listEl.setAttribute('xylist', 'itemHeight', 0.5);
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
        document.querySelector('[vrm]').setAttribute('vrm', { 'src': models[ev.detail.index].src });
    });

    let files = motions.map(path => { let m = path.match(/([^\/]+)\.\w+$/); return m ? m[1] : path }).join(',');
    document.getElementById('animation-select').setAttribute('values', files);
    document.getElementById('animation-select').addEventListener('change', (ev) => {
        document.querySelector('[vrm]').setAttribute('vrm-bvh', { 'src': motions[ev.detail.index] });
    });

    document.getElementById('skeleton-toggle').addEventListener('change', (ev) => {
        if (ev.detail.value) {
            for (var el of document.querySelectorAll('[vrm]')) {
                el.setAttribute('vrm-skeleton', {});
            }
        } else {
            for (var el of document.querySelectorAll('[vrm]')) {
                el.removeAttribute('vrm-skeleton');
            }
        }
    });

    document.getElementById('blink-toggle').addEventListener('change', (ev) => {
        for (var el of document.querySelectorAll('[vrm]')) {
            el.setAttribute('vrm', 'blink', ev.detail.value);
        }
    });

    document.getElementById('lookat-toggle').addEventListener('change', (ev) => {
        for (var el of document.querySelectorAll('[vrm]')) {
            el.components.vrm.avatar.lookAtTarget = ev.detail.value ? el.sceneEl.camera : null;
        }
    });

    document.getElementById('bone-toggle').addEventListener('change', (ev) => {
        if (ev.detail.value) {
            for (var el of document.querySelectorAll('[vrm]')) {
                el.removeAttribute('vrm-bvh');
                el.setAttribute('vrm-poser', {});
            }
        } else {
            for (var el of document.querySelectorAll('[vrm]')) {
                el.removeAttribute('vrm-poser');
            }
        }
    });

    document.getElementById('stop-animation-button').addEventListener('click', (ev) => {
        for (var el of document.querySelectorAll('[vrm]')) {
            el.removeAttribute('vrm-bvh');
        }
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
                document.querySelector('[vrm]').setAttribute('vrm', { 'src': url });
                models.push({ name: file.name, src: url });
                list.setContents(models);
            } else if (namelc.endsWith('.bvh')) {
                document.querySelector('[vrm]').setAttribute('vrm-bvh', { 'src': URL.createObjectURL(file) });
            }
        }
    });

}, { once: true });
