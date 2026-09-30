/*
 * Shared sunburst renderer used by composition packages such as fridge.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncateLabel(value, maxChars) {
  const text = String(value == null ? "" : value);
  return text.length > maxChars
    ? text.slice(0, Math.max(1, maxChars - 1)) + "\u2026"
    : text;
}

function labelFontSize(node) {
  if (node.data._depth === 0) return 13;
  if (node.data._depth === 1) return 11;

  const labelRadius = node.children
    ? (node.y0 + node.y1) / 2
    : node.y1;
  const edgeLength = (node.x1 - node.x0) * labelRadius;

  return Math.max(0.75, Math.min(9, edgeLength * 0.68));
}

function hierarchyPath(state, node) {
  if (node.data._depth === 0) return ["Total"];
  return state.displayKeys()
    .slice(0, node.data._depth)
    .map(key => node.data[key])
    .filter(value => value != null && String(value).trim() !== "");
}

function pointInBox(x, y, box) {
  return x >= box.xMin && x <= box.xMax &&
    y >= box.yMin && y <= box.yMax;
}

function pointInPolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (((vertices[i].y > point.y) !== (vertices[j].y > point.y)) &&
        (point.x <
          (vertices[j].x - vertices[i].x) *
          (point.y - vertices[i].y) /
          (vertices[j].y - vertices[i].y) +
          vertices[i].x)) {
      inside = !inside;
    }
  }
  return inside;
}

export function renderSunburst(content, x, shared) {
  if (typeof d3 === "undefined") {
    throw new Error("D3 is required to render gig_sunburst.");
  }

  shared.hasSunburst = true;

  let treeNodes = [];
  let radiusStep = 55;
  let treeX = 0;
  let treeY = 0;
  let treeZoom = 1;
  let brushing = false;
  let brushPath = [];
  let brushShape = null;
  let destroyed = false;

  content.innerHTML =
    '<div class="gig-sun-wrap">' +
      '<svg viewBox="-250 -250 500 500" preserveAspectRatio="xMidYMid meet">' +
        '<rect x="-2500" y="-2500" width="5000" height="5000" ' +
          'fill="transparent" stroke="none"></rect>' +
        '<g class="gig-tree-group"></g>' +
      '</svg>' +
    '</div>';

  const svg = content.querySelector("svg");
  const group = d3.select(content).select(".gig-tree-group");

  function initialiseTree() {
    let maxDepth = 0;
    const flat = [];
    const byId = new Map();

    shared.state.series.forEach((series, index) => {
      if (shared.state.isSeriesHidden(series)) return;
      const node = { ...series, _gIdx: index, children: [] };
      flat.push(node);
      byId.set(node._id, node);
      maxDepth = Math.max(maxDepth, node._depth);
    });

    const roots = [];
    flat.forEach(node => {
      const parent = node._depth > 0 ? byId.get(node._parentId) : null;
      if (parent && parent._depth === node._depth - 1) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    if (!roots.length) {
      treeNodes = [];
      return;
    }

    const hierarchyRoot = roots.length === 1
      ? roots[0]
      : { _id: "VIRTUAL_ROOT", _depth: -1, children: roots };

    radiusStep = Math.min(55, 170 / (maxDepth + 1));

    const rootD3 = d3.hierarchy(hierarchyRoot)
      .sum(node => node.children && node.children.length ? 0 : 1)
      .sort((left, right) => right.value - left.value);

    const hasVirtualRoot = roots.length > 1;
    d3.partition().size([2 * Math.PI, 1])(rootD3);

    treeNodes = rootD3.descendants()
      .filter(node => node.data._id !== "VIRTUAL_ROOT")
      .map(node => {
        const depth = hasVirtualRoot ? node.depth - 1 : node.depth;
        node.y0 = depth === 0 ? 0 : depth * radiusStep;
        node.y1 = (depth + 1) * radiusStep;
        return node;
      });
  }

  function showTooltip(event, node) {
    const tooltip = shared.tooltipEl;
    const name = shared.state.label(node.data) || "Total";
    const path = hierarchyPath(shared.state, node);
    tooltip.innerHTML =
      '<div class="gig-sunburst-tooltip-name">' +
        escapeHtml(name) +
      "</div>" +
      (path.length > 1
        ? '<div class="gig-sunburst-tooltip-path">' +
            path.map(escapeHtml).join(
              ' <span aria-hidden="true">\u203a</span> '
            ) +
          "</div>"
        : "");
    tooltip.style.opacity = 1;
    tooltip.style.left = (event.clientX + 12) + "px";
    tooltip.style.top = (event.clientY + 12) + "px";
  }

  function hideTooltip() {
    shared.tooltipEl.style.opacity = 0;
  }

  function updateStyles() {
    if (destroyed) return;

    treeNodes.forEach(node => {
      const path = content.querySelector(
        '.gig-tree-node[data-gidx="' + node.data._gIdx + '"]'
      );
      if (!path) return;
      const style = shared.getStyle(node.data, node.data._gIdx);
      path.setAttribute("fill",
        style.c === "rgba(200,200,200,0.15)" ? "#e2e8f0" : style.c);
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", 0.5);
      path.setAttribute("vector-effect", "non-scaling-stroke");
    });

    content.querySelectorAll(".gig-tree-label").forEach(label => {
      label.classList.toggle("visible", shared.labelsOn.v);
    });
  }

  function renderTree() {
    group.selectAll("*").remove();

    const arc = d3.arc()
      .startAngle(node => node.x0)
      .endAngle(node => node.x1)
      .innerRadius(node => node.y0)
      .outerRadius(node => node.y1)
      .padAngle(0);

    const nodes = group.selectAll("g.gig-node-group")
      .data(treeNodes)
      .enter()
      .append("g")
      .attr("class", "gig-node-group");

    nodes.append("path")
      .attr("class", "gig-tree-node")
      .attr("data-gidx", node => node.data._gIdx)
      .attr("d", arc)
      .on("click", (event, node) => {
        event.stopPropagation();
        if (shared.tools.box || shared.tools.lasso) return;
        shared.select(node.data._gIdx, event.shiftKey);
      })
      .on("mousemove", showTooltip)
      .on("mouseleave", hideTooltip);

    nodes.append("text")
      .attr("class", node =>
        "gig-tree-label gig-tree-label-depth-" + node.data._depth +
        (shared.labelsOn.v ? " visible" : ""))
      .attr("data-depth", node => node.data._depth)
      .attr("transform", node => {
        if (node.data._depth === 0) return "";
        const angle = (node.x0 + node.x1) / 2;
        const radius = node.children
          ? (node.y0 + node.y1) / 2
          : node.y1 + 5;
        const xPosition = radius * Math.sin(angle);
        const yPosition = -radius * Math.cos(angle);
        let rotation = angle * 180 / Math.PI - 90;
        if (rotation > 90 && rotation < 270) rotation += 180;
        return "translate(" + xPosition + "," + yPosition + ") rotate(" +
          rotation + ")";
      })
      .attr("dy", "0.35em")
      .attr("text-anchor", node => {
        if (node.data._depth === 0) return "middle";
        if (node.children) return "middle";
        const rotation =
          (node.x0 + node.x1) / 2 * 180 / Math.PI - 90;
        return rotation > 90 && rotation < 270 ? "end" : "start";
      })
      .text(node => {
        const name = shared.state.label(node.data) || "";
        if (node.data._depth === 0) return name;
        const fontSize = labelFontSize(node);
        const ringWidth = node.y1 - node.y0;
        const maxChars = Math.max(
          3,
          Math.floor((ringWidth - 6) / (fontSize * 0.56))
        );
        return truncateLabel(name, maxChars);
      })
      .style("font-size", node => labelFontSize(node) + "px")
      .style("pointer-events", "none");

    updateStyles();
  }

  const zoom = d3.zoom()
    .scaleExtent([0.1, 10])
    .filter(event =>
      !(shared.tools.box || shared.tools.lasso) &&
      !event.ctrlKey &&
      !event.button)
    .on("zoom", event => {
      treeX = event.transform.x;
      treeY = event.transform.y;
      treeZoom = event.transform.k;
      group.attr("transform", event.transform);
    });

  d3.select(svg).call(zoom);
  d3.select(svg).on("click.ggelatoSunburst", () => {
    if (shared.tools.box || shared.tools.lasso) return;
    shared.select(-1, false);
  });

  function viewBoxCoordinates(clientX, clientY) {
    const bounds = svg.getBoundingClientRect();
    const scale = Math.min(bounds.width / 500, bounds.height / 500);
    const offsetX = (bounds.width - 500 * scale) / 2;
    const offsetY = (bounds.height - 500 * scale) / 2;
    return {
      x: ((clientX - bounds.left) - offsetX) / scale - 250,
      y: ((clientY - bounds.top) - offsetY) / scale - 250
    };
  }

  function onMouseDown(event) {
    if (!(shared.tools.box || shared.tools.lasso)) return;
    brushing = true;
    brushPath = [viewBoxCoordinates(event.clientX, event.clientY)];
    brushShape = document.createElementNS(
      SVG_NS,
      shared.tools.box ? "rect" : "path"
    );
    brushShape.setAttribute("fill", "rgba(0,114,178,0.2)");
    brushShape.setAttribute("stroke", "#0072B2");
    svg.appendChild(brushShape);
    event.stopPropagation();
  }

  function onMouseMove(event) {
    if (!brushing || !brushShape) return;
    const point = viewBoxCoordinates(event.clientX, event.clientY);
    brushPath.push(point);

    if (shared.tools.box) {
      brushShape.setAttribute("x", Math.min(brushPath[0].x, point.x));
      brushShape.setAttribute("y", Math.min(brushPath[0].y, point.y));
      brushShape.setAttribute("width", Math.abs(point.x - brushPath[0].x));
      brushShape.setAttribute("height", Math.abs(point.y - brushPath[0].y));
    } else {
      brushShape.setAttribute(
        "d",
        "M " + brushPath.map(item => item.x + "," + item.y).join(" L ") + " Z"
      );
    }
  }

  function onMouseUp(event) {
    if (!brushing) return;
    brushing = false;
    if (brushShape && brushShape.parentNode === svg) {
      svg.removeChild(brushShape);
    }
    brushShape = null;

    if (brushPath.length < 2) return;

    const finalPoint = brushPath[brushPath.length - 1];
    const box = {
      xMin: Math.min(brushPath[0].x, finalPoint.x),
      xMax: Math.max(brushPath[0].x, finalPoint.x),
      yMin: Math.min(brushPath[0].y, finalPoint.y),
      yMax: Math.max(brushPath[0].y, finalPoint.y)
    };
    const useBox = shared.tools.box;
    const hits = [];

    treeNodes.forEach(node => {
      const angle = (node.x0 + node.x1) / 2;
      const radii = [
        (node.y0 + node.y1) / 2,
        node.y0 + 5,
        node.y1 - 5
      ];
      const hit = radii.some(radius => {
        const xPosition =
          radius * Math.sin(angle) * treeZoom + treeX;
        const yPosition =
          -radius * Math.cos(angle) * treeZoom + treeY;
        return useBox
          ? pointInBox(xPosition, yPosition, box)
          : pointInPolygon({ x: xPosition, y: yPosition }, brushPath);
      });
      if (hit) hits.push(node.data._gIdx);
    });

    shared.brush(hits, event.shiftKey);
  }

  svg.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  const resetZoom = () => {
    d3.select(svg).call(zoom.transform, d3.zoomIdentity);
    treeX = 0;
    treeY = 0;
    treeZoom = 1;
  };
  shared.resetFns.push(resetZoom);

  function update(full) {
    if (full) {
      initialiseTree();
      renderTree();
    } else {
      updateStyles();
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    hideTooltip();
    d3.select(svg).on(".zoom", null).on(".ggelatoSunburst", null);
    svg.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    const resetIndex = shared.resetFns.indexOf(resetZoom);
    if (resetIndex >= 0) shared.resetFns.splice(resetIndex, 1);
  }

  initialiseTree();
  renderTree();

  return {
    update,
    resize() {},
    destroy
  };
}
