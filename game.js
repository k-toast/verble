// Game state
let gameState = {
    adjective: '',
    noun: '',
    remainingAdjective: '',
    remainingNoun: '',
    quality: 10,
    moves: 0,
    history: [],
    isWon: false,
    isLost: false,
    puzzleDate: ''
};

let puzzles = [];
let currentPuzzle = null;
let debugDateOverride = null;
let countdownInterval = null;

// Get real Helsinki timezone date string (YYYY-MM-DD) - without debug override
function getRealHelsinkiDate() {
    const now = new Date();
    const helsinkiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
    const year = helsinkiTime.getFullYear();
    const month = String(helsinkiTime.getMonth() + 1).padStart(2, '0');
    const day = String(helsinkiTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get Helsinki timezone date string (YYYY-MM-DD)
function getHelsinkiDate() {
    if (debugDateOverride) {
        return debugDateOverride;
    }
    return getRealHelsinkiDate();
}

// Validate date string format (YYYY-MM-DD)
function isValidDateString(dateString) {
    if (!dateString || typeof dateString !== 'string') return false;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;
    
    const parts = dateString.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
        return false;
    }
    
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && 
           date.getMonth() === month - 1 && 
           date.getDate() === day;
}

// Increment date by one day (YYYY-MM-DD format)
function incrementDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.error('Invalid date string format:', dateString);
        return dateString;
    }
    
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return dateString;
    }
    
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Decrement date by one day (YYYY-MM-DD format)
function decrementDate(dateString) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.error('Invalid date string format:', dateString);
        return dateString;
    }
    
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return dateString;
    }
    
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Load puzzles from JSON
async function loadPuzzles() {
    try {
        const response = await fetch('puzzles.json');
        puzzles = await response.json();
    } catch (error) {
        console.error('Error loading puzzles:', error);
        puzzles = [];
    }
}

// Find puzzle for today
function findTodayPuzzle() {
    const today = getHelsinkiDate();
    return puzzles.find(p => p.date === today);
}

// Format date for display (M/D/YYYY)
function formatDateDisplay(dateString) {
    const parts = dateString.split('-');
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const year = parts[0];
    return `${month}/${day}/${year}`;
}

// Initialize game
function initGame() {
    try {
        const savedDebugDate = localStorage.getItem('dishle_debug_date');
        if (savedDebugDate) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(savedDebugDate)) {
                debugDateOverride = savedDebugDate;
            } else {
                localStorage.removeItem('dishle_debug_date');
            }
        }
    } catch (error) {
        console.error('Error reading debug date from localStorage:', error);
    }
    
    currentPuzzle = findTodayPuzzle();
    
    if (!currentPuzzle) {
        document.getElementById('noPuzzleMessage').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
        updatePreviousButtonState();
        startCountdownTimer();
        return;
    }

    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';

    const puzzleDate = currentPuzzle.date;
    document.getElementById('dateDisplay').textContent = formatDateDisplay(puzzleDate);
    
    // Display the full dish name in quotes
    const dishName = `${currentPuzzle.adjective} ${currentPuzzle.noun}`;
    document.getElementById('dishName').textContent = `"${dishName}"`;

    // Try to load saved state
    try {
        const savedState = localStorage.getItem(`dishle_${puzzleDate}`);
        
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                if (parsed && typeof parsed === 'object') {
                    gameState = {
                        adjective: parsed.adjective || currentPuzzle.adjective,
                        noun: parsed.noun || currentPuzzle.noun,
                        remainingAdjective: parsed.remainingAdjective || currentPuzzle.adjective,
                        remainingNoun: parsed.remainingNoun || currentPuzzle.noun,
                        quality: parsed.quality !== undefined ? parsed.quality : (parsed.health !== undefined ? parsed.health : 10),
                        moves: parsed.moves || 0,
                        history: Array.isArray(parsed.history) ? parsed.history : [],
                        isWon: parsed.isWon || false,
                        isLost: parsed.isLost || false,
                        puzzleDate: puzzleDate
                    };
                } else {
                    resetGameState();
                }
            } catch (e) {
                console.error('Error parsing saved state:', e);
                resetGameState();
            }
        } else {
            resetGameState();
        }
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateDisplay();
    loadRecipe();
    startCountdownTimer();
}

