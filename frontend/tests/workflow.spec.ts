import path from 'path';
import fs from 'fs';
import { test, expect } from '@playwright/test';

/** Path to sample PDF (run Playwright from frontend: cwd is frontend, so repo/data/... is one level up). */
const SAMPLE_BID_PDF = path.join(process.cwd(), '..', 'data', 'test_samples', 'sample_bid.pdf');

/**
 * POC v3 E2E workflows. Requires Docker Compose (frontend :3000, backend :8001).
 * Optional: run `python scripts/create_poc_v3_test_data.py` for extra seed data.
 * Persona is set to Bid Manager for create/publish/QA/upload.
 * Shared title set in TC1 so TC2–TC4 use the same RFP (serial run).
 * TC2–TC4 target that RFP by regex so the link is unique even if e2eRfpTitle is not shared across workers.
 */
let e2eRfpTitle: string;

/** Matches the E2E-created RFP link (title "E2E Workflow RFP - <timestamp>"); use in main to avoid strict mode. */
function e2eRfpLink(page: import('@playwright/test').Page) {
  return page.getByRole('main').getByRole('link', { name: /^E2E Workflow RFP - \d+/ });
}

function selectBidManager(page: import('@playwright/test').Page) {
  return page.getByRole('combobox', { name: /persona/i }).selectOption('Bid Manager');
}

test.describe('POC v3 workflows', () => {
  test.describe.configure({ mode: 'serial' });

  test('TC1: Create RFP – 4-step wizard', async ({ page }) => {
    e2eRfpTitle = `E2E Workflow RFP - ${Date.now()}`;

    await page.goto('/rfps');
    await selectBidManager(page);
    await expect(page.getByText('Loading RFPs…')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Create RFP' })).toBeVisible();

    await page.getByRole('button', { name: 'Create RFP' }).click();
    await expect(page.getByRole('heading', { name: 'Create RFP' })).toBeVisible();
    await expect(page.getByText('1. Basics')).toBeVisible();

    const templateSelect = page.getByRole('combobox', { name: /load template/i });
    await templateSelect.selectOption({ label: 'Road Construction' });
    await expect(page.getByRole('textbox', { name: /title/i }).first()).not.toHaveValue('');

    await page.getByRole('radio', { name: 'RFI → RFP' }).check();
    await page.getByRole('textbox', { name: /title/i }).first().fill(e2eRfpTitle);
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('2. Criteria')).toBeVisible();
    await page.getByLabel(/technical/i).fill('50');
    await page.getByLabel(/financial/i).fill('30');
    await page.getByLabel(/non-functional/i).fill('20');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('3. Timeline')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByLabel(/technical/i).fill('40');
    await page.getByLabel(/financial/i).fill('30');
    await page.getByLabel(/non-functional/i).fill('20');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Weights must total exactly 100%')).toBeVisible();
    await page.getByLabel(/non-functional/i).fill('30');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('3. Timeline')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('4. Team')).toBeVisible();
    // Submit the wizard form programmatically: the modal's submit button can be missing by the time we click
    // (e.g. form already submitted via Enter or race), and clicking reviewer chips causes scroll→detach.
    await page.evaluate(() => {
      const h2 = Array.from(document.querySelectorAll('h2')).find((el) => el.textContent?.trim() === 'Create RFP');
      const form = h2?.closest('div')?.querySelector('form');
      if (form) (form as HTMLFormElement).requestSubmit();
    });
    await expect(e2eRfpLink(page).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Create RFP' })).not.toBeVisible({ timeout: 10000 });
  });

  test('TC2: RFP detail – Timeline and Publish', async ({ page }) => {
    await page.goto('/rfps');
    await selectBidManager(page);

    await e2eRfpLink(page).first().click();
    await expect(page).toHaveURL(/\/rfps\/\d+$/);

    await expect(page.getByRole('main').getByText('Timeline', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('Publish', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main').getByText('Q&A', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main').getByText('Submission', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main').getByText('Review', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main').getByText('Decision', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Publish to Procurement Portal' }).click();
    await expect(page.getByRole('button', { name: 'Publish to Procurement Portal' })).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('main').getByText('Published', { exact: true })).toBeVisible();
  });

  test('TC3: Vendor Q&A tab – submit and answer', async ({ page }) => {
    await page.goto('/rfps');
    await selectBidManager(page);

    await e2eRfpLink(page).first().click();
    await expect(page).toHaveURL(/\/rfps\/\d+$/);

    await page.getByRole('button', { name: /Vendor Q&A/ }).click();
    await expect(page.getByText('Submit a question')).toBeVisible();

    await page.getByPlaceholder('Vendor / company name').fill('E2E Vendor');
    await page.getByPlaceholder('Your question…').fill('E2E test question?');
    await page.getByRole('button', { name: 'Submit question' }).click();

    await expect(page.getByText('E2E test question?')).toBeVisible();
    const answerInput = page.getByPlaceholder('Type your answer…');
    await answerInput.first().click();
    await answerInput.first().fill('E2E test answer.');
    await page.getByRole('button', { name: 'Answer' }).first().click();

    await expect(page.getByText('E2E test answer.')).toBeVisible();
  });

  test('TC4: Bid upload with sample PDF', async ({ page }) => {
    test.setTimeout(360000); // 6 min: default is 30s, but AI extraction can take 2–5+ min
    if (!fs.existsSync(SAMPLE_BID_PDF)) {
      test.skip(true, `Sample PDF missing: ${SAMPLE_BID_PDF}`);
    }

    await page.goto('/rfps');
    await selectBidManager(page);

    await e2eRfpLink(page).first().click();
    await expect(page).toHaveURL(/\/rfps\/\d+$/);

    await expect(page.getByRole('heading', { name: 'Upload Bid' })).toBeVisible();
    const fileInput = page.locator('input#bid_file');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles(SAMPLE_BID_PDF);
    await page.getByRole('button', { name: 'Upload Bid' }).click();

    // AI extraction can take 2–5+ min. Wait for Bids tab to show at least one bid, then open tab and assert table.
    await expect(page.getByRole('main').getByRole('button', { name: /^Bids \([1-9]\d*\)$/ })).toBeVisible({ timeout: 300000 });
    await page.getByRole('main').getByRole('button', { name: /^Bids \(\d+\)$/ }).click();
    await expect(page.getByRole('main').getByRole('table')).toBeVisible({ timeout: 15000 });
  });
});
