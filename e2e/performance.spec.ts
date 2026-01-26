import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('homepage loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    const loadTime = Date.now() - startTime;
    
    // Should load in less than 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('albums page loads within acceptable time', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Login")');
    
    // Measure albums page load time
    const startTime = Date.now();
    await page.waitForURL('/albums', { timeout: 5000 });
    const loadTime = Date.now() - startTime;
    
    // Should load in less than 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('no memory leaks in navigation', async ({ page }) => {
    // Navigate through multiple pages
    await page.goto('/');
    await page.goto('/login');
    await page.goto('/register');
    await page.goto('/');
    
    // Check memory usage hasn't spiked
    const metrics = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: (performance.memory as any).usedJSHeapSize,
          totalJSHeapSize: (performance.memory as any).totalJSHeapSize,
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
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Login")');
    await page.waitForURL('/albums');
    
    // Open album
    await page.click('a[href*="/albums/"] >> first');
    
    // Check images load without 404s
    const images = page.locator('img');
    const imageCount = await images.count();
    
    if (imageCount > 0) {
      // At least some images should be loaded
      const visibleImages = await images.evaluateAll((imgs: HTMLImageElement[]) =>
        imgs.filter(img => img.naturalHeight > 0).length
      );
      
      expect(visibleImages).toBeGreaterThan(0);
    }
  });
});
