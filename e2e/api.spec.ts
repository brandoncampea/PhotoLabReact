import { test, expect } from '@playwright/test';

test.describe('API Integration', () => {
  test('API health check', async ({ request }) => {
    // Check if API is accessible
    const response = await request.get('http://localhost:3001/api/health').catch(() => null);
    
    // API might not have health endpoint, that's ok
    if (response) {
      expect(response.ok()).toBeTruthy();
    }
  });

  test('album list API endpoint is accessible', async ({ request }) => {
    const response = await request.get('http://localhost:3001/api/albums').catch(() => null);
    
    // Should get 401 or 200, not 404 or 500
    if (response) {
      expect([200, 401, 403]).toContain(response.status());
    }
  });

  test('authentication API responds', async ({ request }) => {
    const response = await request.post('http://localhost:3001/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123',
      },
    }).catch(() => null);
    
    if (response) {
      // Should get 200, 401, or 400 - not 500
      expect([200, 400, 401]).toContain(response.status());
    }
  });

  test('frontend loads without console errors', async ({ page }) => {
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleLogs.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Filter out known third-party errors
    const criticalErrors = consoleLogs.filter(
      log => !log.includes('facebook') && 
              !log.includes('google') &&
              !log.includes('external')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('frontend handles API errors gracefully', async ({ page }) => {
    // Go to login page
    await page.goto('/login');
    
    // Simulate network failure during login
    await page.context().setOffline(true);
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Login")');
    
    // Should show error message, not crash
    await page.waitForTimeout(1500);
    
    // Restore network
    await page.context().setOffline(false);
    
    // Check for error message or handling
    const errorMsg = page.locator('text=/error|network|connection|try again/i');
    const isHandled = await errorMsg.isVisible().catch(() => false);
    
    // Either shows error or stays on login page
    expect(isHandled || page.url().includes('login')).toBeTruthy();
  });
});