function resetGameState() {
    gameState = {
        adjective: currentPuzzle.adjective,
        noun: currentPuzzle.noun,
        remainingAdjective: currentPuzzle.adjective,
        remainingNoun: currentPuzzle.noun,
        quality: 10,
        moves: 0,
        history: [],
        isWon: false,
        isLost: false,
        puzzleDate: currentPuzzle.date
    };
}

// Save game state to localStorage
function saveGameState() {
    try {
        const key = `dishle_${gameState.puzzleDate}`;
        const value = JSON.stringify(gameState);
        localStorage.setItem(key, value);
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.error('localStorage quota exceeded. Game state not saved.');
        } else {
            console.error('Error saving game state:', error);
        }
    }
}

// Update display
function updateDisplay() {
    const puzzleText = document.getElementById('puzzleText');
    puzzleText.innerHTML = `<span class="puzzle-adjective">${gameState.remainingAdjective}</span> <span class="puzzle-noun">${gameState.remainingNoun}</span>`;

    document.getElementById('qualityValue').textContent = gameState.quality;

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    
    if (gameState.isWon || gameState.isLost) {
        input.disabled = true;
        submitBtn.disabled = true;
        showGameOver();
    } else {
        input.disabled = false;
        submitBtn.disabled = false;
    }

    updatePreviousButtonState();
}

// Update Previous button enabled/disabled state
function updatePreviousButtonState() {
    const prevBtn = document.getElementById('prevBtn');
    if (!prevBtn) return;

    const currentDate = getHelsinkiDate();
    const realToday = getRealHelsinkiDate();
    
    if (currentDate === realToday) {
        prevBtn.disabled = true;
        return;
    }

    const prevDate = decrementDate(currentDate);
    const prevPuzzle = puzzles.find(p => p.date === prevDate);
    
    prevBtn.disabled = !prevPuzzle;
}

// Process an ingredient - letters match against combined puzzle left-to-right
function processIngredient(ingredient) {
    if (gameState.isWon || gameState.isLost) return;

    ingredient = ingredient.toUpperCase().trim();
    
    if (!/^[A-Z]{2,20}$/.test(ingredient)) {
        alert('Please enter an ingredient with 2-20 letters (A-Z only)');
        return;
    }

    const result = [];
    let adjArray = gameState.remainingAdjective.split('');
    let nounArray = gameState.remainingNoun.split('');
    let newQuality = gameState.quality;

    for (let i = 0; i < ingredient.length; i++) {
        const letter = ingredient[i];
        let found = false;
        let foundInNoun = false;

        // First check adjective
        for (let j = 0; j < adjArray.length; j++) {
            if (adjArray[j] === letter) {
                adjArray.splice(j, 1);
                found = true;
                foundInNoun = false;
                break;
            }
        }

        // Then check noun if not found in adjective
        if (!found) {
            for (let j = 0; j < nounArray.length; j++) {
                if (nounArray[j] === letter) {
                    nounArray.splice(j, 1);
                    found = true;
                    foundInNoun = true;
                    break;
                }
            }
        }

        if (found) {
            // 'match' = found in noun (green), 'neutral' = found in adjective (grey)
            result.push({ letter: letter, status: foundInNoun ? 'match' : 'neutral' });
        } else {
            // 'miss' = not found anywhere, costs quality (red)
            newQuality--;
            result.push({ letter: letter, status: 'miss' });
        }
    }

    gameState.remainingAdjective = adjArray.join('');
    gameState.remainingNoun = nounArray.join('');
    gameState.quality = newQuality;
    gameState.moves++;
    gameState.history.push({
        ingredient: ingredient,
        result: result
    });

    if (gameState.remainingNoun.replace(/\s/g, '') === '') {
        gameState.isWon = true;
    }

    if (newQuality <= 0) {
        gameState.isLost = true;
    }

    saveGameState();
    updateDisplay();
    loadRecipe();
}

