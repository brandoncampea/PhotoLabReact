# Photo Lab React - Quick Start Guide

## 🎉 Your Photo Lab Customer Portal is Ready!

A complete React application for photo ordering with the following features:

### ✨ Features Implemented

- **Authentication System**
  - Login and registration pages
  - JWT token management
  - Protected routes
  - Automatic logout on session expiration

- **Photo Browsing**
  - Albums page with grid layout
  - Album details with photo gallery
  - Photo thumbnails and full images
  - Responsive image loading

- **Image Cropping**
  - React Cropper integration
  - Custom crop before ordering
  - Option to add without cropping
  - Crop data saved with order

- **Shopping Cart**
  - Add/remove items
  - Update quantities
  - View crop previews
  - Persistent cart (localStorage)
  - Real-time total calculation

- **Order Management**
  - Checkout functionality
  - Order history page
  - Order status tracking
  - Item details display

- **Mobile Responsive**
  - Mobile-first design
  - Tablet optimization
  - Desktop enhancement
  - Touch-friendly controls

### 🚀 Getting Started

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Configure backend URL**:
   - Copy `.env.example` to `.env.local`
   - Update `VITE_API_URL` with your ASP.NET backend

3. **Start development**:
   ```bash
   npm run dev
   ```
   Access at: http://localhost:3000

### 📁 Project Structure

```
PhotoLabReact/
├── src/
│   ├── components/       # Reusable UI components
│   ├── contexts/         # Auth & Cart state management
│   ├── pages/           # Route pages
│   ├── services/        # API integration
│   └── types/           # TypeScript definitions
├── public/              # Static assets
└── .env                 # Environment variables
```

### 🔌 Backend API Integration

Your ASP.NET backend needs these endpoints:

**Authentication**
- POST `/api/auth/login`
- POST `/api/auth/register`

**Albums**
- GET `/api/albums`
- GET `/api/albums/{id}`

**Photos**
- GET `/api/albums/{albumId}/photos`
- GET `/api/photos/{id}`

**Orders**
- GET `/api/orders`
- POST `/api/orders`

### 🛠️ Available Commands

- `npm run dev` - Start development server (port 3000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### 🎨 Technology Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **React Router** for navigation
- **Axios** for API calls
- **React Cropper** for image editing
- **Context API** for state management

### 📝 Next Steps

1. **Update API URL**: Edit `.env.local` with your backend URL
2. **Customize Styles**: Modify colors in `src/index.css` (CSS variables)
3. **Add Features**: Extend components as needed
4. **Test Integration**: Ensure backend endpoints match expected format

### 🔒 Authentication Flow

1. User logs in/registers
2. Backend returns JWT token
3. Token stored in localStorage
4. Included in all API requests
5. Auto-logout on 401 responses

### 💾 State Management

- **AuthContext**: User authentication state
- **CartContext**: Shopping cart state
- Both contexts use localStorage for persistence

### 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

### 🐛 Troubleshooting

**CORS Errors**: Configure CORS in your ASP.NET backend

**Auth Issues**: Clear localStorage and re-login

**Build Errors**: Delete node_modules and reinstall

### 📚 Documentation

See [README.md](README.md) for complete documentation including:
- Detailed API requirements
- Component documentation
- Deployment guide
- Browser support

---

**Status**: ✅ Project fully configured and ready for development

**Dev Server**: Running at http://localhost:3000

**Build**: ✅ Verified successful
