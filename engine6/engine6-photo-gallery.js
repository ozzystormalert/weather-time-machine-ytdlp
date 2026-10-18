
'use strict';

// ============================================
// WEATHER TIME MACHINE
// ENGINE 6 — TEST 6.2 FREE
// FILE 3 — PHOTO GALLERY RESEARCH
// ============================================
//
// Historical Weather Photo Gallery Search
//
// Node.js 22
// No external packages
// No Brave API
// No paid search API
// No API keys
// No Google scraping
//
// PURPOSE:
//
// 1. Build a regular Google search query.
// 2. Generate a Google research link.
// 3. Preserve the Weather Time Machine
//    historical event and state selection.
// 4. Support the free Engine 6 verification
//    process.
//
// IMPORTANT:
//
// Google search results are research leads.
// They are NOT verified photo galleries.
//
// A search result alone cannot receive
// a numerical grade.
//
// Final grading remains:
// 100 / 50 / 0 / Not Evaluated
//
// ============================================


// --------------------------------------------
// CLEAN INPUT
// --------------------------------------------

function cleanInput(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// --------------------------------------------
// VALIDATE EVENT AND STATE
// --------------------------------------------

function validSelection(event, state) {
  const cleanEvent = cleanInput(event);
  const cleanState = cleanInput(state);

  return (
    cleanEvent.length > 0 &&
    cleanState.length > 0
  );
}


// --------------------------------------------
// BUILD GOOGLE SEARCH FORMULA
// --------------------------------------------

function queryFor(event, state) {
  const cleanEvent = cleanInput(event);
  const cleanState = cleanInput(state);

  if (!validSelection(cleanEvent, cleanState)) {
    return '';
  }

  return [
    'photo gallery',
    cleanEvent,
    cleanState
  ].join(' ');
}


// --------------------------------------------
// GENERATE REGULAR GOOGLE SEARCH URL
// --------------------------------------------

function googleLink(event, state) {
  const query = queryFor(event, state);

  if (!query) {
    return '';
  }

  const url = new URL(
    'https://www.google.com/search'
  );

  url.searchParams.set(
    'q',
    query
  );

  return url.toString();
}


// --------------------------------------------
// BUILD RESEARCH INFORMATION
// --------------------------------------------

function researchFor(event, state, year = '') {
  const cleanEvent = cleanInput(event);
  const cleanState = cleanInput(state);
  const cleanYear = cleanInput(year);

  const query = queryFor(
    cleanEvent,
    cleanState
  );

  return {
    engine: 6,

    version: '6.2-free',

    category:
      'Historical Photo Gallery',

    event: cleanEvent,

    state: cleanState,

    year: cleanYear,

    searchTerm: query,

    googleSearchUrl:
      googleLink(cleanEvent, cleanState),

    provider:
      'Google Web Search — Manual Research',

    discoveryMethod:
      'User-selected public gallery URLs',

    apiRequired: false,

    paidServiceRequired: false,

    googleScraping: false,

    score: null,

    grade: null,

    status:
      'Not Evaluated',

    instructions:
      'Open Google search, locate relevant historical photo gallery websites, and supply their public URLs to Engine 6 Test 6.2 for independent inspection.',

    note:
      'Google search results are research leads only. Event photographs must be verified before numerical grading.'
  };
}


// --------------------------------------------
// PRINT RESEARCH INFORMATION
// --------------------------------------------

function printResearch(event, state, year = '') {
  const result = researchFor(
    event,
    state,
    year
  );

  console.log('');
  console.log('====================================');
  console.log(' WEATHER TIME MACHINE');
  console.log(' ENGINE 6 — PHOTO GALLERY RESEARCH');
  console.log('====================================');
  console.log('');

  console.log(
    'Weather Event:',
    result.event
  );

  console.log(
    'State:',
    result.state
  );

  console.log(
    'Year:',
    result.year || 'Not specified'
  );

  console.log('');

  console.log(
    'Google Search:',
    result.searchTerm
  );

  console.log('');

  console.log(
    'Research URL:',
    result.googleSearchUrl
  );

  console.log('');

  console.log(
    'Status:',
    result.status
  );

  console.log('');

  console.log(
    'API Required:',
    'NO'
  );

  console.log(
    'Paid Service:',
    'NO'
  );

  console.log('');

  console.log(
    'NEXT STEP:'
  );

  console.log(
    'Find historical photo gallery URLs using the Google research link.'
  );

  console.log(
    'Place selected URLs into engine6-gallery-urls.json.'
  );

  console.log('');
}


// --------------------------------------------
// DIRECT NODE.JS EXECUTION
// --------------------------------------------

if (require.main === module) {
  const event =
    process.env.EVENT ||
    'Tropical Storm Irene';

  const state =
    process.env.STATE ||
    'Vermont';

  const year =
    process.env.YEAR ||
    '2011';

  printResearch(
    event,
    state,
    year
  );
}


// --------------------------------------------
// EXPORT FUNCTIONS
// --------------------------------------------

module.exports = {
  cleanInput,
  validSelection,
  queryFor,
  googleLink,
  researchFor,
  printResearch
};

// ============================================
// END — ENGINE 6 TEST 6.2 FREE
// FILE 3
// ============================================
