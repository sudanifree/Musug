const verificationPattern = /verified|verified account|تم التحقق|موثّق|موثق|شارة التوثيق/i;

function findVerifiedPages() {
  const pages = new Map();
  const labels = document.querySelectorAll('[aria-label], [title], [data-tooltip-content]');

  for (const label of labels) {
    const description = [
      label.getAttribute('aria-label'),
      label.getAttribute('title'),
      label.getAttribute('data-tooltip-content')
    ].filter(Boolean).join(' ');

    if (!verificationPattern.test(description)) continue;

    const link = label.closest('a[href]');
    if (!link) continue;

    try {
      const url = new URL(link.href);
      if (!['www.facebook.com', 'web.facebook.com'].includes(url.hostname)) continue;
      if (url.pathname === '/' || url.pathname.startsWith('/groups/')) continue;

      const name = link.innerText.trim().replace(/\s+/g, ' ');
      if (name) pages.set(url.href, { name, url: url.href });
    } catch {
      // Ignore malformed links in Facebook's dynamically rendered page.
    }
  }

  return [...pages.values()];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_VERIFIED_PAGES') {
    sendResponse({ pages: findVerifiedPages() });
  }
});