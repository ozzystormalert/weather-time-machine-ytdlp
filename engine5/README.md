
# Weather Time Machine — Engine 5
## Historical Weather Map Verification

Engine 5 is an independent historical weather map research and verification service for the Weather Time Machine Blogger project.

### Purpose

Engine 5 supports:

STEP 8 — Historical Weather Maps

STEP 8A — Engine 5 Historical Weather Map Verification

The engine searches for historical weather map evidence related to a selected weather event and U.S. state.

### Step 8 — Research Search

Research source: Google Images

Search formula:

Weather Event + State + map

Example:

Superstorm Sandy New Jersey map

The event year is not included in the Google Images search query.

### Accepted Historical Weather Maps

- Rainfall and precipitation maps
- Storm-track and hurricane-path maps
- Wind-speed and wind-gust maps
- Flooding and storm-surge maps
- Atmospheric pressure and weather-system maps
- Historical radar maps
- Historical satellite weather maps

Maps must be relevant to the selected historical weather event and state.

### Rejected Resources

- Ordinary photographs
- Artistic illustrations
- Decorative graphics
- Unrelated weather-event maps
- Unrelated geographic maps
- Images without sufficient historical weather-map evidence

### Engine 5 Verification

Engine 5 uses public Wikimedia Commons resources to discover historical weather-map candidates.

Verification considers:

1. Weather event relevance
2. State and geographic relevance
3. Historical date relevance
4. Map type and meteorological content
5. Source and metadata reliability

A matching title or image description alone does not prove that an image is an authentic historical weather map.

### Grading Rules

Engine 5 is intended to support A–F grading.

A — Excellent verified historical map evidence

B — Strong verified historical map evidence

C — Acceptable but limited map evidence

D — Weak or incomplete map evidence

F — Completed verification confirms no acceptable historical weather maps

NOT EVALUATED — Verification could not be completed.

A failed API request must never automatically receive a zero.

Until image evidence is sufficiently verified, grading must remain provisional or Not Evaluated.

### API Endpoints

Health check:

GET /health

Historical weather map audit:

GET /audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012

### Deployment

Platform: Render

Runtime: Node.js 22

GitHub repository:
ozzystormalert/weather-time-machine-ytdlp

Root Directory:
engine5

Build Command:
npm install

Start Command:
npm start

Suggested Render service name:
weather-time-machine-engine5

### Independence Rules

Engine 5 must not modify:

- Engine 1 — Wikipedia
- Engine 2 — Wikimedia Commons Images
- Engine 3 — YouTube News Verification
- Engine 4 — Educational Documentary Verification
- Existing Blogger research links
- Existing weather-event datasets
- Existing seven-category grading structure

### Development Status

Phase 1 — Historical map candidate discovery

Phase 2 — Historical event and geographic relevance testing

Phase 3 — Map image verification and grading

Phase 4 — Render deployment and API testing

Phase 5 — Blogger Step 8A integration

Final grading requires sufficient verified evidence.
