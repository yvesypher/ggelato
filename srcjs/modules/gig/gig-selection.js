/* Click, inverse, hierarchy and brush selection shared by the gig widgets. */

import { TOTAL_KEY } from "../core/hierarchy-model.js";

export function getDescendantIndices(state, node) {
  const output = [];
  state.series.forEach((candidate, index) => {
    if (node._id === "ROOT") {
      if (candidate._id !== "ROOT") output.push(index);
    } else if (
      candidate._id !== node._id &&
      candidate._id.indexOf(`${node._id}|`) === 0
    ) {
      output.push(index);
    }
  });
  return output;
}

export function updateGigSelection({
  state,
  selectedIndices,
  index,
  shift = false,
  mode = "single"
}) {
  const node = index >= 0 ? state.series[index] : null;
  if (mode === "hierarchy") {
    if (!shift) selectedIndices.clear();
    if (node) {
      selectedIndices.add(index);
      getDescendantIndices(state, node).forEach(i => selectedIndices.add(i));
    }
  } else if (index === -1) {
    if (!shift) selectedIndices.clear();
  } else if (mode === "single") {
    if (shift) {
      selectedIndices.has(index)
        ? selectedIndices.delete(index)
        : selectedIndices.add(index);
    } else {
      const wasSelected = selectedIndices.has(index);
      selectedIndices.clear();
      if (!wasSelected) selectedIndices.add(index);
    }
  } else if (mode === "multiple") {
    selectedIndices.has(index)
      ? selectedIndices.delete(index)
      : selectedIndices.add(index);
  } else if (mode === "inverse") {
    selectedIndices.clear();
    state.series.forEach((candidate, candidateIndex) => {
      if (candidateIndex !== index && candidate._depth === node._depth) {
        selectedIndices.add(candidateIndex);
      }
    });
  } else if (mode === "inverseAll") {
    selectedIndices.clear();
    state.series.forEach((_candidate, candidateIndex) => {
      if (candidateIndex !== index) selectedIndices.add(candidateIndex);
    });
  }
  return selectedIndices;
}

export function pointInBox(point, box) {
  return point.x >= box.xMin && point.x <= box.xMax &&
    point.y >= box.yMin && point.y <= box.yMax;
}

export function pointInPolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (
      (vertices[i].y > point.y) !== (vertices[j].y > point.y) &&
      point.x < (
        (vertices[j].x - vertices[i].x) * (point.y - vertices[i].y) /
        (vertices[j].y - vertices[i].y) + vertices[i].x
      )
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function attachBrushGesture({
  surface,
  overlay,
  signal,
  getPoint,
  getMode,
  onComplete,
  stopPropagation = true
}) {
  let active = false;
  let path = [];
  let shape = null;
  let mode = null;
  const listen = (node, type, handler) =>
    node.addEventListener(type, handler, signal ? { signal } : undefined);

  const removeShape = () => {
    if (shape?.parentNode) shape.parentNode.removeChild(shape);
    shape = null;
  };

  listen(surface, "mousedown", event => {
    mode = getMode();
    if (!mode) return;
    active = true;
    path = [getPoint(event)];
    shape = document.createElementNS(
      "http://www.w3.org/2000/svg",
      mode === "box" ? "rect" : "path"
    );
    shape.setAttribute("fill", "rgba(0,114,178,0.2)");
    shape.setAttribute("stroke", "#0072B2");
    overlay.appendChild(shape);
    if (stopPropagation) event.stopPropagation();
  });

  listen(window, "mousemove", event => {
    if (!active) return;
    const point = getPoint(event);
    path.push(point);
    const start = path[0];
    if (mode === "box") {
      shape.setAttribute("x", Math.min(start.x, point.x));
      shape.setAttribute("y", Math.min(start.y, point.y));
      shape.setAttribute("width", Math.abs(point.x - start.x));
      shape.setAttribute("height", Math.abs(point.y - start.y));
    } else {
      shape.setAttribute("d", `M ${path.map(p => `${p.x},${p.y}`).join(" L ")} Z`);
    }
  });

  listen(window, "mouseup", event => {
    if (!active) return;
    active = false;
    removeShape();
    const start = path[0];
    const end = path[path.length - 1];
    onComplete({
      event,
      mode,
      path,
      box: {
        xMin: Math.min(start.x, end.x),
        xMax: Math.max(start.x, end.x),
        yMin: Math.min(start.y, end.y),
        yMax: Math.max(start.y, end.y)
      }
    });
  });

  signal?.addEventListener("abort", removeShape, { once: true });
}

export function createBrushOverlay(container) {
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.assign(overlay.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "40"
  });
  container.appendChild(overlay);
  return overlay;
}

