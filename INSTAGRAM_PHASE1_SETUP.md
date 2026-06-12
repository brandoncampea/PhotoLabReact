# Instagram Full Integration — Phase 1 Setup

This phase sets up Meta app prerequisites and app-wide configuration.

## 1) Create Meta App

1. Go to Meta for Developers and create a **Business** app.
2. Add products:
	- **Facebook Login**
	- **Instagram Graph API**
3. Add your platform domains and OAuth redirect URIs.
4. Make sure the app is configured to allow the Instagram scopes you request:
	- If the app is still in **Development** mode, log in with a role that is added to the app (Admin/Developer/Tester).
	- Confirm **Facebook Login** is enabled for the app.
	- Confirm **Instagram Graph API** is added as a product.
	- If Meta shows invalid scopes, the app usually has not been granted access to those permissions yet.
	- For publish flows, request `instagram_content_publish` only after the app can already authorize the base connect scopes.

Recommended local callback:

- `http://localhost:3000/api/instagram/connect/callback`

## 2) Account requirements per studio

Each studio account that connects must use:

- Instagram **Business** or **Creator** account
- Linked Facebook Page

Note: Studio-specific values are **not** environment variables. They should be stored in DB per `studio_id`.

## 3) Required permissions (for connect and publish)

For initial connection, start with:

- `instagram_basic`
- `pages_show_list`
- `pages_read_engagement`

Only enable `instagram_content_publish` when you are ready to test publishing and the permission is valid for your app.

For production use, submit these for App Review.

## 4) Environment variables (app-wide only)

Set in runtime environment (`.env.local` for local, platform secrets in prod):

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_GRAPH_VERSION` (default `v20.0`)
- `INSTAGRAM_MAX_CAROUSEL_ITEMS` (currently set to `20`)
- `INSTAGRAM_OAUTH_STATE_SECRET` (for signed callback state)
- `INSTAGRAM_OAUTH_STATE_TTL_MINUTES` (default `15`)
- `SOCIAL_TOKEN_ENCRYPTION_KEY` (32-byte base64 key or strong passphrase)

## 4.1) Exactly where each Meta setting goes

Use this mapping so setup is unambiguous:

- `META_APP_ID`
	- Meta path: **My Apps → [Your App] → App Settings → Basic → App ID**
	- Copy this value into your app secrets/environment.

- `META_APP_SECRET`
	- Meta path: **My Apps → [Your App] → App Settings → Basic → App Secret → Show**
	- Keep this server-only (never frontend).

- `META_REDIRECT_URI`
	- Meta path (required in two places):
		1. **Facebook Login → Settings → Valid OAuth Redirect URIs**
		2. **App Settings → Basic → + Add Platform → Website → Site URL** (use app base URL)
	- For local dev, include:
		- `http://localhost:3000/api/instagram/connect/callback`
	- For production, include your deployed callback URL.

- `META_GRAPH_VERSION`
	- Not a dashboard field.
	- Set in env (example: `v20.0`) and keep aligned with your Graph API testing version.

- Required permissions/scopes (start with `instagram_basic`, `pages_show_list`, `pages_read_engagement`; add `instagram_content_publish` later if needed)
	- Meta path: **App Review → Permissions and Features**
	- During development: grant access via test users/roles.
	- For production: submit each needed permission for review.

- App mode (important)
	- Meta path: **App Settings → Basic → App Mode** (Development / Live)
	- Keep Development while testing; switch to Live only after review/verification.

- Privacy policy and data deletion URLs (required for review)
	- Meta path: **App Settings → Basic**
	- Fill these before submitting permissions for production approval.

## 5) Security baseline

- Keep `META_APP_SECRET` in secrets manager only.
- Never expose app secret to frontend.
- Encrypt studio access tokens when persisted in DB.
- If Meta shows `Invalid Scopes`, fix the Meta app configuration first; code changes alone will not resolve it.
- The user who connects must be an app role member while the app is in Development mode.

## 6) Done criteria for Phase 1

- Meta app exists and products are added.
- OAuth redirect URI configured.
- Env vars are configured in local/prod.
- Decision confirmed: app-level credentials in env, studio-level tokens in DB.

