const status = document.querySelector('#status');
const pageList = document.querySelector('#pages');

function showPages(pages) {
  pageList.replaceChildren();

  for (const page of pages) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = page.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = page.name;
    item.append(link);
    pageList.append(item);
  }

  status.textContent = pages.length
    ? `عُثر على ${pages.length} صفحة تحمل شارة توثيق ظاهرة.`
    : 'لم تظهر صفحات موثقة في المحتوى المحمّل حاليًا.';
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.url || !/^https:\/\/(www|web)\.facebook\.com\//.test(tab.url)) {
    status.textContent = 'افتح صفحة فيسبوك لعرض الصفحات التي تحمل شارة التوثيق.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'GET_VERIFIED_PAGES' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      status.textContent = 'تعذر فحص الصفحة. أعد تحميل فيسبوك ثم حاول مجددًا.';
      return;
    }

    showPages(response.pages);
  });
});