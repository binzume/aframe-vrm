'use strict';

AFRAME.registerComponent('camera-control', {
    schema: {
    },
    init() {
        this.dragging = false;
        let cursorEl = document.getElementById('mouse-cursor');
        let canvasEl = this.el.sceneEl.canvas;
        let dragX = 0, dragY = 0;
        this.onMouseMove = (ev) => {
            let targetObj = this.el.object3D;
            let mat = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(dragY - ev.offsetY, dragX - ev.offsetX, 0), 0.005);
            targetObj.applyMatrix(mat); // TODO
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
    }
});

window.addEventListener('DOMContentLoaded', (ev) => {

    let models = [
        { name: 'AliciaSolid', src: 'assets/AliciaSolid/AliciaSolid.vrm' },
        { name: 'AliciaSolid_mmd', src: 'assets/AliciaSolid/AliciaSolid_mmd.vrm' },
        { name: 'Zunko', src: 'assets/Zunko/zunko_vrm.vrm' }
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

    document.getElementById('ik-toggle').addEventListener('change', (ev) => {
        if (ev.detail.value) {
            for (var el of document.querySelectorAll('[vrm]')) {
                el.removeAttribute('vrm-bvh');
                el.setAttribute('vrm-ik-poser', {});
            }
        } else {
            for (var el of document.querySelectorAll('[vrm]')) {
                el.removeAttribute('vrm-ik-poser');
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
