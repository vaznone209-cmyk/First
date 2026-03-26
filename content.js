// Content script - handles text selection and tooltip display
// Uses Shadow DOM for complete style isolation

let tooltipHost = null;
let tooltip = null;
let shadowRoot = null;
let debounceTimer = null;

// Tooltip CSS (injected into Shadow DOM)
const TOOLTIP_STYLES = `
<style>
  :host {
    all: initial;
  }
  
  .ai-vocab-tooltip {
    all: initial;
    position: absolute;
    z-index: 2147483647;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #1f2937;
    max-width: 350px;
    min-width: 280px;
    display: none;
    opacity: 0;
    transform: translateY(-10px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: auto;
  }
  
  .ai-vocab-tooltip.ai-vocab-visible {
    display: block;
    opacity: 1;
    transform: translateY(0);
  }
  
  .ai-vocab-content {
    padding: 16px;
  }
  
  .ai-vocab-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  
  .ai-vocab-word {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #111827;
  }
  
  .ai-vocab-transcription {
    font-size: 13px;
    color: #6b7280;
    font-family: 'Lucida Sans Unicode', 'Arial Unicode MS', sans-serif;
  }
  
  .ai-vocab-definition {
    margin-bottom: 12px;
    color: #374151;
    line-height: 1.6;
  }
  
  .ai-vocab-example {
    padding: 10px 12px;
    background: #f9fafb;
    border-left: 3px solid #3b82f6;
    border-radius: 4px;
    margin-bottom: 12px;
    font-style: italic;
    color: #4b5563;
    font-size: 13px;
  }
  
  .ai-vocab-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  
  .ai-vocab-save-btn {
    all: initial;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }
  
  .ai-vocab-save-btn:hover {
    background: #2563eb;
  }
  
  .ai-vocab-save-btn:active {
    background: #1d4ed8;
  }
  
  .ai-vocab-close-btn {
    all: initial;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #f3f4f6;
    color: #6b7280;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .ai-vocab-close-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }
  
  .ai-vocab-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    gap: 12px;
    color: #6b7280;
  }
  
  .ai-vocab-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: ai-vocab-spin 0.8s linear infinite;
  }
  
  @keyframes ai-vocab-spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .ai-vocab-error-message {
    padding: 16px;
    color: #ef4444;
    background: #fef2f2;
    border-radius: 6px;
    font-size: 13px;
  }
  
  .ai-vocab-notification {
    all: initial;
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: ai-vocab-slide-in 0.3s ease;
  }
  
  .ai-vocab-success {
    background: #10b981;
    color: white;
  }
  
  .ai-vocab-error {
    background: #ef4444;
    color: white;
  }
  
  .ai-vocab-info {
    background: #3b82f6;
    color: white;
  }
  
  .ai-vocab-fade-out {
    animation: ai-vocab-fade-out 0.3s ease forwards;
  }
  
  @keyframes ai-vocab-slide-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes ai-vocab-fade-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
</style>
`;

