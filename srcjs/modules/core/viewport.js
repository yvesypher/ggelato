// Context-aware sizing shared by all five ggelato output types.
//
// A completed Quarto/R Markdown document can safely use viewport units and
// break out of its article column. RStudio's inline chunk output is a separate
// iframe, where 100vh means only the iframe's current height and can create a
// circular, clipped layout. Inline previews and standalone Viewer output
// therefore keep the size selected by htmlwidgets::sizingPolicy().

export function resolveViewportOptions(options) {
  return {
    width: options?.width !== false,
    height: options?.height !== false
  };
}

export function resolveSizingContext(doc, win) {
  const renderedDocument = Boolean(
    doc?.querySelector?.(
      "#quarto-content, .quarto-container, .main-container, .reveal"
    )
  );
  if (renderedDocument) return "document";
  if (win && win.parent && win.parent !== win) return "embedded";
  return "standalone";
}

export function applyViewportSizing(el, options, environment = {}) {
  if (!el) return resolveViewportOptions(options);

  const resolved = resolveViewportOptions(options);
  const doc = environment.document || el.ownerDocument ||
    (typeof document !== "undefined" ? document : null);
  const win = environment.window ||
    (doc?.defaultView || (typeof window !== "undefined" ? window : null));
  const useDocumentViewport = resolveSizingContext(doc, win) === "document";
  const viewportWidth = resolved.width && useDocumentViewport;
  const viewportHeight = resolved.height && useDocumentViewport;

  el.classList.toggle("ggelato-viewport-width", viewportWidth);
  el.classList.toggle("ggelato-viewport-height", viewportHeight);

  if (typeof el.closest === "function") {
    const output = el.closest(
      ".cell-output-display, .cell-output, .html-widget-container"
    );
    output?.classList.toggle("ggelato-viewport-host", viewportWidth);
  }

  return resolved;
}
