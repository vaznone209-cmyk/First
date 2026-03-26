// Popup script - handles word list display and interactions

let allWords = [];
let filteredWords = [];

// DOM elements
const wordListEl = document.getElementById('word-list');
const emptyStateEl = document.getElementById('empty-state');
const loadingStateEl = document.getElementById('loading-state');
const searchInputEl = document.getElementById('search-input');
const exportBtnEl = document.getElementById('export-btn');
const optionsLinkEl = document.getElementById('options-link');
const wordCountEl = document.getElementById('word-count');

// Initialize popup
async function init() {
  showLoading();
  await loadWords();
  setupEventListeners();
}

// Show loading state
function showLoading() {
  wordListEl.style.display = 'none';
  emptyStateEl.style.display = 'none';
  loadingStateEl.style.display = 'flex';
}

// Hide loading state
function hideLoading() {
  loadingStateEl.style.display = 'none';
}

// Load words from storage
async function loadWords() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getWords' });
    
    if (response.error) {
      console.error('Error loading words:', response.error);
      showError('Failed to load words');
      return;
    }
    
    allWords = response || [];
    filteredWords = [...allWords];
    
    hideLoading();
    renderWordList();
  } catch (error) {
    console.error('Load error:', error);
    showError('Failed to load words');
  }
}

// Render word list
function renderWordList() {
  wordListEl.innerHTML = '';
  
  if (filteredWords.length === 0) {
    wordListEl.style.display = 'none';
    emptyStateEl.style.display = 'flex';
    wordCountEl.textContent = `${allWords.length} words`;
    return;
  }
  
  wordListEl.style.display = 'block';
  emptyStateEl.style.display = 'none';
  wordCountEl.textContent = `${filteredWords.length} of ${allWords.length} words`;
  
  // Sort by updated date (newest first)
  const sortedWords = [...filteredWords].sort((a, b) => 
    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
  );
  
  sortedWords.forEach(word => {
    const wordEl = createWordElement(word);
    wordListEl.appendChild(wordEl);
  });
}

// Create word element
function createWordElement(word) {
  const el = document.createElement('div');
  el.className = 'word-item';
  
  el.innerHTML = `
    <div class="word-item-header">
      <span class="word-item-word">${escapeHtml(word.word)}</span>
      <span class="word-item-transcription">${escapeHtml(word.transcription || '')}</span>
    </div>
    <div class="word-item-definition">${escapeHtml(word.definition || '')}</div>
    <div class="word-item-example">${escapeHtml(word.example || '')}</div>
    <div class="word-item-actions">
      <button class="btn-delete" title="Delete word">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `;
  
  // Delete button handler
  el.querySelector('.btn-delete').addEventListener('click', async () => {
    if (confirm(`Delete "${word.word}" from your collection?`)) {
      await deleteWord(word.word);
    }
  });
  
  return el;
}

// Delete word
async function deleteWord(word) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'deleteWord',
      word: word
    });
    
    if (response.error) {
      console.error('Delete error:', response.error);
      alert('Failed to delete word');
      return;
    }
    
    await loadWords(); // Reload the list
  } catch (error) {
    console.error('Delete error:', error);
    alert('Failed to delete word');
  }
}

// Export to CSV
async function exportToCSV() {
  if (allWords.length === 0) {
    alert('No words to export. Start by highlighting text on any page!');
    return;
  }
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'exportToCSV' });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Create download link
    const blob = new Blob([response], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocabulary-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    // Show success message
    const originalText = exportBtnEl.innerHTML;
    exportBtnEl.innerHTML = '✓ Exported!';
    setTimeout(() => {
      exportBtnEl.innerHTML = originalText;
    }, 2000);
  } catch (error) {
    console.error('Export error:', error);
    alert('Failed to export: ' + error.message);
  }
}

// Search/filter words
function filterWords(query) {
  const searchTerm = query.toLowerCase().trim();
  
  if (!searchTerm) {
    filteredWords = [...allWords];
  } else {
    filteredWords = allWords.filter(word => 
      word.word.toLowerCase().includes(searchTerm) ||
      (word.definition && word.definition.toLowerCase().includes(searchTerm)) ||
      (word.example && word.example.toLowerCase().includes(searchTerm))
    );
  }
  
  renderWordList();
}

// Setup event listeners
function setupEventListeners() {
  // Search input
  searchInputEl.addEventListener('input', (e) => {
    filterWords(e.target.value);
  });
  
  // Export button
  exportBtnEl.addEventListener('click', exportToCSV);
  
  // Options link
  optionsLinkEl.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show error state
function showError(message) {
  hideLoading();
  wordListEl.style.display = 'none';
  emptyStateEl.style.display = 'flex';
  emptyStateEl.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <p>${message}</p>
    <span>Please try again</span>
  `;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
