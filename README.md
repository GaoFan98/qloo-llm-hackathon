# Qloo Taste Discovery

A complete web app that helps users discover culturally similar places using Qloo's Taste AI™, Google Maps data, and OpenAI explanations. Built for the **Qloo Global Hackathon**.

## ✨ Features

- **Free-text taste queries** - Search for places using natural language like "cozy minimalist cafes with ambient music"
- **@ Autocomplete with location bias** - Type "@" followed by a place name for Google Places autocomplete suggestions prioritized by your target city
- **Google Maps URL parsing** - Paste any Google Maps URL (including shortened goo.gl links) to extract place information
- **Geolocation-powered** - Automatically detects your city as the target location (editable)
- **AI-generated explanations** - OpenAI creates personalized explanations for why places match your taste
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
   Create a `.env` file with your API keys:
   ```bash
   # Qloo Hackathon API Credentials  
   QLOO_API_KEY=ZMoLxqnSl3w1-4ZDEK6jXlYRdQ64eweO4o_VmXtATcQ1
   QLOO_API_URL=https://hackathon.api.qloo.com
   
   # Google Maps API (required for autocomplete)
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   
   # OpenAI API (required for explanations)
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:8888**
   - Frontend runs on http://localhost:3000 (proxied)
   - Netlify functions on http://localhost:8888

## ⚡ Current Status

| Feature | Status | Notes |
|---------|--------|--------|
| 🔍 **Free-text search** | ✅ **Working** | Uses mock Qloo data with real OpenAI explanations |
| 📍 **@ Autocomplete** | ✅ **Working** | Real Google Places API with location bias |
| 🗺️ **Google Maps URLs** | ✅ **Working** | Parses full URLs and shortened goo.gl links |
| 🌍 **Geolocation** | ✅ **Working** | Auto-detects user's current city |
| 🎨 **UI/UX** | ✅ **Working** | Dark/light themes, responsive design |
| 🔗 **Share links** | ✅ **Working** | Permalink generation and URL state |

### Netlify Deployment

1. **Connect to Netlify:**
   - Fork this repository
   - Connect your GitHub repo to Netlify
   - Set build command: `npm run build`
   - Set publish directory: `dist`

2. **Set environment variables in Netlify:**
   - Go to Site settings → Environment variables
   - Add all environment variables from your `.env` file

3. **Deploy:**
   ```bash
   npm run build
   netlify deploy --prod
   ```

## 🔑 API Keys Setup

### Google Maps API Key ⚠️ **Required**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - **Places API** (for autocomplete)
   - **Geocoding API** (for city coordinates)  
   - Maps JavaScript API (optional)
4. Create credentials → API key
5. **Restrict the key:**
   - Application restrictions: **Websites**
   - Website restrictions: Add:
     ```
     http://localhost:*
     https://localhost:*
     *.netlify.app/*
     *.netlify.com/*
     ```
   - API restrictions: Select "Places API" and "Geocoding API"

### OpenAI API Key ⚠️ **Required**
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up and add billing information  
3. Create a new API key
4. Add to your environment variables

### Qloo API Key ℹ️ **Already provided**
- Hackathon credentials are pre-configured
- Currently using mock data for development
- Real Qloo integration ready for production

## 🧪 Testing

Try these example queries:

| Input Type | Example | Expected Result |
|------------|---------|-----------------|
| **Taste** | `"cozy minimalistic cafe"` | Tokyo coffee shops with AI explanations |
| **@ Place** | `"@Starbucks"` | Autocomplete dropdown with Tokyo Starbucks |  
| **Google URL** | `https://maps.app.goo.gl/ot3gAGzC7FLsWMkS6` | Parses to search query |

## 📁 Project Structure

```
qloo-taste-discovery/
├── src/
│   ├── components/           # React components
│   │   ├── InputBar.tsx     # Search input with autocomplete & URL parsing
│   │   ├── ResultCard.tsx   # Place result display with images
│   │   ├── SkeletonLoader.tsx # Loading state animation
│   │   └── ShareButton.tsx  # Share functionality
│   ├── hooks/               # Custom React hooks
│   │   ├── usePlacesAutocomplete.ts # Google Places with location bias
│   │   ├── useQueryParam.ts # URL state management  
│   │   └── useDebounce.ts   # API call optimization
│   ├── types/               # TypeScript definitions
│   └── App.tsx              # Main application with geolocation
├── netlify/functions/       # Serverless backend
│   ├── qloo.ts             # Qloo API integration + OpenAI explanations
│   └── parsePlace.ts       # Google Maps URL parsing + autocomplete
├── netlify.toml            # Netlify configuration
└── public/                 # Static assets
```

## 🎯 How It Works

### 1. **Location-Aware Autocomplete:**
   - User types "@Starbucks" in Tokyo
   - App geocodes Tokyo → (35.6764, 139.6500)
   - Google Places API prioritizes Tokyo results
   - Shows: "STARBUCKS RESERVE ROASTERY TOKYO" first

### 2. **Smart URL Parsing:**
   - Handles full Google Maps URLs with place_id
   - Parses /place/ URLs to extract place names
   - Resolves shortened goo.gl links
   - Extracts query parameters automatically

### 3. **AI-Powered Explanations:**
   - User searches "cozy minimalistic cafe"  
   - OpenAI generates: *"Blue Bottle Coffee emphasizes a minimalist aesthetic, creating a calm atmosphere..."*
   - Explanations cached to avoid duplicate API calls

### 4. **Geolocation Integration:**
   - Auto-detects user's city via browser geolocation
   - Falls back to manual city input
   - All searches biased toward target city

## 🎨 Demo Recording Tips

Perfect for hackathon submission videos:

1. **Show location bias in action:**
   - Set city to "Tokyo" → search "@Starbucks" → see Tokyo results
   - Change to "London" → search "@Starbucks" → see London results

2. **Demonstrate URL parsing:**
   - Copy any Google Maps link
   - Paste into search → watch it parse automatically
   - Try shortened goo.gl links

3. **Highlight AI explanations:**
   - Search "vintage bookstores with coffee"
   - Show unique AI-generated explanations for each result
   - Compare explanations between different queries

## 🏗️ Tech Stack

- **Frontend:** Vite + React + TypeScript + TailwindCSS
- **Backend:** Netlify Functions (Node.js serverless)
- **APIs:** Google Maps/Places (geocoding + autocomplete), OpenAI GPT-3.5-turbo
- **State:** URL-based state management with custom hooks
- **Deployment:** Netlify with environment variables
- **Styling:** TailwindCSS with system dark/light theme detection

## 📈 Performance Features

- **Location-biased search** - Results prioritized by target city coordinates
- **API response caching** - OpenAI explanations cached in memory  
- **Debounced autocomplete** - Prevents excessive API calls while typing
- **Lazy loading** - Images and components loaded on demand
- **Error boundaries** - Graceful fallbacks for API failures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Set up API keys in your `.env` file
4. Test locally with `npm run dev`
5. Submit a pull request

## 📄 License

MIT License - feel free to use this code for your own projects! 