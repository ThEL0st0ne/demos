import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2/detect';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid text field' },
        { status: 400 }
      );
    }

    const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || "AIzaSyD4Dz4KT1b716y8R34WoogEuRMX6j-WQ-4";

    if (!GOOGLE_TRANSLATE_API_KEY) {
      console.error('Google Translate API key not configured');
      return NextResponse.json(
        { error: 'Language detection service not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('Google Translate API error:', errorData);
      return NextResponse.json(
        { error: errorData.error?.message || `Language detection failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.data && data.data.detections && data.data.detections.length > 0) {
      const detection = data.data.detections[0][0];
      return NextResponse.json({
        language: detection.language,
        confidence: detection.confidence,
      });
    }

    return NextResponse.json(
      { error: 'No language detection found in response' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Language detection error:', error);
    return NextResponse.json(
      { error: error.message || 'Language detection failed' },
      { status: 500 }
    );
  }
}

