import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Trophy, Users, Calendar, RefreshCw, ChevronRight, ChevronDown, UserPlus, Save, Plus, Minus, Edit2, Lock, Unlock, Check, Trash2, Menu, X, Download, Upload, Share2, Clipboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LZString from 'lz-string';
import { Player, Round, PlayerRole, LeaderboardEntry, Match } from './types';
import { INITIAL_ROUNDS, INITIAL_PLAYERS } from './constants';

const STORAGE_KEY_ROUNDS = 'padel_tournament_rounds';
const STORAGE_KEY_STARTERS = 'padel_tournament_starters';
const STORAGE_KEY_UNLOCKED = 'padel_tournament_unlocked';

export default function App() {
  const [rounds, setRounds] = useState<Round[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ROUNDS);
    return saved ? JSON.parse(saved) : INITIAL_ROUNDS;
  });
  const [starters, setStarters] = useState<Player[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_STARTERS);
    return saved ? JSON.parse(saved) : INITIAL_PLAYERS;
  });
  const [activeTab, setActiveTab] = useState<'live' | 'leaderboard' | 'players'>('live');
  const [expandedRound, setExpandedRound] = useState<number | null>(1);
  const [swappingPlayer, setSwappingPlayer] = useState<{ roundIdx: number, matchIdx: number, originalId: number } | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [unlockedMatches, setUnlockedMatches] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_UNLOCKED);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [incomingTournament, setIncomingTournament] = useState<{ rounds: Round[], starters: Player[], unlockedMatches?: string[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get stats for comparison
  const getStats = (tournamentRounds: Round[]) => {
    const completed = tournamentRounds.filter(r => r.completed);
    const lastRound = completed.length > 0 ? Math.max(...completed.map(r => r.number)) : 0;
    const matchesPlayed = completed.reduce((acc, r) => acc + r.matches.length, 0);
    return { lastRound, matchesPlayed };
  };

  // Minification logic for sharing
  const minifyTournament = (data: { rounds: Round[], starters: Player[], unlockedMatches: string[] }) => {
    return {
      r: data.rounds.map(round => ({
        n: round.number,
        c: round.completed ? 1 : 0,
        m: round.matches.map(match => ({
          i: match.id,
          ct: match.court,
          tA: match.teamA,
          tB: match.teamB,
          sA: match.scoreA,
          sB: match.scoreB,
          ap: Object.entries(match.actualPlayers).reduce((acc, [id, name]) => {
            const starter = data.starters.find(p => p.id === Number(id));
            if (starter && starter.name !== name) {
              acc[id] = name;
            }
            return acc;
          }, {} as any)
        }))
      })),
      s: data.starters.map(p => ({
        i: p.id,
        n: p.name,
        r: p.role === PlayerRole.TITOLARE ? 1 : 0
      })),
      u: data.unlockedMatches
    };
  };

  const unminifyTournament = (min: any) => {
    // Backward compatibility: check if it's already unminified
    if (min.rounds && min.starters) return min;

    const starters: Player[] = min.s.map((p: any) => ({
      id: p.i,
      name: p.n,
      role: p.r === 1 ? PlayerRole.TITOLARE : PlayerRole.SOSTITUTO
    }));

    const rounds: Round[] = min.r.map((r: any) => ({
      number: r.n,
      completed: r.c === 1,
      matches: r.m.map((m: any) => {
        const actualPlayers: { [id: number]: string } = {};
        // Fill with starter names first
        [...m.tA, ...m.tB].forEach(id => {
          const starter = starters.find(p => p.id === id);
          actualPlayers[id] = starter?.name || '';
        });
        // Override with substitutes
        Object.entries(m.ap || {}).forEach(([id, name]) => {
          actualPlayers[Number(id)] = name as string;
        });

        return {
          id: m.i,
          court: m.ct,
          teamA: m.tA,
          teamB: m.tB,
          scoreA: m.sA,
          scoreB: m.sB,
          actualPlayers
        };
      })
    }));

    return {
      rounds,
      starters,
      unlockedMatches: min.u || []
    };
  };

  // URL Import
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tournamentData = params.get('torneo');
    if (tournamentData) {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(tournamentData);
        if (decompressed) {
          const rawData = JSON.parse(decompressed);
          const data = unminifyTournament(rawData);
          
          if (data.rounds && data.starters) {
            // Check if data is different from current state
            const currentStats = getStats(rounds);
            const incomingStats = getStats(data.rounds);
            
            // Even if stats are same, names or scores might differ. 
            // For simplicity and safety, we show the modal if the data string is different
            const currentDataStr = JSON.stringify({ rounds, starters });
            const incomingDataStr = JSON.stringify({ rounds: data.rounds, starters: data.starters });

            if (currentDataStr !== incomingDataStr) {
              setIncomingTournament(data);
              setShowImportModal(true);
            } else {
              // Data is identical, just clean URL
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } else {
            throw new Error('Formato dati non valido');
          }
        } else {
          throw new Error('Decompressione fallita');
        }
      } catch (e) {
        console.error('Errore critico nel caricamento dei dati dall\'URL:', e);
        alert('Errore nel caricamento dei dati condivisi. Riprova a copiare il link.');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleConfirmImport = () => {
    if (incomingTournament) {
      const { rounds: newRounds, starters: newStarters, unlockedMatches: newUnlocked } = incomingTournament;
      
      // Update state
      setRounds(newRounds);
      setStarters(newStarters);
      if (newUnlocked) {
        setUnlockedMatches(new Set(newUnlocked));
      }

      // Force immediate localStorage update
      localStorage.setItem(STORAGE_KEY_ROUNDS, JSON.stringify(newRounds));
      localStorage.setItem(STORAGE_KEY_STARTERS, JSON.stringify(newStarters));
      if (newUnlocked) {
        localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(newUnlocked));
      }
    }
    setShowImportModal(false);
    setIncomingTournament(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleCancelImport = () => {
    setShowImportModal(false);
    setIncomingTournament(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ROUNDS, JSON.stringify(rounds));
  }, [rounds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STARTERS, JSON.stringify(starters));
  }, [starters]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(Array.from(unlockedMatches)));
  }, [unlockedMatches]);

  const resetTournament = () => {
    if (confirm('Sei sicuro di voler resettare tutto il torneo? Tutti i punteggi e i nomi verranno persi.')) {
      localStorage.removeItem(STORAGE_KEY_ROUNDS);
      localStorage.removeItem(STORAGE_KEY_STARTERS);
      localStorage.removeItem(STORAGE_KEY_UNLOCKED);
      setRounds(INITIAL_ROUNDS);
      setStarters(INITIAL_PLAYERS);
      setUnlockedMatches(new Set());
      setExpandedRound(1);
      setActiveTab('live');
    }
  };

  // Calculate Leaderboard
  const leaderboard = useMemo(() => {
    const scores: { [name: string]: { points: number, matches: number, role: PlayerRole, hasPlayed: boolean } } = {};

    // Initialize starters
    starters.forEach(p => {
      scores[p.name] = { points: 0, matches: 0, role: PlayerRole.TITOLARE, hasPlayed: true };
    });

    // We need to process rounds in order to know when a substitute "enters" the active pool
    const sortedRounds = [...rounds].sort((a, b) => a.number - b.number);
    
    sortedRounds.filter(r => r.completed).forEach(round => {
      const playersInThisRound = new Set<string>();
      
      // 1. Process matches to see who played and what they scored
      round.matches.forEach(match => {
        const { scoreA, scoreB, actualPlayers, teamA, teamB } = match;
        
        const processMatchPlayer = (originalId: number, points: number) => {
          const actualName = actualPlayers[originalId];
          const originalPlayer = starters.find(p => p.id === originalId);
          const originalName = originalPlayer?.name || '';

          playersInThisRound.add(actualName);

          if (!scores[actualName]) {
            // New substitute found
            scores[actualName] = { points: 0, matches: 0, role: PlayerRole.SOSTITUTO, hasPlayed: true };
          }
          
          scores[actualName].points += points;
          scores[actualName].matches += 1;
          scores[actualName].hasPlayed = true;
        };

        teamA.forEach(id => processMatchPlayer(id, scoreA));
        teamB.forEach(id => processMatchPlayer(id, scoreB));
      });

      // 2. Award 2 points to "active" players who did NOT play in this round
      // Active players are all starters + any substitute who has already played at least once (including this round)
      Object.keys(scores).forEach(playerName => {
        if (!playersInThisRound.has(playerName)) {
          // Player is active but didn't play this round
          scores[playerName].points += 2;
        }
      });
    });

    return Object.entries(scores)
      .map(([name, data]) => ({
        name,
        role: data.role,
        totalPoints: data.points,
        matchesPlayed: data.matches
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
  }, [rounds, starters]);

  const updateScore = (roundIdx: number, matchIdx: number, team: 'A' | 'B', delta: number) => {
    const newRounds = [...rounds];
    const match = newRounds[roundIdx].matches[matchIdx];
    if (team === 'A') match.scoreA = Math.max(0, match.scoreA + delta);
    else match.scoreB = Math.max(0, match.scoreB + delta);
    setRounds(newRounds);
  };

  const toggleMatchLock = (matchId: string) => {
    const newUnlocked = new Set(unlockedMatches);
    if (newUnlocked.has(matchId)) {
      newUnlocked.delete(matchId);
    } else {
      newUnlocked.add(matchId);
    }
    setUnlockedMatches(newUnlocked);
  };

  const toggleRoundCompletion = (roundIdx: number) => {
    const newRounds = [...rounds];
    newRounds[roundIdx].completed = !newRounds[roundIdx].completed;
    setRounds(newRounds);
  };

  const handleStarterNameChange = (id: number, newName: string) => {
    const oldName = starters.find(p => p.id === id)?.name || '';
    const updatedStarters = starters.map(p => p.id === id ? { ...p, name: newName } : p);
    setStarters(updatedStarters);

    const updatedRounds = rounds.map(round => ({
      ...round,
      matches: round.matches.map(match => ({
        ...match,
        actualPlayers: {
          ...match.actualPlayers,
          [id]: match.actualPlayers[id] === oldName ? newName : match.actualPlayers[id]
        }
      }))
    }));
    setRounds(updatedRounds);
  };

  const handleSwapPlayer = () => {
    if (!swappingPlayer || !newPlayerName.trim()) return;
    const { roundIdx, matchIdx, originalId } = swappingPlayer;
    const newRounds = [...rounds];
    newRounds[roundIdx].matches[matchIdx].actualPlayers[originalId] = newPlayerName.trim();
    setRounds(newRounds);
    setSwappingPlayer(null);
    setNewPlayerName('');
  };

  const resetPlayer = (roundIdx: number, matchIdx: number, originalId: number) => {
    const originalName = starters.find(p => p.id === originalId)?.name || '';
    const newRounds = [...rounds];
    newRounds[roundIdx].matches[matchIdx].actualPlayers[originalId] = originalName;
    setRounds(newRounds);
  };

  const exportTournament = () => {
    const fileName = prompt('Inserisci il nome del file:', 'torneo_padel.json');
    if (!fileName) return;

    const data = {
      rounds,
      starters,
      unlockedMatches: Array.from(unlockedMatches)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const importTournament = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.rounds && data.starters) {
          if (confirm('Sei sicuro di voler caricare questo torneo? Sovrascriverà i dati attuali.')) {
            setRounds(data.rounds);
            setStarters(data.starters);
            if (data.unlockedMatches) {
              setUnlockedMatches(new Set(data.unlockedMatches));
            }
            setIsMenuOpen(false);
          }
        } else {
          alert('File non valido.');
        }
      } catch (err) {
        alert('Errore nel caricamento del file.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const generateShareLink = () => {
    const data = {
      rounds,
      starters,
      unlockedMatches: Array.from(unlockedMatches) as string[]
    };
    const minified = minifyTournament(data);
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(minified));
    const url = `${window.location.origin}${window.location.pathname}?torneo=${compressed}`;
    return url;
  };

  const copyLeaderboard = () => {
    const textToCopy = leaderboard.map(entry => `${entry.name}\t${entry.matchesPlayed}\t${entry.totalPoints}`).join('\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    }).catch(err => {
      console.error('Failed to copy leaderboard', err);
    });
  };

  const shareTournament = async () => {
    const url = generateShareLink();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Torneo Padel',
          text: 'Ecco lo stato attuale del torneo di Padel!',
          url: url
        });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Link copiato negli appunti!');
      }
    } catch (err) {
      console.error('Error sharing', err);
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans pb-20">
      <header className="bg-white border-b border-[#141414]/10 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full sm:w-auto gap-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 hover:bg-[#F5F5F0] rounded-xl transition-colors"
              >
                <Menu size={24} />
              </button>
              <div>
                <h1 className="text-xl font-serif italic font-bold tracking-tight leading-none">Padel Americano</h1>
                <p className="text-[10px] uppercase tracking-widest opacity-50 font-semibold">12 Players • 11 Rounds</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 sm:flex w-full sm:w-auto bg-[#E4E3E0] p-1 rounded-xl sm:rounded-full gap-1">
            <button 
              onClick={() => setActiveTab('live')}
              className={`px-2 sm:px-4 py-2 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-medium transition-all ${activeTab === 'live' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Live
            </button>
            <button 
              onClick={() => setActiveTab('leaderboard')}
              className={`px-2 sm:px-4 py-2 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-medium transition-all ${activeTab === 'leaderboard' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Classifica
            </button>
            <button 
              onClick={() => setActiveTab('players')}
              className={`px-2 sm:px-4 py-2 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-medium transition-all ${activeTab === 'players' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Giocatori
            </button>
          </div>
        </div>
      </header>

      {/* Hamburger Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-[#141414]/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-80 bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center">
                <h2 className="text-xl font-serif italic">Configurazione</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-[#F5F5F0] rounded-full">
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <button 
                  onClick={exportTournament}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Download size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <span className="block font-bold">Salva Torneo</span>
                    <span className="text-xs opacity-50">Esporta in formato JSON</span>
                  </div>
                </button>

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Upload size={24} className="text-green-600" />
                  </div>
                  <div>
                    <span className="block font-bold">Carica Torneo</span>
                    <span className="text-xs opacity-50">Importa da file JSON</span>
                  </div>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={importTournament} 
                  accept=".json" 
                  className="hidden" 
                />

                <button 
                  onClick={shareTournament}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Share2 size={24} className="text-purple-600" />
                  </div>
                  <div>
                    <span className="block font-bold">Condividi Link</span>
                    <span className="text-xs opacity-50">Copia link compresso</span>
                  </div>
                </button>

                <button 
                  onClick={copyLeaderboard}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    {isCopying ? <Check size={24} className="text-green-600" /> : <Clipboard size={24} className="text-orange-600" />}
                  </div>
                  <div>
                    <span className="block font-bold">{isCopying ? 'Copiato!' : 'Copia Classifica'}</span>
                    <span className="text-xs opacity-50">Per Excel / Google Sheets</span>
                  </div>
                </button>

                <div className="pt-6 mt-6 border-t border-[#141414]/10">
                  <button 
                    onClick={resetTournament}
                    className="w-full flex items-center gap-4 p-4 bg-red-50 hover:bg-red-100 rounded-2xl transition-colors text-left text-red-600"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Trash2 size={24} />
                    </div>
                    <div>
                      <span className="block font-bold">Reset Totale</span>
                      <span className="text-xs opacity-50 text-red-400">Cancella ogni dato</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-6 bg-[#F5F5F0] text-center">
                <p className="text-[10px] uppercase tracking-widest font-bold opacity-30">Padel Tournament Manager v2.0</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Import Comparison Modal */}
      <AnimatePresence>
        {showImportModal && incomingTournament && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Share2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-serif italic">Importa Torneo</h3>
                  <p className="text-xs opacity-50">Confronta i dati prima di sovrascrivere</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5">
                  <span className="text-[10px] uppercase font-bold opacity-40 block mb-3">Stato Locale</span>
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-xs opacity-60">Match:</span>
                      <span className="font-mono font-bold text-lg leading-none">{getStats(rounds).matchesPlayed}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs opacity-60">Ultimo Turno:</span>
                      <span className="font-mono font-bold text-lg leading-none">{getStats(rounds).lastRound}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <span className="text-[10px] uppercase font-bold text-blue-400 block mb-3">Stato in Arrivo</span>
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-blue-600/60">Match:</span>
                      <span className="font-mono font-bold text-lg leading-none text-blue-600">{getStats(incomingTournament.rounds).matchesPlayed}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-blue-600/60">Ultimo Turno:</span>
                      <span className="font-mono font-bold text-lg leading-none text-blue-600">{getStats(incomingTournament.rounds).lastRound}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={handleConfirmImport}
                  className="w-full bg-[#141414] text-white rounded-2xl py-4 font-bold hover:bg-black transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={20} />
                  Conferma e Sovrascrivi
                </button>
                <button 
                  onClick={handleCancelImport}
                  className="w-full bg-[#F5F5F0] text-[#141414] rounded-2xl py-4 font-bold hover:bg-[#E4E3E0] transition-colors"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {activeTab === 'live' && (
          <div className="space-y-4">
            {rounds.map((round, rIdx) => (
              <div key={round.number} className="bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-6 py-4 hover:bg-[#F5F5F0] transition-colors group">
                  <button 
                    onClick={() => setExpandedRound(expandedRound === round.number ? null : round.number)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${round.completed ? 'bg-green-600 text-white' : 'bg-[#141414] text-white'}`}>
                      {round.completed ? <Check size={16} /> : round.number}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-serif italic text-lg leading-tight">Turno {round.number}</span>
                      {round.completed && <span className="text-[10px] uppercase font-bold text-green-600">Giocato</span>}
                    </div>
                  </button>
                  
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px] uppercase font-bold opacity-40 hidden sm:inline">Giocato</span>
                      <input 
                        type="checkbox"
                        checked={round.completed}
                        onChange={() => toggleRoundCompletion(rIdx)}
                        className="w-5 h-5 rounded border-[#141414]/20 text-[#141414] focus:ring-[#141414]"
                      />
                    </label>
                    <button 
                      onClick={() => setExpandedRound(expandedRound === round.number ? null : round.number)}
                      className="p-1 opacity-50 group-hover:opacity-100"
                    >
                      {expandedRound === round.number ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedRound === round.number && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-[#141414]/5"
                    >
                      <div className="p-4 grid gap-4 md:grid-cols-3">
                        {round.matches.map((match, mIdx) => {
                          const isUnlocked = unlockedMatches.has(match.id);
                          return (
                            <div key={match.id} className="bg-[#F5F5F0] p-4 rounded-xl space-y-4 border border-[#141414]/5 relative">
                              <div className="flex justify-between items-center border-b border-[#141414]/10 pb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">Campo {match.court}</span>
                                <button 
                                  onClick={() => toggleMatchLock(match.id)}
                                  className={`p-1.5 rounded-full transition-colors ${isUnlocked ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}
                                  title={isUnlocked ? "Conferma e Blocca" : "Sblocca per Modificare"}
                                >
                                  {isUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                                </button>
                              </div>

                              {/* Team A */}
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  {match.teamA.map(id => (
                                    <div key={id} className="flex justify-between items-center group">
                                      <span className={`text-sm truncate pr-2 ${match.actualPlayers[id] !== starters.find(p => p.id === id)?.name ? 'text-orange-600 font-medium' : ''}`}>
                                        {match.actualPlayers[id]}
                                      </span>
                                      <div className="flex gap-1 flex-shrink-0">
                                        <button 
                                          onClick={() => setSwappingPlayer({ roundIdx: rIdx, matchIdx: mIdx, originalId: id })}
                                          className="p-1.5 bg-white/80 hover:bg-white rounded-md shadow-sm border border-[#141414]/10 text-[#141414]/70 hover:text-[#141414] transition-all"
                                          title="Sostituisci Giocatore"
                                        >
                                          <RefreshCw size={12} />
                                        </button>
                                        {match.actualPlayers[id] !== starters.find(p => p.id === id)?.name && (
                                          <button 
                                            onClick={() => resetPlayer(rIdx, mIdx, id)}
                                            className="p-1.5 bg-red-50 hover:bg-red-100 rounded-md shadow-sm border border-red-100 text-red-500 transition-all"
                                            title="Ripristina Titolare"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                
                                <div className="flex items-center justify-center gap-3 bg-white rounded-lg border border-[#141414]/5 p-1 shadow-sm">
                                  <button 
                                    disabled={!isUnlocked}
                                    onClick={() => updateScore(rIdx, mIdx, 'A', -1)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${isUnlocked ? 'hover:bg-[#F5F5F0]' : 'opacity-20 cursor-not-allowed'}`}
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className={`font-mono text-xl font-bold w-8 text-center ${!isUnlocked ? 'opacity-60' : ''}`}>{match.scoreA}</span>
                                  <button 
                                    disabled={!isUnlocked}
                                    onClick={() => updateScore(rIdx, mIdx, 'A', 1)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${isUnlocked ? 'hover:bg-[#F5F5F0]' : 'opacity-20 cursor-not-allowed'}`}
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>

                              <div className="text-center text-[10px] font-bold opacity-20 italic">VS</div>

                              {/* Team B */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-center gap-3 bg-white rounded-lg border border-[#141414]/5 p-1 shadow-sm">
                                  <button 
                                    disabled={!isUnlocked}
                                    onClick={() => updateScore(rIdx, mIdx, 'B', -1)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${isUnlocked ? 'hover:bg-[#F5F5F0]' : 'opacity-20 cursor-not-allowed'}`}
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className={`font-mono text-xl font-bold w-8 text-center ${!isUnlocked ? 'opacity-60' : ''}`}>{match.scoreB}</span>
                                  <button 
                                    disabled={!isUnlocked}
                                    onClick={() => updateScore(rIdx, mIdx, 'B', 1)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${isUnlocked ? 'hover:bg-[#F5F5F0]' : 'opacity-20 cursor-not-allowed'}`}
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>

                                <div className="space-y-1">
                                  {match.teamB.map(id => (
                                    <div key={id} className="flex justify-between items-center group">
                                      <span className={`text-sm truncate pr-2 ${match.actualPlayers[id] !== starters.find(p => p.id === id)?.name ? 'text-orange-600 font-medium' : ''}`}>
                                        {match.actualPlayers[id]}
                                      </span>
                                      <div className="flex gap-1 flex-shrink-0">
                                        <button 
                                          onClick={() => setSwappingPlayer({ roundIdx: rIdx, matchIdx: mIdx, originalId: id })}
                                          className="p-1.5 bg-white/80 hover:bg-white rounded-md shadow-sm border border-[#141414]/10 text-[#141414]/70 hover:text-[#141414] transition-all"
                                          title="Sostituisci Giocatore"
                                        >
                                          <RefreshCw size={12} />
                                        </button>
                                        {match.actualPlayers[id] !== starters.find(p => p.id === id)?.name && (
                                          <button 
                                            onClick={() => resetPlayer(rIdx, mIdx, id)}
                                            className="p-1.5 bg-red-50 hover:bg-red-100 rounded-md shadow-sm border border-red-100 text-red-500 transition-all"
                                            title="Ripristina Titolare"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-[#141414] text-white">
              <h2 className="text-xl font-serif italic">Leaderboard</h2>
              <Trophy size={20} className="text-yellow-400" />
            </div>
            <div className="w-full">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="bg-[#F5F5F0] border-b border-[#141414]/10">
                    <th className="w-12 px-3 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50 text-center">Pos</th>
                    <th className="px-3 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50">Giocatore</th>
                    <th className="w-16 px-3 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50 text-center">Part</th>
                    <th className="w-16 px-3 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50 text-right">Punti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/5">
                  {leaderboard.map((entry, idx) => (
                    <tr key={entry.name} className="hover:bg-[#F5F5F0] transition-colors">
                      <td className="px-3 py-4 font-mono text-xs font-bold opacity-40 text-center">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-4">
                        <span className="font-medium text-sm truncate">{entry.name}</span>
                      </td>
                      <td className="px-3 py-4 text-center font-mono text-xs">
                        {entry.matchesPlayed}
                      </td>
                      <td className="px-3 py-4 text-right">
                        <span className="font-serif italic text-base font-bold">{entry.totalPoints}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-[#141414] text-white">
                <h2 className="text-xl font-serif italic">Gestione Giocatori</h2>
                <Users size={20} />
              </div>
              <div className="p-6 grid gap-4 md:grid-cols-2">
                {starters.map((player) => (
                  <div key={player.id} className="flex items-center gap-4 bg-[#F5F5F0] p-3 rounded-xl border border-[#141414]/5">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-mono font-bold text-sm shadow-sm">
                      {player.id}
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold opacity-40 block mb-1">ID {player.id}</label>
                      <input 
                        type="text"
                        value={player.name}
                        onChange={(e) => handleStarterNameChange(player.id, e.target.value)}
                        className="w-full bg-transparent border-b border-[#141414]/10 focus:border-[#141414] focus:outline-none py-1 font-medium transition-colors"
                        placeholder={`Nome Giocatore ${player.id}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-6 bg-[#F5F5F0] border-t border-[#141414]/10">
                <p className="text-xs opacity-50 italic">
                  * Modificando i nomi qui, verranno aggiornati automaticamente in tutti i turni dove il giocatore è presente come titolare.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-red-100 overflow-hidden shadow-sm">
              <div className="p-6 flex justify-between items-center">
                <div>
                  <h3 className="font-serif italic text-lg">Zona Pericolosa</h3>
                  <p className="text-xs opacity-50">Resetta tutti i dati del torneo</p>
                </div>
                <button 
                  onClick={resetTournament}
                  className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={18} />
                  Reset Torneo
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {swappingPlayer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141414]/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-[#141414]/10"
            >
              <h3 className="text-lg font-serif italic mb-2">Sostituzione Giocatore</h3>
              <p className="text-xs opacity-50 mb-4">Stai sostituendo {starters.find(p => p.id === swappingPlayer.originalId)?.name}</p>
              
              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold opacity-40">Nome Sostituto</label>
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Es. Marco Rossi"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSwapPlayer()}
                    className="w-full bg-[#F5F5F0] border-none rounded-xl p-4 text-lg focus:ring-2 focus:ring-[#141414]"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => { setSwappingPlayer(null); setNewPlayerName(''); }}
                  className="flex-1 bg-[#E4E3E0] rounded-xl py-3 font-bold hover:bg-[#D4D3D0] transition-colors"
                >
                  Annulla
                </button>
                <button 
                  onClick={handleSwapPlayer}
                  className="flex-1 bg-[#141414] text-white rounded-xl py-3 font-bold hover:bg-black transition-colors"
                >
                  Conferma
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-4xl mx-auto px-4 py-8 border-t border-[#141414]/10 text-center">
        <p className="text-[10px] uppercase tracking-widest font-bold opacity-30">
          Regole: Sostituto prende i punti del match • Titolare assente riceve 2 punti bonus
        </p>
      </footer>
    </div>
  );
}
