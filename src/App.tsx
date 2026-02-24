import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, Users, Calendar, RefreshCw, ChevronRight, ChevronDown, UserPlus, Save, Plus, Minus, Edit2, Lock, Unlock, Check, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans pb-20">
      <header className="bg-white border-b border-[#141414]/10 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-serif italic font-bold tracking-tight">Padel Americano</h1>
            <p className="text-xs uppercase tracking-widest opacity-50 font-semibold">12 Players • 11 Rounds</p>
          </div>
          <div className="flex bg-[#E4E3E0] p-1 rounded-full overflow-x-auto">
            <button 
              onClick={() => setActiveTab('live')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'live' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Live
            </button>
            <button 
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'leaderboard' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Classifica
            </button>
            <button 
              onClick={() => setActiveTab('players')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'players' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Giocatori
            </button>
          </div>
        </div>
      </header>

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
