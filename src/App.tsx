import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Trophy, Users, Calendar, RefreshCw, ChevronRight, ChevronDown, UserPlus, Save, Plus, Minus, Edit2, Lock, Unlock, Check, Trash2, Menu, X, Download, Upload, Share2, Clipboard, CloudUpload, CloudDownload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LZString from 'lz-string';
import { Player, Round, PlayerRole, LeaderboardEntry, Match } from './types';
import { INITIAL_ROUNDS, INITIAL_PLAYERS } from './constants';

const STORAGE_KEY_ROUNDS = 'padel_tournament_rounds';
const STORAGE_KEY_STARTERS = 'padel_tournament_starters';
const STORAGE_KEY_UNLOCKED = 'padel_tournament_unlocked';

const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfTkxLau-pYc3bCS0LgCiW_M1aogrw4Ypv6czOPRcbthZMuTA/formResponse';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQG2pYTsjkUEtTb4dyGaBHRQ-5mSSXo3glLQfqbejebXVpmT3oDubXovDExoLMMKk9gDlyArTUK2DO-/pub?gid=327084063&single=true&output=csv';
const ENTRY_ID_TORNEO = 'entry.1572193378';
const ENTRY_DATI_TORNEO = 'entry.112050746';
const SERVER_PASSWORD = 'zucca';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('torneo_padel.json');
  const [showResetModal, setShowResetModal] = useState(false);
  const [serverModal, setServerModal] = useState<{
    type: 'save' | 'load';
    step: 'password' | 'id' | 'confirm' | 'list';
    tournamentId?: string;
    foundData?: any;
  } | null>(null);
  const [serverPassword, setServerPassword] = useState('');
  const [serverTournamentId, setServerTournamentId] = useState('');
  const [isServerLoading, setIsServerLoading] = useState(false);
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
    localStorage.removeItem(STORAGE_KEY_ROUNDS);
    localStorage.removeItem(STORAGE_KEY_STARTERS);
    localStorage.removeItem(STORAGE_KEY_UNLOCKED);
    setRounds(INITIAL_ROUNDS);
    setStarters(INITIAL_PLAYERS);
    setUnlockedMatches(new Set());
    setExpandedRound(1);
    setActiveTab('live');
    setShowResetModal(false);
    setIsMenuOpen(false);
    setToast({ message: 'Torneo resettato con successo!', type: 'success' });
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
    setShowExportModal(true);
  };

  const handleConfirmExport = () => {
    const data = {
      rounds,
      starters,
      unlockedMatches: Array.from(unlockedMatches)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName.endsWith('.json') ? exportFileName : `${exportFileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
    setIsMenuOpen(false);
    setToast({ message: 'Torneo esportato con successo!', type: 'success' });
  };

  const importTournament = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.rounds && data.starters) {
          setIncomingTournament(data);
          setShowImportModal(true);
        } else {
          setToast({ message: 'File non valido.', type: 'error' });
        }
      } catch (err) {
        setToast({ message: 'Errore nel caricamento del file.', type: 'error' });
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const parseCSVLine = (line: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else current += char;
    }
    result.push(current.trim());
    return result.map(col => col.replace(/^"|"$/g, ''));
  };

  const fetchTournamentList = async () => {
    setIsServerLoading(true);
    setServerModal({ type: 'load', step: 'list' });
    setIsMenuOpen(false);

    try {
      const response = await fetch(CSV_URL);
      const csvText = await response.text();
      const lines = csvText.split('\n');
      const tournamentsMap: Record<string, { id: string, timestamp: string, data: string }> = {};

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = parseCSVLine(line);
        if (columns.length >= 3) {
          const timestamp = columns[0].trim();
          const id = columns[1].trim();
          const data = columns[2].trim();
          tournamentsMap[id] = { id, timestamp, data };
        }
      }
      
      const list = Object.values(tournamentsMap).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setServerModal({ type: 'load', step: 'list', foundData: list });
    } catch (err) {
      console.error('Errore nel recupero della lista', err);
      setToast({ message: 'Errore nel recupero della lista.', type: 'error' });
      setServerModal(null);
    } finally {
      setIsServerLoading(false);
    }
  };

  const handleLoadTournament = (tournament: { id: string, data: string }) => {
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(tournament.data);
      if (decompressed) {
        const rawData = JSON.parse(decompressed);
        const data = unminifyTournament(rawData);
        setServerModal({ 
          type: 'load', 
          step: 'confirm', 
          tournamentId: tournament.id, 
          foundData: data 
        });
      } else {
        setToast({ message: 'Errore nella decompressione dei dati.', type: 'error' });
      }
    } catch (err) {
      console.error('Errore nel caricamento del torneo', err);
      setToast({ message: 'Errore nel caricamento del torneo.', type: 'error' });
    }
  };

  const handleSaveToServer = async () => {
    if (serverPassword !== SERVER_PASSWORD) {
      setToast({ message: 'Password errata!', type: 'error' });
      return;
    }

    if (!serverTournamentId.trim()) {
      setToast({ message: 'Inserisci un ID torneo valido.', type: 'error' });
      return;
    }

    setIsServerLoading(true);
    const data = {
      rounds,
      starters,
      unlockedMatches: Array.from(unlockedMatches) as string[]
    };
    const minified = minifyTournament(data);
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(minified));

    const formData = new URLSearchParams();
    formData.append(ENTRY_ID_TORNEO, serverTournamentId.trim());
    formData.append(ENTRY_DATI_TORNEO, compressed);

    try {
      await fetch(GOOGLE_FORM_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
      setServerModal(null);
      setServerPassword('');
      setServerTournamentId('');
      setToast({ message: 'Salvataggio inviato con successo!', type: 'success' });
    } catch (err) {
      console.error('Errore durante il salvataggio sul server', err);
      setToast({ message: 'Errore durante il salvataggio.', type: 'error' });
    } finally {
      setIsServerLoading(false);
    }
  };

  const handleLoadFromServer = async () => {
    if (!serverTournamentId.trim()) {
      setToast({ message: 'Inserisci un ID torneo valido.', type: 'error' });
      return;
    }

    setIsServerLoading(true);
    try {
      const response = await fetch(CSV_URL);
      const csvText = await response.text();
      
      const lines = csvText.split('\n');
      let foundData = null;

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = parseCSVLine(line);
        if (columns.length >= 3) {
          const id = columns[1].trim();
          if (id === serverTournamentId.trim()) {
            foundData = columns[2].trim();
            break;
          }
        }
      }

      if (foundData) {
        handleLoadTournament({ id: serverTournamentId.trim(), data: foundData });
      } else {
        setToast({ message: `Torneo "${serverTournamentId}" non trovato.`, type: 'error' });
      }
    } catch (err) {
      console.error('Errore durante il caricamento dal server', err);
      setToast({ message: 'Errore di connessione al server.', type: 'error' });
    } finally {
      setIsServerLoading(false);
    }
  };

  const confirmLoadFromServer = () => {
    if (serverModal?.foundData) {
      const data = serverModal.foundData;
      setRounds(data.rounds);
      setStarters(data.starters);
      if (data.unlockedMatches) {
        setUnlockedMatches(new Set(data.unlockedMatches));
      }
      
      localStorage.setItem(STORAGE_KEY_ROUNDS, JSON.stringify(data.rounds));
      localStorage.setItem(STORAGE_KEY_STARTERS, JSON.stringify(data.starters));
      if (data.unlockedMatches) {
        localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(data.unlockedMatches));
      }

      setServerModal(null);
      setServerTournamentId('');
      setToast({ message: 'Torneo caricato con successo!', type: 'success' });
    }
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

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans pb-20">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 px-6 py-3 rounded-full shadow-lg z-[100] text-white font-medium text-sm whitespace-nowrap ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

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
                  onClick={fetchTournamentList}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <CloudDownload size={24} className="text-green-500" />
                  </div>
                  <div>
                    <span className="block font-bold">Carica da Server</span>
                    <span className="text-xs opacity-50">Importa Torneo da Database</span>
                  </div>
                </button>

                <button 
                  onClick={() => { setServerModal({ type: 'save', step: 'password' }); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <CloudUpload size={24} className="text-blue-500" />
                  </div>
                  <div>
                    <span className="block font-bold">Salva su Server</span>
                    <span className="text-xs opacity-50">Esporta su Database</span>
                  </div>
                </button>

                <div className="h-px bg-[#141414]/5 my-2" />

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Upload size={24} className="text-green-600" />
                  </div>
                  <div>
                    <span className="block font-bold">Carica da File</span>
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
                  onClick={exportTournament}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Download size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <span className="block font-bold">Salva su File</span>
                    <span className="text-xs opacity-50">Esporta in formato JSON</span>
                  </div>
                </button>

                <div className="h-px bg-[#141414]/5 my-2" />

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
                    onClick={() => setShowResetModal(true)}
                    className="w-full flex items-center gap-4 p-4 bg-red-50 hover:bg-red-100 rounded-2xl transition-colors text-left text-red-600"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Trash2 size={24} />
                    </div>
                    <div>
                      <span className="block font-bold">Reset Totale</span>
                      <span className="text-xs opacity-50 text-red-400">Resetta il Torneo Locale</span>
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

      {/* Export Filename Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Download size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-serif italic">Esporta Torneo</h3>
                  <p className="text-xs opacity-50">Scegli il nome del file</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold opacity-40">Nome File</label>
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="torneo_padel.json"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmExport()}
                    className="w-full bg-[#F5F5F0] border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={handleConfirmExport}
                  className="w-full bg-blue-600 text-white rounded-2xl py-4 font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  Scarica File
                </button>
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="w-full bg-[#F5F5F0] text-[#141414] rounded-2xl py-4 font-bold hover:bg-[#E4E3E0] transition-colors"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-serif italic">Reset Totale</h3>
                  <p className="text-xs opacity-50">Questa azione è irreversibile</p>
                </div>
              </div>

              <p className="text-sm opacity-70 mb-8 leading-relaxed">
                Sei sicuro di voler resettare tutto il torneo? Tutti i punteggi, i nomi e le impostazioni verranno persi per sempre.
              </p>

              <div className="space-y-3">
                <button 
                  onClick={resetTournament}
                  className="w-full bg-red-600 text-white rounded-2xl py-4 font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={20} />
                  Sì, Resetta Tutto
                </button>
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="w-full bg-[#F5F5F0] text-[#141414] rounded-2xl py-4 font-bold hover:bg-[#E4E3E0] transition-colors"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Server Modal */}
      <AnimatePresence>
        {serverModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${serverModal.type === 'save' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                    {serverModal.type === 'save' ? <CloudUpload size={24} /> : <CloudDownload size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-serif italic">
                      {serverModal.type === 'save' ? 'Salva su Server' : 'Carica da Server'}
                    </h3>
                    <p className="text-xs opacity-50">
                      {serverModal.step === 'password' ? 'Inserisci la password' : 
                       serverModal.step === 'id' ? 'Inserisci l\'ID del torneo' : 
                       serverModal.step === 'list' ? 'Scegli un torneo dalla lista' :
                       'Conferma caricamento'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setServerModal(null)}
                  className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {serverModal.step === 'password' && (
                  <div>
                    <input 
                      type="password"
                      placeholder="Password"
                      value={serverPassword}
                      onChange={(e) => setServerPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setServerModal({ ...serverModal, step: 'id' })}
                      className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border border-[#141414]/5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      autoFocus
                    />
                    <button 
                      onClick={() => setServerModal({ ...serverModal, step: 'id' })}
                      className="w-full mt-4 bg-[#141414] text-white rounded-2xl py-4 font-bold hover:bg-black transition-colors"
                    >
                      Avanti
                    </button>
                  </div>
                )}

                {serverModal.step === 'list' && (
                  <div className="space-y-4">
                    {isServerLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <RefreshCw size={32} className="animate-spin text-green-600" />
                        <p className="text-sm opacity-50">Recupero tornei salvati...</p>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
                          {serverModal.foundData && serverModal.foundData.length > 0 ? (
                            serverModal.foundData.map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => handleLoadTournament(t)}
                                className="w-full flex items-center justify-between p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-all text-left group"
                              >
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm">{t.id}</span>
                                </div>
                                <ChevronRight size={16} className="opacity-20 group-hover:opacity-100 transition-opacity" />
                              </button>
                            ))
                          ) : (
                            <div className="text-center py-8 opacity-50">
                              Nessun torneo trovato sul server.
                            </div>
                          )}
                        </div>
                        <div className="pt-2 border-t border-[#141414]/5">
                          <button 
                            onClick={() => setServerModal({ ...serverModal, step: 'id' })}
                            className="w-full text-xs font-bold opacity-40 hover:opacity-100 transition-opacity py-2"
                          >
                            Cerca per ID manuale
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {serverModal.step === 'id' && (
                  <div>
                    <input 
                      type="text"
                      placeholder="Nome Torneo (ID)"
                      value={serverTournamentId}
                      onChange={(e) => setServerTournamentId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (serverModal.type === 'save' ? handleSaveToServer() : handleLoadFromServer())}
                      className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border border-[#141414]/5 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      autoFocus
                    />
                    <button 
                      onClick={serverModal.type === 'save' ? handleSaveToServer : handleLoadFromServer}
                      disabled={isServerLoading}
                      className="w-full mt-4 bg-[#141414] text-white rounded-2xl py-4 font-bold hover:bg-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isServerLoading ? (
                        <RefreshCw size={20} className="animate-spin" />
                      ) : (
                        serverModal.type === 'save' ? 'Salva Ora' : 'Cerca Torneo'
                      )}
                    </button>
                  </div>
                )}

                {serverModal.step === 'confirm' && (
                  <div className="space-y-6">
                    <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                      <span className="text-[10px] uppercase font-bold text-green-600 block mb-3">Torneo Trovato</span>
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <span className="text-xs text-green-600/60">Match:</span>
                          <span className="font-mono font-bold text-lg leading-none text-green-600">{getStats(serverModal.foundData.rounds).matchesPlayed}</span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="text-xs text-green-600/60">Ultimo Turno:</span>
                          <span className="font-mono font-bold text-lg leading-none text-green-600">{getStats(serverModal.foundData.rounds).lastRound}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <button 
                        onClick={confirmLoadFromServer}
                        className="w-full bg-[#141414] text-white rounded-2xl py-4 font-bold hover:bg-black transition-colors flex items-center justify-center gap-2"
                      >
                        <Check size={20} />
                        Conferma e Sovrascrivi
                      </button>
                      <button 
                        onClick={() => setServerModal(null)}
                        className="w-full bg-[#F5F5F0] text-[#141414] rounded-2xl py-4 font-bold hover:bg-[#E4E3E0] transition-colors"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
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
                  onClick={() => setShowResetModal(true)}
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
