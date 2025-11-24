# Chatbot Demo

A simple Next.js chatbot demo with translation support (English and Amharic).

## Features

- Chatbot interface with streaming responses
- Language detection (English/Amharic)
- Automatic translation between English and Amharic
- Message translation controls
- Responsive design

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file (optional - API key is hardcoded for demo):
```env
GOOGLE_TRANSLATE_API_KEY=your-api-key-here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

- `/` - Home page with navigation
- `/chatbot` - Main chatbot interface
- `/chatbot/[agentId]` - Agent-specific chatbot page

## API Routes

- `/api/detect-language` - Language detection using Google Translate API
- `/api/translate` - Text translation using Google Translate API

## Notes

This is a demo application. For production use, make sure to:
- Store API keys securely in environment variables
- Implement proper error handling
- Add authentication if needed
- Configure your chatbot API endpoints

