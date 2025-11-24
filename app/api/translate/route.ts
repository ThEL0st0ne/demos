import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export async function POST(request: NextRequest) {
  try {
    const { text, targetLang, sourceLang } = await request.json();

    if (!text || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required fields: text, targetLang' },
        { status: 400 }
      );
    }

    const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || "AIzaSyD4Dz4KT1b716y8R34WoogEuRMX6j-WQ-4";

    if (!GOOGLE_TRANSLATE_API_KEY) {
      console.error('Google Translate API key not configured');
      return NextResponse.json(
        { error: 'Translation service not configured' },
        { status: 500 }
      );
    }

    const payload: {
      q: string;
      target: string;
      source?: string;
    } = {
      q: text,
      target: targetLang,
    };

    if (sourceLang) {
      payload.source = sourceLang;
    }

    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('Google Translate API error:', errorData);
      return NextResponse.json(
        { error: errorData.error?.message || `Translation failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.data && data.data.translations && data.data.translations.length > 0) {
      const translatedText = decodeHtmlEntities(data.data.translations[0].translatedText);
      return NextResponse.json({ translatedText });
    }

    return NextResponse.json(
      { error: 'No translation found in response' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: error.message || 'Translation failed' },
      { status: 500 }
    );
  }
}

