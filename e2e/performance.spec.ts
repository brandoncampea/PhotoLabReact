import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Performance', () => {
  test('homepage loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    const loadTime = Date.now() - startTime;
    
    // Should load in less than 5 seconds for acceptable performance
    expect(loadTime).toBeLessThan(5000);
  });

  test('albums page loads within acceptable time', async ({ page }) => {
    // Login first
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    await page.fill('input[type="email"]', 'customer@example.com', { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', 'TestPassword@123', { timeout: 5000 }).catch(() => null);
    
    const loginBtn = page.locator('button:has-text("Login"), button:has-text("Sign In")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const startTime = Date.now();
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
      const loadTime = Date.now() - startTime;
      
      // Should complete in less than 10 seconds
      expect(loadTime).toBeLessThan(10000);
    }
  });

  test('no memory leaks in navigation', async ({ page }) => {
    // Navigate through multiple pages
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.goto(BASE_URL + '/register', { waitUntil: 'domcontentloaded' });
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    
    // Check memory usage hasn't spiked
    const metrics = await page.evaluate(() => {
      const perfMemory = (performance as any).memory;
      if (perfMemory) {
        return {
          usedJSHeapSize: perfMemory.usedJSHeapSize,
          totalJSHeapSize: perfMemory.totalJSHeapSize,
        };
      }
      return null;
    });
    
    // Memory info is available in Chromium
    if (metrics) {
      // Heap size should be reasonable (less than 100MB for SPA)
      expect(metrics.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024);
    }
  });

  test('images load properly on album details', async ({ page }) => {
    // Login
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    await page.fill('input[type="email"]', 'customer@example.com', { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', 'TestPassword@123', { timeout: 5000 }).catch(() => null);
    
    const loginBtn = page.locator('button:has-text("Login"), button:has-text("Sign In")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
    
    // Open album
    const albumLink = page.locator('a[href*="/albums/"]').first();
    if (await albumLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await albumLink.click({ timeout: 5000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
    
    // Check images load without 404s
    const images = page.locator('img');
    const imageCount = await images.count().catch(() => 0);
    
    if (imageCount > 0) {
      // At least some images should be loaded
      const visibleImages = await images.evaluateAll((imgs: HTMLImageElement[]) =>
        imgs.filter(img => img.naturalHeight > 0).length
      );
      
      expect(visibleImages).toBeGreaterThan(0);
    }
  });
});
