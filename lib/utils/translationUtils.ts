// Translation utility - calls server-side API to keep API key secure
// The actual Google Translate API key is stored server-side in environment variables

export type LanguageCode = 'am' | 'en';
export type TranslationProvider = 'google' | 'camb' | 'backenster';
export type DetectedLanguage = LanguageCode | 'other';

async function detectLanguageWithAPI(text: string): Promise<string | null> {
  try {
    const response = await fetch('/api/detect-language', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error('[Language Detection] API error:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.language || null;
  } catch (error) {
    console.error('[Language Detection] Error detecting language:', error);
    return null;
  }
}

export async function isLanguageSupported(text: string): Promise<boolean> {
  if (!text || text.trim().length === 0) {
    return true;
  }

  if (text.trim().length <= 2) {
    const amharicRegex = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      if (/\s/.test(char) || /[.,!?;:'"()\[\]{}\-_=+*&^%$#@~`|\\\/<>]/.test(char)) {
        continue;
      }
      if (charCode <= 127 || amharicRegex.test(char)) {
        continue;
      }
      return false;
    }
    return true;
  }

  const detectedLang = await detectLanguageWithAPI(text);
  
  if (!detectedLang) {
    console.warn('[Language Detection] API detection failed, using fallback');
    const amharicRegex = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;
    const hasAmharic = amharicRegex.test(text);
    if (hasAmharic) {
      return true;
    }
    return true;
  }

  const isSupported = detectedLang === 'en' || detectedLang === 'am';
  
  if (!isSupported) {
    console.log(`[Language Detection] Unsupported language detected: ${detectedLang} for text: "${text.substring(0, 50)}..."`);
  }
  
  return isSupported;
}

export function detectLanguageSync(text: string): DetectedLanguage {
  if (!text || text.trim().length === 0) {
    return 'en';
  }

  const amharicRegex = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;
  const amharicMatches = text.match(/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/g);
  const amharicCount = amharicMatches ? amharicMatches.length : 0;
  const totalChars = text.replace(/\s/g, '').length;
  
  if (amharicCount > 0) {
    if (amharicCount >= 2 || (totalChars > 0 && (amharicCount / totalChars) > 0.2)) {
      return 'am';
    }
  }
  
  return 'en';
}

export async function detectLanguage(text: string): Promise<DetectedLanguage> {
  if (!text || text.trim().length === 0) {
    return 'en';
  }

  const isSupported = await isLanguageSupported(text);
  if (!isSupported) {
    console.log(`[Language Detection] Unsupported language detected`);
    return 'other';
  }

  if (text.trim().length <= 2) {
    const amharicRegex = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;
    if (amharicRegex.test(text)) {
      return 'am';
    }
    return 'en';
  }

  const detectedLang = await detectLanguageWithAPI(text);
  
  if (detectedLang === 'am') {
    console.log(`[Language Detection] Detected Amharic via API`);
    return 'am';
  } else if (detectedLang === 'en') {
    console.log(`[Language Detection] Detected English via API`);
    return 'en';
  } else if (detectedLang) {
    console.warn(`[Language Detection] Unexpected language from API: ${detectedLang}`);
    return 'other';
  }

  const amharicMatches = text.match(/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/g);
  const amharicCount = amharicMatches ? amharicMatches.length : 0;
  const totalChars = text.replace(/\s/g, '').length;
  
  if (amharicCount > 0) {
    if (amharicCount >= 2 || (totalChars > 0 && (amharicCount / totalChars) > 0.2)) {
      console.log(`[Language Detection] Detected Amharic via fallback: ${amharicCount} Amharic chars out of ${totalChars} total chars`);
      return 'am';
    }
  }
  
  console.log(`[Language Detection] Detected English via fallback`);
  return 'en';
}

export async function translate(
  text: string,
  targetLang: LanguageCode,
  sourceLang?: LanguageCode,
  provider: TranslationProvider = 'google'
): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        targetLang,
        sourceLang,
        provider,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.translatedText) {
      return data.translatedText;
    }
    
    throw new Error('No translation found in response');
  } catch (error: any) {
    console.error('Translation error:', error);
    return text;
  }
}

export async function translateAmharicToEnglish(
  text: string,
  provider: TranslationProvider = 'google'
): Promise<string> {
  return translate(text, 'en', 'am', provider);
}

export async function translateEnglishToAmharic(
  text: string,
  provider: TranslationProvider = 'google'
): Promise<string> {
  return translate(text, 'am', 'en', provider);
}

function convertUrlsToMarkdownLinks(text: string): string {
  const urlRegex = /(https?:\/\/[^\s\)]+|www\.[^\s\)]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s\)]*)?)/g;
  
  return text.replace(urlRegex, (url) => {
    let normalizedUrl = url;
    if (url.startsWith('www.')) {
      normalizedUrl = 'https://' + url;
    }
    
    return `[${url}](${normalizedUrl})`;
  });
}

export async function translateEnglishToAmharicWithFormatting(
  text: string,
  provider: TranslationProvider = 'google'
): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  const textWithLinks = convertUrlsToMarkdownLinks(text);
  return translate(textWithLinks, 'am', 'en', provider);
}

