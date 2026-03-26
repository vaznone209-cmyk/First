// Background script - handles API requests and storage management
// With robust error handling and safe JSON parsing

// Default AI configuration
const DEFAULT_CONFIG = {
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-3.5-turbo',
  systemPrompt: 'You are a helpful English language tutor. Provide clear, concise definitions suitable for beginners. Always respond in JSON format with fields: word, transcription, definition, example.'
};

// Safely parse JSON from AI response, even if it contains extra text
function safeParseJSON(str) {
  if (!str) return null;
  
  // Try direct parse first
  try {
    return JSON.parse(str);
  } catch (e) {
    // Ignore and continue to extraction
  }
  
  // Try to extract JSON object from the string
  // This handles cases where AI adds markdown code blocks or extra text
  const jsonMatch = str.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Ignore and continue
    }
  }
  
  // Try to extract JSON array
  const arrayMatch = str.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (e) {
      // Ignore
    }
  }
  
  // Remove markdown code block markers if present
  const cleaned = str.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Final attempt: look for key-value patterns
    console.error('Failed to parse JSON from:', str);
    return null;
  }
}

// Load configuration from storage
async function getConfig() {
  const result = await browser.storage.local.get(['aiConfig']);
  return { ...DEFAULT_CONFIG, ...result.aiConfig };
}

// Call AI API to get word information
async function fetchWordInfo(word) {
  const config = await getConfig();
  
  if (!config.apiKey) {
    throw new Error('API key not configured. Please set it in options.');
  }

  const userPrompt = `Analyze this English word or phrase: "${word}"
Provide:
1. The word itself (normalized form)
2. Phonetic transcription (IPA)
3. Clear definition in simple English
4. An example sentence showing usage

Respond ONLY with valid JSON in this exact format:
{
  "word": "the word",
  "transcription": "/transcription/",
  "definition": "clear definition",
  "example": "Example sentence."
}`;

  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    // Handle HTTP errors with specific messages
    if (!response.ok) {
      let errorMessage = `API request failed: ${response.status}`;
      let errorType = 'http_error';
      
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch (e) {
        // Ignore parse error, use default message
      }
      
      // Provide user-friendly messages for common errors
      switch (response.status) {
        case 401:
          errorMessage = 'Invalid API key. Please check your settings.';
          errorType = 'auth_error';
          break;
        case 403:
          errorMessage = 'Access denied. Check your API key permissions.';
          errorType = 'permission_error';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded. Please wait a moment.';
          errorType = 'rate_limit';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'AI service temporarily unavailable. Please try again.';
          errorType = 'service_error';
          break;
        case 408:
        case 504:
          errorMessage = 'Request timeout. Please check your connection.';
          errorType = 'timeout';
          break;
      }
      
      const error = new Error(errorMessage);
      error.type = errorType;
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse JSON response safely
    const parsedResponse = safeParseJSON(content);
    
    if (!parsedResponse) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid response format from AI. Please try again.');
    }
    
    // Validate required fields
    const requiredFields = ['word', 'definition'];
    for (const field of requiredFields) {
      if (!parsedResponse[field]) {
        console.warn(`Missing field '${field}' in AI response`);
        // Don't fail, but provide defaults
        if (field === 'word') parsedResponse.word = word;
        if (field === 'definition') parsedResponse.definition = 'Definition not available';
      }
    }
    
    return parsedResponse;
  } catch (error) {
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your internet connection.');
    }
    
    // Re-throw known errors
    if (error.type || error.message) {
      throw error;
    }
    
    // Unknown errors
    console.error('Unexpected AI API error:', error);
    throw new Error('An unexpected error occurred. Please try again.');
  }
}

// Save word to collection
async function saveWord(wordData) {
  try {
    const result = await browser.storage.local.get(['wordCollection']);
    const collection = result.wordCollection || [];
    
    // Check if word already exists
    const existingIndex = collection.findIndex(
      item => item.word.toLowerCase() === wordData.word.toLowerCase()
    );
    
    if (existingIndex !== -1) {
      // Update existing word
      collection[existingIndex] = { ...wordData, updatedAt: Date.now() };
    } else {
      // Add new word
      collection.push({ ...wordData, createdAt: Date.now(), updatedAt: Date.now() });
    }
    
    await browser.storage.local.set({ wordCollection: collection });
    return { success: true, collection };
  } catch (error) {
    console.error('Save word error:', error);
    throw new Error('Failed to save word: ' + error.message);
  }
}

// Get all saved words
async function getWords() {
  try {
    const result = await browser.storage.local.get(['wordCollection']);
    return result.wordCollection || [];
  } catch (error) {
    console.error('Get words error:', error);
    throw new Error('Failed to retrieve words: ' + error.message);
  }
}

// Delete word from collection
async function deleteWord(word) {
  try {
    const result = await browser.storage.local.get(['wordCollection']);
    const collection = result.wordCollection || [];
    const filtered = collection.filter(item => item.word.toLowerCase() !== word.toLowerCase());
    await browser.storage.local.set({ wordCollection: filtered });
    return { success: true, collection: filtered };
  } catch (error) {
    console.error('Delete word error:', error);
    throw new Error('Failed to delete word: ' + error.message);
  }
}

// Export collection to CSV
async function exportToCSV() {
  try {
    const words = await getWords();
    
    if (words.length === 0) {
      throw new Error('No words to export');
    }
    
    // Create CSV content with semicolon delimiter for Anki
    const csvContent = [
      ['Word', 'Definition', 'Example'].join(';'),
      ...words.map(w => 
        [w.word, w.definition, w.example].map(field => 
          `"${String(field || '').replace(/"/g, '""')}"`
        ).join(';')
      )
    ].join('\n');
    
    return { success: true, csv: csvContent };
  } catch (error) {
    console.error('Export error:', error);
    throw new Error('Failed to export: ' + error.message);
  }
}

// Message handler with comprehensive error handling
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (message.action) {
        case 'fetchWordInfo':
          return await fetchWordInfo(message.word);
        
        case 'saveWord':
          return await saveWord(message.wordData);
        
        case 'getWords':
          return await getWords();
        
        case 'deleteWord':
          return await deleteWord(message.word);
        
        case 'exportToCSV':
          return await exportToCSV();
        
        case 'getConfig':
          return await getConfig();
        
        default:
          throw new Error(`Unknown action: ${message.action}`);
      }
    } catch (error) {
      // Log error for debugging
      console.error(`Action ${message.action} failed:`, error);
      
      // Return structured error response
      return {
        error: error.message,
        errorCode: error.type || 'unknown',
        status: error.status
      };
    }
  };

  return handleAsync()
    .then(response => {
      // Ensure we always send a response
      sendResponse(response || { error: 'Empty response' });
    })
    .catch(error => {
      // Catch any unhandled errors
      sendResponse({ 
        error: error.message || 'An unexpected error occurred',
        errorCode: 'unexpected_error'
      });
    });
});

// Keep the service worker alive
browser.runtime.onInstalled.addListener(() => {
  console.log('AI Vocabulary Learner installed (v1.1)');
});

console.log('AI Vocabulary Learner background script loaded');
