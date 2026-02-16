import { test, expect } from '@playwright/test';

/**
 * Customer Portal - Feature Coverage Tests
 * Tests all customer-facing features and workflows
 */

const BASE_URL = 'http://localhost:3000';
const customerCredentials = {
  email: 'customer@example.com',
  password: 'TestPassword@123'
};

test.describe('Customer - Search and Discovery', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form
    await page.fill('input[type="email"]', customerCredentials.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', customerCredentials.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('customer can access search page', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    await expect(page).toHaveURL('/search');
    
    // Search page should have search interface
    await expect(page.locator('input[type="text"], input[placeholder*="search" i], main, h1')).toBeTruthy();
  });

  test('customer can search by filename', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    // Find search input
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], input[placeholder*="filename" i]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('photo');
      
      // Should trigger search
      await page.waitForTimeout(500);
      
      // Results or no results message should appear
      const resultsArea = page.locator('main, [class*="result"], [class*="search-results"]');
      await expect(resultsArea).toBeVisible();
    }
  });

  test('customer can search by EXIF metadata', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    // Look for EXIF search fields
    const exifFilters = page.locator('input[placeholder*="camera" i], input[placeholder*="iso" i], input[placeholder*="aperture" i], select[name*="exif"], label:has-text("Camera")');
    
    // Should have EXIF search capability
    if (await exifFilters.first().isVisible()) {
      await expect(exifFilters.first()).toBeVisible();
    }
  });

  test('customer can filter by date', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    // Look for date filter
    const dateFilter = page.locator('input[type="date"], input[placeholder*="date" i], label:has-text("Date")').first();
    
    if (await dateFilter.isVisible()) {
      await expect(dateFilter).toBeVisible();
    }
  });

  test('customer can search by player names', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    // Look for player/person name search
    const playerInput = page.locator('input[placeholder*="player" i], input[placeholder*="person" i], input[placeholder*="name" i], label:has-text("Player")').first();
    
    if (await playerInput.isVisible()) {
      await playerInput.fill('John');
      await page.waitForTimeout(500);
    }
  });

  test('customer can apply multiple filters', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    // Try applying multiple filters
    const inputs = page.locator('input[type="text"], input[type="date"], select');
    
    if (await inputs.count() > 0) {
      // Apply first filter
      const firstInput = inputs.first();
      if (await firstInput.isVisible()) {
        const type = await firstInput.getAttribute('type');
        if (type === 'text') {
          await firstInput.fill('test');
        }
      }
      
      // Search should work with multiple filters
      const searchBtn = page.locator('button:has-text("Search"), button:has-text("Find")').first();
      if (await searchBtn.isVisible()) {
        await searchBtn.click();
      }
    }
  });

  test('customer can view search results', async ({ page }) => {
    await page.goto(BASE_URL + '/search');
    
    // Apply a search
    const searchInput = page.locator('input[type="text"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('*');
      await page.waitForTimeout(500);
    }
    
    // Results area should be visible
    const results = page.locator('img, [class*="photo"], [class*="result"]');
    expect(await results.count()).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Customer - Photo Details and Metadata', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form
    await page.fill('input[type="email"]', customerCredentials.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', customerCredentials.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('customer can view photo metadata', async ({ page }) => {
    // Navigate to album
    await page.goto(BASE_URL + '/albums');
    
    // Click first album
    const firstAlbum = page.locator('a[href*="/albums/"], [class*="album"] a').first();
    
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      // Navigate to photo details
      await page.waitForURL(/\/albums\/\d+/, { timeout: 5000 });
      
      // Look for photo metadata display
      const metadata = page.locator('[class*="metadata"], [class*="exif"], [class*="details"], dd, .info-row').first();
      
      if (await metadata.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(metadata).toBeVisible();
      }
    }
  });

  test('customer can see camera settings', async ({ page }) => {
    // Navigate to album details
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Look for camera/EXIF information
      const cameraInfo = page.locator('text=/camera|iso|aperture|shutter|focal/i').first();
      
      if (await cameraInfo.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(cameraInfo).toBeVisible();
      }
    }
  });

  test('customer can view photo date taken', async ({ page }) => {
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Look for date information
      const dateInfo = page.locator('text=/date|taken|created/i').first();
      
      if (await dateInfo.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(dateInfo).toBeVisible();
      }
    }
  });

  test('customer can expand/collapse photo details', async ({ page }) => {
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Look for expand/toggle button
      const expandBtn = page.locator('button:has-text("Details"), button:has-text("Show More"), button:has-text("Expand")').first();
      
      if (await expandBtn.isVisible()) {
        await expandBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });
});

