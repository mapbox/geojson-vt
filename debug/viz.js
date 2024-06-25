
const options = {
    debug: 1
};

const padding = 8 / 512;
const totalExtent = 4096 * (1 + padding * 2);

let tileIndex;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const height = canvas.height = canvas.width = window.innerHeight - 5;
const ratio = height / totalExtent;
const pad = 4096 * padding * ratio;

const backButton = document.getElementById('back');

let x = 0;
let y = 0;
let z = 0;

if (devicePixelRatio > 1) {
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    canvas.width *= 2;
    canvas.height *= 2;
    ctx.scale(2, 2);
}

ctx.textAlign = 'center';
ctx.font = '48px Helvetica, Arial';
ctx.fillText('Drag a GeoJSON or TopoJSON here', height / 2, height / 2);

function humanFileSize(size) {
    const i = Math.floor(Math.log(size) / Math.log(1024));
    return `${Math.round(100 * (size / Math.pow(1024, i))) / 100} ${['B', 'kB', 'MB', 'GB'][i]}`;
}

canvas.ondragover = function () {
    this.className = 'hover';
    return false;
};
canvas.ondragend = function () {
    this.className = '';
    return false;
};
canvas.ondrop = function (e) {
    this.className = 'loaded';

    ctx.clearRect(0, 0, height, height);
    ctx.fillText('Thanks! Loading...', height / 2, height / 2);

    const reader = new FileReader();
    reader.onload = function (event) {
        console.log('data size', humanFileSize(event.target.result.length));
        console.time('JSON.parse');

        let data = JSON.parse(event.target.result);
        console.timeEnd('JSON.parse');

        if (data.type === 'Topology') {
            const firstKey = Object.keys(data.objects)[0];
            /* global topojson: false */
            data = topojson.feature(data, data.objects[firstKey]);
        }

        tileIndex = geojsonvt(data, options); //eslint-disable-line

        drawTile();
    };
    reader.readAsText(e.dataTransfer.files[0]);

    e.preventDefault();
    return false;
};

ctx.lineWidth = 1;

const halfHeight = height / 2;

function drawGrid() {
    ctx.strokeStyle = 'lightgreen';
    ctx.strokeRect(pad, pad, height - 2 * pad, height - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(pad, halfHeight);
    ctx.lineTo(height - pad, halfHeight);
    ctx.moveTo(halfHeight, pad);
    ctx.lineTo(halfHeight, height - pad);
    ctx.stroke();
}

function drawSquare(left, top) {
    ctx.strokeStyle = 'blue';
    ctx.strokeRect(left ? pad : halfHeight, top ? pad : halfHeight, halfHeight - pad, halfHeight - pad);
}

function drawTile() {

    console.time(`getting tile z${z}-${x}-${y}`);
    const tile = tileIndex.getTile(z, x, y);
    console.timeEnd(`getting tile z${z}-${x}-${y}`);

    if (!tile) {
        console.log('tile empty');
        zoomOut();
        return;
    }

    // console.log('z%d-%d-%d: %d points of %d', z, x, y, tile.numSimplified, tile.numPoints);
    // console.time('draw');

    ctx.clearRect(0, 0, height, height);

    const features = tile.features;

    ctx.strokeStyle = 'red';
    ctx.fillStyle = 'rgba(255,0,0,0.05)';

    for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const type = feature.type;

        ctx.beginPath();

        for (let j = 0; j < feature.geometry.length; j++) {
            const geom = feature.geometry[j];

            if (type === 1) {
                ctx.arc(geom[0] * ratio + pad, geom[1] * ratio + pad, 2, 0, 2 * Math.PI, false);
                continue;
            }

            for (let k = 0; k < geom.length; k++) {
                const p = geom[k];
                if (k) ctx.lineTo(p[0] * ratio + pad, p[1] * ratio + pad);
                else ctx.moveTo(p[0] * ratio + pad, p[1] * ratio + pad);
            }
        }

        if (type === 3 || type === 1) ctx.fill('evenodd');
        ctx.stroke();
    }
    drawGrid();

    // console.timeEnd('draw');
}

canvas.onclick = function (e) {
    if (!tileIndex || z === 14) return;

    const mouseX = e.layerX - 10;
    const mouseY = e.layerY - 10;
    const left = mouseX / height < 0.5;
    const top = mouseY / height < 0.5;

    z++;
    x *= 2;
    y *= 2;
    if (!left) x++;
    if (!top) y++;

    drawTile();
    drawSquare(left, top);

    if (z > 0) backButton.style.display = '';
};

canvas.onmousemove = function (e) {
    if (!tileIndex) return;

    const mouseX = e.layerX - 10;
    const mouseY = e.layerY - 10;
    const left = mouseX / height < 0.5;
    const top = mouseY / height < 0.5;
    drawGrid();
    drawSquare(left, top);
};

function zoomOut() {
    z--;
    x = Math.floor(x / 2);
    y = Math.floor(y / 2);
}

backButton.style.display = 'none';

backButton.onclick = function () {
    if (!tileIndex) return;
    zoomOut();
    drawTile();
    if (z === 0) backButton.style.display = 'none';
};

/*eslint-disable no-unused-vars */
function drillDown() {
    let i, j;
    console.time('drill down');
    for (i = 0; i < 10; i++) {
        for (j = 0; j < 10; j++) {
            tileIndex.getTile(7, 30 + i, 45 + j);
        }
    }
    for (i = 0; i < 10; i++) {
        for (j = 0; j < 10; j++) {
            tileIndex.getTile(8, 70 + i, 100 + j);
        }
    }
    console.timeEnd('drill down');
}
/*eslint-enable no-unused-vars */
