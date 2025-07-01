# Qloo Taste Discovery

A lean, fully-featured web app that helps users discover culturally similar places using Qloo's Taste AI™ and Google Maps data. Built for the Qloo Global Hackathon.

## ✨ Features

- **Free-text taste queries** - Search for places using natural language like "cozy minimalist cafes with ambient music"
- **@ Autocomplete** - Type "@" followed by a place name for Google Places autocomplete suggestions
- **Google Maps URL parsing** - Paste any Google Maps URL to extract place information
- **Geolocation-powered** - Automatically detects your city as the target location (editable)
- **Smart recommendations** - Uses Qloo's Taste AI to find culturally similar places
- **Beautiful UI** - Minimalistic design with dark/light theme support
- **Share functionality** - Generate permalinks to share discoveries with friends
- **Fully responsive** - Works perfectly on mobile and desktop

## 🚀 Quick Start

### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd qloo-taste-discovery
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your API keys:
   ```bash
   # Get from https://qloo.com/developers
   QLOO_API_KEY=your_qloo_api_key_here
   
   # Get from https://console.cloud.google.com/
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   
   # Get from https://platform.openai.com/api-keys
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:5173**

### Netlify Deployment

1. **Connect to Netlify:**
   - Fork this repository
   - Connect your GitHub repo to Netlify
   - Or use Netlify CLI: `netlify deploy`

2. **Set environment variables in Netlify:**
   - Go to your Netlify site dashboard
   - Navigate to Site settings → Environment variables
   - Add the same environment variables from your `.env` file

3. **Deploy:**
   ```bash
   npm run build
   netlify deploy --prod
   ```

## 🔑 API Keys Setup

### Qloo API Key
1. Visit [https://qloo.com/developers](https://qloo.com/developers)
2. Sign up for a developer account
3. Create a new API key in your dashboard
4. Add to your environment variables

### Google Maps API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - Places API
   - Maps JavaScript API
   - Places API (new)
4. Create credentials → API key
5. Restrict the key to your domain for security
6. Add to your environment variables

### OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up and add billing information
3. Create a new API key
4. Add to your environment variables

## 🧪 Testing

### Run E2E Tests
```bash
# Open Cypress Test Runner
npm run cypress:open

# Run tests headlessly
npm run cypress:run

# Skip API tests in CI (when no keys available)
CYPRESS_SKIP_API_TESTS=true npm run cypress:run
```

### Test Coverage
- UI component functionality
- Theme switching
- Search form validation
- Google Maps URL parsing
- Autocomplete behavior
- URL sharing and permalink generation

## 📁 Project Structure

```
qloo-taste-discovery/
├── src/
│   ├── components/           # React components
│   │   ├── InputBar.tsx     # Search input with autocomplete
│   │   ├── ResultCard.tsx   # Place result display
│   │   ├── SkeletonLoader.tsx # Loading state
│   │   └── ShareButton.tsx  # Share functionality
│   ├── hooks/               # Custom React hooks
│   │   ├── usePlacesAutocomplete.ts # Google Places integration
│   │   └── useQueryParam.ts # URL state management
│   ├── types/               # TypeScript definitions
│   └── App.tsx              # Main application
├── netlify/functions/       # Serverless backend
│   ├── qloo.ts             # Qloo API integration
│   └── parsePlace.ts       # Google Maps URL parsing
├── cypress/e2e/            # End-to-end tests
└── public/                 # Static assets
```

## 🎯 How It Works

1. **Text Query Flow:**
   - User enters free-text query like "cozy minimalist cafes"
   - Backend calls Qloo `/v1/taste/extract` to get taste vector
   - Uses taste vector with `/v1/places/recommendations` to find similar places
   - OpenAI generates explanations for why places are similar

2. **Place Query Flow:**
   - User types "@" + place name or pastes Google Maps URL
   - Google Places Autocomplete suggests matching places
   - Backend calls Qloo `/v1/places/similar` with place ID
   - Returns culturally similar places in target city

3. **Smart Features:**
   - Geolocation auto-fills target city
   - Google Maps URL parsing extracts place information
   - Image handling prioritizes Qloo images, falls back to Google Photos
   - OpenAI explanations are cached to avoid duplicate API calls

## 🎨 Demo Recording Tips

For hackathon submission videos:

1. **Show the complete flow:**
   - Start with a text query like "vintage bookstores with coffee"
   - Demonstrate city auto-detection
   - Show the results with images and explanations

2. **Highlight unique features:**
   - Paste a Google Maps URL to show parsing
   - Use @ autocomplete for place search
   - Share a permalink and open it in new tab
   - Toggle dark/light theme

3. **Mobile responsiveness:**
   - Show the app working on mobile device
   - Demonstrate touch interactions

## 🏗️ Tech Stack

- **Frontend:** Vite + React + TypeScript + TailwindCSS
- **Backend:** Netlify Functions (serverless)
- **APIs:** Qloo Taste AI, Google Maps/Places, OpenAI
- **Testing:** Cypress E2E
- **Deployment:** Netlify
- **Styling:** TailwindCSS with dark/light theme

## 📈 Performance

- **Bundle size:** Optimized with code splitting
- **Time-to-first-byte:** < 200ms on Netlify edge
- **Google Maps:** Lazy loaded only when needed
- **API caching:** OpenAI responses cached in memory
- **Responsive images:** Optimized photo loading

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run cypress:run`
5. Format code: `npm run format`
6. Submit a pull request

## 📄 License

MIT License - feel free to use this code for your own projects! 