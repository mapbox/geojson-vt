const options = {
    debug: 2,
    updateable: true,
    // tolerance: 0,
    // indexMaxZoom: 0,
    maxZoom: 14
};

const padding = 8 / 512;
const totalExtent = 4096 * (1 + padding * 2);

let tileIndex;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const height = canvas.height = canvas.width = window.innerHeight - 125;
const ratio = height / totalExtent;
const pad = 4096 * padding * ratio;

const backButton = document.getElementById('back');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const addButton = document.getElementById('add');
const removeButton = document.getElementById('remove');
const generateButton = document.getElementById('generate');
const removeAllButton = document.getElementById('removeAll');
const modeButton = document.getElementById('mode');
const propsButton = document.getElementById('props');
const navLeftButton = document.getElementById('navLeft');
const navRightButton = document.getElementById('navRight');
const navUpButton = document.getElementById('navUp');
const navDownButton = document.getElementById('navDown');
const coordDiv = document.getElementById('coord');
const msSpan = document.getElementById('ms');

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
ctx.font = '36px Helvetica, Arial';
ctx.fillText('Drag a GeoJSON or TopoJSON here', height / 2, height / 2);

let animationId = null;
let isAnimating = false;
let rotatingRectangles = [];

let updateCount = 0;
let lastStatsTime = 0;
let lastUpdateTime = 0;
let updateTimes = [];
const UPDATE_TIMES_WINDOW = 30;

let useUpdateData = true;
let originalData = null;
let generatedFeatures = [];

let minX = -180;
let maxX = 180;
let minY = -90;
let maxY = 90;
let rectangleWidth = 30;
let rectangleHeight = 20;

function zoomIn(left, top) {
    if (z === options.maxZoom) return;

    z++;
    x *= 2;
    y *= 2;
    if (!left) x++;
    if (!top) y++;

    drawTile();
    drawSquare(left, top);

    backButton.textContent = `← z${z}`;
}

function zoomOut() {
    if (z === 0) return;

    z--;
    x = Math.floor(x / 2);
    y = Math.floor(y / 2);

    drawTile();

    backButton.textContent = `${z > 0 ? '← ' : ''}z${z}`;
}

function rotatePoint(cx, cy, x, y, angle) {
    const radians = (Math.PI / 180) * angle;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const nx = (cos * (x - cx)) + (sin * (y - cy)) + cx;
    const ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
    return [nx, ny];
}

function updateRotatingRectangles() {
    if (rotatingRectangles.length === 0) {
        return;
    }

    const updateStartTime = performance.now();

    if (isAnimating) {
        for (let i = 0; i < rotatingRectangles.length; i++) {
            const rect = rotatingRectangles[i];

            rect.angle = (rect.angle + 2) % 360;
            rect.x += rect.velocityX;
            rect.y += rect.velocityY;

            if (rect.x - rectangleWidth / 2 <= minX || rect.x + rectangleWidth / 2 >= maxX) {
                rect.velocityX = -rect.velocityX;
                rect.velocityX *= (0.9 + Math.random() * 0.2);
                rect.x = Math.max(minX + rectangleWidth / 2, Math.min(maxX - rectangleWidth / 2, rect.x));
            }
            if (rect.y - rectangleHeight / 2 <= minY || rect.y + rectangleHeight / 2 >= maxY) {
                rect.velocityY = -rect.velocityY;
                rect.velocityY *= (0.9 + Math.random() * 0.2);
                rect.y = Math.max(minY + rectangleHeight / 2, Math.min(maxY - rectangleHeight / 2, rect.y));
            }
        }
    }

    const rectangleFeatures = rotatingRectangles.map((rect, index) => {
        const corners = [
            [rect.x - rectangleWidth / 2, rect.y + rectangleHeight / 2],
            [rect.x + rectangleWidth / 2, rect.y + rectangleHeight / 2],
            [rect.x + rectangleWidth / 2, rect.y - rectangleHeight / 2],
            [rect.x - rectangleWidth / 2, rect.y - rectangleHeight / 2]
        ];

        const rotatedCorners = corners.map(([x, y]) => rotatePoint(rect.x, rect.y, x, y, rect.angle));
        rotatedCorners.push(rotatedCorners[0]);

        return {
            type: 'Feature',
            id: `rotating-rectangle-${index}`,
            properties: {
                name: `Rotating Rectangle ${index}`,
                color: rect.color
            },
            geometry: {
                type: 'Polygon',
                coordinates: [rotatedCorners]
            }
        };
    });

    if (useUpdateData) {
        const removeIds = rotatingRectangles.map((_, index) => `rotating-rectangle-${index}`);
        tileIndex.updateData({
            remove: removeIds,
            add: rectangleFeatures
        });
    } else {
        // Use new geojsonvt constructor (full rebuild)
        const allFeatures = {
            type: 'FeatureCollection',
            features: [...(originalData ? originalData.features : []), ...generatedFeatures, ...rectangleFeatures]
        };
        tileIndex = geojsonvt(allFeatures, options); //eslint-disable-line
    }

    drawTile();

    if (isAnimating) {
        lastUpdateTime = performance.now() - updateStartTime;

        updateTimes.push(lastUpdateTime);
        if (updateTimes.length > UPDATE_TIMES_WINDOW) {
            updateTimes.shift();
        }

        const avgTime = updateTimes.reduce((sum, t) => sum + t, 0) / updateTimes.length;
        msSpan.textContent = avgTime.toFixed(2) + ' ms';
    }
}

