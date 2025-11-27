import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const CAMB_TRANSLATE_URL = 'https://client.camb.ai/apis/translate';
const CAMB_RESULT_URL = 'https://client.camb.ai/apis/translation-result';
const BACKENSTER_TRANSLATE_URL = 'https://api-b2b.backenster.com/b1/api/v3/translate';

type LanguageCode = 'en' | 'am';
type TranslationProvider = 'google' | 'camb' | 'backenster';

const CAMB_LANGUAGE_CODES: Record<LanguageCode, number> = {
  en: 1,
  am: 3,
};

const BACKENSTER_LANGUAGE_CODES: Record<LanguageCode, string> = {
  en: 'en_GB',
  am: 'am_ET',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function translateWithGoogle(text: string, targetLang: string, sourceLang?: string) {
  const GOOGLE_TRANSLATE_API_KEY =
    process.env.GOOGLE_TRANSLATE_API_KEY || 'AIzaSyD4Dz4KT1b716y8R34WoogEuRMX6j-WQ-4';

  if (!GOOGLE_TRANSLATE_API_KEY) {
    throw new Error('Google Translate API key not configured');
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
    throw new Error(errorData.error?.message || `Translation failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.data && data.data.translations && data.data.translations.length > 0) {
    return decodeHtmlEntities(data.data.translations[0].translatedText);
  }

  throw new Error('No translation found in response');
}

async function translateWithCamb(text: string, targetLang: LanguageCode, sourceLang?: LanguageCode) {
  if (!sourceLang) {
    throw new Error('Camb translation requires sourceLang');
  }

  if (sourceLang === targetLang) {
    return text;
  }

  const apiKey =
    process.env.CAMB_API_KEY || 'b0054807-a68e-4d5b-b01c-4312f6ebb55e';

  if (!apiKey) {
    throw new Error('Camb API key not configured');
  }

  const sourceCode = CAMB_LANGUAGE_CODES[sourceLang];
  const targetCode = CAMB_LANGUAGE_CODES[targetLang];

  if (!sourceCode || !targetCode) {
    throw new Error('Unsupported language for Camb translation');
  }

  const submitResponse = await fetch(CAMB_TRANSLATE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_language: sourceCode,
      target_language: targetCode,
      texts: [text],
    }),
  });

  if (!submitResponse.ok) {
    const errorData = await submitResponse.json().catch(() => ({}));
    console.error('Camb translate submit error:', errorData);
    throw new Error('Failed to submit Camb translation');
  }

  const submitData = await submitResponse.json();
  const taskId = submitData.task_id;

  if (!taskId) {
    throw new Error('Camb translation response missing task_id');
  }

  const statusUrl = `${CAMB_TRANSLATE_URL}/${taskId}`;
  let runId: string | undefined;

  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(1000);
    const statusResponse = await fetch(statusUrl, {
      headers: { 'x-api-key': apiKey },
    });

    if (!statusResponse.ok) {
      console.error('Camb translate status error:', statusResponse.statusText);
      continue;
    }

    const statusData = await statusResponse.json();
    const status = statusData.status;

    if (status === 'SUCCESS') {
      runId = statusData.run_id;
      break;
    }

    if (status === 'ERROR') {
      throw new Error('Camb translation returned an error status');
    }
  }

  if (!runId) {
    throw new Error('Camb translation timed out waiting for completion');
  }

  const resultResponse = await fetch(`${CAMB_RESULT_URL}/${runId}`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!resultResponse.ok) {
    console.error('Camb translate result error:', resultResponse.statusText);
    throw new Error('Failed to fetch Camb translation result');
  }

  const resultData = await resultResponse.json();
  const texts = resultData.texts;

  if (Array.isArray(texts) && texts.length > 0) {
    return texts[0] ?? text;
  }

  throw new Error('Camb translation returned no texts');
}

async function translateWithBackenster(text: string, targetLang: LanguageCode, sourceLang?: LanguageCode) {
  if (!sourceLang) {
    throw new Error('Backenster translation requires sourceLang');
  }

  if (sourceLang === targetLang) {
    return text;
  }

  const apiKey =
    process.env.BACKENSTER_API_KEY || 'backenster-demo-key';

  if (!apiKey) {
    throw new Error('Backenster API key not configured');
  }

  const fromCode = BACKENSTER_LANGUAGE_CODES[sourceLang];
  const toCode = BACKENSTER_LANGUAGE_CODES[targetLang];

  if (!fromCode || !toCode) {
    throw new Error('Unsupported language for Backenster translation');
  }

  const response = await fetch(BACKENSTER_TRANSLATE_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform: 'api',
      from: fromCode,
      to: toCode,
      data: text,
      enableTransliteration: false,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('Backenster translate API error:', data);
    throw new Error('Failed to translate with Backenster');
  }

  if (data.err) {
    console.error('Backenster translate response error:', data.err);
    throw new Error('Backenster translation returned an error');
  }

  if (typeof data.result === 'string' && data.result.length > 0) {
    return data.result;
  }

  throw new Error('Backenster translation returned no result');
}

export async function POST(request: NextRequest) {
  try {
    const {
      text,
      targetLang,
      sourceLang,
      provider = 'google',
    }: {
      text: string;
      targetLang: LanguageCode;
      sourceLang?: LanguageCode;
      provider?: TranslationProvider;
    } = await request.json();

    if (!text || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required fields: text, targetLang' },
        { status: 400 }
      );
    }

    let translatedText: string;

    if (provider === 'camb') {
      translatedText = await translateWithCamb(text, targetLang, sourceLang);
    } else if (provider === 'backenster') {
      translatedText = await translateWithBackenster(text, targetLang, sourceLang);
    } else {
      translatedText = await translateWithGoogle(text, targetLang, sourceLang);
    }

    return NextResponse.json({ translatedText });
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: error.message || 'Translation failed' },
      { status: 500 }
    );
  }
}