// Load and display recipe (history) - always show 6 slots in 2x3 grid
function loadRecipe() {
    const container = document.getElementById('recipeContainer');
    container.innerHTML = '';

    const maxSlots = 6;

    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'recipe-slot';
        
        // Add number
        const numberDiv = document.createElement('div');
        numberDiv.className = 'recipe-number';
        numberDiv.textContent = `${i + 1}.`;
        slotDiv.appendChild(numberDiv);
        
        if (i < gameState.history.length) {
            // Filled slot with ingredient
            const item = gameState.history[i];
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recipe-item';
            
            item.result.forEach(letterData => {
                const box = document.createElement('div');
                // Support both old format (match: true/false) and new format (status: 'match'/'neutral'/'miss')
                let statusClass;
                if (letterData.status) {
                    statusClass = letterData.status; // 'match', 'neutral', or 'miss'
                } else {
                    // Legacy support for old saved games
                    statusClass = letterData.match ? 'match' : 'miss';
                }
                box.className = 'letter-box ' + statusClass;
                box.textContent = letterData.letter;
                itemDiv.appendChild(box);
            });
            
            slotDiv.appendChild(itemDiv);
        } else {
            // Empty slot with placeholder
            const placeholder = document.createElement('div');
            placeholder.className = 'recipe-placeholder';
            placeholder.textContent = '???';
            slotDiv.appendChild(placeholder);
        }
        
        container.appendChild(slotDiv);
    }
}

// Show game over message as modal
function showGameOver() {
    if (gameState.isWon) {
        const dishName = `${gameState.adjective} ${gameState.noun}`;
        const ingredients = gameState.moves;
        
        const content = `
            <p style="text-align: center; margin-bottom: 20px;">You prepared the ${dishName} with ${ingredients} ingredient${ingredients !== 1 ? 's' : ''}!</p>
            <div style="text-align: center;">
                <button id="modalShareBtn" style="padding: 10px 20px; font-size: 1em; background: #535373; color: #e6e6ec; border: 1px solid #535373; cursor: pointer; font-weight: 500;">Share</button>
            </div>
        `;
        openModal('Victory!', content);
        
        // Add share button listener
        setTimeout(() => {
            const modalShareBtn = document.getElementById('modalShareBtn');
            if (modalShareBtn) {
                modalShareBtn.addEventListener('click', handleShare);
            }
        }, 0);
    } else if (gameState.isLost) {
        const content = `
            <p style="text-align: center; margin-bottom: 20px;">The dish was ruined!</p>
            <div style="text-align: center;">
                <button id="modalShareBtn" style="padding: 10px 20px; font-size: 1em; background: #535373; color: #e6e6ec; border: 1px solid #535373; cursor: pointer; font-weight: 500;">Share</button>
            </div>
        `;
        openModal('Game Over', content);
        
        // Add share button listener
        setTimeout(() => {
            const modalShareBtn = document.getElementById('modalShareBtn');
            if (modalShareBtn) {
                modalShareBtn.addEventListener('click', handleShare);
            }
        }, 0);
    }
}

