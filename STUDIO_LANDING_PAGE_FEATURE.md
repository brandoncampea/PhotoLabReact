# Studio Landing Page Feature Documentation

## Overview
Studios can now create and customize their own branded landing pages with a built-in HTML editor. When a custom domain is configured, visitors are directed to this landing page instead of the albums page, creating a seamless branded experience.

## Features

### 1. **HTML Editor**
- Rich text editor powered by Quill
- Support for formatting, images, videos, and links
- Real-time preview capability
- One-click reset to default template

### 2. **Default Template**
- Pre-made professional landing page
- Includes studio name and call-to-action button
- Fully customizable

### 3. **Custom Domain Integration**
- Landing page automatically serves when custom domain is accessed
- Example: `https://photos.yourstudio.com` → Landing Page
- Falls back to albums if no landing page is configured

## How It Works

### Architecture
```
User visits custom domain (https://labs.yourstudio.com)
                    ↓
customDomainRedirect middleware intercepts
                    ↓
Redirects to /studio/your-studio-slug/landing
                    ↓
publicLanding route serves HTML from studio_landing_pages table
                    ↓
Landing page renders in browser
                    ↓
User can click to view albums or navigate elsewhere
```

### Database Schema
```sql
CREATE TABLE studio_landing_pages (
  id INT IDENTITY(1,1) PRIMARY KEY,
  studio_id INT NOT NULL UNIQUE,
  html_content NVARCHAR(MAX) NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
)
```

## Usage Guide

### For Studio Admins

#### Accessing the Landing Page Editor

1. Go to **Profile Settings** in your Admin Dashboard
2. Scroll down to the **Landing Page** section
3. Click **✏️ Edit Landing Page**

#### Editing Your Landing Page

1. **Use the Rich Editor**
   - Type and format text using toolbar buttons
   - Bold, italic, underline text
   - Create headings, bullet lists, code blocks
   - Insert images, videos, and links
   - Change colors and alignment

2. **Toolbar Features**
   - Headers (H1, H2, H3)
   - **Bold**, _italic_, ~~strikethrough~~, underline
   - Block quote
   - Lists (ordered and unordered)
   - Code block
   - Font sizes and colors
   - Text alignment
   - Image, video, and link insertion
   - Clear formatting

3. **Preview Your Changes**
   - Click **👁️ Preview** to see live landing page
   - Opens in a new tab

#### Saving Your Landing Page

- Click **💾 Save Landing Page** when done
- Your changes are immediately live
- Confirmation message appears

#### Resetting to Default

- Click **🔄 Reset to Default**
- Confirms before resetting
- Restores the original template

#### Closing the Editor

- Click **✕ Cancel** to close without saving
- Any unsaved changes are lost

### Accessing the Landing Page

**As a Customer:**
- Visit your custom domain (e.g., `https://photos.yourstudio.com`)
- See your custom landing page
- Click the call-to-action button to browse albums

**As a Studio Admin (Preview):**
- Go to Profile Settings → Landing Page section
- Click **👁️ Preview** button
- Opens your live landing page in a new tab

## Default Landing Page HTML

When a studio is created, they get this default template:

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 1200px; margin: 0 auto; padding: 40px 20px; text-align: center;">
  <h1 style="font-size: 3em; margin-bottom: 10px; color: #333;">Welcome to Our Studio</h1>
  <p style="font-size: 1.2em; color: #666; margin-bottom: 30px;">View our beautiful photo gallery</p>
  <a href="/albums" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-size: 1.1em; transition: background-color 0.3s;">View Albums</a>
</div>
```

## API Endpoints

### Get Landing Page
```
GET /api/profile/landing-page
Headers: Authorization: Bearer <token>

Response:
{
  "id": 1,
  "studioId": 5,
  "htmlContent": "<div>...</div>",
  "createdAt": "2026-06-10T12:00:00.000Z",
  "updatedAt": "2026-06-10T12:00:00.000Z"
}
```

### Update Landing Page
```
PUT /api/profile/landing-page
Headers: Authorization: Bearer <token>
Body: { "htmlContent": "<div>...</div>" }

Response: Updated landing page object
```

### Reset Landing Page
```
POST /api/profile/landing-page/reset
Headers: Authorization: Bearer <token>

Response: Landing page reset to default
```

### Get Public Landing Page (No Auth Required)
```
GET /studio/:studioSlug/landing

