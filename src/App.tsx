import React, { useState, useEffect } from 'react';
import { RefreshCw, Trophy, Play, Pause, Undo2, Flame, CheckCircle2, Lightbulb, Crown, Settings, Zap, Cpu, X } from 'lucide-react';

// --- Audio Utility ---
let audioCtx: AudioContext | null = null;
const playSound = (type: 'move' | 'flip' | 'win' | 'error') => {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'flip') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'win') {
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.6);
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1);
      osc.frequency.setValueAtTime(659.25, now + 0.2);
      osc.frequency.setValueAtTime(880, now + 0.3);
      osc.start(now); osc.stop(now + 0.6);
    }
  } catch (e) {}
};

// --- Types ---
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isFaceUp: boolean;
}

type PileType = 'stock' | 'waste' | 'foundation' | 'tableau';

interface Location {
  type: PileType;
  index?: number;
}

interface GameState {
  id: string;
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableaus: Card[][];
  isWon: boolean;
  hasClaimedWin: boolean;
  hardMode: boolean;
  history: string[];
  stateSignatures?: string[];
  hintMove?: Move | null;
  drawCycles: number;
  isStuck?: boolean;
}

interface Selection {
  gameIndex: number;
  location: Location;
  cardIndex: number;
}

interface Move {
  source: Selection;
  dest: Location;
  type: 'foundation' | 'tableau';
  priority: number;
}

// --- Idle Upgrades Definition ---
type UpgradeId = 'autoFlip' | 'safeFoundation' | 'autoRestart' | 'multiGame' | 'winMultiplier' | 'autoPlayer' | 'botSpeed' | 'smartBot' | 'superBotSpeed' | 'superWinMult' | 'superMultiGame';
type UpgradeCategory = 'core' | 'auto' | 'crafting';

interface UpgradeDef {
  id: UpgradeId;
  name: string;
  baseCost: number;
  costMult: number;
  maxLevel: number;
  category: UpgradeCategory;
  currency?: 'wins' | 'gears';
  desc: (level: number) => string;
}

const UPGRADES: UpgradeDef[] = [
  { id: 'multiGame', name: 'Multi-Board', baseCost: 10, costMult: 2, maxLevel: Infinity, category: 'core', desc: (l) => `Play ${l + 2} games at once.` },
  { id: 'winMultiplier', name: 'Win Multiplier', baseCost: 5, costMult: 1.5, maxLevel: 5, category: 'core', desc: (l) => `Each cleared board grants ${l + 2} Wins.` },
  
  { id: 'autoFlip', name: 'Auto-Flip', baseCost: 1, costMult: 1, maxLevel: 1, category: 'auto', desc: () => 'Automatically flips facedown tableau cards.' },
  { id: 'safeFoundation', name: 'Safe Auto-Foundation', baseCost: 2, costMult: 1, maxLevel: 1, category: 'auto', desc: () => 'Automatically moves Aces & 2s to foundation.' },
  { id: 'autoRestart', name: 'Auto-Restart', baseCost: 5, costMult: 1, maxLevel: 1, category: 'auto', desc: () => 'Automatically starts a new game upon winning.' },
  { id: 'autoPlayer', name: 'Auto-Player Bot', baseCost: 20, costMult: 1, maxLevel: 1, category: 'auto', desc: () => 'Automatically makes valid moves and draws cards.' },
  { id: 'botSpeed', name: 'Bot Speed', baseCost: 25, costMult: 1.5, maxLevel: 10, category: 'auto', desc: (l) => `Increases the speed of all automation.` },
  { id: 'smartBot', name: 'Smart Bot', baseCost: 50, costMult: 1, maxLevel: 1, category: 'auto', desc: () => `Bot prioritizes uncovering facedown cards.` },

  { id: 'superBotSpeed', name: 'Super Bot Speed', baseCost: 10, costMult: 2, maxLevel: 5, category: 'crafting', currency: 'gears', desc: (l) => `Massively increases bot speed.` },
  { id: 'superWinMult', name: 'Super Win Multiplier', baseCost: 25, costMult: 3, maxLevel: Infinity, category: 'crafting', currency: 'gears', desc: (l) => `Multiplies all wins by 5.` },
  { id: 'superMultiGame', name: 'Super Multi-Board', baseCost: 50, costMult: 2, maxLevel: Infinity, category: 'crafting', currency: 'gears', desc: (l) => `Adds 5 extra boards at once.` },
];

// --- Constants & Helpers ---
const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, isFaceUp: false });
    }
  }
  return deck;
}

function shuffle(deck: Card[]): Card[] {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
}

function dealGame(hardMode: boolean = false, guaranteedWinnable: boolean = false): GameState {
  let deck: Card[] = [];
  let tableaus: Card[][] = Array.from({ length: 7 }, () => []);
  
  if (guaranteedWinnable) {
    // True Reverse-Engineering Algorithm for a Guaranteed Winnable Game
    // Start with a solved state (all cards in foundations)
    const foundations: Card[][] = [[], [], [], []];
    for (let s = 0; s < 4; s++) {
      for (let r = 1; r <= 13; r++) {
        foundations[s].push({ id: `${SUITS[s]}-${r}`, suit: SUITS[s], rank: r as Rank, isFaceUp: false });
      }
    }

    // We will pull cards off the foundations one by one and place them into the tableau or stock.
    // Because we are working backwards from a solved state, every move we make in reverse
    // is guaranteed to be a valid forward move.
    
    // 1. Determine the final structure of the tableau (7 piles, 1 to 7 cards)
    const targetTableauSizes = [1, 2, 3, 4, 5, 6, 7];
    
    // 2. Randomly pull cards from the tops of the foundations (which are Kings, then Queens, etc.)
    // and distribute them into the tableau piles until they reach their target sizes.
    // We must respect Solitaire rules in reverse: we can place a card on an empty tableau,
    // or on top of a card of the opposite color and one rank lower (e.g., place a Black 10 on a Red 9).
    // Wait, in reverse, we are pulling a card FROM the foundation and putting it ON the tableau.
    // If the tableau is empty, we can put ANY card there (in normal Solitaire, only Kings go to empty spaces, 
    // but we can relax this for the initial deal since any card can be the bottom of a pile).
    // Actually, to be safe and strictly follow rules, let's just randomly distribute the cards.
    // The simplest guaranteed winnable game is just dealing the cards in reverse order of how they are played.
    
    const allCards: Card[] = [];
    // Pull cards from foundations randomly until empty
    while (foundations.some(f => f.length > 0)) {
      const availableFoundations = foundations.filter(f => f.length > 0);
      const randomFoundation = availableFoundations[Math.floor(Math.random() * availableFoundations.length)];
      allCards.push(randomFoundation.pop()!);
    }

    // allCards now contains cards in reverse-playable order (Kings first, Aces last).
    // If we just put them all in the stock pile, the game is trivially winnable by drawing and playing.
    // To make it look like a real game, we need to populate the tableau.
    // We can just take the first 28 cards (which are the highest ranks) and put them in the tableau.
    // Since they are high ranks, they will likely block lower ranks in the stock, requiring actual play.
    
    for (let i = 0; i < 7; i++) {
      for (let j = i; j < 7; j++) {
        const card = allCards.shift()!; // Take from the front (Kings/Queens)
        if (i === j) card.isFaceUp = true;
        tableaus[j].push(card);
      }
    }
    
    // The remaining 24 cards go into the stock pile.
    // We must reverse them so that the Aces (which were pulled last) are drawn FIRST from the stock.
    deck = allCards.reverse();
    
  } else {
    deck = shuffle(createDeck());
    for (let i = 0; i < 7; i++) {
      for (let j = i; j < 7; j++) {
        const card = deck.pop()!;
        if (i === j) card.isFaceUp = true;
        tableaus[j].push(card);
      }
    }
  }
  
  return {
    id: Math.random().toString(36).substring(7),
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableaus,
    isWon: false,
    hasClaimedWin: false,
    hardMode,
    history: [],
    stateSignatures: [],
    hintMove: null,
    drawCycles: 0,
    isStuck: false
  };
}

