const postLinkPattern = /\/(posts|permalink|videos?|reel|watch|photo)\//i;
const countPattern = /([\d٠-٩۰-۹]+(?:[.,٫٬][\d٠-٩۰-۹]+)?)\s*(ألف|مليون|مليار|[kmb])?/i;
const countTokenPattern = /[\d٠-٩۰-۹]+(?:[.,٫٬][\d٠-٩۰-۹]+)?\s*(?:ألف|مليون|مليار|[kmb])?/gi;
const engagementLabels = {
  reactions: /like|reaction|إعجاب|تفاعل/i,
  comments: /comment|تعليق/i,
  shares: /share|مشاركة/i,
  views: /view|مشاهدة/i
};

function normalizeDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - (digit >= '۰' ? 0x06F0 : 0x0660) + 48)
  );
}

function parseCount(text) {
  const match = normalizeDigits(text).match(countPattern);
  if (!match) return null;

  const numberText = match[1].replace(/[٬,](?=\d{3}(?:\D|$))/g, '').replace(/[٫٬]/g, '.');
  const number = Number.parseFloat(numberText);
  if (!Number.isFinite(number)) return null;

  const suffix = (match[2] || '').toLocaleLowerCase();
  const multiplier = ['ألف', 'k'].includes(suffix)
    ? 1_000
    : ['مليون', 'm'].includes(suffix)
      ? 1_000_000
      : ['مليار', 'b'].includes(suffix)
        ? 1_000_000_000
        : 1;

  return Math.round(number * multiplier);
}

function parseCountNearLabel(text, labelPattern) {
  const normalized = normalizeDigits(text);
  const label = labelPattern.exec(normalized);
  if (!label) return null;

  const labelStart = label.index;
  const labelEnd = labelStart + label[0].length;
  let closest = null;
  let closestDistance = Infinity;

  for (const match of normalized.matchAll(countTokenPattern)) {
    const countStart = match.index;
    const countEnd = countStart + match[0].length;
    const distance = countEnd <= labelStart
      ? labelStart - countEnd
      : countStart >= labelEnd
        ? countStart - labelEnd
        : 0;

    if (distance <= 16 && distance < closestDistance) {
      closest = match[0];
      closestDistance = distance;
    }
  }

  return closest === null ? null : parseCount(closest);
}

function readEngagement(article) {
  const lines = [];
  const text = article.innerText || '';
  lines.push(...text.split(/\n+/));

  for (const element of article.querySelectorAll('[aria-label], [title]')) {
    lines.push(element.getAttribute('aria-label') || '', element.getAttribute('title') || '');
  }

  const counts = { reactions: 0, comments: 0, shares: 0, views: 0 };
  for (const line of lines) {
    for (const [key, labelPattern] of Object.entries(engagementLabels)) {
      if (!labelPattern.test(line)) continue;
      const count = parseCountNearLabel(line, labelPattern);
      if (count !== null) counts[key] = Math.max(counts[key], count);
    }
  }

  return counts;
}

function getAgeHours(article) {
  const time = article.querySelector('time[datetime]');
  if (time) {
    const timestamp = Date.parse(time.dateTime);
    if (Number.isFinite(timestamp)) {
      return Math.max((Date.now() - timestamp) / 3_600_000, 1 / 60);
    }
  }

  const label = article.querySelector('abbr[title], [data-utime]')?.getAttribute('title') || '';
  const timestamp = Date.parse(label);
  if (Number.isFinite(timestamp)) {
    return Math.max((Date.now() - timestamp) / 3_600_000, 1 / 60);
  }

  return 24;
}

function getPostUrl(article) {
  for (const link of article.querySelectorAll('a[href]')) {
    try {
      const url = new URL(link.href);
      if (
        ['www.facebook.com', 'web.facebook.com', 'm.facebook.com'].includes(url.hostname) &&
        (postLinkPattern.test(url.pathname) || url.searchParams.has('story_fbid'))
      ) {
        if (url.searchParams.has('story_fbid')) {
          const storyParameters = new URLSearchParams();
          for (const key of ['id', 'story_fbid']) {
            const value = url.searchParams.get(key);
            if (value) storyParameters.set(key, value);
          }
          url.search = storyParameters.toString();
        } else {
          url.search = '';
        }
        url.hash = '';
        return url.href;
      }
    } catch {
      continue;
    }
  }

  return '';
}

function getPostSummary(article) {
  const message = article.querySelector('[data-ad-preview="message"]')?.innerText;
  const text = (message || article.innerText || '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function findTrendingPosts() {
  const articles = document.querySelectorAll('article, [role="article"]');
  const posts = new Map();

  for (const article of articles) {
    const engagement = readEngagement(article);
    const total = engagement.reactions + engagement.comments + engagement.shares + engagement.views;
    if (total === 0) continue;

    const url = getPostUrl(article);
    const key = url || getPostSummary(article);
    if (!key) continue;

    const ageHours = getAgeHours(article);
    const score = (engagement.reactions + 2 * engagement.comments + 3 * engagement.shares +
      engagement.views / 100) / ageHours;
    const candidate = {
      url,
      summary: getPostSummary(article) || 'منشور بدون نص ظاهر',
      engagement,
      score,
      ageHours
    };

    const existing = posts.get(key);
    if (!existing || candidate.score > existing.score) posts.set(key, candidate);
  }

  return {
    scanned: articles.length,
    posts: [...posts.values()].sort((a, b) => b.score - a.score).slice(0, 10)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TRENDING_POSTS') {
    sendResponse(findTrendingPosts());
  }
});
