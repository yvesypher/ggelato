(function () {
  "use strict";

  const DEPTH_COLORS = [
    "#e63946",
    "#f4a261",
    "#e9c46a",
    "#2a9d8f",
    "#264653",
    "#1d3557"
  ];

  function escapeRegExp(x) {
    return String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function decodeHtml(x) {
    const txt = document.createElement("textarea");
    txt.innerHTML = String(x);
    return txt.value;
  }

  function parseStructure(structureStr) {
    let activeKeys = [];
    let constraints = [];
    let depths = {};

    if (!structureStr || typeof structureStr !== "string") {
      return { activeKeys, constraints, depths };
    }

    const cleanStr = structureStr.replace(/\s+/g, "");
    const tokens = cleanStr.match(/[^/*()]+|[/*()]/g);

    if (!tokens) {
      return { activeKeys, constraints, depths };
    }

    let pos = 0;

    function addKey(key) {
      if (!activeKeys.includes(key)) {
        activeKeys.push(key);
        depths[key] = 0;
      }
    }

    function addConstraint(parent, child) {
      const exists = constraints.some(function (c) {
        return c.parent === parent && c.child === child;
      });

      if (!exists) {
        constraints.push({ parent: parent, child: child });
      }
    }

    function parseExpression() {
      let left = parseTerm();

      while (pos < tokens.length && tokens[pos] === "*") {
        pos++;
        const right = parseTerm();

        left = {
          roots: left.roots.concat(right.roots),
          leaves: left.leaves.concat(right.leaves)
        };
      }

      return left;
    }

    function parseTerm() {
      let left = parseFactor();

      while (pos < tokens.length && tokens[pos] === "/") {
        pos++;
        const right = parseFactor();

        left.leaves.forEach(function (parent) {
          right.roots.forEach(function (child) {
            addConstraint(parent, child);
          });
        });

        left = {
          roots: left.roots,
          leaves: right.leaves
        };
      }

      return left;
    }

    function parseFactor() {
      if (pos >= tokens.length) {
        return { roots: [], leaves: [] };
      }

      if (tokens[pos] === "(") {
        pos++;
        const expr = parseExpression();

        if (pos < tokens.length && tokens[pos] === ")") {
          pos++;
        }

        return expr;
      }

      const val = tokens[pos++];
      addKey(val);

      return {
        roots: [val],
        leaves: [val]
      };
    }

    parseExpression();

    return { activeKeys, constraints, depths };
  }

  function isValidHierarchyOrder(proposedArray, constraints) {
    for (let i = 0; i < constraints.length; i++) {
      const rule = constraints[i];
      const parentIdx = proposedArray.indexOf(rule.parent);
      const childIdx = proposedArray.indexOf(rule.child);

      if (parentIdx !== -1 && childIdx !== -1 && parentIdx > childIdx) {
        return false;
      }
    }

    return true;
  }

  function getHighchartsChart(el) {
    if (!window.Highcharts || !Highcharts.charts) {
      return null;
    }

    const charts = window.Highcharts.charts.filter(Boolean);

    for (let i = charts.length - 1; i >= 0; i--) {
      const chart = charts[i];

      if (
        chart &&
        chart.renderTo &&
        (
          chart.renderTo === el ||
          el.contains(chart.renderTo) ||
          chart.renderTo.contains(el)
        )
      ) {
        return chart;
      }
    }

    return null;
  }

  function hasOwnCaseInsensitive(obj, key) {
    if (!obj || typeof obj !== "object") {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }

    const wanted = String(key).toLowerCase();

    for (const k in obj) {
      if (String(k).toLowerCase() === wanted) {
        return obj[k];
      }
    }

    return undefined;
  }

  function isAggregatedValue(value) {
    if (value === null || value === undefined) {
      return true;
    }

    const v = decodeHtml(value)
      .trim()
      .toLowerCase();

    return (
      v === "" ||
      v === "na" ||
      v === "n/a" ||
      v === "null" ||
      v === "undefined" ||
      v === "all" ||
      v === "total" ||
      v === "aggregate" ||
      v === "aggregated" ||
      v === "<aggregated>" ||
      v.indexOf("aggregated") !== -1
    );
  }

  function getSeriesTextBlob(series) {
    const userOptions = series.userOptions || {};
    const options = series.options || {};
    const pieces = [];

    if (series.name) pieces.push(series.name);
    if (userOptions.name) pieces.push(userOptions.name);
    if (options.name) pieces.push(options.name);
    if (userOptions.id) pieces.push(userOptions.id);
    if (options.id) pieces.push(options.id);

    if (userOptions.custom) {
      try {
        pieces.push(JSON.stringify(userOptions.custom));
      } catch (e) {}
    }

    if (options.custom) {
      try {
        pieces.push(JSON.stringify(options.custom));
      } catch (e) {}
    }

    return decodeHtml(pieces.join("; "))
      .replace(/<br\s*\/?>/gi, "; ")
      .replace(/\n/g, "; ");
  }

  function findHierarchyValueInText(text, key) {
    const re = new RegExp(
      "(^|[;|,\\s])" + escapeRegExp(key) + "\\s*[:=]\\s*([^;|,\\n]+)",
      "i"
    );

    const match = text.match(re);

    if (!match) {
      return undefined;
    }

    return match[2].trim();
  }

  function extractHierarchyFromSeries(series, allKeys) {
    const userOptions = series.userOptions || {};
    const options = series.options || {};
    const out = {};
    let found = false;

    const candidates = [
      userOptions.custom && userOptions.custom.hierarchy,
      options.custom && options.custom.hierarchy,
      userOptions.custom,
      options.custom,
      userOptions,
      options
    ];

    if (
      series.points &&
      series.points.length > 0 &&
      series.points[0].options &&
      series.points[0].options.custom
    ) {
      candidates.push(series.points[0].options.custom.hierarchy);
      candidates.push(series.points[0].options.custom);
    }

    candidates.forEach(function (obj) {
      if (!obj || typeof obj !== "object") {
        return;
      }

      allKeys.forEach(function (key) {
        if (out[key] !== undefined) {
          return;
        }

        const val = hasOwnCaseInsensitive(obj, key);

        if (val !== undefined) {
          out[key] = val;
          found = true;
        }
      });
    });

    const textBlob = getSeriesTextBlob(series);

    allKeys.forEach(function (key) {
      if (out[key] !== undefined) {
        return;
      }

      const val = findHierarchyValueInText(textBlob, key);

      if (val !== undefined) {
        out[key] = val;
        found = true;
      }
    });

    if (!found) {
      const seriesName = decodeHtml(
        series.name ||
        userOptions.name ||
        options.name ||
        ""
      ).trim();

      const isTotalName = /^(total|all|aggregate|aggregated)$/i.test(seriesName);

      if (isTotalName) {
        allKeys.forEach(function (key) {
          out[key] = "<aggregated>";
        });

        return out;
      }

      const parts = seriesName
        .split(/\s*(?:\/|\||›|→|»)\s*/)
        .map(function (x) {
          return x.trim();
        })
        .filter(Boolean);

      if (parts.length > 0 && parts.length <= allKeys.length) {
        parts.forEach(function (part, i) {
          out[allKeys[i]] = part;
        });

        found = true;
      }
    }

    if (!found) {
      return null;
    }

    allKeys.forEach(function (key) {
      if (out[key] === undefined) {
        out[key] = "<aggregated>";
      }
    });

    return out;
  }

  function classifySeries(series, displayKeys, allKeys) {
    const hierarchy = extractHierarchyFromSeries(series, allKeys);

    if (!hierarchy) {
      return null;
    }

    const isAgg = {};

    allKeys.forEach(function (key) {
      isAgg[key] = isAggregatedValue(hierarchy[key]);
    });

    let activeDepth = 0;

    for (let i = 0; i < displayKeys.length; i++) {
      const key = displayKeys[i];

      if (!isAgg[key]) {
        activeDepth = i + 1;
      }
    }

    let valid = true;

    for (let i = 0; i < displayKeys.length; i++) {
      const key = displayKeys[i];

      if (i < activeDepth && isAgg[key]) {
        valid = false;
      }

      if (i >= activeDepth && !isAgg[key]) {
        valid = false;
      }
    }

    allKeys.forEach(function (key) {
      if (!displayKeys.includes(key) && !isAgg[key]) {
        valid = false;
      }
    });

    return {
      valid: valid,
      activeDepth: activeDepth,
      hierarchy: hierarchy
    };
  }

  function updateHighchartSeries(chart, displayKeys, allKeys) {
    if (!chart || !chart.series) {
      return;
    }

    let matched = 0;

    chart.series.forEach(function (series) {
      if (!series || !series.options) {
        return;
      }

      if (series.options.isInternal) {
        return;
      }

      const info = classifySeries(series, displayKeys, allKeys);

      if (!info) {
        return;
      }

      matched++;

      const visible = info.valid;
      const depth = info.activeDepth;
      const color = DEPTH_COLORS[depth % DEPTH_COLORS.length];

      const lineWidth =
        depth === 0 ? 4 :
        depth === displayKeys.length ? 1.2 :
        2.5;

      const opacity =
        depth === displayKeys.length ? 0.65 :
        1;

      series.setVisible(visible, false);

      if (visible) {
        series.update(
          {
            color: color,
            lineWidth: lineWidth,
            opacity: opacity,
            marker: {
              enabled: false,
              states: {
                hover: {
                  enabled: true
                }
              }
            }
          },
          false
        );

        if (series.group) {
          series.group.attr({ opacity: opacity });
        }
      }
    });

    if (matched === 0) {
      console.warn(
        "add_hierarchy_hc(): No Highcharts series contained hierarchy metadata. " +
        "Use series custom.hierarchy, key:value names, or slash-separated names."
      );
    }

    chart.redraw();
  }

  function shake(el) {
    if (!el) {
      return;
    }

    el.classList.add("error-shake");

    setTimeout(function () {
      el.classList.remove("error-shake");
    }, 450);
  }

function cleanHierarchyValue(value) {
    if (isAggregatedValue(value)) {
        return "All";
    }

    return String(value);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatNumericValue(value) {
    if (
        window.Highcharts &&
        Highcharts.numberFormat &&
        typeof value === "number"
    ) {
        return Highcharts.numberFormat(value, 0, ".", ",");
    }

    return value;
}

function getYAxisValueName(pointContext, x) {
    if (
        x &&
        x.hierarchy_value_name &&
        String(x.hierarchy_value_name).trim() !== ""
    ) {
        return String(x.hierarchy_value_name);
    }

    const axis =
        pointContext &&
        pointContext.series &&
        pointContext.series.yAxis;

    const axisTitle =
        axis &&
        axis.options &&
        axis.options.title &&
        axis.options.title.text;

    if (
        axisTitle &&
        String(axisTitle).trim() !== "" &&
        !["value", "values", "y"].includes(String(axisTitle).trim().toLowerCase())
    ) {
        return String(axisTitle).trim();
    }

    const renderedAxisTitle =
        axis &&
        axis.axisTitle &&
        axis.axisTitle.textStr;

    if (
        renderedAxisTitle &&
        String(renderedAxisTitle).trim() !== "" &&
        !["value", "values", "y"].includes(String(renderedAxisTitle).trim().toLowerCase())
    ) {
        return String(renderedAxisTitle).trim();
    }

    return "Value";
}

function makeHierarchyTooltip(pointContext, orderedKeys, allKeys, x) {
    const series = pointContext.series;
    const hierarchy = extractHierarchyFromSeries(series, allKeys);
    const valueName = getYAxisValueName(pointContext, x);

    let html = "";

    html += '<div class="hierarchy-hc-tooltip">';
    html += '<table class="hierarchy-hc-tooltip-table">';

    if (hierarchy) {
        orderedKeys.forEach(function(key) {
            html += "<tr>";
            html += '<td class="hierarchy-hc-tooltip-key">';
            html += escapeHtml(key);
            html += "</td>";
            html += '<td class="hierarchy-hc-tooltip-value">';
            html += escapeHtml(cleanHierarchyValue(hierarchy[key]));
            html += "</td>";
            html += "</tr>";
        });
    }

    html += "<tr>";
    html += '<td class="hierarchy-hc-tooltip-key">';
    html += escapeHtml(valueName);
    html += "</td>";
    html += '<td class="hierarchy-hc-tooltip-number">';
    html += escapeHtml(formatNumericValue(pointContext.y));
    html += "</td>";
    html += "</tr>";

    html += "</table>";
    html += "</div>";

    return html;
}

function installHierarchyHighchartsOptions(chart, getOrderedKeys, allKeys, x) {
    if (!chart || chart.__hierarchyHcOptionsInstalled) {
        return;
    }

    chart.update(
        {
            legend: {
                enabled: false
            },
            tooltip: {
                useHTML: true,
                shared: false,
                headerFormat: "",
                formatter: function() {
                    return makeHierarchyTooltip(
                        this,
                        getOrderedKeys(),
                        allKeys,
                        x
                    );
                }
            }
        },
        false
    );

    chart.__hierarchyHcOptionsInstalled = true;
}

  window.init_hierarchy_hc = function (el, x) {
    if (!el || !x || !x.hierarchy_structure) {
      return;
    }

    if (el.__hierarchyHcCleanup) {
      el.__hierarchyHcCleanup();
    }

    el.querySelectorAll(".hierarchy-hc-addon-container").forEach(function (node) {
      node.remove();
    });

    const cleanupFns = [];

    function listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      cleanupFns.push(function () {
        target.removeEventListener(type, handler, options);
      });
    }

    el.__hierarchyHcCleanup = function () {
      cleanupFns.forEach(function (fn) {
        fn();
      });

      el.querySelectorAll(".hierarchy-hc-addon-container").forEach(function (node) {
        node.remove();
      });
    };

    const parsed = parseStructure(x.hierarchy_structure);
    const allKeys = parsed.activeKeys.slice();
    const constraints = parsed.constraints.slice();
    let activeKeys = parsed.activeKeys.slice();

    if (allKeys.length === 0) {
      return;
    }

    const disabledKeys = new Set();

    if (window.getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }

    el.style.overflow = "visible";

    const container = document.createElement("div");
    container.className = "hierarchy-hc-addon-container";

    const inner = document.createElement("div");
    inner.className = "hierarchy-hc-inner";

    container.appendChild(inner);
    el.appendChild(container);

    let isMovingPanel = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    listen(container, "mousedown", function (e) {
      if (e.button !== 0) {
        return;
      }

      if (e.target.closest(".hierarchy-hc-chip")) {
        return;
      }

      isMovingPanel = true;

      const rect = container.getBoundingClientRect();
      const parentRect = el.getBoundingClientRect();

      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left - parentRect.left;
      startTop = rect.top - parentRect.top;

      container.style.right = "auto";
      container.style.transform = "none";
      container.style.left = startLeft + "px";
      container.style.top = startTop + "px";

      container.classList.add("is-moving");

      e.preventDefault();
    });

    listen(document, "mousemove", function (e) {
      if (!isMovingPanel) {
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      container.style.left = startLeft + dx + "px";
      container.style.top = startTop + dy + "px";

      e.preventDefault();
    });

    listen(document, "mouseup", function () {
      if (isMovingPanel) {
        isMovingPanel = false;
        container.classList.remove("is-moving");
      }
    });

    function currentDisplayKeys() {
      return activeKeys.filter(function (key) {
        return !disabledKeys.has(key);
      });
    }

    function requestPlotUpdate() {
    const chart = getHighchartsChart(el);

    if (!chart) {
        setTimeout(requestPlotUpdate, 150);
        return;
    }

    installHierarchyHighchartsOptions(
        chart,
        function() {
            return activeKeys;
        },
        allKeys,
        x
    );

    updateHighchartSeries(chart, currentDisplayKeys(), allKeys);
}

    function drawLines() {
      inner.querySelectorAll(".hierarchy-hc-svg-lines").forEach(function (svg) {
        svg.remove();
      });

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");

      svg.setAttribute("class", "hierarchy-hc-svg-lines");

      const chips = Array.from(inner.querySelectorAll(".hierarchy-hc-chip"));

      constraints.forEach(function (rule) {
        const parentEl = chips.find(function (chip) {
          return chip.dataset.key === rule.parent;
        });

        const childEl = chips.find(function (chip) {
          return chip.dataset.key === rule.child;
        });

        if (!parentEl || !childEl) {
          return;
        }

        const y1 = parentEl.offsetTop + parentEl.offsetHeight / 2;
        const y2 = childEl.offsetTop + childEl.offsetHeight / 2;

        const startX = parentEl.offsetLeft;
        const endX = childEl.offsetLeft;
        const trackX = Math.min(startX, endX) - 16;
        const r = 6;

        let d = "";

        if (y1 < y2) {
          d =
            "M " + startX + " " + y1 +
            " L " + (trackX + r) + " " + y1 +
            " Q " + trackX + " " + y1 + " " + trackX + " " + (y1 + r) +
            " L " + trackX + " " + (y2 - r) +
            " Q " + trackX + " " + y2 + " " + (trackX + r) + " " + y2 +
            " L " + endX + " " + y2;
        } else if (y1 > y2) {
          d =
            "M " + startX + " " + y1 +
            " L " + (trackX + r) + " " + y1 +
            " Q " + trackX + " " + y1 + " " + trackX + " " + (y1 - r) +
            " L " + trackX + " " + (y2 + r) +
            " Q " + trackX + " " + y2 + " " + (trackX + r) + " " + y2 +
            " L " + endX + " " + y2;
        }

        if (!d) {
          return;
        }

        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute(
          "stroke",
          disabledKeys.has(rule.parent) || disabledKeys.has(rule.child)
            ? "#e2e8f0"
            : "#a0aec0"
        );
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");

        svg.appendChild(path);
      });

      inner.prepend(svg);
    }

    function renderTree() {
      inner.innerHTML = "";

      const displayKeys = currentDisplayKeys();

      activeKeys.forEach(function (key) {
        const chip = document.createElement("div");
        chip.className = "hierarchy-hc-chip";
        chip.dataset.key = key;
        chip.draggable = true;

        if (disabledKeys.has(key)) {
          chip.classList.add("disabled");
        }

        const depthIndex = displayKeys.indexOf(key);
        const color =
          depthIndex === -1
            ? "#94a3b8"
            : DEPTH_COLORS[(depthIndex + 1) % DEPTH_COLORS.length];

        chip.innerHTML =
          '<span class="hierarchy-hc-chip-color" style="background:' +
          color +
          '"></span>' +
          '<span class="hierarchy-hc-chip-label">' +
          key +
          "</span>";

        chip.title =
          "Drag to reorder hierarchy levels. Click to hide/show this level.";

        let wasDragged = false;

        listen(chip, "dragstart", function (e) {
          e.dataTransfer.setData("text/plain", key);
          e.dataTransfer.effectAllowed = "move";
          chip.classList.add("dragging");
          wasDragged = true;
        });

        listen(chip, "dragend", function () {
          chip.classList.remove("dragging");

          inner.querySelectorAll(".hierarchy-hc-chip").forEach(function (c) {
            c.classList.remove("drag-over-top", "drag-over-bottom");
          });

          setTimeout(function () {
            wasDragged = false;
          }, 150);
        });

        listen(chip, "dragover", function (e) {
          e.preventDefault();

          const rect = chip.getBoundingClientRect();
          const offset = e.clientY - rect.top;

          inner.querySelectorAll(".hierarchy-hc-chip").forEach(function (c) {
            c.classList.remove("drag-over-top", "drag-over-bottom");
          });

          if (offset > rect.height / 2) {
            chip.classList.add("drag-over-bottom");
          } else {
            chip.classList.add("drag-over-top");
          }
        });

        listen(chip, "dragleave", function () {
          chip.classList.remove("drag-over-top", "drag-over-bottom");
        });

        listen(chip, "drop", function (e) {
          e.preventDefault();

          inner.querySelectorAll(".hierarchy-hc-chip").forEach(function (c) {
            c.classList.remove("drag-over-top", "drag-over-bottom");
          });

          const draggedKey = e.dataTransfer.getData("text/plain");

          if (!draggedKey || draggedKey === key) {
            return;
          }

          const proposed = Array.from(
            inner.querySelectorAll(".hierarchy-hc-chip")
          ).map(function (c) {
            return c.dataset.key;
          });

          const draggedIdx = proposed.indexOf(draggedKey);

          if (draggedIdx === -1) {
            return;
          }

          proposed.splice(draggedIdx, 1);

          let targetIdx = proposed.indexOf(key);
          const rect = chip.getBoundingClientRect();

          if (e.clientY - rect.top > rect.height / 2) {
            targetIdx++;
          }

          proposed.splice(targetIdx, 0, draggedKey);

          if (isValidHierarchyOrder(proposed, constraints)) {
            activeKeys = proposed;
            renderTree();
            requestPlotUpdate();
          } else {
            const draggedEl = inner.querySelector(
              '.hierarchy-hc-chip[data-key="' + draggedKey + '"]'
            );

            shake(draggedEl || chip);
          }
        });

        listen(chip, "click", function () {
          if (wasDragged) {
            return;
          }

          if (!disabledKeys.has(key)) {
            if (activeKeys.length - disabledKeys.size <= 1) {
              shake(chip);
              return;
            }

            disabledKeys.add(key);
          } else {
            disabledKeys.delete(key);
          }

          renderTree();
          requestPlotUpdate();
        });

        inner.appendChild(chip);
      });

      setTimeout(drawLines, 30);
    }

    renderTree();
    setTimeout(requestPlotUpdate, 150);
  };
})();