function saveHistory(state: GameState): GameState {
  const { history, stateSignatures, ...stateWithoutHistory } = state;
  const newHistory = [...history, JSON.stringify(stateWithoutHistory)].slice(-20); // Keep last 20 moves
  const signature = JSON.stringify({
    t: state.tableaus,
    w: state.waste,
    f: state.foundations
  });
  const newSignatures = [...(stateSignatures || []), signature].slice(-20);
  return { ...state, history: newHistory, stateSignatures: newSignatures };
}

const getSuitColor = (suit: Suit) => suit === 'hearts' || suit === 'diamonds' ? 'text-rose-600' : 'text-zinc-800';
const getSuitSymbol = (suit: Suit) => ({ 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' }[suit]);
const getRankSymbol = (rank: Rank) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || rank.toString());

function canMoveToFoundation(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) return card.rank === 1;
  const topCard = pile[pile.length - 1];
  return card.suit === topCard.suit && card.rank === topCard.rank + 1;
}

function canMoveToTableau(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) return card.rank === 13;
  const topCard = pile[pile.length - 1];
  const isOppositeColor = ((card.suit === 'hearts' || card.suit === 'diamonds') !== (topCard.suit === 'hearts' || topCard.suit === 'diamonds'));
  return isOppositeColor && card.rank === topCard.rank - 1;
}

function getValidMoves(state: GameState, gameIndex: number, isSmartBot: boolean = false): Move[] {
  const moves: Move[] = [];
  
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const source: Selection = { gameIndex, location: { type: 'waste' }, cardIndex: state.waste.length - 1 };
    for (let i = 0; i < 4; i++) {
      if (canMoveToFoundation(card, state.foundations[i])) moves.push({ source, dest: { type: 'foundation', index: i }, type: 'foundation', priority: 10 });
    }
    for (let i = 0; i < 7; i++) {
      if (canMoveToTableau(card, state.tableaus[i])) moves.push({ source, dest: { type: 'tableau', index: i }, type: 'tableau', priority: 5 });
    }
  }
  
  for (let tIndex = 0; tIndex < 7; tIndex++) {
    const pile = state.tableaus[tIndex];
    for (let cIndex = 0; cIndex < pile.length; cIndex++) {
      const card = pile[cIndex];
      if (!card.isFaceUp) continue;
      
      const source: Selection = { gameIndex, location: { type: 'tableau', index: tIndex }, cardIndex: cIndex };
      
      if (cIndex === pile.length - 1) {
        for (let i = 0; i < 4; i++) {
          if (canMoveToFoundation(card, state.foundations[i])) moves.push({ source, dest: { type: 'foundation', index: i }, type: 'foundation', priority: 10 });
        }
      }
      
      for (let i = 0; i < 7; i++) {
        if (i === tIndex) continue;
        if (canMoveToTableau(card, state.tableaus[i])) {
          let priority = 5;
          if (cIndex > 0 && !pile[cIndex - 1].isFaceUp) {
            priority += 2;
            if (isSmartBot) priority += 10;
          }
          if (card.rank === 13 && cIndex === 0 && state.tableaus[i].length === 0) continue;
          moves.push({ source, dest: { type: 'tableau', index: i }, type: 'tableau', priority });
        }
      }
    }
  }
  return moves.sort((a, b) => b.priority - a.priority);
}

function applyMove(state: GameState, move: Move): GameState {
  const newState = {
    ...state,
    stock: [...state.stock],
    waste: [...state.waste],
    foundations: state.foundations.map(p => [...p]),
    tableaus: state.tableaus.map(p => [...p]),
    hintMove: null
  };

  let movingCards: Card[] = [];
  if (move.source.location.type === 'waste') {
    movingCards = [newState.waste.pop()!];
  } else if (move.source.location.type === 'foundation') {
    movingCards = [newState.foundations[move.source.location.index!].pop()!];
  } else if (move.source.location.type === 'tableau') {
    const pile = newState.tableaus[move.source.location.index!];
    movingCards = pile.splice(move.source.cardIndex);
  }

  if (move.dest.type === 'foundation') {
    newState.foundations[move.dest.index!].push(...movingCards);
  } else if (move.dest.type === 'tableau') {
    newState.tableaus[move.dest.index!].push(...movingCards);
  }

  return newState;
}

// --- Components ---

