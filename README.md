# Photo Lab React - Customer Portal

A modern React customer portal for photo ordering with cropping, cart management, and checkout functionality. Built with React, TypeScript, and integrates with an ASP.NET backend via REST API.

## Features

### Customer Portal
- 🔐 **Authentication** - User registration and login with JWT tokens
- 📸 **Photo Albums** - Browse albums and view photos
- 🔍 **Photo Search** - Search photos by name or EXIF metadata (camera, settings, date)
- 📊 **Photo Metadata** - View camera settings, date taken, and image details
- ✂️ **Image Cropping** - Crop photos before ordering using react-cropper
- 🛒 **Shopping Cart** - Add photos to cart with custom crops
- 💳 **Checkout** - Place orders with shipping address collection
- 📦 **Product Selection** - Choose from multiple print sizes and digital downloads
- 🎁 **Packages** - Purchase bundled product packages at special pricing
- 💰 **Discount Codes** - Apply promo codes to orders
- 📱 **Mobile Responsive** - Optimized for mobile, tablet, and desktop
- 🎨 **Modern UI** - Clean, intuitive interface with smooth animations

### Admin Portal
- 📁 **Album Management** - Create and manage photo albums with album-specific pricing
- 🖼️ **Photo Upload** - Upload photos with automatic EXIF metadata extraction
- 🛍️ **Product Management** - Manage print products, sizes, and pricing
- 💰 **Price Lists** - Create and manage multiple price lists, import from CSV with smart product grouping
- 📦 **Package System** - Create product packages with bundled pricing
- 💰 **Discount Codes** - Create and manage promotional discount codes
- 🚚 **Shipping Options** - Configure batch and direct shipping with deadlines
- 🎨 **Watermark Management** - Upload and configure watermarks with tiling
- 👥 **User Management** - Manage customer accounts and roles
- 💳 **Payment Configuration** - Set up Stripe and other payment providers
- 📊 **Analytics Dashboard** - Track site visits, album views, and photo views
- 📈 **Sales Reports** - View order statistics and revenue data
- 👤 **Business Profile** - Configure business info and notification settings

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **React Router** - Client-side routing
- **Axios** - HTTP client for API calls
- **React Cropper** - Image cropping component
- **Context API** - State management for auth and cart

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── Navbar.tsx
│   ├── PhotoCard.tsx
│   ├── CartItem.tsx
│   ├── CropperModal.tsx
│   └── ProtectedRoute.tsx
├── contexts/           # React contexts for state management
│   ├── AuthContext.tsx
│   └── CartContext.tsx
├── pages/             # Page components
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Albums.tsx
│   ├── AlbumDetails.tsx
│   ├── Cart.tsx
│   └── Orders.tsx
├── services/          # API service layer
│   ├── api.ts
│   ├── authService.ts
│   ├── albumService.ts
│   ├── photoService.ts
│   └── orderService.ts
├── types/            # TypeScript type definitions
│   └── index.ts
├── App.tsx           # Main app component with routing
├── App.css           # Application styles
├── main.tsx          # Application entry point
└── index.css         # Global styles
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- ASP.NET backend API running (see backend documentation)

### Installation

1. Clone the repository:
```bash
cd /Users/brandoncampea/Projects/PhotoLabReact
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - Copy `.env.example` to `.env.local`
   - Update `VITE_API_URL` with your ASP.NET backend URL

```bash
cp .env.example .env.local
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## API Integration

The app expects the following ASP.NET backend endpoints:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Albums
- `GET /api/albums` - Get all albums
- `GET /api/albums/{id}` - Get album by ID

### Photos
- `GET /api/albums/{albumId}/photos` - Get photos in album
- `GET /api/photos/{id}` - Get photo by ID

### Orders
- `GET /api/orders` - Get user's orders
- `GET /api/orders/{id}` - Get order by ID
- `POST /api/orders` - Create new order

## Authentication Flow

1. User registers or logs in
2. Backend returns JWT token
3. Token stored in localStorage
4. Token sent in Authorization header for all API requests
5. Automatic logout on 401 responses

## State Management

### AuthContext
- Manages user authentication state
- Provides login, register, and logout functions
- Persists user data in localStorage

### CartContext
- Manages shopping cart state
- Handles add, remove, and update operations
- Persists cart data in localStorage
- Calculates totals

## Key Features

### Image Cropping
- Uses react-cropper for intuitive image cropping
- Crop data saved with cart items
- Option to add without cropping

### Protected Routes
- Routes require authentication
- Automatic redirect to login if not authenticated
- Preserves intended destination

### Responsive Design
- Mobile-first CSS approach
- Flexible grid layouts
- Touch-friendly controls
- Optimized for all screen sizes

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Development Notes

- The app uses TypeScript for type safety
- ESLint configured for code quality
- Vite provides fast hot module replacement
- All components are functional with React Hooks

## Backend API Requirements

Your ASP.NET backend should:
1. Support CORS for the frontend origin
2. Return JWT tokens on successful authentication
3. Accept Bearer tokens in Authorization header
4. Return appropriate error messages and status codes
5. Follow REST conventions

Example response formats are defined in `src/types/index.ts`

## Deployment

1. Build the production bundle:
```bash
npm run build
```

2. The `dist` folder contains the production build
3. Deploy to your hosting service (Vercel, Netlify, etc.)
4. Update `VITE_API_URL` environment variable for production

## Troubleshooting

### CORS Issues
- Ensure your ASP.NET backend has CORS properly configured
- Check that the API URL in `.env.local` is correct

### Authentication Issues
- Clear localStorage and try logging in again
- Check browser console for error messages
- Verify backend is returning proper JWT tokens

### Build Errors
- Delete `node_modules` and run `npm install` again
- Clear Vite cache: `rm -rf node_modules/.vite`

## License

This project is for educational/portfolio purposes.

## Author

Brandon Campea
