
name: Engine 3 - Test 30 - Expanded 50-State YouTube Coverage

on:
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: engine3-test30
  cancel-in-progress: false

jobs:
  expanded-50-state-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Verify Test 30 files
        run: |
          test -f engine3-youtube-test30.js
          test -f engine3-test29-events.json
          node --check engine3-youtube-test30.js
          node -e "const d=require('./engine3-test29-events.json'); if(!Array.isArray(d)||d.length!==50) process.exit(1); console.log('50 states loaded')"

      - name: Run Engine 3 Test 30
        env:
          YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}
        run: node engine3-youtube-test30.js

      - name: Upload Test 30 report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: engine3-test30-50-state-report
          path: reports/engine3-test30-50states.json
          if-no-files-found: warn

      - name: Publish report to repository
        if: success()
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add reports/engine3-test30-50states.json
          if ! git diff --cached --quiet; then
            git commit -m "Update Engine 3 Test 30 report"
            git push
          fi