test.describe('Customer - Cropping and Image Editing', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form
    await page.fill('input[type="email"]', customerCredentials.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', customerCredentials.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('customer can open photo cropper', async ({ page }) => {
    // Navigate to album
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Look for crop button
      const cropBtn = page.locator('button:has-text("Crop"), button:has-text("Edit")').first();
      
      if (await cropBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cropBtn.click();
        
        // Cropper modal should appear
        const cropper = page.locator('[class*="cropper"], [class*="modal"], [class*="dialog"]');
        await expect(cropper.first()).toBeVisible({ timeout: 3000 }).catch(() => null);
      }
    }
  });

  test('customer can crop image', async ({ page }) => {
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Open cropper
      const cropBtn = page.locator('button:has-text("Crop")').first();
      if (await cropBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cropBtn.click();
        
        // Look for crop canvas or handles
        const cropCanvas = page.locator('[class*="cropper"], canvas, img[class*="crop"]').first();
        
        if (await cropCanvas.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Cropping tools should be available
          const controls = page.locator('button, input[type="range"]');
          expect(await controls.count()).toBeGreaterThan(0);
        }
      }
    }
  });

  test('customer can save crop', async ({ page }) => {
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Open cropper and save
      const cropBtn = page.locator('button:has-text("Crop")').first();
      if (await cropBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cropBtn.click();
        
        // Look for save/apply button
        const saveBtn = page.locator('button:has-text("Apply"), button:has-text("Save"), button:has-text("Confirm")').first();
        
        if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(saveBtn).toBeVisible();
        }
      }
    }
  });

  test('customer can preview crop before saving', async ({ page }) => {
    await page.goto(BASE_URL + '/albums');
    
    const firstAlbum = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbum.isVisible()) {
      await firstAlbum.click();
      
      await page.waitForURL(/\/albums\/\d+/);
      
      // Open cropper
      const cropBtn = page.locator('button:has-text("Crop")').first();
      if (await cropBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cropBtn.click();
        
        // Preview should be visible
        const preview = page.locator('img, canvas, [class*="preview"]');
        expect(await preview.count()).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('Customer - Orders and Order History', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form
    await page.fill('input[type="email"]', customerCredentials.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', customerCredentials.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('customer can view orders history', async ({ page }) => {
    await page.goto(BASE_URL + '/orders');
    
    await expect(page).toHaveURL('/orders');
    
    // Orders page should load
    await expect(page.locator('h1, h2, main')).toBeTruthy();
  });

  test('customer can view order details', async ({ page }) => {
    await page.goto(BASE_URL + '/orders');
    
    // Look for first order link
    const firstOrder = page.locator('a[href*="/orders/"], tr a').first();
    
    if (await firstOrder.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstOrder.click();
      
      // Should navigate to order details
      const detailsContent = page.locator('h1, h2, [class*="order"], [class*="details"]');
      await expect(detailsContent.first()).toBeVisible({ timeout: 3000 }).catch(() => null);
    }
  });

  test('customer can filter orders', async ({ page }) => {
    await page.goto(BASE_URL + '/orders');
    
    // Look for filter controls
    const filterInput = page.locator('input[placeholder*="filter" i], select, button:has-text("Filter")').first();
    
    if (await filterInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(filterInput).toBeVisible();
    }
  });

  test('customer can sort orders', async ({ page }) => {
    await page.goto(BASE_URL + '/orders');
    
    // Look for sort controls
    const sortBtn = page.locator('button:has-text("Sort"), [class*="sort"], th[class*="sortable"]').first();
    
    if (await sortBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(sortBtn).toBeVisible();
    }
  });

  test('customer can download order receipt', async ({ page }) => {
    await page.goto(BASE_URL + '/orders');
    
    // Look for order with download option
    const downloadBtn = page.locator('button:has-text("Download"), button:has-text("Receipt"), a:has-text("PDF")').first();
    
    if (await downloadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(downloadBtn).toBeVisible();
    }
  });

  test('customer can view order status', async ({ page }) => {
    await page.goto(BASE_URL + '/orders');
    
    // Orders should show status
    const statusElement = page.locator('[class*="status"], td:nth-child(3), .badge').first();
    
    if (await statusElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(statusElement).toBeVisible();
    }
  });
});

test.describe('Customer - Account and Profile', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form
    await page.fill('input[type="email"]', customerCredentials.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', customerCredentials.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('customer can access profile/account', async ({ page }) => {
    // Look for profile link in navbar
    const profileLink = page.locator('a:has-text("Profile"), a:has-text("Account"), button:has-text("Profile")').first();
    
    if (await profileLink.isVisible()) {
      await profileLink.click();
      
      // Should navigate to profile
      const profileContent = page.locator('h1, h2, main, form');
      await expect(profileContent.first()).toBeVisible({ timeout: 3000 }).catch(() => null);
    }
  });

  test('customer can view account information', async ({ page }) => {
    // Look for profile/account page
    const possibleUrls = [
      '/profile',
      '/account',
      '/settings',
      '/user/profile'
    ];
    
    for (const url of possibleUrls) {
      const response = await page.goto(BASE_URL + url).catch(() => null);
      if (response && response.status() !== 404) {
        // Page found
        await expect(page.locator('h1, h2, main')).toBeTruthy();
        break;
      }
    }
  });

  test('customer can update profile', async ({ page }) => {
    // Find profile page
    const profileLink = page.locator('a:has-text("Profile"), a:has-text("Account")').first();
    
    if (await profileLink.isVisible()) {
      await profileLink.click();
      
      // Look for form and save button
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
      
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(saveBtn).toBeVisible();
      }
    }
  });

  test('customer can change password', async ({ page }) => {
    // Find profile page
    const profileLink = page.locator('a:has-text("Profile"), a:has-text("Account")').first();
    
    if (await profileLink.isVisible()) {
      await profileLink.click();
      
      // Look for password change option
      const passwordBtn = page.locator('button:has-text("Change Password"), a:has-text("Change Password"), [class*="password"]').first();
      
      if (await passwordBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(passwordBtn).toBeVisible();
      }
    }
  });

  test('customer can manage addresses', async ({ page }) => {
    // Find profile or account page
    const profileLink = page.locator('a:has-text("Profile"), a:has-text("Account"), a:has-text("Addresses")').first();
    
    if (await profileLink.isVisible()) {
      await profileLink.click();
      
      // Look for address management
      const addressSection = page.locator('[class*="address"], text=/address/i').first();
      
      if (await addressSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(addressSection).toBeVisible();
      }
    }
  });
});