function startAnimation() {
    if (isAnimating) return;

    if (!tileIndex) {
        tileIndex = geojsonvt({type: 'FeatureCollection', features: []}, options); //eslint-disable-line
    }

    if (rotatingRectangles.length === 0) {
        addRandomRectangle();
    }

    isAnimating = true;
    lastStatsTime = performance.now();
    updateCount = 0;

    function animate() {
        if (!isAnimating) return;

        updateRotatingRectangles();
        updateCount++;

        animationId = requestAnimationFrame(animate);
    }
    animationId = requestAnimationFrame(animate);
}

function stopAnimation() {
    isAnimating = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    updateCount = 0;
    updateTimes = [];
    msSpan.textContent = '0.00 ms';
}

function generateRandomRectangles() {
    console.time('generate rectangles');

    if (!tileIndex) {
        tileIndex = geojsonvt({type: 'FeatureCollection', features: []}, options); //eslint-disable-line
    }

    const features = [];
    const startIndex = generatedFeatures.length;

    for (let i = 0; i < 50000; i++) {
        features.push(getRectangle(`bulk-${startIndex + i}`));
    }

    generatedFeatures.push(...features);

    tileIndex.updateData({
        add: features
    });

    console.timeEnd('generate rectangles');
    console.log(`Total generated features: ${generatedFeatures.length}`);

    drawTile();
}

function getRectangle(id, sizeMultiplier = 0.3) {
    const centerX = Math.random() * 360 - 180;
    const centerY = Math.random() * 180 - 90;
    const width = Math.random() * sizeMultiplier + 0.1;
    const height = Math.random() * sizeMultiplier + 0.1;
    const angle = Math.random() * 360;

    const corners = [
        [centerX - width / 2, centerY + height / 2],
        [centerX + width / 2, centerY + height / 2],
        [centerX + width / 2, centerY - height / 2],
        [centerX - width / 2, centerY - height / 2]
    ];

    const rotatedCorners = corners.map(([x, y]) => rotatePoint(centerX, centerY, x, y, angle));
    rotatedCorners.push(rotatedCorners[0]);

    return {
        type: 'Feature',
        id: `rect-${id}`,
        properties: {
            color: '#ff0000'
        },
        geometry: {
            type: 'Polygon',
            coordinates: [rotatedCorners]
        }
    };
}

function addRandomRectangle() {
    if (!tileIndex) {
        tileIndex = geojsonvt({type: 'FeatureCollection', features: []}, options); //eslint-disable-line
    }

    const newRect = {
        x: Math.random() * 360 - 180,
        y: Math.random() * 180 - 90,
        velocityX: (Math.random() - 0.5) * 2,
        velocityY: (Math.random() - 0.5) * 2,
        angle: Math.random() * 360,
        color: '#ff0000'
    };

    rotatingRectangles.push(newRect);

    updateRotatingRectangles();
}

function removeRandomRectangle() {
    if (!tileIndex || rotatingRectangles.length === 0) {
        return;
    }

    const lastIndex = rotatingRectangles.length - 1;
    const removeId = `rotating-rectangle-${lastIndex}`;

    rotatingRectangles.pop();

    tileIndex.updateData({
        remove: [removeId]
    });

    drawTile();

    if (isAnimating && rotatingRectangles.length === 0) {
        stopAnimation();
    }
}

