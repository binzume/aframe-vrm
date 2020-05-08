window.addEventListener('DOMContentLoaded', async (ev) => {

    window.addEventListener('dragover', (ev) => {
        ev.preventDefault();
    });
    window.addEventListener('drop', (ev) => {
        ev.preventDefault();
        for (let file of ev.dataTransfer.files) {
            let namelc = file.name.toLowerCase();
            if (namelc.endsWith(".vrm") || namelc.endsWith(".glb")) {
                document.querySelector('[vrm]').setAttribute('vrm', { 'src': URL.createObjectURL(file) });
            } else if (namelc.endsWith(".bvh")) {
                document.querySelector('[vrm]').setAttribute('vrm-bvh', { 'src': URL.createObjectURL(file) });
            }
        }
    });

}, { once: true });