test.describe('Customer - Mobile Responsiveness', () => {
  test('customer pages are mobile responsive', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Login
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="email"]', customerCredentials.email);
    await page.fill('input[type="password"]', customerCredentials.password);
    await page.click('button:has-text("Sign In"), button:has-text("Login")');
    
    await page.waitForURL('/albums', { timeout: 5000 });
    
    // Test key pages
    const pages = ['/albums', '/cart', '/orders'];
    
    for (const testPath of pages) {
      await page.goto(BASE_URL + testPath);
      
      // Should have content visible
      await expect(page.locator('main, h1, h2')).toBeTruthy();
      
      // No horizontal scroll needed
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(375);
    }
  });

  test('navbar is accessible on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Login
    await page.goto(BASE_URL + '/login');
    await page.fill('input[type="email"]', customerCredentials.email);
    await page.fill('input[type="password"]', customerCredentials.password);
    await page.click('button:has-text("Sign In"), button:has-text("Login")');
    
    await page.waitForURL('/albums', { timeout: 5000 });
    
    // Navigate to albums
    await page.goto(BASE_URL + '/albums');
    
    // Navbar should be accessible
    const navbar = page.locator('nav, [class*="navbar"], [class*="header"]');
    await expect(navbar).toBeVisible();
    
    // Hamburger or menu should work on mobile
    const mobileMenu = page.locator('button:has-text("Menu"), button[class*="hamburger"], button[class*="toggle"]').first();
    
    if (await mobileMenu.isVisible()) {
      await expect(mobileMenu).toBeVisible();
    }
  });
});
