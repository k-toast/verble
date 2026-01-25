// Game state
let gameState = {
    adjective: '',
    noun: '',
    remainingAdjective: '',
    remainingNoun: '',
    health: 10,
    injuries: 0,
    moves: 0,
    history: [],
    isWon: false,
    isLost: false,
    puzzleDate: ''
};

let puzzles = [];
let currentPuzzle = null;
let debugDateOverride = null; // For debugging: overrides the current date

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
// Uses debugDateOverride if set (for testing/debugging)
function getHelsinkiDate() {
    if (debugDateOverride) {
        return debugDateOverride;
    }
    return getRealHelsinkiDate();
}

// Increment date by one day (YYYY-MM-DD format)
function incrementDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Decrement date by one day (YYYY-MM-DD format)
function decrementDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
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

// Initialize game
function initGame() {
    // Initialize debug date override from localStorage if it exists
    const savedDebugDate = localStorage.getItem('verble_debug_date');
    if (savedDebugDate) {
        debugDateOverride = savedDebugDate;
    }
    
    currentPuzzle = findTodayPuzzle();
    
    if (!currentPuzzle) {
        document.getElementById('noPuzzleMessage').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
        // Still update button state even if no puzzle
        updatePreviousButtonState();
        return;
    }

    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';

    const puzzleDate = currentPuzzle.date;
    document.getElementById('dateDisplay').textContent = puzzleDate;

    // Try to load saved state
    const savedState = localStorage.getItem(`verble_${puzzleDate}`);
    
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            gameState = {
                adjective: parsed.adjective || currentPuzzle.adjective,
                noun: parsed.noun || currentPuzzle.noun,
                remainingAdjective: parsed.remainingAdjective || currentPuzzle.adjective,
                remainingNoun: parsed.remainingNoun || currentPuzzle.noun,
                health: parsed.health !== undefined ? parsed.health : 10,
                injuries: parsed.injuries || 0,
                moves: parsed.moves || 0,
                history: parsed.history || [],
                isWon: parsed.isWon || false,
                isLost: parsed.isLost || false,
                puzzleDate: puzzleDate
            };
        } catch (e) {
            console.error('Error loading saved state:', e);
            resetGameState();
        }
    } else {
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateDisplay();
    loadHistory();
}

function resetGameState() {
    gameState = {
        adjective: currentPuzzle.adjective,
        noun: currentPuzzle.noun,
        remainingAdjective: currentPuzzle.adjective,
        remainingNoun: currentPuzzle.noun,
        health: 10,
        injuries: 0,
        moves: 0,
        history: [],
        isWon: false,
        isLost: false,
        puzzleDate: currentPuzzle.date
    };
}

// Save game state to localStorage
function saveGameState() {
    localStorage.setItem(`verble_${gameState.puzzleDate}`, JSON.stringify(gameState));
}

// Update display - show actual puzzle letters (not underscores)
function updateDisplay() {
    // Show the actual remaining puzzle with letters visible
    const puzzleDisplay = `${gameState.remainingAdjective} ${gameState.remainingNoun}`;
    document.getElementById('puzzleText').textContent = puzzleDisplay;

    // Update stats
    document.getElementById('healthValue').textContent = gameState.health;
    document.getElementById('injuriesValue').textContent = gameState.injuries;
    document.getElementById('movesValue').textContent = gameState.moves;

    // Update input state
    const input = document.getElementById('verbInput');
    const submitBtn = document.getElementById('submitBtn');
    
    if (gameState.isWon || gameState.isLost) {
        input.disabled = true;
        submitBtn.disabled = true;
        showGameOver();
    } else {
        input.disabled = false;
        submitBtn.disabled = false;
        document.getElementById('gameOverMessage').style.display = 'none';
    }

    // Update Previous button state
    updatePreviousButtonState();
}

// Update Previous button enabled/disabled state
function updatePreviousButtonState() {
    const prevBtn = document.getElementById('prevBtn');
    if (!prevBtn) return;

    const currentDate = getHelsinkiDate();
    const realToday = getRealHelsinkiDate();
    
    // Disable if we're on today's real date (not debug date)
    if (currentDate === realToday) {
        prevBtn.disabled = true;
        return;
    }

    // Check if there's a puzzle for the previous date
    const prevDate = decrementDate(currentDate);
    const prevPuzzle = puzzles.find(p => p.date === prevDate);
    
    // Disable if no puzzle exists for previous date
    prevBtn.disabled = !prevPuzzle;
}