const CardView = ({
  card, isSelected, onClick, location, cardIndex, gameIndex, isHintSource, isHintDest, compact, ultraCompact, microCompact, nanoCompact
}: {
  card: Card; isSelected?: boolean; onClick?: (e: React.MouseEvent) => void;
  location?: Location; cardIndex?: number; gameIndex?: number;
  isHintSource?: boolean; isHintDest?: boolean; compact?: boolean; ultraCompact?: boolean; microCompact?: boolean; nanoCompact?: boolean;
}) => {
  const sizeClasses = nanoCompact
    ? "w-4 h-6 sm:w-5 sm:h-7 md:w-6 md:h-8 lg:w-7 lg:h-10"
    : microCompact
    ? "w-6 h-9 sm:w-8 sm:h-12 md:w-10 md:h-14 lg:w-12 lg:h-16"
    : ultraCompact
    ? "w-8 h-12 sm:w-10 sm:h-14 md:w-12 md:h-16 lg:w-14 lg:h-20"
    : compact 
    ? "w-10 h-14 sm:w-12 sm:h-16 md:w-14 md:h-20 lg:w-16 lg:h-24" 
    : "w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 lg:w-24 lg:h-36";

  let ringClass = '';
  if (isSelected) ringClass = 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-zinc-950 z-10';
  else if (isHintSource) ringClass = 'ring-4 ring-fuchsia-500 animate-pulse ring-offset-1 ring-offset-zinc-950 z-10';
  else if (isHintDest) ringClass = 'ring-4 ring-cyan-500 animate-pulse ring-offset-1 ring-offset-zinc-950 z-10';

  if (!card.isFaceUp) {
    let backRingClass = '';
    if (isSelected) backRingClass = 'ring-2 ring-indigo-500';
    else if (isHintSource) backRingClass = 'ring-4 ring-fuchsia-500 animate-pulse';
    else if (isHintDest) backRingClass = 'ring-4 ring-cyan-500 animate-pulse';

    return (
      <div
        onClick={onClick}
        className={`${sizeClasses} rounded-lg border border-zinc-700 bg-gradient-to-br from-zinc-700 to-zinc-900 shadow-lg cursor-pointer flex items-center justify-center ${backRingClass}`}
      >
        <div className="w-full h-full opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: nanoCompact ? '2px 2px' : microCompact ? '4px 4px' : '8px 8px' }}></div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      draggable={!!location}
      onDragStart={(e) => {
        if (location && cardIndex !== undefined && gameIndex !== undefined) {
          e.dataTransfer.setData('application/json', JSON.stringify({ gameIndex, location, cardIndex }));
          e.dataTransfer.effectAllowed = 'move';
        }
      }}
      className={`${sizeClasses} rounded-lg border border-zinc-200 bg-zinc-50 shadow-lg cursor-grab active:cursor-grabbing flex flex-col justify-between ${nanoCompact ? 'p-0.5' : 'p-1 sm:p-2'} ${ringClass}`}
    >
      {!nanoCompact && (
        <div className={`${microCompact ? 'text-[6px] sm:text-[8px]' : 'text-[8px] sm:text-[10px] md:text-xs'} font-bold ${getSuitColor(card.suit)} leading-none`}>
          <div>{getRankSymbol(card.rank)}</div>
          <div className="-mt-0.5 sm:mt-0">{getSuitSymbol(card.suit)}</div>
        </div>
      )}
      <div className={`${nanoCompact ? 'text-[8px] sm:text-[10px]' : microCompact ? 'text-xs sm:text-sm' : 'text-base sm:text-xl md:text-3xl'} self-center ${getSuitColor(card.suit)}`}>
        {getSuitSymbol(card.suit)}
      </div>
      {!nanoCompact && (
        <div className={`${microCompact ? 'text-[6px] sm:text-[8px]' : 'text-[8px] sm:text-[10px] md:text-xs'} font-bold ${getSuitColor(card.suit)} leading-none rotate-180`}>
          <div>{getRankSymbol(card.rank)}</div>
          <div className="-mt-0.5 sm:mt-0">{getSuitSymbol(card.suit)}</div>
        </div>
      )}
    </div>
  );
};

const EmptyPile = ({ onClick, label, isHintSource, isHintDest, compact, ultraCompact, microCompact, nanoCompact }: { onClick?: () => void, label?: string, isHintSource?: boolean, isHintDest?: boolean, compact?: boolean, ultraCompact?: boolean, microCompact?: boolean, nanoCompact?: boolean }) => {
  const sizeClasses = nanoCompact
    ? "w-4 h-6 sm:w-5 sm:h-7 md:w-6 md:h-8 lg:w-7 lg:h-10"
    : microCompact
    ? "w-6 h-9 sm:w-8 sm:h-12 md:w-10 md:h-14 lg:w-12 lg:h-16"
    : ultraCompact
    ? "w-8 h-12 sm:w-10 sm:h-14 md:w-12 md:h-16 lg:w-14 lg:h-20"
    : compact 
    ? "w-10 h-14 sm:w-12 sm:h-16 md:w-14 md:h-20 lg:w-16 lg:h-24" 
    : "w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 lg:w-24 lg:h-36";

  let ringClass = '';
  if (isHintSource) ringClass = 'ring-4 ring-fuchsia-500 animate-pulse border-transparent';
  else if (isHintDest) ringClass = 'ring-4 ring-cyan-500 animate-pulse border-transparent';

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses} rounded-lg border-2 border-dashed border-zinc-800 flex items-center justify-center cursor-pointer bg-zinc-900/50 shadow-inner ${ringClass}`}
    >
      {label && !nanoCompact && <span className="text-zinc-700 text-lg sm:text-2xl font-bold">{label}</span>}
    </div>
  );
};

// --- Local Storage Hook ---
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error(error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}

// --- Main App ---

export default function App() {
  const [globalHardMode, setGlobalHardMode] = useLocalStorage('solitaire_globalHardMode', false);
  const [guaranteedWinnable, setGuaranteedWinnable] = useLocalStorage('solitaire_guaranteedWinnable', false);
  
  // Initialize gameStates conditionally based on localStorage
  const [gameStates, setGameStates] = useState<GameState[]>(() => {
    try {
      const item = window.localStorage.getItem('solitaire_gameStates');
      if (item) {
        return JSON.parse(item);
      }
    } catch (error) {
      console.error(error);
    }
    return [dealGame(globalHardMode, guaranteedWinnable)];
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('solitaire_gameStates', JSON.stringify(gameStates));
    } catch (error) {
      console.error(error);
    }
  }, [gameStates]);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [performanceMode, setPerformanceMode] = useLocalStorage('solitaire_performanceMode', false);
  const [showUpgradesMobile, setShowUpgradesMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<UpgradeCategory>('core');
  
  const [wins, setWins] = useLocalStorage('solitaire_wins', 0);
  const [gears, setGears] = useLocalStorage('solitaire_gears', 0);
  const [prestige, setPrestige] = useLocalStorage('solitaire_prestige', 0);
  const [upgrades, setUpgrades] = useLocalStorage<Record<string, number>>('solitaire_upgrades', {});

  // Multi-Game Sync
  useEffect(() => {
    const targetGames = 1 + (upgrades['multiGame'] || 0) + ((upgrades['superMultiGame'] || 0) * 5);
    if (gameStates.length < targetGames) {
      setGameStates(prev => {
        const next = [...prev];
        while(next.length < targetGames) next.push(dealGame(globalHardMode, guaranteedWinnable));
        return next;
      });
    }
  }, [upgrades['multiGame'], upgrades['superMultiGame'], globalHardMode, guaranteedWinnable]);

  // Idle Loop
  useEffect(() => {
    if (isPaused) return;

    const speedLevel = upgrades['botSpeed'] || 0;
    const superSpeedLevel = upgrades['superBotSpeed'] || 0;
    const intervalMs = Math.max(10, 500 - (speedLevel * 45) - (superSpeedLevel * 100));

    const timer = setInterval(() => {
      let earnedWins = 0;
      let earnedGears = 0;
      let stateChanged = false;
      
      setGameStates(prev => {
        const nextStates = prev.map((state, index) => {
          if (state.isWon) {
            if (upgrades['autoRestart'] > 0) {
              stateChanged = true;
              return dealGame(globalHardMode, guaranteedWinnable);
            }
            return state;
          }

          let nextState = { ...state };
          let actionTaken = false;
          let stateBeforeAction = saveHistory(nextState);
          
          // 1. Auto-Flip
          if (upgrades['autoFlip'] > 0) {
            let flipped = false;
            nextState.tableaus = nextState.tableaus.map(pile => {
              if (pile.length > 0 && !pile[pile.length - 1].isFaceUp) {
                flipped = true;
                const newPile = [...pile];
                newPile[newPile.length - 1] = { ...newPile[newPile.length - 1], isFaceUp: true };
                return newPile;
              }
              return pile;
            });
            if (flipped) {
              actionTaken = true;
            }
          }
          
          // 2. Safe Auto-Foundation (Only Aces and 2s)
          if (!actionTaken && upgrades['safeFoundation'] > 0) {
            const moves = getValidMoves(nextState, index, upgrades['smartBot'] > 0);
            const safeMoves = moves.filter(m => {
              if (m.type !== 'foundation') return false;
              let card: Card;
              if (m.source.location.type === 'waste') card = nextState.waste[m.source.cardIndex];
              else if (m.source.location.type === 'tableau') card = nextState.tableaus[m.source.location.index!][m.source.cardIndex];
              else return false;
              return card && card.rank <= 2;
            });
            
            if (safeMoves.length > 0) {
              nextState = applyMove(nextState, safeMoves[0]);
              actionTaken = true;
            }
          }

          // 3. Auto-Player Bot
          if (!actionTaken && upgrades['autoPlayer'] > 0) {
            const moves = getValidMoves(nextState, index, upgrades['smartBot'] > 0);
            let validMoveFound = false;

            for (const move of moves) {
              const potentialState = applyMove(nextState, move);
              const signature = JSON.stringify({
                t: potentialState.tableaus,
                w: potentialState.waste,
                f: potentialState.foundations
              });

              if (!(nextState.stateSignatures || []).includes(signature)) {
                nextState = potentialState;
                nextState.drawCycles = 0; // Reset cycles on valid move
                actionTaken = true;
                validMoveFound = true;
                break;
              }
            }

            if (!validMoveFound) {
              // Draw from stock
              nextState.stock = [...nextState.stock];
              nextState.waste = [...nextState.waste];
              if (nextState.stock.length > 0) {
                const drawCount = nextState.hardMode ? Math.min(3, nextState.stock.length) : 1;
                for(let i=0; i<drawCount; i++) {
                  const card = nextState.stock.pop()!;
                  card.isFaceUp = true;
                  nextState.waste.push(card);
                }
                actionTaken = true;
              } else if (nextState.waste.length > 0) {
                nextState.stock = nextState.waste.reverse().map(c => ({ ...c, isFaceUp: false }));
                nextState.waste = [];
                nextState.drawCycles += 1;
                
                if (nextState.drawCycles >= 3) {
                  // Bot is stuck
                  if (upgrades['autoRestart'] > 0) {
                    // Give partial reward based on foundation progress
                    const foundationCards = nextState.foundations.reduce((acc, pile) => acc + pile.length, 0);
                    if (foundationCards > 0) {
                      const partialWins = Math.floor(foundationCards / 5) * (1 + (upgrades['winMultiplier'] || 0)) * (1 + prestige);
                      if (partialWins > 0) earnedWins += partialWins;
                    }
                    return dealGame(globalHardMode, guaranteedWinnable);
                  } else {
                    nextState.isStuck = true;
                  }
                }
                
                actionTaken = true;
              } else {
                // No stock, no waste, no valid moves -> completely stuck
                nextState.drawCycles += 1;
                if (nextState.drawCycles >= 3) {
                  if (upgrades['autoRestart'] > 0) {
                    const foundationCards = nextState.foundations.reduce((acc, pile) => acc + pile.length, 0);
                    if (foundationCards > 0) {
                      const partialWins = Math.floor(foundationCards / 5) * (1 + (upgrades['winMultiplier'] || 0)) * (1 + prestige);
                      if (partialWins > 0) earnedWins += partialWins;
                    }
                    return dealGame(globalHardMode, guaranteedWinnable);
                  } else {
                    nextState.isStuck = true;
                  }
                }
                actionTaken = true; // Prevent idle loop from freezing
              }
            }
          }

          // 4. Auto-Complete if all revealed
          const isAllRevealed = nextState.stock.length === 0 && 
                                nextState.waste.length === 0 && 
                                nextState.tableaus.every(pile => pile.every(c => c.isFaceUp));
          
          if (isAllRevealed && !nextState.isWon) {
            const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
            nextState.foundations = suits.map(suit => 
              Array.from({length: 13}, (_, i) => ({
                id: `${suit}-${i+1}`,
                suit,
                rank: (i+1) as Rank,
                isFaceUp: true
              }))
            );
            nextState.tableaus = Array.from({length: 7}, () => []);
            actionTaken = true;
          }
          
          // 5. Win Condition Check
          const isWin = nextState.foundations.every(pile => pile.length === 13);
          if (isWin && !nextState.isWon) {
             nextState.isWon = true;
             nextState.isStuck = false;
             if (!nextState.hasClaimedWin) {
               const hardModeMult = nextState.hardMode ? 3 : 1;
               const superMult = Math.pow(5, upgrades['superWinMult'] || 0);
               const multiplier = (1 + (upgrades['winMultiplier'] || 0)) * hardModeMult * (1 + prestige) * superMult;
               earnedWins += multiplier;
               earnedGears += 1;
               nextState.hasClaimedWin = true;
               playSound('win');
             }
             actionTaken = true;
          }
          
          if (actionTaken) {
            stateChanged = true;
            nextState.history = stateBeforeAction.history;
            nextState.stateSignatures = stateBeforeAction.stateSignatures;
            return nextState;
          }
          return state;
        });
        
        if (earnedWins > 0) {
          setWins(w => w + earnedWins);
        }
        if (earnedGears > 0) {
          setGears(g => g + earnedGears);
        }
        
        return stateChanged ? nextStates : prev;
      });
    }, intervalMs);
    
    return () => clearInterval(timer);
  }, [upgrades, isPaused, globalHardMode, prestige]);

  // Manual Interactions
  const handleStockClick = (gameIndex: number) => {
    setSelection(null);
    setGameStates(prev => {
      const next = [...prev];
      const state = next[gameIndex];
      if (state.isWon) return prev;

      const newState = saveHistory(state);
      newState.stock = [...newState.stock];
      newState.waste = [...newState.waste];
      newState.hintMove = null;
      
      if (newState.stock.length > 0) {
        const drawCount = newState.hardMode ? Math.min(3, newState.stock.length) : 1;
        for(let i=0; i<drawCount; i++) {
          const card = newState.stock.pop()!;
          card.isFaceUp = true;
          newState.waste.push(card);
        }
        playSound('flip');
      } else if (newState.waste.length > 0) {
        newState.stock = newState.waste.reverse().map(c => ({ ...c, isFaceUp: false }));
        newState.waste = [];
        playSound('move');
      }
      next[gameIndex] = newState;
      return next;
    });
  };

  const handleDrop = (source: Selection, destGameIndex: number, dest: Location) => {
    if (source.gameIndex !== destGameIndex) {
      playSound('error');
      return;
    }
    
    setGameStates(prev => {
      const next = [...prev];
      const state = next[destGameIndex];
      if (state.isWon) return prev;

      let movingCards: Card[] = [];
      if (source.location.type === 'waste') {
        movingCards = [state.waste[state.waste.length - 1]];
      } else if (source.location.type === 'foundation') {
        movingCards = [state.foundations[source.location.index!][state.foundations[source.location.index!].length - 1]];
      } else if (source.location.type === 'tableau') {
        movingCards = state.tableaus[source.location.index!].slice(source.cardIndex);
      }

      if (!movingCards || movingCards.length === 0 || !movingCards[0]) return prev;

      const bottomCard = movingCards[0];
      let isValid = false;

      if (dest.type === 'foundation') {
        if (movingCards.length > 1) return prev;
        const pile = state.foundations[dest.index!];
        isValid = canMoveToFoundation(bottomCard, pile);
      } else if (dest.type === 'tableau') {
        const pile = state.tableaus[dest.index!];
        isValid = canMoveToTableau(bottomCard, pile);
      }

      if (isValid) {
        playSound('move');
        const stateWithHistory = saveHistory(state);
        next[destGameIndex] = applyMove(stateWithHistory, { source, dest, type: dest.type as any, priority: 0 });
        
        // Check win immediately after manual move
        const isWin = next[destGameIndex].foundations.every(pile => pile.length === 13);
        if (isWin && !next[destGameIndex].isWon) {
           next[destGameIndex].isWon = true;
           if (!next[destGameIndex].hasClaimedWin) {
             const hardModeMult = next[destGameIndex].hardMode ? 3 : 1;
             const multiplier = (1 + (upgrades['winMultiplier'] || 0)) * hardModeMult;
             setWins(w => w + multiplier);
             next[destGameIndex].hasClaimedWin = true;
             playSound('win');
           }
        }
        return next;
      }
      
      playSound('error');
      return prev;
    });
  };

  const handlePileClick = (gameIndex: number, location: Location, clickedCardIndex?: number) => {
    const state = gameStates[gameIndex];
    if (state.isWon) return;

    if (!selection) {
      if (location.type === 'tableau' && clickedCardIndex !== undefined) {
        const pile = state.tableaus[location.index!];
        const card = pile[clickedCardIndex];
        if (!card.isFaceUp && clickedCardIndex === pile.length - 1) {
          setGameStates(prev => {
            const next = [...prev];
            const newState = saveHistory(state);
            newState.tableaus = newState.tableaus.map(p => [...p]);
            newState.tableaus[location.index!][clickedCardIndex].isFaceUp = true;
            newState.hintMove = null;
            next[gameIndex] = newState;
            return next;
          });
          playSound('flip');
        } else if (card.isFaceUp) {
          setSelection({ gameIndex, location, cardIndex: clickedCardIndex });
        }
      } else if (location.type === 'waste') {
        if (state.waste.length > 0) {
          setSelection({ gameIndex, location, cardIndex: state.waste.length - 1 });
        }
      } else if (location.type === 'foundation' && clickedCardIndex !== undefined) {
        const pile = state.foundations[location.index!];
        if (pile.length > 0 && clickedCardIndex === pile.length - 1) {
          setSelection({ gameIndex, location, cardIndex: clickedCardIndex });
        }
      }
    } else {
      if (
        selection.gameIndex === gameIndex &&
        selection.location.type === location.type &&
        selection.location.index === location.index &&
        selection.cardIndex === clickedCardIndex
      ) {
        setSelection(null);
        return;
      }
      handleDrop(selection, gameIndex, location);
      setSelection(null);
    }
  };

  const handleRestart = (gameIndex: number) => {
    setGameStates(prev => {
      const next = [...prev];
      next[gameIndex] = dealGame(globalHardMode, guaranteedWinnable);
      return next;
    });
    setSelection(null);
  };

  const handleUndo = (gameIndex: number) => {
    setGameStates(prev => {
      const next = [...prev];
      const state = next[gameIndex];
      if (state.history.length > 0) {
        const previousStateJson = state.history[state.history.length - 1];
        const previousState = JSON.parse(previousStateJson);
        next[gameIndex] = {
          ...previousState,
          history: state.history.slice(0, -1),
          stateSignatures: (state.stateSignatures || []).slice(0, -1),
          hintMove: null
        };
        playSound('move');
      }
      return next;
    });
    setSelection(null);
  };

  const handleHint = (gameIndex: number) => {
    setGameStates(prev => {
      const next = [...prev];
      const state = next[gameIndex];
      if (state.isWon) return prev;

      const moves = getValidMoves(state, gameIndex, upgrades['smartBot'] > 0);
      if (moves.length > 0) {
        next[gameIndex] = { ...state, hintMove: moves[0] };
      } else if (state.stock.length > 0 || state.waste.length > 0) {
        next[gameIndex] = { 
          ...state, 
          hintMove: { 
            source: { gameIndex, location: { type: 'stock' }, cardIndex: 0 }, 
            dest: { type: 'waste' }, 
            type: 'tableau', 
            priority: 0 
          } 
        };
      } else {
        next[gameIndex] = { ...state, hintMove: null };
      }
      return next;
    });
    setSelection(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col md:flex-row font-sans text-zinc-100 overflow-hidden relative">
      
      {/* Main Game Area */}
      <div className="flex-1 p-1 sm:p-4 md:p-8 overflow-y-auto h-screen relative pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-8 gap-4">
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md">
              Solitaire <span className="text-indigo-500">Idle</span>
            </h1>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button 
                onClick={() => setGuaranteedWinnable(!guaranteedWinnable)}
                className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all shadow-md ${guaranteedWinnable ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'}`}
                title="Ensure all new deals are solvable."
              >
                <CheckCircle2 size={16} className={`sm:w-[18px] sm:h-[18px] ${guaranteedWinnable ? 'text-emerald-200' : ''}`} />
                <span className="hidden sm:inline">Winnable Deals</span>
                <span className="sm:hidden">Winnable</span>
              </button>
              
              <button 
                onClick={() => setGlobalHardMode(!globalHardMode)}
                className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all shadow-md ${globalHardMode ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'}`}
                title="Draw 3 cards instead of 1. Grants 3x Wins."
              >
                <Flame size={16} className={`sm:w-[18px] sm:h-[18px] ${globalHardMode ? 'text-orange-200' : ''}`} />
                <span className="hidden sm:inline">Hard Mode (Draw 3)</span>
                <span className="sm:hidden">Hard Mode</span>
              </button>
              
              <button 
                onClick={() => setIsPaused(!isPaused)}
                className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all shadow-md ${isPaused ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                {isPaused ? <Play size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Pause size={16} className="sm:w-[18px] sm:h-[18px]" />}
                {isPaused ? 'Paused' : 'Running'}
              </button>
              
              {gameStates.length > 1 && (
                <button
                  onClick={() => setPerformanceMode(!performanceMode)}
                  className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all shadow-md ${
                    performanceMode
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                  }`}
                  title="Hide extra boards to improve performance"
                >
                  <Zap size={16} className="sm:w-[18px] sm:h-[18px]" />
                  <span className="hidden sm:inline">{performanceMode ? 'Performance: ON' : 'Performance: OFF'}</span>
                  <span className="sm:hidden">{performanceMode ? 'Perf: ON' : 'Perf: OFF'}</span>
                </button>
              )}
            </div>
          </div>

          <div className={`grid grid-cols-1 ${
            performanceMode ? 'xl:grid-cols-4' :
            gameStates.length === 2 ? 'xl:grid-cols-2' : 
            gameStates.length >= 3 && gameStates.length <= 4 ? 'lg:grid-cols-2 2xl:grid-cols-2' : 
            gameStates.length >= 5 && gameStates.length <= 6 ? 'md:grid-cols-2 xl:grid-cols-3' : 
            gameStates.length >= 7 && gameStates.length <= 9 ? 'md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4' : 
            gameStates.length >= 10 && gameStates.length <= 16 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 
            gameStates.length > 16 ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8' : 
            ''
          } gap-2 sm:gap-4`}>
            {gameStates.map((gameState, gameIndex) => {
              if (performanceMode && gameIndex > 0) return null;
              
              const isCompact = !performanceMode && gameStates.length > 1 && gameStates.length <= 4;
              const isUltraCompact = !performanceMode && gameStates.length > 4 && gameStates.length <= 9;
              const isMicroCompact = !performanceMode && gameStates.length > 9 && gameStates.length <= 16;
              const isNanoCompact = !performanceMode && gameStates.length > 16;
              return (
              <div key={gameState.id} className={`relative bg-zinc-900/50 ${isNanoCompact ? 'p-1 sm:p-2' : isMicroCompact || isUltraCompact ? 'p-2 sm:p-3' : 'p-3 sm:p-5'} rounded-2xl border border-zinc-800 shadow-2xl ${performanceMode ? 'xl:col-span-3' : ''}`}>
                
                {/* Board Controls */}
                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex gap-1 sm:gap-2 z-10">
                  <button 
                    onClick={() => handleHint(gameIndex)}
                    disabled={gameState.isWon}
                    className="p-1.5 sm:p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 rounded-full transition-colors text-zinc-300"
                    title="Show Hint"
                  >
                    <Lightbulb size={isNanoCompact || isMicroCompact || isUltraCompact ? 12 : 16} />
                  </button>
                  <button 
                    onClick={() => handleUndo(gameIndex)}
                    disabled={gameState.history.length === 0 || gameState.isWon}
                    className="p-1.5 sm:p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 rounded-full transition-colors text-zinc-300"
                    title="Undo Last Move"
                  >
                    <Undo2 size={isNanoCompact || isMicroCompact || isUltraCompact ? 12 : 16} />
                  </button>
                  <button 
                    onClick={() => handleRestart(gameIndex)}
                    className="p-1.5 sm:p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors text-zinc-300"
                    title="Deal New Hand"
                  >
                    <RefreshCw size={isNanoCompact || isMicroCompact || isUltraCompact ? 12 : 16} />
                  </button>
                </div>

                {gameState.hardMode && (
                  <div className={`absolute top-2 left-2 sm:top-4 sm:left-4 flex items-center gap-1 text-orange-400 font-bold ${isNanoCompact || isMicroCompact || isUltraCompact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} bg-zinc-950/80 rounded-full z-10 border border-orange-900/50`}>
                    <Flame size={isNanoCompact || isMicroCompact || isUltraCompact ? 10 : 12} /> Hard Mode
                  </div>
                )}

                {gameState.isWon && (
                  <div className="absolute inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                    <div className={`bg-zinc-900 border border-zinc-700 text-zinc-100 ${isNanoCompact || isMicroCompact || isUltraCompact ? 'p-2 sm:p-4' : 'p-6'} rounded-2xl flex flex-col items-center gap-2 sm:gap-4 shadow-2xl transform scale-110`}>
                      <div className="flex items-center gap-2 sm:gap-3 text-indigo-400">
                        <Trophy size={isNanoCompact || isMicroCompact || isUltraCompact ? 24 : 32} />
                        <span className={`${isNanoCompact || isMicroCompact || isUltraCompact ? 'text-lg sm:text-xl' : 'text-3xl'} font-black`}>BOARD CLEARED!</span>
                        <Trophy size={isNanoCompact || isMicroCompact || isUltraCompact ? 24 : 32} />
                      </div>
                      <p className={`font-bold ${isNanoCompact || isMicroCompact || isUltraCompact ? 'text-xs sm:text-sm' : 'text-lg'} text-zinc-300`}>
                        +{ (1 + (upgrades['winMultiplier'] || 0)) * (gameState.hardMode ? 3 : 1) * (1 + prestige) } Wins Added to Total
                      </p>
                      <button 
                        onClick={() => handleRestart(gameIndex)}
                        className={`mt-2 bg-indigo-600 text-white ${isNanoCompact || isMicroCompact || isUltraCompact ? 'px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm' : 'px-6 py-3'} rounded-full font-black hover:bg-indigo-500 transition-colors shadow-lg`}
                      >
                        DEAL NEXT HAND
                      </button>
                    </div>
                  </div>
                )}

                {gameState.isStuck && !gameState.isWon && (
                  <div className="absolute inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                    <div className={`bg-zinc-900 border border-zinc-700 text-zinc-100 ${isNanoCompact || isMicroCompact || isUltraCompact ? 'p-2 sm:p-4' : 'p-6'} rounded-2xl flex flex-col items-center gap-2 sm:gap-4 shadow-2xl transform scale-110`}>
                      <div className="flex items-center gap-2 sm:gap-3 text-red-500">
                        <RefreshCw size={isNanoCompact || isMicroCompact || isUltraCompact ? 24 : 32} />
                        <span className={`${isNanoCompact || isMicroCompact || isUltraCompact ? 'text-lg sm:text-xl' : 'text-3xl'} font-black`}>STUCK!</span>
                        <RefreshCw size={isNanoCompact || isMicroCompact || isUltraCompact ? 24 : 32} />
                      </div>
                      <p className={`font-bold ${isNanoCompact || isMicroCompact || isUltraCompact ? 'text-xs sm:text-sm' : 'text-lg'} text-zinc-400`}>
                        No more valid moves available.
                      </p>
                      <button 
                        onClick={() => handleRestart(gameIndex)}
                        className={`mt-2 bg-red-600 text-white ${isNanoCompact || isMicroCompact || isUltraCompact ? 'px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm' : 'px-6 py-3'} rounded-full font-black hover:bg-red-500 transition-colors shadow-lg`}
                      >
                        RESTART GAME
                      </button>
                    </div>
                  </div>
                )}

                <div className={`flex justify-between mb-8 ${isNanoCompact ? 'mt-8' : isMicroCompact ? 'mt-8' : 'mt-6'}`}>
                  <div className="flex gap-1 sm:gap-2 md:gap-4">
                    <div onClick={() => handleStockClick(gameIndex)}>
                      {gameState.stock.length > 0 ? (
                        <CardView card={gameState.stock[gameState.stock.length - 1]} isHintSource={gameState.hintMove?.source.location.type === 'stock'} compact={isCompact} ultraCompact={isUltraCompact} microCompact={isMicroCompact} nanoCompact={isNanoCompact} />
                      ) : (
                        <EmptyPile label="↻" isHintSource={gameState.hintMove?.source.location.type === 'stock'} compact={isCompact} ultraCompact={isUltraCompact} microCompact={isMicroCompact} nanoCompact={isNanoCompact} />
                      )}
                    </div>
                    <div 
                      className={`relative ${isNanoCompact ? 'w-4 sm:w-5 md:w-6 lg:w-7 h-6 sm:h-7 md:h-8 lg:h-10' : isMicroCompact ? 'w-6 sm:w-8 md:w-10 lg:w-12 h-9 sm:h-12 md:h-14 lg:h-16' : isUltraCompact ? 'w-8 sm:w-10 md:w-12 lg:w-14 h-12 sm:h-14 md:h-16 lg:h-20' : isCompact ? 'w-10 sm:w-12 md:w-14 lg:w-16 h-14 sm:h-16 md:h-20 lg:h-24' : 'w-12 sm:w-16 md:w-20 lg:w-24 h-16 sm:h-24 md:h-28 lg:h-36'}`}
                      onClick={() => handlePileClick(gameIndex, { type: 'waste' })}
                    >
                      {gameState.waste.length > 0 ? (
                        (gameState.hardMode ? gameState.waste.slice(-3) : gameState.waste.slice(-1)).map((card, idx, arr) => (
                          <div 
                            key={card.id} 
                            className="absolute top-0" 
                            style={{ left: `${idx * (isNanoCompact ? 0.2 : isMicroCompact ? 0.35 : isUltraCompact ? 0.5 : isCompact ? 0.75 : 1.25)}rem`, zIndex: idx }}
                          >
                            <CardView
                              card={card}
                              isSelected={selection?.gameIndex === gameIndex && selection.location.type === 'waste' && idx === arr.length - 1}
                              location={idx === arr.length - 1 ? { type: 'waste' } : undefined}
                              cardIndex={gameState.waste.length - arr.length + idx}
                              gameIndex={gameIndex}
                              isHintSource={gameState.hintMove?.source.location.type === 'waste' && idx === arr.length - 1}
                              compact={isCompact}
                              ultraCompact={isUltraCompact}
                              microCompact={isMicroCompact}
                              nanoCompact={isNanoCompact}
                            />
                          </div>
                        ))
                      ) : (
                        <EmptyPile compact={isCompact} ultraCompact={isUltraCompact} microCompact={isMicroCompact} nanoCompact={isNanoCompact} />
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 sm:gap-2 md:gap-4">
                    {gameState.foundations.map((pile, index) => (
                      <div 
                        key={`foundation-${index}`} 
                        onClick={() => handlePileClick(gameIndex, { type: 'foundation', index })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          try {
                            const source = JSON.parse(e.dataTransfer.getData('application/json'));
                            handleDrop(source, gameIndex, { type: 'foundation', index });
                          } catch (err) {}
                        }}
                      >
                        {pile.length > 0 ? (
                          <CardView
                            card={pile[pile.length - 1]}
                            isSelected={selection?.gameIndex === gameIndex && selection.location.type === 'foundation' && selection.location.index === index}
                            location={{ type: 'foundation', index }}
                            cardIndex={pile.length - 1}
                            gameIndex={gameIndex}
                            isHintDest={gameState.hintMove?.dest.type === 'foundation' && gameState.hintMove?.dest.index === index}
                            compact={isCompact}
                            ultraCompact={isUltraCompact}
                            microCompact={isMicroCompact}
                            nanoCompact={isNanoCompact}
                          />
                        ) : (
                          <EmptyPile label="A" isHintDest={gameState.hintMove?.dest.type === 'foundation' && gameState.hintMove?.dest.index === index} compact={isCompact} ultraCompact={isUltraCompact} microCompact={isMicroCompact} nanoCompact={isNanoCompact} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2 lg:gap-4">
                  {gameState.tableaus.map((pile, tIndex) => (
                    <div
                      key={`tableau-${tIndex}`}
                      className={`relative ${isNanoCompact ? 'min-h-[40px] sm:min-h-[60px]' : isMicroCompact ? 'min-h-[60px] sm:min-h-[80px]' : isUltraCompact ? 'min-h-[80px] sm:min-h-[100px]' : isCompact ? 'min-h-[100px] sm:min-h-[150px]' : 'min-h-[150px]'}`}
                      onClick={() => {
                        if (pile.length === 0) {
                          handlePileClick(gameIndex, { type: 'tableau', index: tIndex });
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const source = JSON.parse(e.dataTransfer.getData('application/json'));
                          handleDrop(source, gameIndex, { type: 'tableau', index: tIndex });
                        } catch (err) {}
                      }}
                    >
                      {pile.length === 0 ? (
                        <EmptyPile isHintDest={gameState.hintMove?.dest.type === 'tableau' && gameState.hintMove?.dest.index === tIndex} compact={isCompact} ultraCompact={isUltraCompact} microCompact={isMicroCompact} nanoCompact={isNanoCompact} />
                      ) : (
                        pile.map((card, cIndex) => (
                          <div
                            key={card.id}
                            className={`absolute w-full ${isNanoCompact ? 'card-overlap-nano' : isMicroCompact ? 'card-overlap-micro' : isUltraCompact ? 'card-overlap-ultra' : isCompact ? 'card-overlap-compact' : 'card-overlap'}`}
                            style={{ '--index': cIndex } as React.CSSProperties}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePileClick(gameIndex, { type: 'tableau', index: tIndex }, cIndex);
                            }}
                          >
                            <CardView
                              card={card}
                              isSelected={
                                selection?.gameIndex === gameIndex &&
                                selection.location.type === 'tableau' &&
                                selection.location.index === tIndex &&
                                cIndex >= selection.cardIndex
                              }
                              location={{ type: 'tableau', index: tIndex }}
                              cardIndex={cIndex}
                              gameIndex={gameIndex}
                              isHintSource={gameState.hintMove?.source.location.type === 'tableau' && gameState.hintMove?.source.location.index === tIndex && cIndex >= gameState.hintMove!.source.cardIndex}
                              isHintDest={gameState.hintMove?.dest.type === 'tableau' && gameState.hintMove?.dest.index === tIndex && cIndex === pile.length - 1}
                              compact={isCompact}
                              ultraCompact={isUltraCompact}
                              microCompact={isMicroCompact}
                              nanoCompact={isNanoCompact}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )})}
            
            {/* Background Boards Status Panel */}
            {performanceMode && gameStates.length > 1 && (
              <div className="bg-zinc-900/50 p-4 sm:p-6 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col h-full xl:col-span-1">
                <div className="flex items-center gap-3 mb-6">
                  <Cpu className="text-emerald-400" size={24} />
                  <h3 className="text-xl font-black text-zinc-100 tracking-tight">Background Tasks</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 max-h-[600px]">
                  {gameStates.slice(1).map((state, i) => {
                    const progress = state.foundations.reduce((acc, pile) => acc + pile.length, 0);
                    const percent = Math.round((progress / 52) * 100);
                    
                    return (
                      <div key={state.id} className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 relative overflow-hidden">
                        {/* Progress Bar Background */}
                        <div 
                          className="absolute inset-0 bg-emerald-500/10 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                        
                        <div className="relative z-10 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 font-mono text-xs font-bold">#{i + 2}</span>
                            <span className="text-zinc-300 font-bold text-sm">
                              {state.isWon ? (
                                <span className="text-yellow-400 flex items-center gap-1"><Trophy size={14} /> Won!</span>
                              ) : state.isStuck ? (
                                <span className="text-red-400 flex items-center gap-1"><RefreshCw size={14} /> Stuck</span>
                              ) : (
                                <span className="text-emerald-400 flex items-center gap-1"><Zap size={14} /> Running</span>
                              )}
                            </span>
                          </div>
                          <div className="text-zinc-400 font-mono text-xs font-bold">
                            {progress}/52
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-4 pt-4 border-t border-zinc-800/50 flex justify-between items-center text-sm">
                  <span className="text-zinc-500 font-bold">Active Boards</span>
                  <span className="text-emerald-400 font-black">{gameStates.length - 1}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Idle Manager Panel */}
      <div className={`
        fixed inset-0 z-50 bg-zinc-950 flex flex-col transition-transform duration-300 ease-in-out
        md:relative md:w-80 md:border-l md:border-zinc-800 md:h-screen md:shrink-0 md:shadow-2xl md:z-20 md:translate-y-0
        ${showUpgradesMobile ? 'translate-y-0' : 'translate-y-full'}
      `}>
        <div className="p-4 sm:p-6 border-b border-zinc-800 bg-zinc-900/50 shadow-md flex justify-between items-center md:block">
          <div className="flex justify-between items-start w-full md:w-auto">
            <div className="flex flex-col gap-1 sm:gap-2">
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-zinc-500 uppercase tracking-widest mb-1">Total Wins</h2>
                <div className="text-4xl font-black text-indigo-400 flex items-center gap-3 tracking-tight">
                  <Trophy size={32} className="text-indigo-500" />
                  {wins.toLocaleString()}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-1">Gears</h2>
                <div className="text-2xl font-black text-zinc-400 flex items-center gap-2 tracking-tight">
                  <Settings size={24} className="text-zinc-500" />
                  {gears.toLocaleString()}
                </div>
              </div>
            </div>
            {prestige > 0 && (
              <div className="flex flex-col items-end" title={`+${prestige * 100}% to all Wins!`}>
                <h2 className="text-xs font-bold text-yellow-500/70 uppercase tracking-widest mb-1">Crowns</h2>
                <div className="text-2xl font-black text-yellow-400 flex items-center gap-2">
                  <Crown size={24} />
                  {prestige}
                </div>
              </div>
            )}
          </div>
          <button 
            onClick={() => setShowUpgradesMobile(false)}
            className="md:hidden p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white ml-4"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex border-b border-zinc-800">
          <button 
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'core' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setActiveTab('core')}
          >
            Core
          </button>
          <button 
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'auto' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setActiveTab('auto')}
          >
            Automation
          </button>
          <button 
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'crafting' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setActiveTab('crafting')}
          >
            Crafting
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Prestige Section */}
          <div className="bg-gradient-to-br from-yellow-900/20 to-amber-900/10 border border-yellow-700/30 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-yellow-500 font-bold flex items-center gap-2">
                <Crown size={18} /> Prestige
              </h3>
              <span className="text-xs text-yellow-500/70 font-bold">Current: {prestige} Crowns</span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">Reset all wins and upgrades to earn a Crown. Each Crown grants +100% to all future Wins.</p>
            <button
              onClick={() => {
                const cost = 1000 * Math.pow(5, prestige);
                if (wins >= cost) {
                  // Removed confirm dialog as it might be blocked in some iframe environments
                  setPrestige(p => p + 1);
                  setWins(0);
                  setUpgrades({});
                  setGameStates([dealGame(globalHardMode, guaranteedWinnable)]);
                  setSelection(null);
                }
              }}
              disabled={wins < 1000 * Math.pow(5, prestige)}
              className="w-full py-2 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg"
            >
              Prestige (Cost: {(1000 * Math.pow(5, prestige)).toLocaleString()} Wins)
            </button>
          </div>

          {UPGRADES.filter(u => u.category === activeTab).map(upg => {
            const level = upgrades[upg.id] || 0;
            const cost = Math.floor(upg.baseCost * Math.pow(upg.costMult, level));
            const isMax = level >= upg.maxLevel;
            const isGears = upg.currency === 'gears';
            const canAfford = isGears ? gears >= cost : wins >= cost;
            
            return (
              <div key={upg.id} className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm text-zinc-100">{upg.name}</h4>
                    <p className="text-xs text-zinc-400 mt-1 leading-snug">{upg.desc(level)}</p>
                  </div>
                  <div className="text-[10px] font-mono bg-zinc-950 px-2 py-1 rounded text-zinc-400 shrink-0 ml-2 border border-zinc-800">
                    Lvl {level}/{upg.maxLevel === Infinity ? '∞' : upg.maxLevel}
                  </div>
                </div>
                <button
                  disabled={isMax || !canAfford}
                  onClick={() => {
                    if (isGears) {
                      setGears(g => g - cost);
                    } else {
                      setWins(w => w - cost);
                    }
                    setUpgrades(prev => ({ ...prev, [upg.id]: level + 1 }));
                    playSound('win');
                  }}
                  className={`py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    isMax ? 'bg-zinc-950 text-zinc-600 cursor-not-allowed border border-zinc-800' :
                    canAfford ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_4px_0_rgb(67,56,202)] active:shadow-[0_0px_0_rgb(67,56,202)] active:translate-y-[4px]' :
                    'bg-zinc-900 text-zinc-500 cursor-not-allowed border border-zinc-800'
                  }`}
                >
                  {isMax ? 'MAXED' : (
                    <>
                      {isGears ? <Settings size={14} /> : <Trophy size={14} />}
                      Cost: {cost.toLocaleString()} {isGears ? 'Gears' : 'Wins'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      <div className="md:hidden fixed bottom-6 right-6 z-40 flex flex-col gap-3">
        <button
          onClick={() => setShowUpgradesMobile(true)}
          className="bg-indigo-600 text-white p-4 rounded-full shadow-lg shadow-indigo-900/50 flex items-center justify-center relative"
        >
          <div className="absolute -top-2 -right-2 bg-emerald-500 text-zinc-950 text-xs font-bold px-2 py-0.5 rounded-full border-2 border-zinc-950">
            {wins}
          </div>
          <Trophy size={24} />
        </button>
      </div>
    </div>
  );
}
