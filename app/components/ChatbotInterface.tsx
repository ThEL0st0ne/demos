'use client';

import React, { useState, useRef, useEffect } from 'react';
import { detectLanguage, detectLanguageSync, translateAmharicToEnglish, translateEnglishToAmharicWithFormatting, LanguageCode, DetectedLanguage } from '@/lib/utils/translationUtils';

// Helper function to render markdown text (bold, links, etc.)
const renderMarkdown = (text: string) => {
  if (!text) return null;

  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let key = 0;

  // Regex to match markdown links [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
  const linkMatches: Array<{ start: number; end: number; text: string; url: string }> = [];
  let linkMatch: RegExpExecArray | null;
  
  // Find all link matches
  linkRegex.lastIndex = 0;
  while ((linkMatch = linkRegex.exec(text)) !== null) {
    linkMatches.push({
      start: linkMatch.index,
      end: linkMatch.index + linkMatch[0].length,
      text: linkMatch[1],
      url: linkMatch[2],
    });
  }

  // Regex to match **bold** (double asterisks)
  const boldRegex = /\*\*([^*]+?)\*\*/g;
  const boldMatches: Array<{ start: number; end: number; text: string }> = [];
  
  // Find all bold matches (but skip if inside a link)
  boldRegex.lastIndex = 0;
  let boldMatch: RegExpExecArray | null;
  while ((boldMatch = boldRegex.exec(text)) !== null) {
    const isInsideLink = linkMatches.some(link => 
      boldMatch!.index >= link.start && boldMatch!.index < link.end
    );
    if (!isInsideLink) {
      boldMatches.push({
        start: boldMatch.index,
        end: boldMatch.index + boldMatch[0].length,
        text: boldMatch[1],
      });
    }
  }

  // If no markdown matches, return original text
  if (boldMatches.length === 0 && linkMatches.length === 0) {
    return text;
  }

  // Combine and sort all matches by position
  const allMatches: Array<{ start: number; end: number; type: 'link' | 'bold'; text: string; url?: string }> = [
    ...linkMatches.map(m => ({ ...m, type: 'link' as const })),
    ...boldMatches.map(m => ({ ...m, type: 'bold' as const }))
  ].sort((a, b) => a.start - b.start);

  // Build the parts array with formatting
  allMatches.forEach((matchItem) => {
    // Add text before the match
    if (matchItem.start > lastIndex) {
      parts.push(text.substring(lastIndex, matchItem.start));
    }

    // Add the formatted element
    if (matchItem.type === 'link') {
      parts.push(
        <a 
          key={key++} 
          href={matchItem.url} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline' }}
        >
          {matchItem.text}
        </a>
      );
    } else {
      parts.push(<strong key={key++}>{matchItem.text}</strong>);
    }

    lastIndex = matchItem.end;
  });

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts}</>;
};

// API Configuration - hardcoded in code as requested
const API_URL = 'https://xpectrum-main-app-prod-cocfr.ondigitalocean.app/api/v1/chat-messages';
// TODO: Replace {api_key} with your actual API key
const API_KEY = 'app-jPCNQKS3Vs6nwDE09wQB501V';
const USER_ID = 'abc-123';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  originalLanguage?: LanguageCode; // Track original language for user messages
  translations?: {
    en?: string; // Cached English translation
    am?: string; // Cached Amharic translation
  };
}

interface ChatFile {
  type: string;
  transfer_method: string;
  url: string;
}

interface ChatbotInterfaceProps {
  onNavigateToVoice?: () => void;
}

const INITIAL_MESSAGES = {
  en: "Hi! I'm ChipChip's assistant. How can I help you today - seller setup, group buying, super-group leaders, Suks, restaurants, payments, or delivery?",
  am: "ሰላም! የቺፕቺፕ ረዳት ነኝ። ዛሬ እንዴት ልረዳዎት እችላለሁ - የሻጭ ማዋቀር፣ የቡድን ግዢ፣ የሱፐር-ግሩፕ መሪዎች፣ ሱኮች፣ ምግብ ቤቶች፣ ክፍያዎች ወይም ማድረስ?"
};

