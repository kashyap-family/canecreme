// Microsoft Clarity loader. Set CLARITY_PROJECT_ID in js/config.js to activate.
(function initMicrosoftClarity(windowRef, documentRef) {
  const clarityId = String(windowRef.CLARITY_PROJECT_ID || '').trim();
  if (!clarityId) return;
  const claritySrc = `https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`;
  const alreadyLoaded = Array.from(documentRef.scripts).some((script) => script.src === claritySrc);
  if (alreadyLoaded) return;

  windowRef.clarity = windowRef.clarity || function clarityQueue() {
    (windowRef.clarity.q = windowRef.clarity.q || []).push(arguments);
  };

  const script = documentRef.createElement('script');
  script.async = true;
  script.src = claritySrc;
  const firstScript = documentRef.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(script, firstScript);
})(window, document);