Response:
{
  "studioId": 5,
  "htmlContent": "<div>...</div>",
  "createdAt": "2026-06-10T12:00:00.000Z",
  "updatedAt": "2026-06-10T12:00:00.000Z"
}
```

## Integration with Custom Domains

### Flow Diagram

```
1. Studio configures custom domain: photos.mysite.com
2. Studio points CNAME to: labs.campeaphotography.com
3. Studio creates/edits landing page with HTML editor
4. Customer visits: photos.mysite.com
5. DNS resolves to labs.campeaphotography.com
6. customDomainRedirect middleware catches request
7. Redirects to: /studio/my-studio-slug/landing
8. publicLanding route fetches from studio_landing_pages table
9. Landing page HTML renders
```

## Best Practices

### Design Tips
1. **Keep it Simple** - Clear hierarchy, not too many colors
2. **Mobile Responsive** - Use responsive images and flexible layouts
3. **Brand Consistent** - Use your studio colors and fonts
4. **Clear CTA** - Make the call-to-action button prominent
5. **Load Fast** - Optimize image sizes before uploading

### HTML/CSS Tips
- Use inline styles for compatibility
- Keep HTML semantic and clean
- Test on mobile devices
- Avoid JavaScript (won't work in landing page context)
- Use standard web fonts or fallbacks

### Example Custom Landing Page

```html
<div style="font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 60px 20px;">
  <!-- Hero Section -->
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="font-size: 2.5em; color: #1a1a1a; margin-bottom: 10px;">
      Professional Portrait Photography
    </h1>
    <p style="font-size: 1.1em; color: #666; margin-bottom: 30px;">
      Capturing life's special moments with artistry and passion
    </p>
    <a href="/albums?studioSlug=my-studio" style="display: inline-block; background-color: #0066cc; color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 1.1em;">
      View Our Work
    </a>
  </div>

  <!-- Features Section -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; margin-bottom: 40px;">
    <div style="text-align: center;">
      <h3 style="color: #0066cc; font-size: 1.5em;">📷 Professional Quality</h3>
      <p style="color: #666;">High-resolution images with professional editing</p>
    </div>
    <div style="text-align: center;">
      <h3 style="color: #0066cc; font-size: 1.5em;">⚡ Fast Service</h3>
      <p style="color: #666;">Quick turnaround on all projects</p>
    </div>
    <div style="text-align: center;">
      <h3 style="color: #0066cc; font-size: 1.5em;">💯 100% Satisfaction</h3>
      <p style="color: #666;">Guaranteed or your money back</p>
    </div>
  </div>

  <!-- Contact Section -->
  <div style="background-color: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center;">
    <h3 style="margin-top: 0;">Ready to Book?</h3>
    <p>Contact us today to schedule your session</p>
    <p style="font-size: 0.9em; color: #666;">Email: photos@example.com | Phone: (555) 123-4567</p>
  </div>
</div>
```

## Security Considerations

1. **HTML Sanitization**: Content is stored as-is, but should not contain scripts
2. **XSS Prevention**: Platform handles rendering safely
3. **No JavaScript Execution**: Scripts in landing page HTML won't execute (by design)
4. **Access Control**: Only studio admins can edit their landing page
5. **Public Access**: Landing pages are public (no authentication needed)

## Troubleshooting

### Landing Page Not Showing When I Visit Custom Domain

1. **Check DNS Configuration**
   - Verify CNAME points correctly
   - DNS may take 24-48 hours to propagate
   - Use `nslookup` or `dig` to verify

2. **Check Landing Page Content**
   - Go to Profile Settings → Landing Page
   - Verify landing page has content
   - Try editing and saving again

3. **Clear Browser Cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Clear cookies for the domain

### Landing Page Shows but Looks Wrong

1. **Check HTML Formatting**
   - View Page Source in browser
   - Look for unclosed tags or broken syntax
   - Reset to default and try again

2. **Image Issues**
   - Use full URLs for images (not relative paths)
   - Verify images are publicly accessible
   - Check image file sizes aren't too large

### Can't Save Landing Page

1. **Check Network Connection**
   - Try again in a few seconds
   - Check browser console for errors

2. **Check Browser Compatibility**
   - Use a modern browser (Chrome, Firefox, Safari, Edge)
   - Clear browser cache and try again

3. **Check File Size**
   - Very large HTML files may fail
   - Try splitting into smaller sections

## Performance

- Landing page HTML stored in database
- Served directly without processing
- Fast load times due to simple HTML
- No database joins needed for public requests

## Future Enhancements

- **Template Library**: Pre-made professional templates
- **Drag-and-Drop Builder**: Visual page builder
- **Custom CSS**: Advanced styling options
- **Form Submission**: Contact forms with email
- **Analytics**: Track landing page views
- **A/B Testing**: Test different versions
- **Social Media Integration**: Embedded feeds
- **Mobile Preview**: Real-time mobile editing

## Support

For issues with landing pages:

1. Check the DNS configuration for custom domain
2. Verify landing page content is not empty
3. Try resetting to default and rebuilding
4. Clear browser cache
5. Test in incognito/private mode
6. Contact support with screenshots and URL