function ChatbotInterface({ onNavigateToVoice }: ChatbotInterfaceProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('en');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [initialTimestamp, setInitialTimestamp] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setShowLanguageDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Generate timestamp on client to avoid SSR hydration mismatches
    setInitialTimestamp(new Date().toLocaleTimeString());
  }, []);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const originalUserInput = inputValue.trim();
    // Lock immediately so rapid key presses don't enqueue duplicate sends
    setIsLoading(true);
    
    // Detect language of user input
    const detectedLanguage = await detectLanguage(originalUserInput);
    console.log(`[Chatbot] User input language detected: ${detectedLanguage}`, originalUserInput);
    
    // Check if language is supported (only English and Amharic are supported)
    if (detectedLanguage === 'other') {
      // Add user message to show what they tried to send
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: originalUserInput,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');
      
      // Add error message after a delay to make it feel more natural
      setTimeout(() => {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: selectedLanguage === 'en' 
            ? "I can only converse in English and Amharic. Please send your message in one of these languages."
            : "እኔ በእንግሊዘኛ እና በአማርኛ ብቻ መወያየት እችላለሁ። እባክዎ መልእክትዎን በእነዚህ ቋንቋዎች አንዱ ይላኩ።",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
      }, 800); // 800ms delay to make it feel natural
      
      return; // Exit early - do NOT send to API
    }
    
    // Translate to English if Amharic
    let queryForLLM = originalUserInput;
    if (detectedLanguage === 'am') {
      console.log('[Chatbot] Translating Amharic to English...');
      try {
        queryForLLM = await translateAmharicToEnglish(originalUserInput);
        console.log('[Chatbot] Translation result:', queryForLLM);
      } catch (err) {
        console.error('[Chatbot] Translation error:', err);
        // Continue with original text if translation fails
        queryForLLM = originalUserInput;
      }
    } else {
      console.log('[Chatbot] English detected, no translation needed');
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: originalUserInput, // Store original user input
      timestamp: new Date(),
      originalLanguage: detectedLanguage, // Track original language
      translations: {
        [detectedLanguage]: originalUserInput, // Store original in translations cache
      },
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setError(null);

    // Reset textarea height
    const textarea = document.querySelector('.chatbot-input') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = 'auto';
    }

    // Create a placeholder for the assistant's response
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    let currentContent = ''; // Accumulated English content from LLM
    let translatedContent = ''; // Final translated (Amharic) content

    try {
      const requestBody = {
        inputs: {},
        query: queryForLLM, // Use translated query for LLM
        response_mode: 'streaming',
        conversation_id: conversationId || '',
        user: USER_ID,
        files: [] as ChatFile[],
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;

          // Handle Server-Sent Events (SSE) format - matching chatbot_llm.py implementation
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim(); // Remove 'data:' prefix and trim

            if (data === '[DONE]' || data === '') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Extract conversation_id if present (like chatbot_llm.py line 386-388)
              // Always update if API returns one - this ensures conversation persists across language switches
              // The API will return the same conversation_id we sent, maintaining continuity
              if (parsed.conversation_id) {
                setConversationId(parsed.conversation_id);
              }

              // Accumulate answer chunks - matching chatbot_llm.py line 407-411
              // Each "answer" field contains a chunk that should be ADDED to the previous content
              if (parsed.answer !== undefined && parsed.answer !== null) {
                currentContent += parsed.answer;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: currentContent,
                          translations:
                            detectedLanguage === 'am'
                              ? {
                                  ...msg.translations,
                                  en: currentContent,
                                }
                              : {
                                  ...msg.translations,
                                  en: currentContent,
                                },
                        }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Skip invalid JSON lines
              console.warn('Failed to parse SSE data:', data, e);
            }
          } else if (line.trim()) {
            // Try to parse as direct JSON (non-SSE format) - fallback
            try {
              const parsed = JSON.parse(line);
              if (parsed.answer !== undefined && parsed.answer !== null) {
                currentContent += parsed.answer;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: currentContent,
                          translations:
                            detectedLanguage === 'am'
                              ? {
                                  ...msg.translations,
                                  en: currentContent,
                                }
                              : {
                                  ...msg.translations,
                                  en: currentContent,
                                },
                        }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        }
      }

      if (currentContent) {
        if (detectedLanguage === 'am') {
          try {
            translatedContent = await translateEnglishToAmharicWithFormatting(currentContent);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content: translatedContent,
                      translations: {
                        ...msg.translations,
                        en: currentContent,
                        am: translatedContent,
                      },
                    }
                  : msg
              )
            );
          } catch (err) {
            console.error('Translation error:', err);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, content: currentContent } : msg
              )
            );
          }
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: currentContent,
                    translations: {
                      ...msg.translations,
                      en: currentContent,
                    },
                  }
                : msg
            )
          );
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was aborted, remove the placeholder message
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
        return;
      }

      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message');
      
      // Update the assistant message with error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: `Error: ${err.message || 'Failed to get response'}` }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const resetConversation = () => {
    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setMessages([]);
    setConversationId('');
    setError(null);
    setInputValue('');
    setIsLoading(false);
  };

  const handleLanguageChange = (lang: LanguageCode) => {
    setSelectedLanguage(lang);
    setShowLanguageDropdown(false);
  };

  const translateMessage = async (messageId: string, targetLang: LanguageCode) => {
    const message = messages.find(m => m.id === messageId);
    if (!message || isTranslating) return;

    // Check if translation is already cached
    if (message.translations?.[targetLang]) {
      // Use cached translation - no API call needed
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, content: message.translations![targetLang]! }
          : msg
      ));
      return;
    }

    // Check if already in target language (using sync version for UI)
    const currentLang = detectLanguageSync(message.content);
    if (currentLang === targetLang) {
      return; // Already in target language
    }

    setIsTranslating(true);
    try {
      // Translate the message
      let translatedText = message.content;
      if (targetLang === 'en') {
        translatedText = await translateAmharicToEnglish(message.content);
      } else {
        translatedText = await translateEnglishToAmharicWithFormatting(message.content);
      }

      // Store original content in cache
      const originalContent = message.content;

      // Update message with translation and cache both versions
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { 
              ...msg, 
              content: translatedText,
              translations: {
                ...(msg.translations || {}),
                [currentLang]: originalContent, // Store original
                [targetLang]: translatedText     // Store translation
              }
            }
          : msg
      ));
    } catch (error) {
      console.error('Translation error:', error);
      setError('Failed to translate message');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-card">
        <div className="chatbot-header">
          <div className="chatbot-logo">
            <img src="/logo-red.webp" alt="ChipChip" className="logo-image" />
          </div>
          <div className="header-right">
            <div className="language-selector" ref={languageDropdownRef}>
              <button
                className="language-button"
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                title="Select Language"
              >
                <span>{selectedLanguage === 'en' ? 'EN' : 'አማርኛ'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 4.5L6 7.5L9 4.5" />
                </svg>
              </button>
              {showLanguageDropdown && (
                <div className="language-dropdown">
                  <button
                    className={`language-option ${selectedLanguage === 'en' ? 'active' : ''}`}
                    onClick={() => handleLanguageChange('en')}
                  >
                    English
                  </button>
                  <button
                    className={`language-option ${selectedLanguage === 'am' ? 'active' : ''}`}
                    onClick={() => handleLanguageChange('am')}
                  >
                    አማርኛ
                  </button>
                </div>
              )}
            </div>
            <div className="header-buttons">
              {onNavigateToVoice && (
                <button
                  className="button nav-button"
                  onClick={onNavigateToVoice}
                  title="Go to Voice Interface"
                >
                  Voice
                </button>
              )}
              <button
                className="button reset-button"
                onClick={resetConversation}
                disabled={isLoading}
                title={selectedLanguage === 'en' ? 'Reset Conversation' : 'ውይይቱን ዳግም አስጀምር'}
              >
                {selectedLanguage === 'en' ? 'Reset' : 'ዳግም አስጀምር'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="status error">
            {error}
          </div>
        )}

        <div className="chatbot-messages">
          <div className="initial-message">
            <div className="message assistant-message">
              <div className="message-header">
                <span className="message-role">{selectedLanguage === 'en' ? 'ChipChip Agent' : 'ቺፕቺፕ ወኪል'}</span>
                <span className="message-time">{initialTimestamp || '--:--'}</span>
              </div>
              <div className="message-content" style={{ color: '#333' }}>
                {INITIAL_MESSAGES[selectedLanguage]}
              </div>
              {/* Translation buttons for initial message */}
              <div className="message-translation-controls">
                <button
                  className={`message-translation-btn ${selectedLanguage === 'en' ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedLanguage !== 'en') {
                      setSelectedLanguage('en');
                    }
                  }}
                  title="View in English"
                >
                  EN
                </button>
                <span className="message-translation-separator">•</span>
                <button
                  className={`message-translation-btn ${selectedLanguage === 'am' ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedLanguage !== 'am') {
                      setSelectedLanguage('am');
                    }
                  }}
                  title="View in Amharic"
                >
                  አማ
                </button>
              </div>
            </div>
          </div>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-header">
                <span className="message-role">
                  {message.role === 'user' ? (selectedLanguage === 'en' ? 'You' : 'እርስዎ') : (selectedLanguage === 'en' ? 'ChipChip Agent' : 'ቺፕቺፕ ወኪል')}
                </span>
                <span className="message-time">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">
                {message.content 
                  ? renderMarkdown(message.content) 
                  : (message.role === 'assistant' && isLoading ? '...' : '')}
              </div>
              {/* Translation buttons for each message */}
              <div className="message-translation-controls">
                <button
                  className={`message-translation-btn ${detectLanguageSync(message.content) === 'en' ? 'active' : ''}`}
                  onClick={() => {
                    const currentLang = detectLanguageSync(message.content);
                    if (currentLang !== 'en') {
                      translateMessage(message.id, 'en');
                    } else if (message.translations?.am) {
                      // Switch to cached Amharic
                      setMessages(prev => prev.map(msg => 
                        msg.id === message.id 
                          ? { ...msg, content: message.translations!.am! }
                          : msg
                      ));
                    }
                  }}
                  disabled={isTranslating}
                  title="View in English"
                >
                  EN
                </button>
                <span className="message-translation-separator">•</span>
                <button
                  className={`message-translation-btn ${detectLanguageSync(message.content) === 'am' ? 'active' : ''}`}
                  onClick={() => {
                    const currentLang = detectLanguageSync(message.content);
                    if (currentLang !== 'am') {
                      translateMessage(message.id, 'am');
                    } else if (message.translations?.en) {
                      // Switch to cached English
                      setMessages(prev => prev.map(msg => 
                        msg.id === message.id 
                          ? { ...msg, content: message.translations!.en! }
                          : msg
                      ));
                    }
                  }}
                  disabled={isTranslating}
                  title="View in Amharic"
                >
                  አማ
                </button>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chatbot-input-container">
          <div className="input-wrapper">
            <textarea
              className="chatbot-input"
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={selectedLanguage === 'en' ? 'Type your message...' : 'መልእክትዎን ይፃፉ..'}
              disabled={isLoading}
              rows={1}
              style={{ color: '#333' }}
            />
            <button
              className="button send-button"
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading}
              title={isLoading ? 'Sending...' : 'Send message (Enter)'}
            >
              {isLoading ? (
                <span className="send-button-content">
                  <span className="spinner"></span>
                  <span>Sending</span>
                </span>
              ) : (
                <span className="send-button-content">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .chatbot-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chatbot-card {
          background: white;
          border-radius: 16px;
          padding: 30px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 800px;
          display: flex;
          flex-direction: column;
          height: 80vh;
          max-height: 800px;
        }

        .chatbot-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #fee2e2;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .chatbot-logo {
          display: flex;
          align-items: center;
        }

        .logo-image {
          height: 40px;
          width: auto;
          object-fit: contain;
        }

        .language-selector {
          position: relative;
        }

        .language-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: white;
          border: 1px solid #e1e5e9;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #333;
          transition: all 0.2s;
        }

        .language-button:hover {
          border-color: #dc2626;
          background: #fef2f2;
        }

        .language-button svg {
          transition: transform 0.2s;
        }

        .language-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: white;
          border: 1px solid #e1e5e9;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          min-width: 120px;
          z-index: 1000;
          overflow: hidden;
        }

        .language-option {
          display: block;
          width: 100%;
          padding: 10px 16px;
          text-align: left;
          background: white;
          border: none;
          cursor: pointer;
          font-size: 14px;
          color: #333;
          transition: background 0.2s;
        }

        .language-option:hover {
          background: #f8f9fa;
        }

        .language-option.active {
          background: #fef2f2;
          color: #dc2626;
          font-weight: 600;
        }

        .header-buttons {
          display: flex;
          gap: 10px;
        }

        .button {
          padding: 8px 16px;
          font-size: 14px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          color: white;
        }

        .nav-button {
          background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
        }

        .reset-button {
          background: linear-gradient(135deg, #991b1b 0%, #c2410c 100%);
        }

        .button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chatbot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .initial-message {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .message {
          padding: 12px 16px;
          border-radius: 12px;
          max-width: 75%;
          word-wrap: break-word;
        }

        .user-message {
          background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
          color: white;
          align-self: flex-end;
          margin-left: auto;
        }

        .assistant-message {
          background: white;
          color: #333;
          border: 1px solid #e1e5e9;
          align-self: flex-start;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-size: 0.85rem;
          opacity: 0.8;
        }

        .message-role {
          font-weight: 600;
        }

        .message-time {
          font-size: 0.75rem;
        }

        .message-content {
          line-height: 1.5;
          white-space: pre-wrap;
          color: inherit;
        }

        .message-content strong {
          font-weight: 600;
          color: inherit;
        }

        .message-content em {
          font-style: italic;
          color: inherit;
        }

        .message-content a {
          color: inherit;
          text-decoration: underline;
        }

        .assistant-message .message-content {
          color: #333;
        }

        .assistant-message .message-content a {
          color: #dc2626 !important;
          text-decoration: underline;
        }

        .user-message .message-content {
          color: white;
        }

        .chatbot-input-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .message-translation-controls {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .message:hover .message-translation-controls {
          opacity: 1;
        }

        .message-translation-btn {
          padding: 2px 6px;
          font-size: 10px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          background: transparent;
          color: #999;
          text-decoration: none;
        }

        .message-translation-btn:hover:not(:disabled) {
          color: #dc2626;
          background: rgba(220, 38, 38, 0.1);
        }

        .message-translation-btn.active {
          color: #dc2626;
          font-weight: 600;
        }

        .message-translation-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .message-translation-separator {
          color: #ddd;
          font-size: 8px;
          padding: 0 2px;
        }

        .user-message .message-translation-controls {
          border-top-color: rgba(255, 255, 255, 0.2);
        }

        .user-message .message-translation-btn {
          color: rgba(255, 255, 255, 0.7);
        }

        .user-message .message-translation-btn:hover:not(:disabled) {
          color: white;
          background: rgba(255, 255, 255, 0.2);
        }

        .user-message .message-translation-btn.active {
          color: white;
        }

        .user-message .message-translation-separator {
          color: rgba(255, 255, 255, 0.4);
        }

        .spinner-small {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(220, 38, 38, 0.3);
          border-top-color: #dc2626;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        .input-wrapper {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          background: white;
          border: 2px solid #e1e5e9;
          border-radius: 12px;
          padding: 8px;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        .input-wrapper:focus-within {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
        }

        .chatbot-input {
          flex: 1 1 auto;
          min-width: 0;
          width: 100%;
          padding: 10px 12px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-family: inherit;
          resize: none;
          min-height: 24px;
          max-height: 120px;
          line-height: 1.5;
          background: transparent;
          transition: none;
          box-sizing: border-box;
          color: #333 !important;
        }

        .chatbot-input:focus {
          outline: none;
          color: #333 !important;
        }

        .chatbot-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          color: #333 !important;
        }

        .chatbot-input::placeholder {
          color: #999;
        }

        .send-button {
          padding: 10px;
          width: 48px;
          height: 48px;
          min-width: 48px;
          max-width: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          transition: all 0.2s;
          flex-shrink: 0;
          flex-grow: 0;
          background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
          border: none;
          color: white;
          cursor: pointer;
        }

        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .send-button:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
        }

        .send-button-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .input-hint {
          font-size: 12px;
          color: #666;
          padding: 0 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .input-hint kbd {
          background: #f0f0f0;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 11px;
          font-family: monospace;
          color: #333;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
        }

        .conversation-info {
          margin-top: 10px;
          padding: 8px;
          background: #f8f9fa;
          border-radius: 6px;
          text-align: center;
          color: #666;
        }

        .status {
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 15px;
          font-weight: 500;
        }

        .status.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        @media (max-width: 600px) {
          .chatbot-container {
            padding: 10px;
          }

          .chatbot-card {
            padding: 20px;
            height: 90vh;
          }

          .chatbot-title {
            font-size: 1.4rem;
          }

          .message {
            max-width: 85%;
          }

          .chatbot-input-container {
            flex-direction: column;
          }

          .send-button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default ChatbotInterface;