// Generate share text
function generateShareText() {
    const result = gameState.isWon ? 'Win' : 'Loss';
    const puzzleDate = gameState.puzzleDate;
    const moves = gameState.moves;
    const qualityLost = 10 - gameState.quality;
    const dishName = gameState.noun;
    
    let text = `dishle ${formatDateDisplay(puzzleDate)}\n`;
    if (gameState.isWon) {
        text += `${dishName} prepared! ${moves} ingredients, Quality: ${gameState.quality}/10\n\n`;
    } else {
        text += `${result} - ${moves} ingredients, Quality: ${gameState.quality}/10\n\n`;
    }
    
    gameState.history.forEach(item => {
        const boxes = item.result.map(r => {
            // Support both old format (match: true/false) and new format (status)
            if (r.status) {
                if (r.status === 'match') return '🟩';
                if (r.status === 'neutral') return '⬜';
                return '🟥';
            }
            // Legacy support
            return r.match ? '🟩' : '🟥';
        }).join('');
        text += `${boxes}\n`;
    });

    return text;
}

// Share button handler
function handleShare() {
    const shareText = generateShareText();
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Results copied to clipboard!');
        }).catch(() => {
            copyToClipboardFallback(shareText);
        });
    } else {
        copyToClipboardFallback(shareText);
    }
}

function copyToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        alert('Results copied to clipboard!');
    } catch (err) {
        alert('Could not copy to clipboard. Please copy manually:\n\n' + text);
    }
    document.body.removeChild(textarea);
}

// Load a specific puzzle
function loadPuzzle(puzzle) {
    if (!puzzle) return;
    
    currentPuzzle = puzzle;
    const puzzleDate = puzzle.date;
    document.getElementById('dateDisplay').textContent = formatDateDisplay(puzzleDate);
    
    const dishName = `${puzzle.adjective} ${puzzle.noun}`;
    document.getElementById('dishName').textContent = `"${dishName}"`;

    try {
        const savedState = localStorage.getItem(`dishle_${puzzleDate}`);
        
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                if (parsed && typeof parsed === 'object') {
                    gameState = {
                        adjective: parsed.adjective || puzzle.adjective,
                        noun: parsed.noun || puzzle.noun,
                        remainingAdjective: parsed.remainingAdjective || puzzle.adjective,
                        remainingNoun: parsed.remainingNoun || puzzle.noun,
                        quality: parsed.quality !== undefined ? parsed.quality : (parsed.health !== undefined ? parsed.health : 10),
                        moves: parsed.moves || 0,
                        history: Array.isArray(parsed.history) ? parsed.history : [],
                        isWon: parsed.isWon || false,
                        isLost: parsed.isLost || false,
                        puzzleDate: puzzleDate
                    };
                } else {
                    resetGameState();
                }
            } catch (e) {
                console.error('Error parsing saved state:', e);
                resetGameState();
            }
        } else {
            resetGameState();
        }
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateDisplay();
    loadRecipe();
    updatePreviousButtonState();
}

// Handle retry button
function handleRetry() {
    if (!currentPuzzle) return;
    
    try {
        localStorage.removeItem(`dishle_${currentPuzzle.date}`);
    } catch (error) {
        console.error('Error removing from localStorage:', error);
    }
    
    resetGameState();
    updateDisplay();
    loadRecipe();
    
    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    input.disabled = false;
    submitBtn.disabled = false;
    // Don't auto-focus input - let user tap when ready (avoids mobile keyboard popup)
}

// Reset debug date override
function resetDebugDate() {
    debugDateOverride = null;
    try {
        localStorage.removeItem('dishle_debug_date');
    } catch (error) {
        console.error('Error removing debug date from localStorage:', error);
    }
    initGame();
}

// Handle reset to today button
function handleResetToToday() {
    resetDebugDate();
}

// Handle previous button
function handlePrevious() {
    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn && prevBtn.disabled) return;

    const currentDate = getHelsinkiDate();
    const prevDate = decrementDate(currentDate);
    
    const prevPuzzle = puzzles.find(p => p.date === prevDate);
    
    if (prevPuzzle) {
        debugDateOverride = prevDate;
        try {
            localStorage.setItem('dishle_debug_date', prevDate);
        } catch (error) {
            console.error('Error saving debug date to localStorage:', error);
        }
        
        loadPuzzle(prevPuzzle);
    } else {
        debugDateOverride = prevDate;
        try {
            localStorage.setItem('dishle_debug_date', prevDate);
        } catch (error) {
            console.error('Error saving debug date to localStorage:', error);
        }
        
        initGame();
    }
}

