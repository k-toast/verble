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

let allowedFoods = null;
let blockedFoods = new Set();
let lastRejectedIngredient = null;
let lastAttemptWasNewBest = false;
let currentView = 'game'; // 'game' | 'archive'

// Animation state for letter-by-letter reveal
let animationState = null; // { ingredient, result, revealedCount, adjArrays, nounArray }
const LETTER_REVEAL_MS = 300;

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

// Offset date by N days (YYYY-MM-DD format)
function offsetDate(dateString, days) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.error('Invalid date string format:', dateString);
        return dateString;
    }
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return dateString;
    }
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function incrementDate(dateString) {
    return offsetDate(dateString, 1);
}

function decrementDate(dateString) {
    return offsetDate(dateString, -1);
}

// Load puzzles from JSON
async function loadPuzzles() {
    try {
        const response = await fetch('puzzles.json');
        if (!response.ok) throw new Error('Failed to load puzzles');
        puzzles = await response.json();
    } catch (error) {
        console.error('Error loading puzzles:', error);
        puzzles = [];
    }
}

// Load food allow/block lists for ingredient validation
async function loadFoodLists() {
    try {
        const [foodsRes, blockedRes] = await Promise.all([
            fetch('foods.json'),
            fetch('foods-blocked.json').catch(() => ({ ok: false }))
        ]);
        if (!foodsRes.ok) throw new Error('No foods list');
        const foods = await foodsRes.json();
        const blocked = blockedRes.ok ? await blockedRes.json() : [];
        allowedFoods = new Set(foods.map(f => String(f).toUpperCase().trim()));
        blockedFoods = new Set((blocked || []).map(b => String(b).toUpperCase().trim()));
    } catch (error) {
        console.warn('Could not load food lists, allowing all:', error);
        allowedFoods = null;
        blockedFoods = new Set();
    }
}

// Find puzzle for today
function findTodayPuzzle() {
    const today = getHelsinkiDate();
    return puzzles.find(p => p.date === today);
}

// Normalize puzzle to new format (adjectives array - 1 adjective)
function getPuzzleAdjectives(puzzle) {
    if (Array.isArray(puzzle.adjectives) && puzzle.adjectives.length >= 1) {
        return puzzle.adjectives.slice(0, 1);
    }
    if (puzzle.adjective) {
        return [puzzle.adjective];
    }
    return [''];
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
        if (Array.isArray(parsed.remainingAdjectives) && parsed.remainingAdjectives.length >= 1) {
            remainingAdjectives = parsed.remainingAdjectives.slice(0, 1).map((r, i) => r || adjectives[i]);
        } else if (parsed.remainingAdjective !== undefined) {
            remainingAdjectives = [parsed.remainingAdjective || adjectives[0]];
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
    currentView = 'game';
    document.body.classList.remove('archive-view');
    document.getElementById('archiveContainer').style.display = 'none';
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
        updateFooterTodayButton();
        startCountdownTimer();
        return;
    }

    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';

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
    updatePuzzleLabel();
    updateFooterTodayButton();
    startCountdownTimer();
}

function updatePuzzleLabel() {
    const el = document.getElementById('puzzleLabel');
    const countdownWrap = document.getElementById('countdownInLabel');
    if (!el || !currentPuzzle) return;
    const today = getHelsinkiDate();
    const isToday = currentPuzzle.date === today;
    el.textContent = isToday ? "TODAY'S CHALLENGE" : 'REPLAY CHALLENGE';
    if (countdownWrap) countdownWrap.style.display = isToday ? '' : 'none';
}