export function applyBrushSelection({ hits, state, selectedIndices, mode }) {
  if (!hits.length) return selectedIndices;
  if (mode === "inverse") {
    selectedIndices.clear();
    const hitSet = new Set(hits);
    const hitDepths = new Set(hits.map(index => state.series[index]._depth));
    state.series.forEach((series, index) => {
      if (!hitSet.has(index) && hitDepths.has(series._depth)) selectedIndices.add(index);
    });
  } else if (mode === "inverseAll") {
    selectedIndices.clear();
    const hitSet = new Set(hits);
    state.series.forEach((_series, index) => {
      if (!hitSet.has(index)) selectedIndices.add(index);
    });
  } else {
    hits.forEach(index => {
      selectedIndices.add(index);
      if (mode === "hierarchy") {
        getDescendantIndices(state, state.series[index])
          .forEach(descendant => selectedIndices.add(descendant));
      }
    });
  }
  return selectedIndices;
}

export function createGigHierarchyAdapter({
  state,
  selectedIndices,
  getTotalDimmed,
  setTotalDimmed,
  onSelectionChange,
  onStructureChange,
  onVisibilityChange
}) {
  const findIndices = (key, value) => {
    if (key === TOTAL_KEY) {
      return state.series
        .map((series, index) => series._depth === 0 ? index : -1)
        .filter(index => index >= 0);
    }
    const depth = state.displayKeys().indexOf(key);
    if (depth < 0) return [];
    return state.series
      .map((series, index) =>
        series._depth === depth + 1 && String(series[key]).trim() === value
          ? index
          : -1
      )
      .filter(index => index >= 0);
  };

  const isSelected = (key, value) => {
    const indices = findIndices(key, value);
    if (key === TOTAL_KEY) {
      if (state.isHidden(TOTAL_KEY, "Total")) return false;
      if (selectedIndices.size === 0) return !getTotalDimmed();
    }
    return indices.length > 0 && indices.every(index => selectedIndices.has(index));
  };

  const setSelected = (key, value, selected) => {
    const indices = findIndices(key, value);
    if (!indices.length) return;
    if (key === TOTAL_KEY) {
      if (selected) {
        setTotalDimmed(false);
        if (selectedIndices.size > 0) indices.forEach(index => selectedIndices.add(index));
      } else if (selectedIndices.size === 0) {
        setTotalDimmed(true);
      } else {
        indices.forEach(index => selectedIndices.delete(index));
      }
      return;
    }
    indices.forEach(index => {
      selected ? selectedIndices.add(index) : selectedIndices.delete(index);
    });
  };

  const valueControls = {
    getValues: key => state.valuesForKey(key),
    isSelected,
    setSelected,
    setSelectedMany: (key, values, selected) => {
      values.forEach(value => setSelected(key, value, selected));
    },
    isHidden: (key, value) => state.isHidden(key, value),
    setHidden: (key, value, hidden) => state.setHidden(key, value, hidden),
    showAll: key => state.showAllFor(key),
    onSelectionChange,
    onVisibilityChange: () => {
      [...selectedIndices].forEach(index => {
        if (state.isSeriesHidden(state.series[index])) selectedIndices.delete(index);
      });
      onVisibilityChange();
    }
  };

  const model = {
    getAllKeys: () => state.allKeys,
    getActiveKeys: () => state.activeKeys,
    getConstraints: () => state.constraints,
    getDisabledKeys: () => state.disabled,
    getTotalVisible: () => !state.isHidden(TOTAL_KEY, "Total"),
    setHierarchyState: snapshot => {
      state.activeKeys = [...snapshot.activeKeys];
      state.disabled = new Set(snapshot.disabledKeys);
      state.setHidden(TOTAL_KEY, "Total", !snapshot.totalVisible);
      state.rebuild();
      selectedIndices.clear();
      onStructureChange();
    },
    onTotalClick: () => {
      setSelected(TOTAL_KEY, "Total", !isSelected(TOTAL_KEY, "Total"));
      onSelectionChange();
    }
  };

  return { model, valueControls };
}