function getRandomColor() {
    const colors = ['#0000ff', '#00ff00', '#ffa500', '#800080', '#ffff00', '#ff69b4', '#00ffff', '#ff00ff', '#ff1493', '#1e90ff', '#32cd32', '#ff4500', '#9370db', '#00ced1', '#ff6347', '#4169e1', '#ff8c00', '#ba55d3', '#20b2aa'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function randomizeRectangleProps() {
    if (!tileIndex || rotatingRectangles.length === 0) {
        return;
    }

    for (const rect of rotatingRectangles) {
        rect.color = getRandomColor();
    }

    const updates = rotatingRectangles.map((rect, index) => ({
        id: `rotating-rectangle-${index}`,
        addOrUpdateProperties: [
            {key: 'color', value: rect.color}
        ]
    }));

    tileIndex.updateData({
        update: updates
    });

    drawTile();
}

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

        originalData = data;
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

    coordDiv.textContent = `tile: z${z}-${x}-${y}`;
    ctx.clearRect(0, 0, height, height);

    if (!tile) {
        canvas.className = '';
        ctx.clearRect(0, 0, height, height);
        ctx.fillStyle = 'black';
        ctx.fillText(`No tile found at z${z}-${x}-${y}`, height / 2, height / 2);
    } else {
        const features = tile.features;

        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const type = feature.type;
            const color = feature.tags?.color || '#ff0000';

            ctx.strokeStyle = color;
            ctx.fillStyle = `${color}22`;

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
    }

    drawGrid();
    updateStatsDisplay();
}

canvas.onclick = function (e) {
    if (!tileIndex) return;

    const mouseX = e.layerX - 10;
    const mouseY = e.layerY - 10;
    const left = mouseX / height < 0.5;
    const top = mouseY / height < 0.5;

    zoomIn(left, top);
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

backButton.onclick = function () {
    if (!tileIndex) return;
    zoomOut();
};

startButton.onclick = function () {
    startAnimation();
};

stopButton.onclick = function () {
    stopAnimation();
};

generateButton.onclick = function () {
    generateRandomRectangles();
};

addButton.onclick = function () {
    addRandomRectangle();
};

removeButton.onclick = function () {
    removeRandomRectangle();
};

modeButton.onclick = function () {
    useUpdateData = !useUpdateData;
    const modeText = useUpdateData ? 'Update' : 'Rebuild';
    modeButton.textContent = `Mode: ${modeText}`;
    console.log(`Switched to ${modeText} mode`);
};

propsButton.onclick = function () {
    randomizeRectangleProps();
};

removeAllButton.onclick = function () {
    if (!tileIndex) return;
    stopAnimation();

    tileIndex.updateData({
        removeAll: true
    });

    generatedFeatures = [];
    originalData = null;
    rotatingRectangles = [];

    // Reset to root tile
    z = 0;
    x = 0;
    y = 0;

    drawTile();
    backButton.textContent = 'z0';
    coordDiv.textContent = 'tile: z0-0-0';

    updateStatsDisplay();
};

navLeftButton.onclick = function () {
    if (!tileIndex || x <= 0) return;
    x--;
    drawTile();
};

navRightButton.onclick = function () {
    if (!tileIndex) return;
    const maxTile = Math.pow(2, z) - 1;
    if (x >= maxTile) return;
    x++;
    drawTile();
};

navUpButton.onclick = function () {
    if (!tileIndex || y <= 0) return;
    y--;
    drawTile();
};

navDownButton.onclick = function () {
    if (!tileIndex) return;
    const maxTile = Math.pow(2, z) - 1;
    if (y >= maxTile) return;
    y++;
    drawTile();
};

function updateStatsDisplay() {
    const statsContent = document.getElementById('stats_content');

    if (!tileIndex || !tileIndex.stats) {
        statsContent.innerHTML = 'No data yet';
        return;
    }

    const stats = tileIndex.stats;
    const statsEntries = Object.entries(stats).sort((a, b) => {
        // Sort by zoom level (z0, z1, z2, etc.)
        const aNum = parseInt(a[0].substring(1));
        const bNum = parseInt(b[0].substring(1));
        return aNum - bNum;
    });

    if (statsEntries.length === 0) {
        statsContent.innerHTML = 'No tiles yet';
        return;
    }

    let html = '';
    for (const [key, count] of statsEntries) {
        html += `<div class="stat-row">
            <span class="stat-label">${key}:</span>
            <span class="stat-value">${count}</span>
        </div>`;
    }

    html += `<div class="stat-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
        <span class="stat-label">Total:</span>
        <span class="stat-value">${tileIndex.total || 0}</span>
    </div>`;

    statsContent.innerHTML = html;
}

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
