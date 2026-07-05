function parseStructure(structureStr) {let activeKeys = [];let constraints = [];let depths = {};

if (!structureStr || typeof structureStr !== 'string') {
    return { activeKeys, constraints, depths };
}

const cleanStr = structureStr.replace(/\s+/g, '');
const tokens = cleanStr.match(/[^/*()]+|[\/\*\(\)]/g);

if (!tokens) return { activeKeys, constraints, depths };

let pos = 0;

function parseExpression() {
    let left = parseTerm();
    while (pos < tokens.length && tokens[pos] === '*') {
        pos++;
        let right = parseTerm();
        left = { roots: [...left.roots, ...right.roots], leaves: [...left.leaves, ...right.leaves] };
    }
    return left;
}

function parseTerm() {
    let left = parseFactor();
    while (pos < tokens.length && tokens[pos] === '/') {
        pos++;
        let right = parseFactor();
        left.leaves.forEach(l => {
            right.roots.forEach(r => {
                if (!constraints.find(c => c.parent === l && c.child === r)) {
                    constraints.push({ parent: l, child: r });
                }
            });
        });
        left = { roots: left.roots, leaves: right.leaves };
    }
    return left;
}

function parseFactor() {
    if (pos >= tokens.length) return { roots: [], leaves: [] };
    if (tokens[pos] === '(') {
        pos++;
        let expr = parseExpression();
        if (pos < tokens.length && tokens[pos] === ')') pos++;
        return expr;
    } else {
        let val = tokens[pos++];
        if (!activeKeys.includes(val)) { activeKeys.push(val); depths[val] = 0; }
        return { roots: [val], leaves: [val] };
    }
}

parseExpression();
return { activeKeys, constraints, depths };

}

function isValidHierarchyOrder(proposedArray, constraints) {for (let rule of constraints) {let parentIdx = proposedArray.indexOf(rule.parent);let childIdx = proposedArray.indexOf(rule.child);if (parentIdx !== -1 && childIdx !== -1 && parentIdx > childIdx) return false;}return true;}

const DEPTH_COLORS = ['#e63946', '#f4a261', '#4169E1', '#2a9d8f', '#264653', '#1d3557'];

window.init_hierarchy = function(el, x) {el.querySelectorAll('.hierarchy-addon-container').forEach(ghost => ghost.remove());

if (window.getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
}

let structureStr = x.hierarchy_structure;
if (!structureStr) return;

let { activeKeys, constraints } = parseStructure(structureStr);
const allHierarchyKeys = [...activeKeys];

let disabledKeys = new Set();

const styleId = 'hierarchy-addon-master-styles';
if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .hierarchy-chip {
            background: #ffffff; border: 1px solid #cbd5e1; border-radius: 20px;
            padding: 6px 16px; display: flex; align-items: center; gap: 10px;
            font-family: system-ui, -apple-system, sans-serif; font-size: 14px; font-weight: 500;
            color: #334155; box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: grab;
            transition: all 0.15s ease;
        }
        .hierarchy-chip:active { cursor: grabbing; transform: scale(0.98); }
        .hierarchy-chip.dragging { opacity: 0.4; }
        .hierarchy-chip.drag-over-top { border-top: 2px solid #3b82f6; }
        .hierarchy-chip.drag-over-bottom { border-bottom: 2px solid #3b82f6; }
        .hierarchy-chip .chip-color { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex-shrink: 0; transition: all 0.15s ease; }

        .hierarchy-chip.disabled {
            background: #f1f5f9; border-color: #e2e8f0; border-style: dashed;
            color: #94a3b8; box-shadow: none; cursor: pointer;
        }
        .hierarchy-chip.disabled .chip-color {
            filter: grayscale(100%); opacity: 0.4;
        }

        .error-shake { animation: chip-shake 0.4s; }
        @keyframes chip-shake {
            0% { transform: translateX(0); } 25% { transform: translateX(-4px); }
            50% { transform: translateX(4px); } 75% { transform: translateX(-4px); } 100% { transform: translateX(0); }
        }
    `;
    document.head.appendChild(style);
}

let container = document.createElement('div');
container.className = 'hierarchy-addon-container';
container.style.cssText = `
    position: absolute; right: 20px !important; left: auto !important; top: 50%; transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    border: 1px solid rgba(203, 213, 225, 0.8); border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.15);
    z-index: 1000; cursor: grab; padding: 0; user-select: none;
    min-width: 60px; min-height: 60px;
`;
el.appendChild(container);

let innerWrapper = document.createElement('div');
innerWrapper.style.cssText = `
    display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
    padding: 12px 16px 12px 28px; width: max-content; height: max-content;
    transform-origin: top left; position: relative; pointer-events: none;
`;
container.appendChild(innerWrapper);

const handleDefs = [
    { dir: 'n', cursor: 'ns-resize', style: 'top: -5px; left: 10px; right: 10px; height: 10px;' },
    { dir: 's', cursor: 'ns-resize', style: 'bottom: -5px; left: 10px; right: 10px; height: 10px;' },
    { dir: 'e', cursor: 'ew-resize', style: 'right: -5px; top: 10px; bottom: 10px; width: 10px;' },
    { dir: 'w', cursor: 'ew-resize', style: 'left: -5px; top: 10px; bottom: 10px; width: 10px;' },
    { dir: 'nw', cursor: 'nwse-resize', style: 'top: -5px; left: -5px; width: 15px; height: 15px;' },
    { dir: 'ne', cursor: 'nesw-resize', style: 'top: -5px; right: -5px; width: 15px; height: 15px;' },
    { dir: 'sw', cursor: 'nesw-resize', style: 'bottom: -5px; left: -5px; width: 15px; height: 15px;' },
    { dir: 'se', cursor: 'nwse-resize', style: 'bottom: -5px; right: -5px; width: 15px; height: 15px;' }
];

let activeResizeHandle = null;
let startX, startY, startLeft, startTop, startW, startH, currentAspect;

const startResize = (dir) => (e) => {
    e.stopPropagation(); e.preventDefault();
    activeResizeHandle = dir;
    startW = container.offsetWidth; startH = container.offsetHeight;
    currentAspect = startW / startH; startX = e.clientX; startY = e.clientY;
    let rect = container.getBoundingClientRect(); let parentRect = el.getBoundingClientRect();
    startLeft = rect.left - parentRect.left; startTop = rect.top - parentRect.top;
    container.style.right = 'auto'; container.style.transform = 'none';
    container.style.left = startLeft + 'px'; container.style.top = startTop + 'px';
};

handleDefs.forEach(def => {
    let h = document.createElement('div');
    h.style.cssText = `position: absolute; z-index: 1002; cursor: ${def.cursor}; ${def.style}`;
    h.addEventListener('mousedown', startResize(def.dir));
    container.appendChild(h);
});

let isDraggingPanel = false;
container.addEventListener('mousedown', function(e) {
    if (e.target.closest('.hierarchy-chip')) return;
    isDraggingPanel = true; startX = e.clientX; startY = e.clientY;
    let rect = container.getBoundingClientRect(); let parentRect = el.getBoundingClientRect();
    startLeft = rect.left - parentRect.left; startTop = rect.top - parentRect.top;
    container.style.right = 'auto'; container.style.transform = 'none';
    container.style.left = startLeft + 'px'; container.style.top = startTop + 'px';
    container.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', function(e) {
    if (activeResizeHandle) {
        e.preventDefault();
        let dx = e.clientX - startX; let dy = e.clientY - startY;
        let newW = startW; let newH = startH; let newLeft = startLeft; let newTop = startTop; const minSize = 60;
        if (['e', 'se', 'ne'].includes(activeResizeHandle)) newW = Math.max(minSize, startW + dx);
        if (['w', 'sw', 'nw'].includes(activeResizeHandle)) { newW = Math.max(minSize, startW - dx); newLeft = startLeft + (startW - newW); }
        if (['se', 'sw', 'ne', 'nw'].includes(activeResizeHandle)) { newH = newW / currentAspect; if (['ne', 'nw'].includes(activeResizeHandle)) newTop = startTop + (startH - newH); }
        else { if (activeResizeHandle === 's') newH = Math.max(minSize, startH + dy); if (activeResizeHandle === 'n') { newH = Math.max(minSize, startH - dy); newTop = startTop + (startH - newH); } }
        container.style.width = newW + 'px'; container.style.height = newH + 'px'; container.style.left = newLeft + 'px'; container.style.top = newTop + 'px';
        return;
    }
    if (isDraggingPanel) {
        e.preventDefault(); let dx = e.clientX - startX; let dy = e.clientY - startY;
        container.style.left = (startLeft + dx) + 'px'; container.style.top = (startTop + dy) + 'px';
    }
});

document.addEventListener('mouseup', function() {
    activeResizeHandle = null; if (isDraggingPanel) { isDraggingPanel = false; container.style.cursor = 'grab'; }
});

function cloneTrace(t) {
    let nt = Object.assign({}, t);
    if (t.line) nt.line = Object.assign({}, t.line); else nt.line = {};
    if (t.marker) nt.marker = Object.assign({}, t.marker); else nt.marker = {};
    return nt;
}

function updatePlotlyTraces(displayKeys) {
    let plotEl = el.classList.contains('js-plotly-plot') ? el : el.querySelector('.js-plotly-plot');
    if (!plotEl || !plotEl.data) { setTimeout(() => updatePlotlyTraces(displayKeys), 150); return; }
    let newTraces = [];

    plotEl.data.forEach(trace => {
        if (!trace.type || !trace.type.includes('scatter')) { newTraces.push(cloneTrace(trace)); return; }
        if (trace.x && trace.x.includes(null)) {
            let cx=[], cy=[], ct=[], ch=[]; let hasText = Array.isArray(trace.text); let hasHover = Array.isArray(trace.hovertext);
            for (let i = 0; i < trace.x.length; i++) {
                if (trace.x[i] == null || trace.y[i] == null) {
                    if (cx.length > 0) {
                        let nt = cloneTrace(trace); nt.x = cx; nt.y = cy; if(hasText) nt.text = ct; if(hasHover) nt.hovertext = ch; delete nt.uid; newTraces.push(nt); cx=[]; cy=[]; ct=[]; ch=[];
                    }
                } else {
                    cx.push(trace.x[i]); cy.push(trace.y[i]); if(hasText) ct.push(trace.text[i]); if(hasHover) ch.push(trace.hovertext[i]);
                }
            }
            if (cx.length > 0) { let nt = cloneTrace(trace); nt.x = cx; nt.y = cy; if(hasText) nt.text = ct; if(hasHover) nt.hovertext = ch; delete nt.uid; newTraces.push(nt); }
        } else { newTraces.push(cloneTrace(trace)); }
    });

    newTraces.forEach((st) => {
        if (!st.type || !st.type.includes('scatter')) return;
        let textArr = Array.isArray(st.text) ? st.text : (Array.isArray(st.hovertext) ? st.hovertext : [st.text || st.hovertext]); let bestText = ""; let minAggCount = 999;
        for (let i = 0; i < textArr.length; i++) {
            let t = textArr[i]; if (typeof t !== 'string' || t.length < 5) continue;
            let clean = t.toLowerCase().replace(/\s+/g, ''); let aggCount = (clean.match(/<aggregated>|&lt;aggregated&gt;|:na/g) || []).length;
            if (aggCount < minAggCount) { minAggCount = aggCount; bestText = t; }
        }
        if (!bestText) { st.visible = false; return; }

        let cleanTT = bestText.toLowerCase().replace(/\s+/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); let isAgg = {};
        allHierarchyKeys.forEach(k => { let keyPrefix = k.toLowerCase() + ":"; isAgg[k] = !cleanTT.includes(keyPrefix) || cleanTT.includes(keyPrefix + "<aggregated>") || cleanTT.includes(keyPrefix + "na"); });

        let activeDepth = 0;
        for (let j = 0; j < displayKeys.length; j++) {
            if (!isAgg[displayKeys[j]]) activeDepth = j + 1;
        }

        let isValid = true;
        for (let j = 0; j < displayKeys.length; j++) {
            if (j < activeDepth && isAgg[displayKeys[j]]) isValid = false;
            if (j >= activeDepth && !isAgg[displayKeys[j]]) isValid = false;
        }

        allHierarchyKeys.forEach(k => {
            if (!displayKeys.includes(k) && !isAgg[k]) {
                isValid = false;
            }
        });

        st.visible = isValid;
        if (isValid) {
            st.opacity = (activeDepth === displayKeys.length) ? 0.6 : 1;
            st.line.width = (activeDepth === 0) ? 4 : (activeDepth === displayKeys.length ? 1 : 2.5);
            st.line.color = DEPTH_COLORS[activeDepth % DEPTH_COLORS.length];
            st.marker.color = DEPTH_COLORS[activeDepth % DEPTH_COLORS.length];
        } else {
            st.opacity = 0; st.line.width = 0; st.line.color = 'transparent'; st.marker.color = 'transparent';
        }
    });
    Plotly.react(plotEl, newTraces, plotEl.layout);
}

function drawLines() {
    const oldSvgs = innerWrapper.querySelectorAll('svg');
    oldSvgs.forEach(s => s.remove());

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');

    svg.setAttribute('class', 'hierarchy-svg-lines');
    svg.style.position = 'absolute'; svg.style.top = '0px'; svg.style.left = '0px';
    svg.style.width = '100%'; svg.style.height = '100%'; svg.style.pointerEvents = 'none'; svg.style.zIndex = '1'; svg.style.overflow = 'visible';

    const chips = Array.from(innerWrapper.querySelectorAll('.hierarchy-chip'));

    constraints.forEach(rule => {
        const parentEl = chips.find(c => c.dataset.key === rule.parent);
        const childEl = chips.find(c => c.dataset.key === rule.child);
        if (parentEl && childEl) {
            const y1 = parentEl.offsetTop + (parentEl.offsetHeight / 2); const y2 = childEl.offsetTop + (childEl.offsetHeight / 2);
            const startX = parentEl.offsetLeft; const endX = childEl.offsetLeft; const trackX = Math.min(startX, endX) - 16; const r = 6; let d = "";
            if (y1 < y2) d = `M ${startX} ${y1} L ${trackX + r} ${y1} Q ${trackX} ${y1} ${trackX} ${y1 + r} L ${trackX} ${y2 - r} Q ${trackX} ${y2} ${trackX + r} ${y2} L ${endX} ${y2}`;
            else if (y1 > y2) d = `M ${startX} ${y1} L ${trackX + r} ${y1} Q ${trackX} ${y1} ${trackX} ${y1 - r} L ${trackX} ${y2 + r} Q ${trackX} ${y2} ${trackX + r} ${y2} L ${endX} ${y2}`;

            const lineColor = disabledKeys.has(rule.child) ? '#e2e8f0' : '#a0aec0';

            if (d) {
                const path = document.createElementNS(svgNS, 'path');
                path.setAttribute('d', d); path.setAttribute('fill', 'none');
                path.setAttribute('stroke', lineColor); path.setAttribute('stroke-width', '2');
                svg.appendChild(path);
            }
        }
    });
    innerWrapper.appendChild(svg);
}

function renderTree() {
    innerWrapper.querySelectorAll('.hierarchy-chip').forEach(c => c.remove());
    innerWrapper.querySelectorAll('svg').forEach(s => s.remove());

    let displayKeys = activeKeys.filter(k => !disabledKeys.has(k));

    activeKeys.forEach((key, index) => {
        const chip = document.createElement('div'); chip.className = 'hierarchy-chip'; chip.draggable = true; chip.dataset.key = key; chip.style.pointerEvents = 'auto';

        if (disabledKeys.has(key)) chip.classList.add('disabled');

        let displayIdx = displayKeys.indexOf(key);
        let color = displayIdx !== -1 ? DEPTH_COLORS[(displayIdx + 1) % DEPTH_COLORS.length] : '#94a3b8';

        chip.innerHTML = `<span class="chip-color" style="background:${color}"></span>${key}`;

        let wasDragged = false;
        chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', key); e.target.classList.add('dragging'); });

        chip.addEventListener('dragend', e => {
            e.target.classList.remove('dragging'); document.querySelectorAll('.hierarchy-chip').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
            wasDragged = true; setTimeout(() => wasDragged = false, 150);
        });

        chip.addEventListener('dragover', e => { e.preventDefault(); const bounding = chip.getBoundingClientRect(); const offset = e.clientY - bounding.top; document.querySelectorAll('.hierarchy-chip').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom')); if (offset > bounding.height / 2) chip.classList.add('drag-over-bottom'); else chip.classList.add('drag-over-top'); });

        chip.addEventListener('drop', e => {
            e.preventDefault(); document.querySelectorAll('.hierarchy-chip').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
            const draggedKey = e.dataTransfer.getData('text/plain'); if (draggedKey === key) return;
            let currentKeys = Array.from(innerWrapper.querySelectorAll('.hierarchy-chip')).map(c => c.dataset.key); let draggedIdx = currentKeys.indexOf(draggedKey); currentKeys.splice(draggedIdx, 1);
            let targetIdx = currentKeys.indexOf(key); const bounding = chip.getBoundingClientRect(); if (e.clientY - bounding.top > bounding.height / 2) currentKeys.splice(targetIdx + 1, 0, draggedKey); else currentKeys.splice(targetIdx, 0, draggedKey);

            if (isValidHierarchyOrder(currentKeys, constraints)) {
                activeKeys = currentKeys;
                renderTree();
                updatePlotlyTraces(activeKeys.filter(k => !disabledKeys.has(k)));
            } else {
                const draggedEl = document.querySelector('.dragging') || chip;
                draggedEl.classList.add('error-shake');
                setTimeout(() => draggedEl.classList.remove('error-shake'), 400);
            }
        });

        chip.addEventListener('click', (e) => {
            if (wasDragged) return;

            if (!disabledKeys.has(key)) {
                if ((activeKeys.length - disabledKeys.size) <= 1) {
                    chip.classList.add('error-shake');
                    setTimeout(() => chip.classList.remove('error-shake'), 400);
                    return; // Stop here, do not disable.
                }
                disabledKeys.add(key);
            } else {
                disabledKeys.delete(key);
            }

            renderTree();
            updatePlotlyTraces(activeKeys.filter(k => !disabledKeys.has(k)));
        });

        innerWrapper.appendChild(chip);
    });

    setTimeout(() => drawLines(), 30);
}

renderTree();
setTimeout(() => { updatePlotlyTraces(activeKeys.filter(k => !disabledKeys.has(k))); }, 150);

let baseWidth = 0; let baseHeight = 0;
setTimeout(() => {
    baseWidth = innerWrapper.offsetWidth; baseHeight = innerWrapper.offsetHeight;
    const defaultScale = 0.75; container.style.width = (baseWidth * defaultScale) + 'px'; container.style.height = (baseHeight * defaultScale) + 'px';
    const resizeObserver = new ResizeObserver(() => {
        if (baseWidth === 0) return;
        let scaleX = container.clientWidth / baseWidth; let scaleY = container.clientHeight / baseHeight; let scale = Math.min(scaleX, scaleY);
        let scaledWidth = baseWidth * scale; let scaledHeight = baseHeight * scale; let offsetX = (container.clientWidth - scaledWidth) / 2; let offsetY = (container.clientHeight - scaledHeight) / 2;
        innerWrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    });
    resizeObserver.observe(container);
}, 50);
};
