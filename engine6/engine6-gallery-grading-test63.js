
'use strict';

/**
 * WEATHER TIME MACHINE
 * ENGINE 6 — TEST 6.3 FREE
 * Historical Photo Gallery Grading
 *
 * Counts only independently verified galleries.
 * No paid API, Google scraping, or API key.
 */

function normalizeUrl(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value.trim());

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    if (url.username || url.password) return null;

    url.hash = '';
    url.hostname = url.hostname.toLowerCase();

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.toString();
  } catch {
    return null;
  }
}

function verifiedGalleryUrls(galleries) {
  if (!Array.isArray(galleries)) return [];

  const found = new Set();

  for (const gallery of galleries) {
    if (!gallery || typeof gallery !== 'object') {
      continue;
    }

    // Every condition must be explicitly verified.
    // Search snippets and candidate matches do not qualify.
    if (
      gallery.verified !== true ||
      gallery.eventMatch !== true ||
      gallery.stateMatch !== true ||
      gallery.yearMatch !== true ||
      gallery.hasEventPhotos !== true
    ) {
      continue;
    }

    const normalized = normalizeUrl(gallery.url);

    if (normalized) {
      found.add(normalized);
    }
  }

  return [...found];
}

function gradeGalleryCount(count, researchCompleted) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError(
      'Gallery count must be a nonnegative integer'
    );
  }

  if (researchCompleted !== true) {
    return {
      score: null,
      grade: 'Not Evaluated',
      status: 'Research incomplete'
    };
  }

  if (count >= 5) {
    return {
      score: 100,
      grade: 'A+',
      status: 'Verified gallery threshold met'
    };
  }

  if (count >= 2) {
    return {
      score: 50,
      grade: 'Partial',
      status: 'Limited verified galleries'
    };
  }

  if (count === 0) {
    return {
      score: 0,
      grade: 'None found',
      status: 'Completed research found no qualifying galleries'
    };
  }

  return {
    score: null,
    grade: 'Not Evaluated',
    status: 'One gallery: insufficient evidence for a numerical grade'
  };
}

function gradeGalleryResearch({
  event,
  state,
  year,
  galleries = [],
  researchCompleted = false
} = {}) {
  const urls = verifiedGalleryUrls(galleries);
  const result = gradeGalleryCount(
    urls.length,
    researchCompleted
  );

  return {
    engine: 6,
    version: '6.3-free',
    category: 'Historical Photo Gallery',
    event: String(event || '').trim(),
    state: String(state || '').trim(),
    year: String(year || '').trim(),
    verifiedGalleryCount: urls.length,
    verifiedGalleryUrls: urls,
    researchCompleted: researchCompleted === true,
    ...result,
    note:
      'Only explicitly reviewed event/state/year-matching ' +
      'galleries containing event photographs are counted. ' +
      'This module does not verify websites or Google results.'
  };
}

module.exports = {
  normalizeUrl,
  verifiedGalleryUrls,
  gradeGalleryCount,
  gradeGalleryResearch
};

// Run directly with Node.js 22.
if (require.main === module) {
  const fs = require('node:fs');

  const inputPath =
    process.env.INPUT ||
    'engine6/engine6-gallery-reviews-test63.json';

  const outputPath =
    process.env.OUTPUT ||
    'engine6-test63-results.json';

  try {
    const input = JSON.parse(
      fs.readFileSync(inputPath, 'utf8')
    );

    const result = gradeGalleryResearch(input);

    fs.writeFileSync(
      outputPath,
      JSON.stringify(result, null, 2) + '\n'
    );

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      'Engine 6 Test 6.3 error:',
      error.message
    );
    process.exitCode = 1;
  }
}
