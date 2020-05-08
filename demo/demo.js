'use strict';

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
