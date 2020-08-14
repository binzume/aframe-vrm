'use strict';

AFRAME.registerComponent('camera-control', {
    schema: {
    },
    init() {
        this.dragging = false;
        let cursorEl = document.getElementById('mouse-cursor');
        let canvasEl = this.el.sceneEl.canvas;
        let dragX = 0, dragY = 0;
        let lookAt = new THREE.Vector3(0, 1.5, 0);
        let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        let distance = 3;
        let updateCamera = () => {
            let targetObj = this.el.object3D;
            let cameraRot = new THREE.Quaternion().setFromEuler(rotation);
            let cameraVec = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraRot).multiplyScalar(distance);
            let cameraPos = lookAt.clone().add(cameraVec);
            targetObj.position.copy(targetObj.parent.worldToLocal(cameraPos));
            targetObj.quaternion.copy(cameraRot.multiply(targetObj.parent.getWorldQuaternion(new THREE.Quaternion())));
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
            el.components.vrm.lookAtTarget = ev.detail.value ? el.sceneEl.camera : null;
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