// Process a verb - letters match against combined puzzle left-to-right
function processVerb(verb) {
    if (gameState.isWon || gameState.isLost) return;

    verb = verb.toUpperCase().trim();
    
    // Validate: 2-20 letters, A-Z only
    if (!/^[A-Z]{2,20}$/.test(verb)) {
        alert('Please enter a verb with 2-20 letters (A-Z only)');
        return;
    }

    const result = [];
    let newAdjective = gameState.remainingAdjective;
    let newNoun = gameState.remainingNoun;
    let newHealth = gameState.health;
    let newInjuries = gameState.injuries;

    // Process each letter of the verb left-to-right
    for (let i = 0; i < verb.length; i++) {
        const letter = verb[i];
        let found = false;

        // Create combined puzzle string for searching (adjective + space + noun)
        const combinedPuzzle = newAdjective + ' ' + newNoun;
        const adjLength = newAdjective.length;
        
        // Search combined puzzle left-to-right for this letter
        for (let j = 0; j < combinedPuzzle.length; j++) {
            if (combinedPuzzle[j] === letter) {
                found = true;
                
                // Determine which word the letter is in
                if (j < adjLength) {
                    // Letter is in adjective - remove first occurrence from adjective
                    const adjArray = newAdjective.split('');
                    const adjLetterIndex = adjArray.indexOf(letter);
                    if (adjLetterIndex !== -1) {
                        adjArray.splice(adjLetterIndex, 1);
                        newAdjective = adjArray.join('');
                    }
                } else if (j > adjLength) {
                    // Letter is in noun (j > adjLength accounts for the space)
                    // Find the position in the noun (subtract adjLength + 1 for the space)
                    const nounPos = j - adjLength - 1;
                    const nounArray = newNoun.split('');
                    // Find first occurrence of letter in noun
                    const nounLetterIndex = nounArray.indexOf(letter);
                    if (nounLetterIndex !== -1) {
                        nounArray.splice(nounLetterIndex, 1);
                        newNoun = nounArray.join('');
                    }
                }
                
                result.push('🟩');
                break; // Only remove first occurrence, then move to next verb letter
            }
        }

        if (!found) {
            // Injury - letter not found in puzzle
            newHealth--;
            newInjuries++;
            result.push('🟥');
        }
    }

    // Update game state
    gameState.remainingAdjective = newAdjective;
    gameState.remainingNoun = newNoun;
    gameState.health = newHealth;
    gameState.injuries = newInjuries;
    gameState.moves++;
    gameState.history.push({
        verb: verb,
        result: result.join('')
    });

    // Check win condition (noun fully removed - all letters, not just non-spaces)
    if (newNoun.replace(/\s/g, '') === '') {
        gameState.isWon = true;
    }

    // Check lose condition (health <= 0)
    if (newHealth <= 0) {
        gameState.isLost = true;
    }

    saveGameState();
    updateDisplay();
    loadHistory();
}

