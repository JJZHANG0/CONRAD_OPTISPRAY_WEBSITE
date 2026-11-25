const fieldName = /\bskagit(?:,\s*washington|[\s-]+(?:field|valley))?\b/gi;

function useFarmlandLabels(doc) {
  const cleanText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('script, style, textarea, [contenteditable]')) return;
      const label = node.data.replace(fieldName, 'Farmland');
      if (label !== node.data) node.data = label;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.id === 'location' && node.tagName === 'INPUT') {
      const label = node.value.replace(fieldName, 'Farmland');
      if (label !== node.value) node.value = label;
    }
    for (const name of ['title', 'aria-label', 'alt', 'placeholder']) {
      const value = node.getAttribute(name);
      if (value) {
        const label = value.replace(fieldName, 'Farmland');
        if (label !== value) node.setAttribute(name, label);
      }
    }
  };
  const cleanTree = (root) => {
    cleanText(root);
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) cleanText(walker.currentNode);
  };
  cleanTree(doc.documentElement);
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type !== 'childList') cleanText(change.target);
      else for (const node of change.addedNodes) cleanTree(node);
    }
  });
  observer.observe(doc.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['title', 'aria-label', 'alt', 'placeholder'],
  });
  return observer;
}

export function createDashboard(frame, selectedPlan) {
  let request;
  let documentObserver;
  let mapObserver;
  let mapDocument;

  function sync() {
    const dashboard = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!request || typeof dashboard?.setStage !== 'function' || !doc) return;
    if (doc.documentElement.lang !== 'en') dashboard.toggleLanguage?.();
    const plan = selectedPlan();
    if (request.stage !== 'post') dashboard.choosePlan?.(plan);
    const confirm = dashboard.confirm;
    try {
      if (request.stage === 'mid') {
        dashboard.confirm = (message) => /^Start a new operation with Plan |^将使用 Plan /.test(message) || confirm.call(dashboard, message);
      }
      dashboard.setStage(request.stage);
    } finally {
      dashboard.confirm = confirm;
    }
    if (request.stage === 'mid') dashboard.setOperationMapMode?.('baseline');
    if (request.target === 'reportDocument') dashboard.previewReport?.();
    if (request.target) dashboard.requestAnimationFrame(() => {
      if (frame.hidden) return;
      doc.getElementById(request?.target)?.scrollIntoView({ block: 'start' });
    });
  }

  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc || typeof frame.contentWindow?.setStage !== 'function') return;
    documentObserver?.disconnect();
    documentObserver = useFarmlandLabels(doc);
    const map = doc.getElementById('midReferenceFrame');
    const syncMap = () => {
      const nested = map?.contentDocument;
      if (!nested?.body || nested === mapDocument) return;
      mapObserver?.disconnect();
      mapDocument = nested;
      mapObserver = useFarmlandLabels(nested);
    };
    map?.addEventListener('load', syncMap);
    syncMap();
    sync();
  });

  function show(stage, target) {
    request = { stage, target };
    frame.hidden = false;
    if (!frame.hasAttribute('src')) {
      frame.src = import.meta.env.BASE_URL + 'dashboard/aeroguard-dashboard-standalone.html';
    } else sync();
  }

  function hide() {
    if (frame.hidden) return;
    frame.hidden = true;
    request = undefined;
    mapDocument?.querySelector('#play-toggle[aria-pressed="true"]')?.click();
  }

  return { show, hide };
}
