// Options page script - handles settings management

// Default configuration
const DEFAULT_CONFIG = {
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-3.5-turbo',
  systemPrompt: 'You are a helpful English language tutor. Provide clear, concise definitions suitable for beginners. Always respond in JSON format with fields: word, transcription, definition, example.'
};

// DOM elements
const apiKeyInput = document.getElementById('api-key');
const apiEndpointInput = document.getElementById('api-endpoint');
const modelInput = document.getElementById('model');
const systemPromptInput = document.getElementById('system-prompt');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const exportAllBtn = document.getElementById('export-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const statusMessageEl = document.getElementById('status-message');
const backLink = document.getElementById('back-link');

// Initialize options page
async function init() {
  await loadSettings();
  setupEventListeners();
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await browser.storage.local.get(['aiConfig']);
    const config = { ...DEFAULT_CONFIG, ...result.aiConfig };
    
    apiKeyInput.value = config.apiKey || '';
    apiEndpointInput.value = config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint;
    modelInput.value = config.model || DEFAULT_CONFIG.model;
    systemPromptInput.value = config.systemPrompt || DEFAULT_CONFIG.systemPrompt;
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

// Save settings
async function saveSettings() {
  const config = {
    apiKey: apiKeyInput.value.trim(),
    apiEndpoint: apiEndpointInput.value.trim() || DEFAULT_CONFIG.apiEndpoint,
    model: modelInput.value.trim() || DEFAULT_CONFIG.model,
    systemPrompt: systemPromptInput.value.trim() || DEFAULT_CONFIG.systemPrompt
  };

  // Validate required fields
  if (!config.apiKey) {
    showStatus('API Key is required', 'error');
    apiKeyInput.focus();
    return false;
  }

  if (!config.apiEndpoint) {
    showStatus('API Endpoint is required', 'error');
    apiEndpointInput.focus();
    return false;
  }

  try {
    await browser.storage.local.set({ aiConfig: config });
    showStatus('Settings saved successfully!', 'success');
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Failed to save settings', 'error');
    return false;
  }
}

// Test API connection
async function testConnection() {
  // First save settings
  const saved = await saveSettings();
  if (!saved) return;

  showStatus('Testing connection...', 'info');
  testBtn.disabled = true;

  try {
    const response = await browser.runtime.sendMessage({
      action: 'fetchWordInfo',
      word: 'test'
    });

    if (response.error) {
      throw new Error(response.error);
    }

    showStatus('Connection successful! API is working.', 'success');
  } catch (error) {
    console.error('Test error:', error);
    showStatus(`Connection failed: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
  }
}

// Export all words
async function exportAllWords() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'exportToCSV' });
    
    if (response.error) {
      throw new Error(response.error);
    }

    if (!response || response.length < 20) { // Just header
      showStatus('No words to export', 'info');
      return;
    }

    // Create download link
    const blob = new Blob([response], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocabulary-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showStatus('Export successful!', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showStatus(`Export failed: ${error.message}`, 'error');
  }
}

// Clear all words
async function clearAllWords() {
  if (!confirm('Are you sure you want to delete all saved words? This action cannot be undone.')) {
    return;
  }

  try {
    await browser.storage.local.set({ wordCollection: [] });
    showStatus('All words cleared successfully!', 'success');
  } catch (error) {
    console.error('Clear error:', error);
    showStatus('Failed to clear words', 'error');
  }
}

// Show status message
function showStatus(message, type = 'info') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = `status-message ${type}`;
  statusMessageEl.style.display = 'block';

  // Auto-hide success messages after 3 seconds
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      statusMessageEl.style.display = 'none';
    }, 3000);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Save button
  saveBtn.addEventListener('click', saveSettings);

  // Test button
  testBtn.addEventListener('click', testConnection);

  // Export button
  exportAllBtn.addEventListener('click', exportAllWords);

  // Clear button
  clearAllBtn.addEventListener('click', clearAllWords);

  // Back link
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    // Close options page and open popup
    window.close();
  });

  // Auto-save on change (optional)
  const inputs = [apiKeyInput, apiEndpointInput, modelInput, systemPromptInput];
  inputs.forEach(input => {
    input.addEventListener('change', async () => {
      // Optional: auto-save on change
      // await saveSettings();
    });
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