// Show TODAY'S DISH button only when on archive screen or viewing a replay (not today's puzzle)
function updateFooterTodayButton() {
    const btn = document.getElementById('retryBtn');
    if (!btn) return;
    const onArchiveScreen = currentView === 'archive';
    const onReplayPuzzle = currentView === 'game' && currentPuzzle && currentPuzzle.date !== getHelsinkiDate();
    const show = onArchiveScreen || onReplayPuzzle;
    btn.style.display = show ? '' : 'none';
    btn.textContent = "TODAY'S DISH";
    btn.setAttribute('aria-label', "Today's dish");
    btn.setAttribute('title', "Today's dish");
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

const STATS_KEY = 'dish_of_the_day_stats';
const ATTEMPTS_KEY = 'dish_of_the_day_attempts';

// Load attempts data (per-puzzle first + best)
function getAttemptsData() {
    try {
        const raw = localStorage.getItem(ATTEMPTS_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        return typeof data === 'object' && data !== null ? data : {};
    } catch (_) {
        return {};
    }
}

// Save attempts data
function setAttemptsData(data) {
    try {
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving attempts:', e);
    }
}

// Returns true if (movesA, wasteA) is strictly better than (movesB, wasteB). Ingredients take priority.
function isBetterRun(movesA, wasteA, movesB, wasteB) {
    return (movesA < movesB) || (movesA === movesB && wasteA < wasteB);
}

// Record first/best attempt for this puzzle. Call on game end (win or loss). Returns { isNewBest } for wins.
function recordAttempts() {
    if (!gameState.isWon && !gameState.isLost) return { isNewBest: false };
    const date = gameState.puzzleDate;
    const moves = gameState.moves;
    const waste = getWastePercent();
    const won = gameState.isWon;

    const data = getAttemptsData();
    const existing = data[date];
    let isNewBest = false;

    if (!existing) {
        data[date] = {
            first: { moves, waste, won },
            best: won ? { moves, waste } : null
        };
        if (won) isNewBest = true;
    } else {
        if (won) {
            const prevBest = existing.best;
            const thisRun = { moves, waste };
            if (!prevBest || isBetterRun(moves, waste, prevBest.moves, prevBest.waste)) {
                data[date].best = thisRun;
                isNewBest = true;
            } else {
                data[date].best = prevBest;
            }
        }
    }
    setAttemptsData(data);
    return { isNewBest };
}

// Record a completed game (win or loss) for statistics
function recordGameCompleted() {
    if (!gameState.isWon && !gameState.isLost) return;
    try {
        const wastePercent = getWastePercent();
        const entry = {
            date: gameState.puzzleDate,
            won: gameState.isWon,
            moves: gameState.moves,
            wastePercent,
            elegant: !!gameState.isElegant,
            trophy: wastePercent <= 25
        };
        let data = { games: [] };
        try {
            const raw = localStorage.getItem(STATS_KEY);
            if (raw) data = JSON.parse(raw);
            if (!Array.isArray(data.games)) data.games = [];
        } catch (_) {}
        data.games.push(entry);
        localStorage.setItem(STATS_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error recording stats:', e);
    }
}

// Load and compute stats for the stats modal
function getStats() {
    let games = [];
    try {
        const raw = localStorage.getItem(STATS_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data.games)) games = data.games;
        }
    } catch (_) {}
    const dishesAttempted = games.length;
    const wins = games.filter(g => g.won);
    const dishSuccessesPercent = dishesAttempted > 0 ? Math.round((wins.length / dishesAttempted) * 100) : 0;
    const averageWastePercent = games.length > 0
        ? Math.round(games.reduce((s, g) => s + (g.wastePercent || 0), 0) / games.length)
        : 0;
    const totalTrophies = games.filter(g => g.trophy).length;
    const elegantPercent = wins.length > 0
        ? Math.round((wins.filter(g => g.elegant).length / wins.length) * 100)
        : 0;
    const averageIngredients = games.length > 0
        ? (games.reduce((s, g) => s + (g.moves || 0), 0) / games.length).toFixed(1)
        : '0.0';

    const today = getRealHelsinkiDate();
    const datesPlayed = [...new Set(games.map(g => g.date))].sort().reverse();
    let attemptStreak = 0;
    if (datesPlayed.length > 0) {
        let check = today;
        for (let i = 0; i < datesPlayed.length; i++) {
            if (datesPlayed[i] === check) {
                attemptStreak++;
                check = offsetDate(check, -1);
            } else if (datesPlayed[i] < check) break;
        }
    }

    let successStreak = 0;
    for (let i = games.length - 1; i >= 0; i--) {
        if (games[i].won) successStreak++;
        else break;
    }

    return {
        dishesAttempted,
        attemptStreak,
        dishSuccessesPercent,
        successStreak,
        averageWastePercent,
        totalTrophies,
        elegantPercent,
        averageIngredients
    };
}

// Get letter states for puzzle display: active, matched
function getLetterStatesForDisplay() {
    const adjectives = gameState.adjectives || [];
    const noun = gameState.noun || '';
    const remainingAdjs = gameState.remainingAdjectives || [];
    const remainingNoun = (gameState.remainingNoun || '').trim();
    const result = { adj: [], noun: [] };

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

    result.adj = processWord((adjectives[0] || '').trim(), (remainingAdjs[0] || '').trim());
    result.noun = processWord(noun.trim(), remainingNoun);
    return result;
}

// Build puzzle display: two lines — adjective on line 1, noun on line 2, both centered
function renderPuzzleStack() {
    const stack = document.getElementById('puzzleStack');
    if (!stack) return;

    const letterStates = getLetterStatesForDisplay();

    function appendLine(letters) {
        const line = document.createElement('div');
        line.className = 'puzzle-line';
        letters.forEach(({ char, state }) => {
            if (state === 'matched') {
                const box = document.createElement('div');
                box.className = 'puzzle-letter puzzle-letter-matched puzzle-matched-box';
                line.appendChild(box);
            } else {
                const span = document.createElement('span');
                span.className = `puzzle-letter puzzle-letter-${state}`;
                span.textContent = char === ' ' ? '\u00A0' : char;
                line.appendChild(span);
            }
        });
        stack.appendChild(line);
    }

    stack.innerHTML = '';
    appendLine(letterStates.adj);
    appendLine(letterStates.noun);
}

// Title-case a word for display (e.g. EARTHY -> Earthy)
function titleCase(str) {
    if (!str || typeof str !== 'string') return '';
    const s = str.trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Get indefinite article for a word (a vs an)
function getIndefiniteArticle(word) {
    if (!word || typeof word !== 'string') return 'a';
    const first = (word.trim().toLowerCase())[0];
    return /[aeiou]/.test(first) ? 'an' : 'a';
}

// Build victory grid HTML: numbered list, only used cells (green=matched, grey=unmatched), left-aligned
function buildVictoryGridHTML() {
    let html = '<ol class="victory-grid">';
    for (let r = 0; r < gameState.history.length; r++) {
        const historyItem = gameState.history[r];
        if (!historyItem || !historyItem.result.length) continue;
        const rowNum = r + 1;
        html += `<li class="victory-grid-row"><span class="victory-row-num">${rowNum}.</span><span class="victory-row-cells">`;
        for (let c = 0; c < historyItem.result.length; c++) {
            const status = historyItem.result[c].status || 'plain';
            const cellClass = status === 'adj' || status === 'noun'
                ? 'victory-cell victory-cell-matched'
                : 'victory-cell victory-cell-unmatched';
            html += `<span class="${cellClass}"></span>`;
        }
        html += '</span></li>';
    }
    html += '</ol>';
    return html;
}

// Get star ingredient: most matches, then least waste, then earliest
function getStarIngredient() {
    if (!gameState.history.length) return null;
    let best = null;
    let bestMatches = -1;
    let bestWaste = Infinity;
    let bestIndex = Infinity;
    for (let i = 0; i < gameState.history.length; i++) {
        const item = gameState.history[i];
        const matches = item.result.filter(r => (r.status || '') === 'adj' || (r.status || '') === 'noun').length;
        const waste = item.result.filter(r => (r.status || '') === 'plain').length;
        if (matches > bestMatches ||
            (matches === bestMatches && waste < bestWaste) ||
            (matches === bestMatches && waste === bestWaste && i < bestIndex)) {
            best = item.ingredient;
            bestMatches = matches;
            bestWaste = waste;
            bestIndex = i;
        }
    }
    return best;
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
    const header = document.getElementById('gameHeader');
    const gameStatus = document.getElementById('gameStatus');

    if (gameState.isWon || gameState.isLost) {
        input.disabled = true;
        submitBtn.disabled = true;
        showInputFeedback('');
        if (gameState.isWon) {
            if (header) header.classList.add('solved');
            if (gameStatus) gameStatus.textContent = 'Puzzle solved!';
        } else {
            if (header) header.classList.remove('solved');
            if (gameStatus) gameStatus.textContent = 'Game over. Try again or move to next puzzle.';
        }
        showGameOver();
    } else {
        input.disabled = false;
        if (header) header.classList.remove('solved');
        if (gameStatus) gameStatus.textContent = '';
        updateInputValidationState();
    }

    updatePreviousButtonState();
}

// Update nav button state (ARCHIVE always enabled)
function updatePreviousButtonState() {
    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.disabled = false;
}

// Show inline feedback near input
// style: '' (default), 'error', or 'highlight' (blue)
function showInputFeedback(message, style) {
    const el = document.getElementById('inputFeedback');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'input-feedback' + (style ? ' ' + style : '');
}

// Update input validation state (length limit) and submit button
function updateInputValidationState() {
    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    if (!input || !submitBtn) return;

    const currentValue = (input.value || '').replace(/[^A-Za-z]/g, '').toUpperCase();

    // Clear sticky invalid-food error when player edits the input
    if (lastRejectedIngredient !== null && currentValue !== lastRejectedIngredient) {
        lastRejectedIngredient = null;
    }

    // If sticky error is still active, preserve it and don't overwrite
    if (lastRejectedIngredient !== null && currentValue === lastRejectedIngredient) {
        return;
    }

    const len = currentValue.length;
    if (len >= 13) {
        showInputFeedback('That ingredient has more than 12 letters.', 'highlight');
        input.setAttribute('aria-invalid', 'true');
        submitBtn.disabled = true;
    } else {
        showInputFeedback('');
        input.setAttribute('aria-invalid', 'false');
        if (!gameState.isWon && !gameState.isLost) {
            submitBtn.disabled = false;
        }
    }
}

// Sleep helper for animation delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Process one letter: match against puzzle, update arrays, return status
function matchOneLetter(letter, adjArrays, nounArray) {
    let foundInAdjective = false;
    for (let adjIdx = 0; adjIdx < adjArrays.length; adjIdx++) {
        for (let j = 0; j < adjArrays[adjIdx].length; j++) {
            if (adjArrays[adjIdx][j] === letter) {
                adjArrays[adjIdx].splice(j, 1);
                return { status: 'adj' };
            }
        }
    }
    for (let j = 0; j < nounArray.length; j++) {
        if (nounArray[j] === letter) {
            nounArray.splice(j, 1);
            return { status: 'noun' };
        }
    }
    return { status: 'plain' };
}

// Process an ingredient - letters match against combined puzzle left-to-right (adj → noun)
// Returns a Promise that resolves to true if accepted, false if rejected (validation failure)
async function processIngredient(ingredient) {
    if (gameState.isWon || gameState.isLost) return false;

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    ingredient = ingredient.toUpperCase().trim();
    showInputFeedback('');

    if (ingredient.length > 12) {
        showInputFeedback('That ingredient has more than 12 letters.', 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    if (!/^[A-Z]{2,12}$/.test(ingredient)) {
        showInputFeedback('Enter 2–12 letters', 'error');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    const isDuplicate = gameState.history.some(h => (h.ingredient || '').toUpperCase() === ingredient);
    if (isDuplicate) {
        showInputFeedback('Already used', 'error');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    const puzzleNoun = (gameState.noun || '').toUpperCase().trim();
    if (puzzleNoun && ingredient === puzzleNoun) {
        lastRejectedIngredient = ingredient;
        showInputFeedback('The challenge dish may not be used as an ingredient.', 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    if (blockedFoods.has(ingredient)) {
        lastRejectedIngredient = ingredient;
        showInputFeedback(`"${ingredient}" is not recognized as an ingredient in the panty.`, 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    if (allowedFoods !== null && !allowedFoods.has(ingredient)) {
        lastRejectedIngredient = ingredient;
        showInputFeedback(`"${ingredient}" is not recognized as an ingredient in the panty.`, 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    lastRejectedIngredient = null;
    if (input) input.setAttribute('aria-invalid', 'false');

    const adjArrays = gameState.remainingAdjectives.map(a => (a || '').split(''));
    const nounArray = (gameState.remainingNoun || '').split('');
    const result = [];

    // Disable input during animation
    if (input) input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    animationState = {
        ingredient,
        result: [],
        revealedCount: 0,
        adjArrays,
        nounArray
    };

    for (let i = 0; i < ingredient.length; i++) {
        const letter = ingredient[i];
        const { status } = matchOneLetter(letter, adjArrays, nounArray);
        result.push({ letter, status });

        // Sync game state so renderPuzzleStack shows the green box for this match
        gameState.remainingAdjectives = adjArrays.map(a => a.join(''));
        gameState.remainingNoun = nounArray.join('');

        animationState.result = result;
        animationState.revealedCount = i + 1;

        renderPuzzleStack();
        loadRecipe();

        const recipeContainer = document.getElementById('recipeContainer');
        if (recipeContainer && i === 0) {
            recipeContainer.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        await sleep(LETTER_REVEAL_MS);
    }

    animationState = null;
    gameState.moves++;
    gameState.history.push({ ingredient, result });

    const allAdjsEmpty = gameState.remainingAdjectives.every(r => r.replace(/\s/g, '') === '');
    const nounEmpty = (gameState.remainingNoun || '').replace(/\s/g, '') === '';
    const allCleared = allAdjsEmpty && nounEmpty;
    if (allCleared) {
        gameState.isWon = true;
        gameState.isElegant = gameState.moves < 5;
    } else if (gameState.moves >= 5) {
        gameState.isLost = true;
    }

    saveGameState();
    if (gameState.isWon || gameState.isLost) {
        recordGameCompleted();
        const result = recordAttempts();
        lastAttemptWasNewBest = result.isNewBest;
    }
    updateDisplay();
    loadRecipe();
    return true;
}

// Load and display recipe (history) - 5 slots with food waste
// Handles animationState: during letter-by-letter reveal, renders partial slot with grow animation on new letter
function loadRecipe() {
    const container = document.getElementById('recipeContainer');
    container.innerHTML = '';

    const maxSlots = 5;
    const historyCount = gameState.history.length;
    const animating = animationState !== null;
    const totalSlots = animating ? historyCount + 1 : historyCount;

    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'recipe-slot';
        
        const numberDiv = document.createElement('div');
        numberDiv.className = 'recipe-number';
        numberDiv.textContent = `${i + 1}.`;
        slotDiv.appendChild(numberDiv);
        
        if (i < historyCount) {
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
        } else if (animating && i === historyCount) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recipe-item';
            
            const partial = animationState.result;
            partial.forEach((letterData, idx) => {
                const box = document.createElement('div');
                const statusClass = letterData.status || 'plain';
                const isNew = idx === animationState.revealedCount - 1;
                box.className = 'letter-box ' + statusClass + (isNew ? ' letter-grow' : '');
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

    const starDiv = document.getElementById('starIngredientDisplay');
    if (starDiv) {
        const star = getStarIngredient();
        starDiv.textContent = 'KEY INGREDIENT: ' + (star || '???') + ' 🔑';
    }

    const wasteDiv = document.getElementById('foodWasteDisplay');
    if (wasteDiv) {
        const wastePercent = getWastePercent();
        wasteDiv.textContent = `FOOD WASTE: ${wastePercent}%`;
    }
}

// Show game over message as modal
function showGameOver() {
    if (gameState.isWon) {
        const adj = (gameState.adjectives[0] || '').toLowerCase();
        const noun = (gameState.noun || '').toLowerCase();
        const article = getIndefiniteArticle(gameState.adjectives[0] || '');
        const wastePercent = getWastePercent();
        const starIngredient = getStarIngredient() || '???';

        let title;
        let message;
        if (gameState.isElegant) {
            title = 'An elegant dish!';
            message = `You prepared ${article} ${adj} ${noun} with only ${gameState.moves} ingredients!`;
        } else {
            title = 'An excellent dish!';
            message = `You prepared ${article} ${adj} ${noun}!`;
        }
        const isReplayPuzzle = currentPuzzle && currentPuzzle.date !== getHelsinkiDate();
        if (isReplayPuzzle && lastAttemptWasNewBest) title += ' - A NEW BEST!';

        const gridHTML = buildVictoryGridHTML();
        const wasteLabel = wastePercent <= 25 ? `Food waste: ${wastePercent}% 🏆` : `Food waste: ${wastePercent}%`;
        const tryAgainBtn = isReplayPuzzle
            ? '<button id="modalRetryBtn" class="victory-share-btn">Try again</button>'
            : '';
        const content = `
            <p class="victory-message">${message}</p>
            ${gridHTML}
            <p class="victory-star">Key ingredient: ${starIngredient} 🔑</p>
            <p class="victory-waste">${wasteLabel}</p>
            <div class="victory-actions">
                ${tryAgainBtn}
                <button id="modalShareBtn" class="victory-share-btn">Share</button>
            </div>
        `;
        openModal(title, content);
        
        setTimeout(() => {
            const modalRetryBtn = document.getElementById('modalRetryBtn');
            const modalShareBtn = document.getElementById('modalShareBtn');
            if (modalRetryBtn) {
                modalRetryBtn.addEventListener('click', () => {
                    closeModal();
                    handleRetry();
                });
            }
            if (modalShareBtn) {
                modalShareBtn.addEventListener('click', handleShare);
            }
        }, 0);
    } else if (gameState.isLost) {
        const content = `
            <p style="text-align: center; margin-bottom: 20px;">The dish, she is ruined.</p>
            <div style="text-align: center; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button id="modalRetryBtn" style="padding: 10px 20px; font-size: 1em; background: #111827; color: #FBF8F1; border: 1px solid #111827; cursor: pointer; font-weight: 500;">Try again</button>
                <button id="modalShareBtn" style="padding: 10px 20px; font-size: 1em; background: transparent; color: #374151; border: 1px solid #D1D5DB; cursor: pointer; font-weight: 500;">Share</button>
            </div>
        `;
        openModal('Oof!', content);
        
        setTimeout(() => {
            const modalRetryBtn = document.getElementById('modalRetryBtn');
            const modalShareBtn = document.getElementById('modalShareBtn');
            if (modalRetryBtn) {
                modalRetryBtn.addEventListener('click', () => {
                    closeModal();
                    handleRetry();
                });
            }
            if (modalShareBtn) {
                modalShareBtn.addEventListener('click', handleShare);
            }
        }, 0);
    }
}

// Generate share text — matches victory modal: message, grid (green/black only, no blanks), key ingredient, food waste
function generateShareText() {
    const puzzleNum = getPuzzleNumber(currentPuzzle);
    const moves = gameState.moves;
    const wastePercent = getWastePercent();
    const starIngredient = getStarIngredient() || '???';

    let text = `dish of the day #${puzzleNum}\n\n`;

    if (gameState.isWon) {
        const adj = (gameState.adjectives[0] || '').toLowerCase();
        const noun = (gameState.noun || '').toLowerCase();
        const article = getIndefiniteArticle(gameState.adjectives[0] || '');
        if (gameState.isElegant) {
            text += `I prepared ${article} ${adj} ${noun} with only ${moves} ingredients!\n\n`;
        } else {
            text += `I prepared ${article} ${adj} ${noun}!\n\n`;
        }
    } else {
        text += `The dish, she is ruined. (${moves} ingredients)\n\n`;
    }

    // Grid: only matched (green) and unmatched (black), no blanks, numbered rows
    gameState.history.forEach((item, index) => {
        const boxes = item.result.map(cell => {
            const status = cell.status || 'plain';
            if (status === 'adj' || status === 'noun') return '🟩';
            return '⬛';  // black for unmatched
        }).join('');
        text += `${index + 1}. ${boxes}\n`;
    });

    if (gameState.isWon) {
        text += `\nKey ingredient: ${starIngredient} 🔑\n`;
        text += wastePercent <= 25 ? `Food waste: ${wastePercent}% 🏆` : `Food waste: ${wastePercent}%`;
    }

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

    lastRejectedIngredient = null;
    showInputFeedback('');
    const inputEl = document.getElementById('ingredientInput');
    if (inputEl) inputEl.value = '';

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
    updatePuzzleLabel();
    updateFooterTodayButton();
    updatePreviousButtonState();
}

// TODAY button: go to today's puzzle (and retry if already on today)
function handleTodayClick() {
    // Always clear debug date override so "today" means real today, not a stored override
    debugDateOverride = null;
    try {
        localStorage.removeItem('dish_of_the_day_debug_date');
    } catch (e) {}

    const today = getRealHelsinkiDate();
    if (currentView === 'archive') {
        const todayPuzzle = findTodayPuzzle();
        if (todayPuzzle) {
            loadPuzzle(todayPuzzle);
            showGameView();
            updatePuzzleLabel();
        }
        return;
    }
    if (currentPuzzle && currentPuzzle.date !== today) {
        resetDebugDate();
        return;
    }
    handleRetry();
}

// Handle retry (same puzzle, clear state)
function handleRetry() {
    if (!currentPuzzle) return;

    lastRejectedIngredient = null;
    showInputFeedback('');
    const inputEl = document.getElementById('ingredientInput');
    if (inputEl) inputEl.value = '';

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

// Show archive view and render list
function showArchiveView() {
    currentView = 'archive';
    document.body.classList.add('archive-view');
    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('archiveContainer').style.display = 'flex';
    renderArchiveList();
    updateFooterTodayButton();
}

// Show game view (from archive or init)
function showGameView() {
    currentView = 'game';
    document.body.classList.remove('archive-view');
    document.getElementById('archiveContainer').style.display = 'none';
    const hasPuzzle = currentPuzzle && puzzles.find(p => p.date === currentPuzzle.date);
    if (!hasPuzzle) {
        document.getElementById('noPuzzleMessage').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
    } else {
        document.getElementById('noPuzzleMessage').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'flex';
    }
    updateFooterTodayButton();
}

// Build and render archive list (all past puzzles: date < today, with or without attempts)
function renderArchiveList() {
    const listEl = document.getElementById('archiveList');
    if (!listEl) return;
    const attempts = getAttemptsData();
    const today = getRealHelsinkiDate();
    const pastPuzzles = puzzles.filter(p => p.date < today).sort((a, b) => b.date.localeCompare(a.date));
    listEl.innerHTML = '';
    pastPuzzles.forEach(puzzle => {
        const date = puzzle.date;
        const entry = attempts[date];
        const num = getPuzzleNumber(puzzle);
        const name = [...getPuzzleAdjectives(puzzle), puzzle.noun].filter(Boolean).map(w => titleCase(w)).join(' ');
        let row1Ingredients, row1Waste, row2Text;
        if (entry && entry.first) {
            const first = entry.first;
            const best = entry.best;
            row1Ingredients = first.won ? String(first.moves) : 'fail';
            row1Waste = first.won ? `${first.waste}%` : 'fail';
            row2Text = best
                ? `Best attempt: ingredients used: ${best.moves}, food waste: ${best.waste}%`
                : 'Best attempt: —';
        } else {
            row1Ingredients = '—';
            row1Waste = '—';
            row2Text = 'Best attempt: —';
        }
        const item = document.createElement('div');
        item.className = 'archive-item';
        item.dataset.date = date;
        item.innerHTML = `
            <div class="archive-item-row1">#${num} ${name}, ingredients used: ${row1Ingredients}, food waste: ${row1Waste}</div>
            <div class="archive-item-row2">${row2Text}</div>
        `;
        item.addEventListener('click', () => {
            loadPuzzle(puzzle);
            showGameView();
            updatePuzzleLabel();
        });
        listEl.appendChild(item);
    });
}

// ARCHIVE button: show archive view
function handleArchive() {
    showArchiveView();
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

// Handle navigation (previous or next)
function handleNavigate(direction) {
    if (direction === 'prev') {
        const prevBtn = document.getElementById('prevBtn');
        if (prevBtn && prevBtn.disabled) return;
    }

    const currentDate = getHelsinkiDate();
    const targetDate = direction === 'prev' ? decrementDate(currentDate) : incrementDate(currentDate);
    const targetPuzzle = puzzles.find(p => p.date === targetDate);

    debugDateOverride = targetDate;
    try {
        localStorage.setItem('dish_of_the_day_debug_date', targetDate);
    } catch (error) {
        console.error('Error saving debug date to localStorage:', error);
    }

    if (targetPuzzle) {
        loadPuzzle(targetPuzzle);
    } else {
        initGame();
    }
}

function handlePrevious() {
    handleNavigate('prev');
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

// Help modal content (shared by help button and first-time auto-show)
function getHelpContent() {
    return `
        <div class="help-content">
            <p>Complete the puzzle by entering ingredients that share letters with the dish of the day.</p>
            <p>Each time you submit a valid ingredient, its letters will match against the dish one at a time, left to right.</p>
            <p>A valid ingredient is a food, a single word, and 12 letters or less.</p>
            <p class="help-label">Example</p>
            <p>Adding the ingredient <strong>BANANA</strong> to this:</p>
            <div class="help-example">
                <img src="assets/clean-before.png" alt="Challenge dish before: APPEALING CANNOLI" class="help-image">
            </div>
            <p>Would produce this:</p>
            <div class="help-example">
                <img src="assets/clean-after.png" alt="Challenge dish after: BANANA letters matched" class="help-image">
            </div>
            <p>With the <strong>A</strong>, <strong>N</strong>, <strong>A</strong>, <strong>N</strong>, and <strong>A</strong> matching and the <strong>B</strong> discarded.</p>
            <p>A dish is prepared successfully if all of its letters are matched using five ingredients or less.</p>
        </div>
    `;
}

function showHelpModal() {
    openModal('How to Play', getHelpContent());
}

// Stats modal content and open
function getStatsContent() {
    const s = getStats();
    return `
        <div class="stats-content">
            <div class="stats-grid">
                <div class="stats-cell">
                    <div class="stats-label">Dishes attempted</div>
                    <div class="stats-value">${s.dishesAttempted}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Attempt streak</div>
                    <div class="stats-value">${s.attemptStreak}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Dish successes</div>
                    <div class="stats-value">${s.dishSuccessesPercent}%</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Success streak</div>
                    <div class="stats-value">${s.successStreak}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Av. waste</div>
                    <div class="stats-value">${s.averageWastePercent}%</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Total trophies</div>
                    <div class="stats-value">${s.totalTrophies}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Elegant dishes</div>
                    <div class="stats-value">${s.elegantPercent}%</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Av. ingredients</div>
                    <div class="stats-value">${s.averageIngredients}</div>
                </div>
            </div>
            <div class="stats-reset">
                <p class="stats-reset-hint">To reset your profile FOREVER, type "RESET" in the box below and submit. <span class="stats-reset-underline">This action cannot be undone.</span></p>
                <div class="stats-reset-row">
                    <input type="text" id="statsResetInput" placeholder="RESET" autocomplete="off" aria-label="Type RESET to confirm">
                    <button type="button" id="statsResetBtn" class="stats-reset-btn">CONFIRM</button>
                </div>
            </div>
        </div>
    `;
}

function showStatsModal() {
    openModal('STATISTICS', getStatsContent());
    setTimeout(() => {
        const input = document.getElementById('statsResetInput');
        const btn = document.getElementById('statsResetBtn');
        const modalContent = document.getElementById('modalContent');
        if (btn) btn.addEventListener('click', handleStatsReset);
        if (input) {
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleStatsReset(); });
            if (window.matchMedia('(max-width: 768px)').matches && modalContent && window.visualViewport) {
                function scrollResetInputAboveKeyboard() {
                    const vv = window.visualViewport;
                    const rect = input.getBoundingClientRect();
                    const marginAboveKeyboard = 220;
                    const visibleBottom = vv.height - marginAboveKeyboard;
                    if (rect.bottom > visibleBottom) {
                        modalContent.scrollTop += (rect.bottom - visibleBottom);
                    }
                }
                input.addEventListener('focus', () => {
                    setTimeout(scrollResetInputAboveKeyboard, 100);
                    setTimeout(scrollResetInputAboveKeyboard, 400);
                    window.visualViewport.addEventListener('resize', scrollResetInputAboveKeyboard);
                    window.visualViewport.addEventListener('scroll', scrollResetInputAboveKeyboard);
                });
                input.addEventListener('blur', () => {
                    window.visualViewport.removeEventListener('resize', scrollResetInputAboveKeyboard);
                    window.visualViewport.removeEventListener('scroll', scrollResetInputAboveKeyboard);
                });
            }
        }
    }, 0);
}

function handleStatsReset() {
    const input = document.getElementById('statsResetInput');
    if (!input || (input.value || '').trim().toUpperCase() !== 'RESET') return;
    try {
        localStorage.removeItem(STATS_KEY);
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('dish_of_the_day_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        closeModal();
        initGame();
    } catch (e) {
        console.error('Error resetting profile:', e);
    }
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
    await loadFoodLists();
    initGame();

    // Show help modal for first-time players
    try {
        const helpShown = localStorage.getItem('dish_of_the_day_help_shown');
        if (!helpShown) {
            showHelpModal();
            localStorage.setItem('dish_of_the_day_help_shown', '1');
        }
    } catch (e) {
        // localStorage may be unavailable (private browsing, etc.)
    }

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');

    submitBtn.addEventListener('click', async () => {
        const ingredient = input.value.trim();
        if (ingredient) {
            const accepted = await processIngredient(ingredient);
            if (accepted) {
                input.value = '';
                if (!gameState.isWon && !gameState.isLost) input.focus();
            }
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
        updateInputValidationState();
    });

    // Navigation buttons
    const prevBtn = document.getElementById('prevBtn');
    const retryBtn = document.getElementById('retryBtn');
    
    prevBtn.addEventListener('click', handleArchive);
    retryBtn.addEventListener('click', handleTodayClick);

    // Reset to Today button
    const resetToTodayBtn = document.getElementById('resetToTodayBtn');
    if (resetToTodayBtn) {
        resetToTodayBtn.addEventListener('click', handleResetToToday);
    }

    // Modal buttons
    document.getElementById('statsBtn').addEventListener('click', showStatsModal);
    document.getElementById('helpBtn').addEventListener('click', showHelpModal);

    document.getElementById('infoBtn').addEventListener('click', () => {
        openModal('About Dish of the Day', `<div class="about-content">
            <p>A daily word puzzle by Mike Kayatta.</p>
            <p>You are playing an early test version, so you might encounter unexpected bugs or changes, unfinished features, or weird placeholders.</p>
            <p>Right now, there are 50 puzzles. Eventually, they will be served daily, but for now you can feel free to cheat using the <strong>&lt;</strong> <strong>R</strong> and <strong>&gt;</strong> buttons at the bottom of the game, which move between the available puzzles and even allow you to replay.</p>
        </div>`);
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

    // Handle mobile keyboard — hide footer when open to free space; allow scroll so input stays visible
    if (window.visualViewport && window.matchMedia('(max-width: 768px)').matches) {
        const footer = document.querySelector('.game-footer');
        let initialHeight = window.visualViewport.height;
        let keyboardOpen = false;

        function updateKeyboardState() {
            const vv = window.visualViewport;
            const currentHeight = vv.height;
            const heightDiff = initialHeight - currentHeight;

            if (heightDiff > 100) {
                if (!keyboardOpen) {
                    keyboardOpen = true;
                    document.documentElement.classList.add('keyboard-open');
                    if (footer) footer.style.display = 'none';
                    document.body.style.overflowY = 'auto';
                }
                // Scroll input into view above keyboard
                requestAnimationFrame(() => {
                    input.scrollIntoView({ block: 'center', behavior: 'auto' });
                });
            } else if (keyboardOpen) {
                keyboardOpen = false;
                document.documentElement.classList.remove('keyboard-open');
                if (footer) footer.style.display = '';
                document.body.style.overflowY = '';
                initialHeight = vv.height;
                window.scrollTo(0, 0);
            } else {
                initialHeight = currentHeight;
            }
        }

        window.visualViewport.addEventListener('resize', updateKeyboardState);
        window.visualViewport.addEventListener('scroll', updateKeyboardState);
    }

    // Blur input when tapping outside to close keyboard
    document.addEventListener('touchstart', (e) => {
        const input = document.getElementById('ingredientInput');
        if (document.activeElement === input && !e.target.closest('.input-section')) {
            input.blur();
        }
    });
});
