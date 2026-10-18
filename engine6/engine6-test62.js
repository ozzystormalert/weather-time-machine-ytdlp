
'use strict';

const assert = require('node:assert/strict');
const {
  publicUrl,
  assess,
  discover
} = require('./engine6-discovery-test62');

const {
  queryFor
} = require('./engine6-photo-gallery');

const tests = [];

function test(name, fn) {
  tests.push([name, fn]);
}

test('Exact search formula', () =>
  assert.equal(
    queryFor('Tropical Storm Irene', 'Vermont'),
    'photo gallery Tropical Storm Irene Vermont'
  )
);

test('Public HTTPS URL allowed', () =>
  assert.equal(
    publicUrl('https://example.org/gallery'),
    true
  )
);

test('Localhost URL blocked', () =>
  assert.equal(
    publicUrl('http://localhost/private'),
    false
  )
);

test('Private IP blocked', () =>
  assert.equal(
    publicUrl('http://192.168.1.1'),
    false
  )
);

test('Credential URL blocked', () =>
  assert.equal(
    publicUrl('https://user:pass@example.org'),
    false
  )
);

test('Strong search snippet yields candidate not verified', () => {
  const x = assess(
    {
      url: 'https://example.org/photos',
      title: 'Tropical Storm Irene Vermont photo gallery'
    },
    'Tropical Storm Irene',
    'Vermont'
  );

  assert.equal(x.candidate, true);
  assert.equal(x.verified, false);
  assert.equal(x.score, null);
});

test('Wrong event not candidate', () =>
  assert.equal(
    assess(
      {
        url: 'https://example.org',
        title: 'Hurricane Sandy Vermont gallery'
      },
      'Tropical Storm Irene',
      'Vermont'
    ).candidate,
    false
  )
);

test('Wrong state not candidate', () =>
  assert.equal(
    assess(
      {
        url: 'https://example.org',
        title: 'Tropical Storm Irene New Jersey gallery'
      },
      'Tropical Storm Irene',
      'Vermont'
    ).candidate,
    false
  )
);

test('No gallery clue not candidate', () =>
  assert.equal(
    assess(
      {
        url: 'https://example.org',
        title: 'Tropical Storm Irene Vermont storm report'
      },
      'Tropical Storm Irene',
      'Vermont'
    ).candidate,
    false
  )
);

test('Missing API key remains Not Evaluated', async () => {
  const r = await discover({
    event: 'Tropical Storm Irene',
    state: 'Vermont',
    apiKey: ''
  });

  assert.equal(r.score, null);
  assert.equal(r.searchCompleted, false);
  assert.ok(r.error);
});

test('Mock API discovery never awards points', async () => {
  const mock = async () => ({
    ok: true,
    json: async () => ({
      web: {
        results: [
          {
            url: 'https://example.org/gallery',
            title: 'Tropical Storm Irene Vermont photo gallery',
            description: 'Historic photos'
          }
        ]
      }
    })
  });

  const r = await discover({
    event: 'Tropical Storm Irene',
    state: 'Vermont',
    apiKey: 'test',
    fetcher: mock
  });

  assert.equal(r.searchCompleted, true);
  assert.equal(r.potentialGalleries, 1);
  assert.equal(r.score, null);
  assert.equal(r.candidates[0].verified, false);
});

test('HTTP error leaves search incomplete', async () => {
  const r = await discover({
    event: 'Tropical Storm Irene',
    state: 'Vermont',
    apiKey: 'test',
    fetcher: async () => ({
      ok: false,
      status: 429
    })
  });

  assert.equal(r.searchCompleted, false);
  assert.equal(r.score, null);
});

test('Empty search results do not automatically mean zero', async () => {
  const r = await discover({
    event: 'Tropical Storm Irene',
    state: 'Vermont',
    apiKey: 'test',
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        web: {
          results: []
        }
      })
    })
  });

  assert.equal(r.searchCompleted, true);
  assert.equal(r.score, null);
});

(async () => {
  let pass = 0;

  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log('PASS:', name);
      pass++;
    } catch (error) {
      console.error('FAIL:', name, error.message);
    }
  }

  console.log(
    `Engine 6 Test 6.2: ${pass}/${tests.length} passed`
  );

  if (pass !== tests.length) {
    process.exitCode = 1;
  }
})();
