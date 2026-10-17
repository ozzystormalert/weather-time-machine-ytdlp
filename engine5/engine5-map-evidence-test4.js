
'use strict';

/**
 * Weather Time Machine — Engine 5
 * TEST 4: Original Map Evidence Verification
 *
 * Independent test — does not change the live Engine 5 server.
 *
 * Run:
 * node engine5-map-evidence-test4.js
 *   --event "Superstorm Sandy"
 *   --state "New Jersey"
 *   --year 2012
 *   --image "https://example.org/map.png"
 *   --source "https://example.org/report"
 *
 * No external npm packages.
 * No Bing API key.
 * No scraping of Bing Images.
 * No automatic A–F grades.
 */

const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
const { URL } = require('node:url');

const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 12000;

const flags = {};

for (let
