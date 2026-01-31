// Game state
let gameState = {
    adjectives: [],
    noun: '',
    remainingAdjectives: [],
    remainingNoun: '',
    moves: 0,
    history: [],
    isWon: false,
    isLost: false,
    isElegant: false,
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

// Normalize puzzle to new format (adjectives array - 2 adjectives)
function getPuzzleAdjectives(puzzle) {
    if (Array.isArray(puzzle.adjectives) && puzzle.adjectives.length >= 2) {
        return puzzle.adjectives.slice(0, 2);
    }
    if (puzzle.adjective) {
        return [puzzle.adjective, puzzle.adjective];
    }
    return ['', ''];
}

// Get 1-based puzzle number from puzzles array
function getPuzzleNumber(puzzle) {
    if (!puzzle || !puzzles.length) return '001';
    const idx = puzzles.findIndex(p => p.date === puzzle.date);
    return String(idx >= 0 ? idx + 1 : 1).padStart(3, '0');
}

// Load saved game state from localStorage for a puzzle, or return null to use fresh state
function loadSavedState(puzzle) {
    const puzzleDate = puzzle.date;
    const adjectives = getPuzzleAdjectives(puzzle);
    const noun = puzzle.noun || '';
    try {
        const savedState = localStorage.getItem(`dish_of_the_day_${puzzleDate}`);
        if (!savedState) return null;

        const parsed = JSON.parse(savedState);
        if (!parsed || typeof parsed !== 'object') return null;

        let remainingAdjectives;
        if (Array.isArray(parsed.remainingAdjectives) && parsed.remainingAdjectives.length >= 2) {
            remainingAdjectives = parsed.remainingAdjectives.slice(0, 2).map((r, i) => r || adjectives[i]);
        } else if (Array.isArray(parsed.remainingAdjectives) && parsed.remainingAdjectives.length === 3) {
            remainingAdjectives = parsed.remainingAdjectives.slice(0, 2).map((r, i) => r || adjectives[i]);
        } else if (parsed.remainingAdjective !== undefined) {
            remainingAdjectives = [parsed.remainingAdjective || adjectives[0], adjectives[1] || ''];
        } else {
            remainingAdjectives = adjectives.slice();
        }

        return {
            adjectives: adjectives,
            noun: parsed.noun || noun,
            remainingAdjectives: remainingAdjectives,
            remainingNoun: parsed.remainingNoun || noun,
            moves: parsed.moves || 0,
            history: Array.isArray(parsed.history) ? parsed.history : [],
            isWon: parsed.isWon || false,
            isLost: parsed.isLost || false,
            isElegant: parsed.isElegant || false,
            puzzleDate: puzzleDate
        };
    } catch (error) {
        console.error('Error loading saved state:', error);
        return null;
    }
}

// Initialize game
function initGame() {
    try {
        const savedDebugDate = localStorage.getItem('dish_of_the_day_debug_date');
        if (savedDebugDate) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(savedDebugDate)) {
                debugDateOverride = savedDebugDate;
            } else {
                localStorage.removeItem('dish_of_the_day_debug_date');
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
    document.getElementById('dateDisplay').textContent = `#${getPuzzleNumber(currentPuzzle)}`;
    
    const adjList = getPuzzleAdjectives(currentPuzzle);
    const dishName = [...adjList, currentPuzzle.noun].filter(Boolean).join(' ');
    document.getElementById('dishName').textContent = `"${dishName}"`;

    const loadedState = loadSavedState(currentPuzzle);
    if (loadedState) {
        gameState = loadedState;
    } else {
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateDisplay();
    loadRecipe();
    startCountdownTimer();
}

function resetGameState() {
    const adjectives = getPuzzleAdjectives(currentPuzzle);
    gameState = {
        adjectives: adjectives,
        noun: currentPuzzle.noun,
        remainingAdjectives: adjectives.slice(),
        remainingNoun: currentPuzzle.noun,
        moves: 0,
        history: [],
        isWon: false,
        isLost: false,
        isElegant: false,
        puzzleDate: currentPuzzle.date
    };
}

// Save game state to localStorage
function saveGameState() {
    try {
        const key = `dish_of_the_day_${gameState.puzzleDate}`;
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

// Get letter states for puzzle display: active, matched
function getLetterStatesForDisplay() {
    const adjectives = gameState.adjectives || [];
    const noun = gameState.noun || '';
    const remainingAdjs = gameState.remainingAdjectives || [];
    const remainingNoun = (gameState.remainingNoun || '').trim();
    const result = { adj1: [], adj2: [], noun: [] };

    function processWord(original, remaining) {
        const letters = [];
        let rem = remaining.split('');
        for (const c of original) {
            const pos = rem.indexOf(c);
            if (pos >= 0) {
                rem.splice(pos, 1);
                letters.push({ char: c, state: 'active' });
            } else {
                letters.push({ char: c, state: 'matched' });
            }
        }
        return letters;
    }

    result.adj1 = processWord((adjectives[0] || '').trim(), (remainingAdjs[0] || '').trim());
    result.adj2 = processWord((adjectives[1] || '').trim(), (remainingAdjs[1] || '').trim());
    result.noun = processWord(noun.trim(), remainingNoun);
    return result;
}

// Build puzzle display: two lines — adjectives on line 1, noun on line 2, both centered
function renderPuzzleStack() {
    const stack = document.getElementById('puzzleStack');
    if (!stack) return;

    const letterStates = getLetterStatesForDisplay();
    const adjLetters = [...letterStates.adj1, { char: ' ', state: 'active' }, ...letterStates.adj2];
    const nounLetters = letterStates.noun;

    function appendLine(letters) {
        const line = document.createElement('div');
        line.className = 'puzzle-line';
        letters.forEach(({ char, state }) => {
            const span = document.createElement('span');
            span.className = `puzzle-letter puzzle-letter-${state}`;
            span.textContent = char === ' ' ? '\u00A0' : char;
            line.appendChild(span);
        });
        stack.appendChild(line);
    }

    stack.innerHTML = '';
    appendLine(adjLetters);
    appendLine(nounLetters);
}

// Calculate waste percentage (letters not matched)
function getWastePercent() {
    const totalLetters = gameState.history.reduce((sum, item) => sum + item.ingredient.length, 0);
    const wasteLetters = gameState.history.reduce((sum, item) =>
        sum + item.result.filter(r => (r.status || '') === 'plain').length, 0);
    return totalLetters > 0 ? Math.round((wasteLetters / totalLetters) * 100) : 0;
}

// Update display
function updateDisplay() {
    renderPuzzleStack();

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

// Process an ingredient - letters match against combined puzzle left-to-right (adj1 → adj2 → noun)
function processIngredient(ingredient) {
    if (gameState.isWon || gameState.isLost) return;

    ingredient = ingredient.toUpperCase().trim();
    
    if (!/^[A-Z]{2,20}$/.test(ingredient)) {
        alert('Please enter an ingredient with 2-20 letters (A-Z only)');
        return;
    }

    const result = [];
    const adjArrays = gameState.remainingAdjectives.map(a => (a || '').split(''));
    let nounArray = (gameState.remainingNoun || '').split('');

    for (let i = 0; i < ingredient.length; i++) {
        const letter = ingredient[i];
        let found = false;
        let foundInAdjective = false;

        for (let adjIdx = 0; adjIdx < adjArrays.length && !found; adjIdx++) {
            for (let j = 0; j < adjArrays[adjIdx].length; j++) {
                if (adjArrays[adjIdx][j] === letter) {
                    adjArrays[adjIdx].splice(j, 1);
                    found = true;
                    foundInAdjective = true;
                    break;
                }
            }
        }

        if (!found) {
            for (let j = 0; j < nounArray.length; j++) {
                if (nounArray[j] === letter) {
                    nounArray.splice(j, 1);
                    found = true;
                    foundInAdjective = false;
                    break;
                }
            }
        }

        if (found) {
            result.push({ letter: letter, status: foundInAdjective ? 'adj' : 'noun' });
        } else {
            result.push({ letter: letter, status: 'plain' });
        }
    }

    gameState.remainingAdjectives = adjArrays.map(a => a.join(''));
    gameState.remainingNoun = nounArray.join('');
    gameState.moves++;
    gameState.history.push({
        ingredient: ingredient,
        result: result
    });

    const allAdjsEmpty = gameState.remainingAdjectives.every(r => r.replace(/\s/g, '') === '');
    const nounEmpty = (gameState.remainingNoun || '').replace(/\s/g, '') === '';
    const allCleared = allAdjsEmpty && nounEmpty;
    if (allCleared) {
        gameState.isWon = true;
        gameState.isElegant = gameState.moves <= 3;
    } else if (gameState.moves >= 5) {
        gameState.isLost = true;
    }

    saveGameState();
    updateDisplay();
    loadRecipe();
}

// Load and display recipe (history) - 4 slots with food waste
function loadRecipe() {
    const container = document.getElementById('recipeContainer');
    container.innerHTML = '';

    const maxSlots = 5;

    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'recipe-slot';
        
        const numberDiv = document.createElement('div');
        numberDiv.className = 'recipe-number';
        numberDiv.textContent = `${i + 1}.`;
        slotDiv.appendChild(numberDiv);
        
        if (i < gameState.history.length) {
            const item = gameState.history[i];
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recipe-item';
            
            item.result.forEach(letterData => {
                const box = document.createElement('div');
                const statusClass = letterData.status || 'plain';
                box.className = 'letter-box ' + statusClass;
                box.textContent = letterData.letter;
                itemDiv.appendChild(box);
            });
            
            slotDiv.appendChild(itemDiv);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'recipe-placeholder';
            placeholder.textContent = '???';
            slotDiv.appendChild(placeholder);
        }
        
        container.appendChild(slotDiv);
    }

    const wasteDiv = document.getElementById('foodWasteDisplay');
    if (wasteDiv) {
        const wastePercent = getWastePercent();
        wasteDiv.textContent = `FOOD WASTE ${wastePercent}%`;
    }
}

// Show game over message as modal
function showGameOver() {
    if (gameState.isWon) {
        const noun = gameState.noun || '';
        const ingredients = gameState.moves;
        const wastePercent = getWastePercent();
        
        let title;
        let message;
        if (gameState.isElegant) {
            title = 'An elegant dish!';
            message = `You prepared ${noun} using only ${ingredients} ingredient${ingredients !== 1 ? 's' : ''}!`;
        } else {
            title = 'An excellent dish!';
            message = `You prepared ${noun} successfully!`;
        }
        
        const content = `
            <p style="text-align: center; margin-bottom: 12px;">${message}</p>
            <p style="text-align: center; margin-bottom: 20px; font-size: 0.9em;">Waste: ${wastePercent}%</p>
            <div style="text-align: center;">
                <button id="modalShareBtn" style="padding: 10px 20px; font-size: 1em; background: #535373; color: #e6e6ec; border: 1px solid #535373; cursor: pointer; font-weight: 500;">Share</button>
            </div>
        `;
        openModal(title, content);
        
        setTimeout(() => {
            const modalShareBtn = document.getElementById('modalShareBtn');
            if (modalShareBtn) {
                modalShareBtn.addEventListener('click', handleShare);
            }
        }, 0);
    } else if (gameState.isLost) {
        const content = `
            <p style="text-align: center; margin-bottom: 20px;">The dish, she is ruined. Try again tomorrow.</p>
            <div style="text-align: center;">
                <button id="modalShareBtn" style="padding: 10px 20px; font-size: 1em; background: #535373; color: #e6e6ec; border: 1px solid #535373; cursor: pointer; font-weight: 500;">Share</button>
            </div>
        `;
        openModal('Oof!', content);
        
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
    const puzzleNum = getPuzzleNumber(currentPuzzle);
    const moves = gameState.moves;
    const dishName = gameState.noun || '';
    const wastePercent = getWastePercent();
    
    let text = `dish of the day #${puzzleNum}\n`;
    if (gameState.isWon) {
        text += `${dishName} prepared! ${moves} ingredients, Waste: ${wastePercent}%\n\n`;
    } else {
        text += `${result} - ${moves} ingredients, Waste: ${wastePercent}%\n\n`;
    }
    
    gameState.history.forEach(item => {
        const boxes = item.result.map(r => {
            const status = r.status || 'plain';
            if (status === 'adj') return '🟩';
            if (status === 'noun') return '⬜';
            return '⬛';
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
    document.getElementById('dateDisplay').textContent = `#${getPuzzleNumber(puzzle)}`;
    
    const adjList = getPuzzleAdjectives(puzzle);
    const dishName = [...adjList, puzzle.noun].filter(Boolean).join(' ');
    document.getElementById('dishName').textContent = `"${dishName}"`;

    const loadedState = loadSavedState(puzzle);
    if (loadedState) {
        gameState = loadedState;
    } else {
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
        localStorage.removeItem(`dish_of_the_day_${currentPuzzle.date}`);
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
        localStorage.removeItem('dish_of_the_day_debug_date');
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
            localStorage.setItem('dish_of_the_day_debug_date', prevDate);
        } catch (error) {
            console.error('Error saving debug date to localStorage:', error);
        }
        
        loadPuzzle(prevPuzzle);
    } else {
        debugDateOverride = prevDate;
        try {
            localStorage.setItem('dish_of_the_day_debug_date', prevDate);
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
            localStorage.setItem('dish_of_the_day_debug_date', nextDate);
        } catch (error) {
            console.error('Error saving debug date to localStorage:', error);
        }
        
        loadPuzzle(nextPuzzle);
    } else {
        debugDateOverride = nextDate;
        try {
            localStorage.setItem('dish_of_the_day_debug_date', nextDate);
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
            clearInterval(countdownInterval);
            countdownInterval = null;
            debugDateOverride = null;
            try {
                localStorage.removeItem('dish_of_the_day_debug_date');
            } catch (e) {}
            closeModal();
            initGame();
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
            // Don't auto-focus - let user tap when ready (prevents iOS keyboard flicker)
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
        let initialHeight = window.innerHeight;
        let keyboardOpen = false;
        
        window.visualViewport.addEventListener('resize', () => {
            const currentHeight = window.visualViewport.height;
            const heightDiff = initialHeight - currentHeight;
            
            // Keyboard is likely open if viewport shrunk significantly (>150px)
            if (heightDiff > 150) {
                keyboardOpen = true;
                document.body.style.height = `${currentHeight}px`;
                // Don't force scroll when keyboard opens - let browser keep input visible
            } else if (keyboardOpen) {
                // Keyboard just closed - remove inline style to let CSS 100dvh take over
                keyboardOpen = false;
                document.body.style.height = '';
                initialHeight = window.innerHeight;
                setTimeout(() => {
                    window.scrollTo(0, 0);
                }, 100);
            }
        });
        
        // Prevent overscroll/bounce
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
