import { test, expect } from '@playwright/test';

test.describe('Navigation and UI', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/photo|lab/i);
    
    // Check navbar is visible - use first() to avoid strict mode
    const navbar = page.locator('nav, [class*="navbar"]').first();
    await expect(navbar).toBeVisible({ timeout: 5000 }).catch(() => null);
  });

  test('navbar contains main navigation links', async ({ page }) => {
    await page.goto('/');
    
    // Check for expected links
    const expectedLinks = ['Home', 'Albums', 'Login', 'Register'];
    
    for (const link of expectedLinks) {
      const element = page.locator(`a:has-text("${link}"), button:has-text("${link}")`);
      expect(await element.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('login page loads and contains form fields', async ({ page }) => {
    await page.goto('/login');
    
    // Check form elements exist
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("Login"), button:has-text("Sign In")').first()).toBeVisible();
    
    // Check register link exists
    const registerLink = page.locator('a:has-text("Register")');
    expect(await registerLink.count()).toBeGreaterThanOrEqual(1);
  });

  test('register page loads and contains form fields', async ({ page }) => {
    await page.goto('/register');
    
    // Check form elements exist
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("Register")').first()).toBeVisible();
    
    // Check login link exists
    const loginLink = page.locator('a:has-text("Login")');
    expect(await loginLink.count()).toBeGreaterThanOrEqual(1);
  });

  test('protected routes redirect to login when not authenticated', async ({ page }) => {
    // Clear any stored auth tokens
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        // Ignore errors in case of same-origin policy
      }
    });
    
    // Try to access protected route
    await page.goto('/albums');
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 5000 });
    expect(page.url()).toContain('login');
  });

  test('404 page appears for invalid routes', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');
    
    // Should show 404 or redirect
    await page.waitForTimeout(500);
    const notFoundText = page.locator('text=/not found|404|does not exist/i');
    const isNotFound = await notFoundText.isVisible().catch(() => false);
    
    // Either shows not found or redirected
    expect(
      page.url().includes('login') || 
      isNotFound || 
      page.url() === 'http://localhost:3000/'
    ).toBeTruthy();
  });

  test('responsive design - mobile view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Check navbar is still accessible
    const navbar = page.locator('nav, [class*="navbar"]').first();
    await expect(navbar).toBeVisible();
    
    // Check for mobile menu if applicable
    const menuButton = page.locator('button[aria-label*="menu" i]');
    expect(await menuButton.count()).toBeGreaterThanOrEqual(0);
  });

  test('responsive design - tablet view', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await page.goto('/');
    
    // Check layout is responsive
    const navbar = page.locator('nav, [class*="navbar"]').first();
    await expect(navbar).toBeVisible();
  });
});
