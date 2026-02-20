# Playwright lessons learned

Reference this when fixing or writing Playwright E2E tests (e.g. `frontend/tests/workflow.spec.ts`).

## 1. Strict mode: one element per locator

Playwright requires locators to resolve to **exactly one** element for actions like `.click()` and for some assertions. If a locator matches 2+ elements, you get a **strict mode violation**.

**Fix:** Narrow the locator or use `.first()` (or `.nth(n)`) when multiple matches are acceptable.

- **Example:** On the RFPs list, `getByRole('link', { name: /^E2E Workflow RFP - \d+/ })` can match multiple cards (duplicate/similar titles). Use `e2eRfpLink(page).first().click()` so the action targets a single element.
- **Example:** `getByText('Review')` matched the sidebar option "Reviewer" (substring). Scope to main: `page.getByRole('main').getByText('Review', { exact: true })`.
- **Example:** `getByRole('button', { name: 'Bids' })` matched both "Bids (0)" and "Lock **Bids** for Final Decision". Use a unique pattern, e.g. `getByRole('button', { name: /^Bids \(\d+\)$/ })`.

## 2. Scope to the right region

Prefer scoping to `main` (or a dialog/modal) so you don’t match sidebar, nav, or other UI.

- RFP list links: `page.getByRole('main').getByRole('link', { name: ... })`.
- Timeline text: `page.getByRole('main').getByText('Review', { exact: true })` so "Review" doesn’t match the Persona "Reviewer" option.
- Table on RFP detail: `page.getByRole('main').getByRole('table')`.

## 3. Wait for the right state (not just “in progress”)

For multi-step or async flows (e.g. upload + AI processing), wait for **completion**, not only for an “in progress” message.

- **Example:** TC4 bid upload: waiting for "Vendor extraction in progress…" then clicking Bids caused "No bids yet" because the bid wasn’t created yet. Fix: wait for the **completion** message (e.g. `Uploaded – vendor extracted.`) with a long timeout (e.g. 150s for 2+ min processing), then open Bids and assert the table.

## 4. Use `exact: true` or regex when text is ambiguous

If the same substring appears in different places (e.g. "Published" vs "published", "Create" vs "Create RFP"), use:

- `getByText('Published', { exact: true })`, or
- A regex / more specific locator so only the intended element matches.

## 5. Flaky “element detached” on click

If the element is found but detaches (e.g. React re-render) before or during click:

- **Avoid relying on fragile elements** (e.g. chips that remount on toggle). Prefer submitting via a stable control or `page.evaluate()` (e.g. `form.requestSubmit()`) when the UI is brittle.
- When multiple elements with the same title can exist (e.g. duplicate RFP cards), use `.first()` so the locator resolves to one element and retries don’t hit a different node.

## 6. Long-running steps need higher timeouts

For slow operations (e.g. AI extraction), set an explicit timeout on the wait (e.g. `timeout: 150000` for 2.5 minutes) so the test doesn’t fail too early.

---

## Recording and viewing videos

Videos are enabled in `frontend/playwright.config.ts` with `video: 'on'`.

**Where videos are saved**

- After a run, artifacts go under **`frontend/test-results/`**.
- Each test run creates a folder (e.g. `workflow-poc-v3-workflows-TC1-Create-RFP-4-step-wizard-chromium`). Inside it you’ll find **`video.webm`** (and optionally traces/screenshots).

**How to see them**

1. **HTML report (easiest)**  
   From the frontend directory:
   ```bash
   cd frontend && npx playwright test
   ```
   When the run finishes, Playwright prints something like:
   ```text
   View report: npx playwright show-report
   ```
   Run that same command from `frontend`:
   ```bash
   npx playwright show-report
   ```
   The report opens in the browser; each test row has a **video** icon – click it to play the recording for that test.

2. **Open the file directly**  
   Go to `frontend/test-results/`, open the folder for the test you care about, and play **`video.webm`** in any player that supports WebM (Chrome, Firefox, VLC, or QuickTime with a plugin).

**Saving disk space**

- To record only when a test fails, set `video: 'retain-on-failure'` in the config.
- To record only on first retry, set `video: 'on-first-retry'` (and keep `trace: 'on-first-retry'` for traces).

---

*Based on fixes applied to `frontend/tests/workflow.spec.ts` (TC1–TC4).*