// Create tooltip with Shadow DOM
function createTooltip() {
  if (tooltipHost) return tooltip;

  // Create host element
  tooltipHost = document.createElement('div');
  tooltipHost.id = 'ai-vocab-tooltip-host';
  
  // Attach Shadow DOM
  shadowRoot = tooltipHost.attachShadow({ mode: 'open' });
  
  // Inject styles and content
  shadowRoot.innerHTML = TOOLTIP_STYLES + `
    <div class="ai-vocab-tooltip">
      <div class="ai-vocab-loading">
        <div class="ai-vocab-spinner"></div>
        <span>Loading...</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(tooltipHost);
  tooltip = shadowRoot.querySelector('.ai-vocab-tooltip');
  return tooltip;
}

// Position tooltip near selection
function positionTooltip(selection) {
  if (!tooltip || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Calculate position
  let top = rect.bottom + window.scrollY + 10;
  let left = rect.left + window.scrollX;
  
  // Ensure tooltip stays within viewport
  const tooltipWidth = 350;
  const tooltipHeight = 200;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (left + tooltipWidth > viewportWidth) {
    left = viewportWidth - tooltipWidth - 10;
  }
  
  if (top + tooltipHeight > viewportHeight + window.scrollY) {
    top = rect.top + window.scrollY - tooltipHeight - 10;
  }
  
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

// Show tooltip with content
function showTooltip(content, isLoading = false, errorMessage = null) {
  const t = createTooltip();
  
  if (isLoading) {
    t.innerHTML = `
      <div class="ai-vocab-loading">
        <div class="ai-vocab-spinner"></div>
        <span>Loading...</span>
      </div>
    `;
  } else if (errorMessage) {
    t.innerHTML = `
      <div class="ai-vocab-error-message">
        <strong>Error:</strong><br>
        ${escapeHtml(errorMessage)}
      </div>
      <div class="ai-vocab-actions" style="margin-top: 12px;">
        <button class="ai-vocab-close-btn" title="Close" style="margin-left: auto;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    
    t.querySelector('.ai-vocab-close-btn').addEventListener('click', () => {
      hideTooltip();
    });
  } else {
    t.innerHTML = `
      <div class="ai-vocab-content">
        <div class="ai-vocab-header">
          <h3 class="ai-vocab-word">${escapeHtml(content.word)}</h3>
          <span class="ai-vocab-transcription">${escapeHtml(content.transcription || '')}</span>
        </div>
        <div class="ai-vocab-definition">
          ${escapeHtml(content.definition || 'No definition available')}
        </div>
        <div class="ai-vocab-example">
          <em>${escapeHtml(content.example || '')}</em>
        </div>
        <div class="ai-vocab-actions">
          <button class="ai-vocab-save-btn" title="Save to collection">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            Save
          </button>
          <button class="ai-vocab-close-btn" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    t.querySelector('.ai-vocab-save-btn').addEventListener('click', () => {
      saveWord(content);
    });
    
    t.querySelector('.ai-vocab-close-btn').addEventListener('click', () => {
      hideTooltip();
    });
  }
  
  t.classList.add('ai-vocab-visible');
}

// Hide tooltip
function hideTooltip() {
  if (tooltip) {
    tooltip.classList.remove('ai-vocab-visible');
    setTimeout(() => {
      if (tooltip && tooltip.parentNode) {
        tooltip.style.display = 'none';
      }
    }, 200);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Save word to collection
async function saveWord(wordData) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'saveWord',
      wordData: wordData
    });
    
    if (response.error) {
      showNotification('Error: ' + response.error, 'error');
    } else {
      showNotification('Word saved successfully!', 'success');
      hideTooltip();
    }
  } catch (error) {
    console.error('Save error:', error);
    showNotification('Failed to save word', 'error');
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `ai-vocab-notification ai-vocab-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('ai-vocab-fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Fetch word info from AI
async function fetchWordInfo(word) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'fetchWordInfo',
      word: word
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Handle text selection
function handleSelection() {
  clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(async () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (!selectedText || selectedText.length > 100) {
      hideTooltip();
      return;
    }
    
    // Check if selection is within an editable area
    const anchorNode = selection.anchorNode;
    if (anchorNode) {
      const parentElement = anchorNode.parentElement;
      if (parentElement && (
        parentElement.isContentEditable ||
        ['INPUT', 'TEXTAREA'].includes(parentElement.tagName)
      )) {
        hideTooltip();
        return;
      }
    }
    
    // Show loading tooltip
    const t = createTooltip();
    tooltipHost.style.display = 'block';
    positionTooltip(selection);
    showTooltip({}, true);
    
    try {
      const wordInfo = await fetchWordInfo(selectedText);
      showTooltip(wordInfo);
      positionTooltip(selection);
    } catch (error) {
      console.error('Error fetching word info:', error);
      showTooltip(null, false, error.message || 'Failed to fetch word info');
      positionTooltip(selection);
    }
  }, 300); // Debounce delay
}

// Handle mouse up for selection
document.addEventListener('mouseup', handleSelection);

// Handle touch end for mobile
document.addEventListener('touchend', handleSelection);

// Hide tooltip on scroll
document.addEventListener('scroll', () => {
  hideTooltip();
}, { passive: true });

// Hide tooltip on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideTooltip();
  }
});

console.log('AI Vocabulary Learner content script loaded (Shadow DOM enabled)');