// Load and display history
function loadHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';

    if (gameState.history.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">No moves yet</p>';
        return;
    }

    gameState.history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <span class="history-verb">${item.verb}</span>
            <span class="history-emoji">${item.result}</span>
        `;
        container.appendChild(div);
    });
}

// Show game over message
function showGameOver() {
    const gameOverDiv = document.getElementById('gameOverMessage');
    const gameOverText = document.getElementById('gameOverText');
    const shareBtn = document.getElementById('shareBtn');

    if (gameState.isWon) {
        gameOverDiv.className = 'game-over win';
        const monsterName = gameState.noun;
        gameOverText.textContent = `${monsterName} defeated! 🎉`;
        shareBtn.style.display = 'inline-block';
    } else if (gameState.isLost) {
        gameOverDiv.className = 'game-over lose';
        gameOverText.textContent = 'You failed to slay the monster! 😢';
        shareBtn.style.display = 'inline-block';
    } else {
        gameOverDiv.style.display = 'none';
        shareBtn.style.display = 'none';
    }
}

// Generate share text
function generateShareText() {
    const result = gameState.isWon ? 'Win' : 'Loss';
    const puzzleDate = gameState.puzzleDate;
    const moves = gameState.moves;
    const injuries = gameState.injuries;
    const monsterName = gameState.noun;
    
    let text = `Verble ${puzzleDate}\n`;
    if (gameState.isWon) {
        text += `${monsterName} defeated! ${moves} moves, ${injuries} injuries\n\n`;
    } else {
        text += `${result} - ${moves} moves, ${injuries} injuries\n\n`;
    }
    
    gameState.history.forEach(item => {
        text += `${item.verb} ${item.result}\n`;
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
            // Fallback
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

// Find next puzzle based on current puzzle date
function findNextPuzzle() {
    if (!currentPuzzle || puzzles.length === 0) return null;
    
    const currentDate = currentPuzzle.date;
    const currentIndex = puzzles.findIndex(p => p.date === currentDate);
    
    if (currentIndex === -1 || currentIndex === puzzles.length - 1) {
        return null; // No next puzzle
    }
    
    return puzzles[currentIndex + 1];
}

// Load a specific puzzle
function loadPuzzle(puzzle) {
    if (!puzzle) return;
    
    currentPuzzle = puzzle;
    const puzzleDate = puzzle.date;
    document.getElementById('dateDisplay').textContent = puzzleDate;

    // Try to load saved state
    const savedState = localStorage.getItem(`verble_${puzzleDate}`);
    
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            gameState = {
                adjective: parsed.adjective || puzzle.adjective,
                noun: parsed.noun || puzzle.noun,
                remainingAdjective: parsed.remainingAdjective || puzzle.adjective,
                remainingNoun: parsed.remainingNoun || puzzle.noun,
                health: parsed.health !== undefined ? parsed.health : 10,
                injuries: parsed.injuries || 0,
                moves: parsed.moves || 0,
                history: parsed.history || [],
                isWon: parsed.isWon || false,
                isLost: parsed.isLost || false,
                puzzleDate: puzzleDate
            };
        } catch (e) {
            console.error('Error loading saved state:', e);
            resetGameState();
        }
    } else {
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateDisplay();
    loadHistory();
    updatePreviousButtonState();
}

// Handle retry button
function handleRetry() {
    if (!currentPuzzle) return;
    
    // Clear saved state for current puzzle
    localStorage.removeItem(`verble_${currentPuzzle.date}`);
    
    // Reset game state
    resetGameState();
    updateDisplay();
    loadHistory();
    
    // Re-enable input
    const input = document.getElementById('verbInput');
    const submitBtn = document.getElementById('submitBtn');
    input.disabled = false;
    submitBtn.disabled = false;
    input.focus();
}

// Reset debug date override (for returning to real date)
function resetDebugDate() {
    debugDateOverride = null;
    localStorage.removeItem('verble_debug_date');
    initGame();
}

// Handle reset to today button
function handleResetToToday() {
    resetDebugDate();
}

// Handle previous button - goes back one day
function handlePrevious() {
    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn && prevBtn.disabled) return; // Don't proceed if disabled

    const currentDate = getHelsinkiDate();
    const prevDate = decrementDate(currentDate);
    
    // Check if a puzzle exists for the previous date
    const prevPuzzle = puzzles.find(p => p.date === prevDate);
    
    if (prevPuzzle) {
        // Set debug date override to the previous date
        debugDateOverride = prevDate;
        localStorage.setItem('verble_debug_date', prevDate);
        
        // Load the puzzle for that date
        loadPuzzle(prevPuzzle);
    } else {
        // Still go back the date even if no puzzle exists
        debugDateOverride = prevDate;
        localStorage.setItem('verble_debug_date', prevDate);
        
        // Re-initialize to show "No puzzle yet" message
        initGame();
    }
}

// Handle next button - advances the date by one day
function handleNext() {
    const currentDate = getHelsinkiDate();
    const nextDate = incrementDate(currentDate);
    
    // Check if a puzzle exists for the next date
    const nextPuzzle = puzzles.find(p => p.date === nextDate);
    
    if (nextPuzzle) {
        // Set debug date override to the next date
        debugDateOverride = nextDate;
        localStorage.setItem('verble_debug_date', nextDate);
        
        // Load the puzzle for that date
        loadPuzzle(nextPuzzle);
    } else {
        // Still advance the date even if no puzzle exists
        debugDateOverride = nextDate;
        localStorage.setItem('verble_debug_date', nextDate);
        
        // Re-initialize to show "No puzzle yet" message
        initGame();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    await loadPuzzles();
    initGame();

    const input = document.getElementById('verbInput');
    const submitBtn = document.getElementById('submitBtn');
    const shareBtn = document.getElementById('shareBtn');

    submitBtn.addEventListener('click', () => {
        const verb = input.value.trim();
        if (verb) {
            processVerb(verb);
            input.value = '';
            input.focus();
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    // Only allow A-Z letters
    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
    });

    shareBtn.addEventListener('click', handleShare);

    // Previous, Retry and Next buttons
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
});
