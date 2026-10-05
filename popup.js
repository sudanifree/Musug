const status = document.querySelector('#status');
const postList = document.querySelector('#posts');

function formatCount(count) {
  return new Intl.NumberFormat('ar', { notation: 'compact', maximumFractionDigits: 1 }).format(count);
}

function showPosts(posts, scanned) {
  postList.replaceChildren();

  for (const post of posts) {
    const item = document.createElement('li');
    const heading = document.createElement('div');
    heading.className = 'post-heading';

    const score = document.createElement('strong');
    score.textContent = `مؤشر الرواج: ${formatCount(Math.round(post.score))}`;
    heading.append(score);

    if (post.url) {
      const link = document.createElement('a');
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'فتح المنشور';
      heading.append(link);
    }

    const summary = document.createElement('p');
    summary.textContent = post.summary;

    const stats = document.createElement('p');
    stats.className = 'stats';
    stats.textContent = [
      `تفاعلات ${formatCount(post.engagement.reactions)}`,
      `تعليقات ${formatCount(post.engagement.comments)}`,
      `مشاركات ${formatCount(post.engagement.shares)}`,
      `مشاهدات ${formatCount(post.engagement.views)}`
    ].join(' · ');

    item.append(heading, summary, stats);
    postList.append(item);
  }

  status.textContent = posts.length
    ? `تم فحص ${scanned} منشورًا ظاهرًا. الأعلى مؤشرًا:`
    : `لم أجد أرقام تفاعل ظاهرة ضمن ${scanned} منشورًا محمّلًا.`;
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.url || !/^https:\/\/(www|web|m)\.facebook\.com\//.test(tab.url)) {
    status.textContent = 'افتح Facebook على الويب لفحص المنشورات الظاهرة.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'GET_TRENDING_POSTS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      status.textContent = 'تعذر فحص الصفحة. أعد تحميل Facebook ثم حاول مجددًا.';
      return;
    }

    showPosts(response.posts, response.scanned);
  });
});