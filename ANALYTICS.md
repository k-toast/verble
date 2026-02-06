# Game analytics (PostHog)

## 1. One-time setup: add your PostHog API key

1. In [PostHog](https://us.posthog.com) go to **Project settings** → **Project** (or **Snippet**).
2. Copy your **Project API key** (starts with `phc_`).
3. In `index.html`, find this line:
   ```javascript
   posthog.init('phc_YOUR_PROJECT_API_KEY',{api_host:'https://us.i.posthog.com'});
   ```
4. Replace `phc_YOUR_PROJECT_API_KEY` with your real key.
5. If you use **EU** PostHog, change `api_host` to `'https://eu.i.posthog.com'`.

After that, no further code changes are needed.

---

## 2. Events sent by the game

| Event              | When                         | Properties                          |
|--------------------|------------------------------|-------------------------------------|
| `game_loaded`      | Every visit (puzzle shown or “no puzzle”) | `puzzle_date` (or `null`) |
| `puzzle_completed` | User wins or runs out of moves           | `puzzle_date`, `won` (true/false)    |

PostHog also captures `$pageview` by default.

---

## 3. Metrics in PostHog

- **Unique visits**  
  Trends → Event: `game_loaded` → Unique users (or use `$pageview`).

- **DAU / MAU**  
  Stickiness (or Trends) → Event: `game_loaded` → Unique users; view by day for DAU, by month for MAU.

- **D1 / D7 / D30 retention**  
  Retention → “Performed event”: `game_loaded` (or “First time” = first `game_loaded` per user). “Returned” = performed same (or any) event on day 1, 7, 30.

- **% of visitors who complete at least one puzzle**  
  Funnel → Step 1: `game_loaded` → Step 2: `puzzle_completed`. Conversion = that %.

---

## 4. Optional: disable analytics

To stop sending events (e.g. for local testing), comment out or remove the PostHog `<script>` block in `index.html`. The game checks `window.posthog` before calling `posthog.capture()`, so it won’t error if PostHog isn’t loaded.