// Handle next button
function handleNext() {
    const currentDate = getHelsinkiDate();
    const nextDate = incrementDate(currentDate);
    
    const nextPuzzle = puzzles.find(p => p.date === nextDate);
    
    if (nextPuzzle) {
        debugDateOverride = nextDate;
        try {
            localStorage.setItem('dishle_debug_date', nextDate);
        } catch (error) {
            console.error('Error saving debug date to localStorage:', error);
        }
        
        loadPuzzle(nextPuzzle);
    } else {
        debugDateOverride = nextDate;
        try {
            localStorage.setItem('dishle_debug_date', nextDate);
        } catch (error) {
            console.error('Error saving debug date to localStorage:', error);
        }
        
        initGame();
    }
}

// Countdown timer to midnight Helsinki time
function startCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    function updateCountdown() {
        const now = new Date();
        const helsinkiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
        
        // Get midnight Helsinki time tomorrow
        const midnightHelsinki = new Date(helsinkiNow);
        midnightHelsinki.setDate(midnightHelsinki.getDate() + 1);
        midnightHelsinki.setHours(0, 0, 0, 0);
        
        const diff = midnightHelsinki - helsinkiNow;
        
        if (diff <= 0) {
            document.getElementById('countdownTimer').textContent = '00:00';
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('countdownTimer').textContent = display;
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// Modal functions
function openModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').innerHTML = content || '<p style="color: #8080a4; text-align: center;">Coming soon...</p>';
    document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    await loadPuzzles();
    initGame();

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');

    submitBtn.addEventListener('click', () => {
        const ingredient = input.value.trim();
        if (ingredient) {
            processIngredient(ingredient);
            input.value = '';
            input.focus();
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
    });

    // Navigation buttons
    const prevBtn = document.getElementById('prevBtn');
    const retryBtn = document.getElementById('retryBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.addEventListener('click', handlePrevious);
    retryBtn.addEventListener('click', handleRetry);
    nextBtn.addEventListener('click', handleNext);

    // Reset to Today button
    const resetToTodayBtn = document.getElementById('resetToTodayBtn');
    if (resetToTodayBtn) {
        resetToTodayBtn.addEventListener('click', handleResetToToday);
    }

    // Modal buttons
    document.getElementById('helpBtn').addEventListener('click', () => {
        openModal('Help', '');
    });
    
    document.getElementById('statsBtn').addEventListener('click', () => {
        openModal('Stats', '');
    });
    
    document.getElementById('infoBtn').addEventListener('click', () => {
        openModal('About', '');
    });
    
    document.getElementById('modalClose').addEventListener('click', closeModal);
    
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalOverlay')) {
            closeModal();
        }
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Handle mobile keyboard open/close - snap viewport back when keyboard closes
    if (window.visualViewport) {
        let pendingUpdate = false;
        
        window.visualViewport.addEventListener('resize', () => {
            if (pendingUpdate) return;
            pendingUpdate = true;
            
            requestAnimationFrame(() => {
                pendingUpdate = false;
                // Force layout recalculation when viewport changes (keyboard open/close)
                document.body.style.height = `${window.visualViewport.height}px`;
                // Scroll to top to ensure content is positioned correctly
                window.scrollTo(0, 0);
            });
        });
        
        // Also handle scroll events from Visual Viewport (some browsers use this)
        window.visualViewport.addEventListener('scroll', () => {
            window.scrollTo(0, 0);
        });
    }

    // Blur input when tapping outside to close keyboard
    document.addEventListener('touchstart', (e) => {
        const input = document.getElementById('ingredientInput');
        if (document.activeElement === input && !e.target.closest('.input-section')) {
            input.blur();
        }
    });
});
