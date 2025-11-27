import { NextRequest } from 'next/server';

const API_URL = 'https://xpectrum-main-app-prod-cocfr.ondigitalocean.app/api/v1/chat-messages';
const DEFAULT_API_KEY = 'app-jPCNQKS3Vs6nwDE09wQB501V';
const WORKFLOW_API_KEY = 'app-dKuQCL3IkKYu6HXBurHvkrfP';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputs, query, response_mode, conversation_id, user, files } = body;

    // Determine if this is a workflow request
    const isWorkflowRequest = inputs?.workflow !== undefined;
    const apiKey = isWorkflowRequest ? WORKFLOW_API_KEY : DEFAULT_API_KEY;

    const requestBody = {
      inputs: inputs || {},
      query,
      response_mode: response_mode || 'streaming',
      conversation_id: conversation_id || '',
      user: user || 'abc-123',
      files: files || [],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return new Response(
        JSON.stringify({ error: errorData.detail || `HTTP ${response.status}: ${response.statusText}` }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Accumulate the entire response before sending to client
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'No response body' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedAnswer = '';
    let finalConversationId = conversation_id || '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;

          // Handle Server-Sent Events (SSE) format
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim(); // Remove 'data:' prefix and trim

            if (data === '[DONE]' || data === '') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Extract conversation_id if present
              if (parsed.conversation_id) {
                finalConversationId = parsed.conversation_id;
              }

              // Accumulate answer chunks
              if (parsed.answer !== undefined && parsed.answer !== null) {
                accumulatedAnswer += parsed.answer;
              }
            } catch (e) {
              // Skip invalid JSON lines
              console.warn('Failed to parse SSE data:', data, e);
            }
          } else if (line.trim()) {
            // Try to parse as direct JSON (non-SSE format) - fallback
            try {
              const parsed = JSON.parse(line);
              if (parsed.conversation_id) {
                finalConversationId = parsed.conversation_id;
              }
              if (parsed.answer !== undefined && parsed.answer !== null) {
                accumulatedAnswer += parsed.answer;
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Send complete response as JSON (non-streaming)
    return new Response(
      JSON.stringify({
        answer: accumulatedAnswer,
        conversation_id: finalConversationId,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Chat messages API error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process chat message' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

