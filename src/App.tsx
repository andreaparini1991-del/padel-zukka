import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Trophy, Users, Calendar, RefreshCw, ChevronRight, ChevronDown, UserPlus, Save, Plus, Minus, Edit2, Lock, Unlock, Check, Trash2, Menu, X, Download, Upload, Share2, Clipboard, CloudUpload, CloudDownload, Award, Zap, Shield, Target, TrendingUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LZString from 'lz-string';
import { Player, Round, PlayerRole, LeaderboardEntry, Match } from './types';
import { generateRounds, generatePlayers } from './constants';

const STORAGE_KEY_ROUNDS = 'padel_tournament_rounds';
const STORAGE_KEY_STARTERS = 'padel_tournament_starters';
const STORAGE_KEY_UNLOCKED = 'padel_tournament_unlocked';
const STORAGE_KEY_COURTS = 'padel_tournament_courts';

const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfTkxLau-pYc3bCS0LgCiW_M1aogrw4Ypv6czOPRcbthZMuTA/formResponse';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQG2pYTsjkUEtTb4dyGaBHRQ-5mSSXo3glLQfqbejebXVpmT3oDubXovDExoLMMKk9gDlyArTUK2DO-/pub?gid=327084063&single=true&output=csv';
const ENTRY_ID_TORNEO = 'entry.1572193378';
const ENTRY_DATI_TORNEO = 'entry.112050746';
const SERVER_PASSWORD = 'zucca';

const RadarChart = ({ stats }: { stats: { label: string, value: number, max: number }[] }) => {
  const size = 160;
  const center = size / 2;
  const radius = size * 0.35;
  const angleStep = (Math.PI * 2) / stats.length;

  const points = stats.map((stat, i) => {
    const r = (stat.value / stat.max) * radius;
    const x = center + r * Math.cos(i * angleStep - Math.PI / 2);
    const y = center + r * Math.sin(i * angleStep - Math.PI / 2);
    return `${x},${y}`;
  }).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} className="mx-auto overflow-visible">
      {/* Grid */}
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={stats.map((_, i) => {
            const r = level * radius;
            const x = center + r * Math.cos(i * angleStep - Math.PI / 2);
            const y = center + r * Math.sin(i * angleStep - Math.PI / 2);
            return `${x},${y}`;
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
      ))}
      {/* Axes */}
      {stats.map((_, i) => {
        const x = center + radius * Math.cos(i * angleStep - Math.PI / 2);
        const y = center + radius * Math.sin(i * angleStep - Math.PI / 2);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        );
      })}
      {/* Data Polygon */}
      <motion.polygon
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        points={points}
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="2"
        className="text-yellow-500"
      />
      {/* Labels */}
      {stats.map((stat, i) => {
        const x = center + (radius + 15) * Math.cos(i * angleStep - Math.PI / 2);
        const y = center + (radius + 15) * Math.sin(i * angleStep - Math.PI / 2);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] font-bold uppercase opacity-40 fill-current"
          >
            {stat.label}
          </text>
        );
      })}
    </svg>
  );
};

export default function App() {
  const [numCourts, setNumCourts] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_COURTS);
    return saved ? parseInt(saved) : 3;
  });
  const [pendingNumCourts, setPendingNumCourts] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_COURTS);
    return saved ? parseInt(saved) : 3;
  });
  const [showCourtConfirmModal, setShowCourtConfirmModal] = useState(false);

  const [rounds, setRounds] = useState<Round[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ROUNDS);
    if (saved) return JSON.parse(saved);
    const savedCourts = localStorage.getItem(STORAGE_KEY_COURTS);
    return generateRounds(savedCourts ? parseInt(savedCourts) : 3);
  });
  const [starters, setStarters] = useState<Player[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_STARTERS);
    if (saved) return JSON.parse(saved);
    const savedCourts = localStorage.getItem(STORAGE_KEY_COURTS);
    return generatePlayers(savedCourts ? parseInt(savedCourts) : 3);
  });
  const [activeTab, setActiveTab] = useState<'live' | 'leaderboard' | 'total' | 'players'>('live');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (activeTab === 'total') {
      fetchTotalStandings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [expandedRound, setExpandedRound] = useState<number | null>(1);
  const [modifiedMatches, setModifiedMatches] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_UNLOCKED);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [incomingTournament, setIncomingTournament] = useState<{ rounds: Round[], starters: Player[], modifiedMatches?: string[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('torneo_padel.json');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showImportPlayersModal, setShowImportPlayersModal] = useState(false);
  const [selectedImportPlayers, setSelectedImportPlayers] = useState<string[]>([]);
  const [serverModal, setServerModal] = useState<{
    type: 'save' | 'load';
    step: 'password' | 'id' | 'confirm' | 'list';
    tournamentId?: string;
    foundData?: any;
  } | null>(null);
  const [serverPassword, setServerPassword] = useState('');
  const [serverTournamentId, setServerTournamentId] = useState('');
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [totalStandingsData, setTotalStandingsData] = useState<LeaderboardEntry[]>([]);
  const [isTotalStandingsLoading, setIsTotalStandingsLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardEntry | null>(null);
  const [activeBadge, setActiveBadge] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get stats for comparison
  const getStats = (tournamentRounds: Round[]) => {
    const completed = tournamentRounds.filter(r => r.completed);
    const lastRound = completed.length > 0 ? Math.max(...completed.map(r => r.number)) : 0;
    const matchesPlayed = completed.reduce((acc, r) => acc + r.matches.length, 0);
    return { lastRound, matchesPlayed };
  };

  const fetchTotalStandings = async () => {
    setIsTotalStandingsLoading(true);
    try {
      const response = await fetch(CSV_URL);
      const text = await response.text();
      const rows = text.split('\n').map(row => row.split(','));
      
      const idIdx = rows[0].findIndex(col => col.trim() === 'ID_Torneo');
      const dataIdx = rows[0].findIndex(col => col.trim() === 'Dati_Torneo');

      if (idIdx === -1 || dataIdx === -1) throw new Error('CSV non valido');

      const scores: { 
        [name: string]: { 
          points: number, 
          pointsConceded: number,
          matches: number,
          wins: number,
          losses: number,
          partners: { [name: string]: { wins: number, total: number, pointsScored: number } },
          opponents: { [name: string]: { losses: number, total: number, pointsAgainst: number } },
          trend: ('W' | 'L')[],
          lastDayWins: number,
          lastDayMatches: number,
          daysPlayed: number
        } 
      } = {};
      let maxMatches = 0;
      let totalDays = 0;

      const validRows = rows.slice(1).filter(row => row[dataIdx]);
      totalDays = validRows.length;
      
      // Process each game day (row)
      validRows.forEach((row, rowIndex) => {
        try {
          const rawData = row[dataIdx].replace(/^"|"$/g, '').replace(/""/g, '"');
          const decompressed = LZString.decompressFromEncodedURIComponent(rawData);
          if (!decompressed) return;
          const dayData = JSON.parse(decompressed);
          const unminified = unminifyTournament(dayData);
          
          const dayStarters: Player[] = unminified.starters;
          const dayRounds: Round[] = unminified.rounds;
          const isLastDay = rowIndex === validRows.length - 1;
          const playersThisDay = new Set<string>();

          dayRounds.filter(r => r.completed).forEach(round => {
            const playersInThisRound = new Set<string>();
            
            round.matches.forEach(match => {
              const { scoreA, scoreB, teamA, teamB } = match;
              
              const teamANames = teamA.map(id => dayStarters.find(p => p.id === id)?.name || '');
              const teamBNames = teamB.map(id => dayStarters.find(p => p.id === id)?.name || '');

              const processMatchPlayer = (name: string, points: number, conceded: number, partnerNames: string[], opponentNames: string[], isWin: boolean) => {
                if (!name) return;
                if (!scores[name]) scores[name] = { 
                  points: 0, pointsConceded: 0, matches: 0, wins: 0, losses: 0, 
                  partners: {}, opponents: {}, trend: [], lastDayWins: 0, lastDayMatches: 0,
                  daysPlayed: 0
                };
                
                scores[name].points += points;
                scores[name].pointsConceded += conceded;
                scores[name].matches += 1;
                if (isWin) {
                  scores[name].wins += 1;
                  scores[name].trend.push('W');
                  if (isLastDay) scores[name].lastDayWins += 1;
                } else {
                  scores[name].losses += 1;
                  scores[name].trend.push('L');
                }
                if (isLastDay) scores[name].lastDayMatches += 1;
                
                partnerNames.forEach(pName => {
                  if (pName === name) return;
                  if (!scores[name].partners[pName]) scores[name].partners[pName] = { wins: 0, total: 0, pointsScored: 0 };
                  scores[name].partners[pName].total += 1;
                  if (isWin) scores[name].partners[pName].wins += 1;
                  scores[name].partners[pName].pointsScored += points;
                });

                opponentNames.forEach(oName => {
                  if (!scores[name].opponents[oName]) scores[name].opponents[oName] = { losses: 0, total: 0, pointsAgainst: 0 };
                  scores[name].opponents[oName].total += 1;
                  if (!isWin) scores[name].opponents[oName].losses += 1;
                  scores[name].opponents[oName].pointsAgainst += conceded;
                });

                playersInThisRound.add(name);
                playersThisDay.add(name);
              };

              teamANames.forEach(name => processMatchPlayer(name, scoreA, scoreB, teamANames, teamBNames, scoreA > scoreB));
              teamBNames.forEach(name => processMatchPlayer(name, scoreB, scoreA, teamBNames, teamANames, scoreB > scoreA));
            });

            // Award 2 points to starters who did NOT play in this round
            dayStarters.forEach(p => {
              if (!playersInThisRound.has(p.name)) {
                if (!scores[p.name]) scores[p.name] = { 
                  points: 0, pointsConceded: 0, matches: 0, wins: 0, losses: 0, 
                  partners: {}, opponents: {}, trend: [], lastDayWins: 0, lastDayMatches: 0,
                  daysPlayed: 0
                };
                scores[p.name].points += 2;
                playersThisDay.add(p.name);
              }
            });
          });

          // Increment daysPlayed for all players present this day
          playersThisDay.forEach(name => {
            if (scores[name]) scores[name].daysPlayed += 1;
          });
        } catch (e) {
          console.error('Errore nel caricamento giornata:', e);
        }
      });

      // Calculate max matches played by any player
      Object.values(scores).forEach(data => {
        if (data.matches > maxMatches) maxMatches = data.matches;
      });

      // Calculate tournament-wide averages
      const totalPoints = Object.values(scores).reduce((acc, d) => acc + d.points, 0);
      const totalMatches = Object.values(scores).reduce((acc, d) => acc + d.matches, 0);
      const avgPointsPerMatch = totalPoints / (totalMatches || 1);
      
      const totalDiff = Object.values(scores).reduce((acc, d) => acc + (d.points - d.pointsConceded), 0);
      const avgDiffPerMatch = totalDiff / (totalMatches || 1);

      // Identify global max points and min conceded for badges
      let maxPointsMade = -1;
      let minConceded = Infinity;
      
      Object.values(scores).forEach(data => {
        if (data.points > maxPointsMade) maxPointsMade = data.points;
        // Require at least 50% of max matches to be eligible for Muro badge in total standings
        if (data.matches >= Math.max(3, Math.floor(maxMatches * 0.5)) && data.pointsConceded < minConceded) minConceded = data.pointsConceded;
      });

      // Apply bonus points: 2 per missing match compared to maxMatches
      const finalData = Object.entries(scores).map(([name, data]) => {
        const missingMatches = maxMatches - data.matches;
        const bonusPoints = missingMatches * 2;
        
        // Find best partner (Anima Gemella)
        let bestPartner = 'Nessuno';
        let maxWinRate = -1;
        let maxPartnerPoints = -1;
        Object.entries(data.partners).forEach(([pName, pData]) => {
          const winRate = pData.wins / pData.total;
          if (pData.total >= 1 && (winRate > maxWinRate || (winRate === maxWinRate && pData.pointsScored > maxPartnerPoints))) {
            maxWinRate = winRate;
            maxPartnerPoints = pData.pointsScored;
            bestPartner = pName;
          }
        });

        // Find nemesis (who you lose to most)
        let nemesis = 'Nessuno';
        let maxLosses = -1;
        let maxPointsAgainst = -1;
        Object.entries(data.opponents).forEach(([oName, oData]) => {
          if (oData.losses > maxLosses || (oData.losses === maxLosses && oData.pointsAgainst > maxPointsAgainst)) {
            maxLosses = oData.losses;
            maxPointsAgainst = oData.pointsAgainst;
            nemesis = oName;
          }
        });

        const playerAvgPoints = data.points / (data.matches || 1);
        const playerPointDiff = (data.points - data.pointsConceded) / (data.matches || 1);

        return {
          name,
          totalPoints: data.points + bonusPoints,
          totalPointsMade: data.points,
          pointsConceded: data.pointsConceded,
          matchesPlayed: data.matches,
          wins: data.wins,
          losses: data.losses,
          avgPoints: Number(playerAvgPoints.toFixed(1)),
          bestPartner,
          nemesis,
          trend: data.trend.slice(-5), // Last 5 matches
          pointDiff: Number(playerPointDiff.toFixed(1)),
          lastDayWinRate: data.lastDayMatches > 0 ? (data.lastDayWins / data.lastDayMatches) : 0,
          maxTournamentMatches: maxMatches,
          daysPlayed: data.daysPlayed,
          // Badge logic
          isBomber: data.points === maxPointsMade && data.points > 0,
          isMuro: data.pointsConceded === minConceded && data.matches >= Math.max(3, Math.floor(maxMatches * 0.5)),
          isVeterano: data.matches === maxMatches && data.daysPlayed >= 2,
          isOrganizzatore: name.toLowerCase() === 'zukka' || name.toLowerCase() === 'zucca',
          isInvincibile: (data.wins / (data.matches || 1)) > 0.7 && data.matches >= 3,
          // Normalization factors
          normPoints: playerAvgPoints / (avgPointsPerMatch || 1),
          normDiff: playerPointDiff - avgDiffPerMatch // This is a raw diff from average
        };
      }).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));

      setTotalStandingsData(finalData);
    } catch (error) {
      console.error('Errore nel caricamento classifica totale:', error);
      setToast({ message: 'Errore nel caricamento classifica totale', type: 'error' });
    } finally {
      setIsTotalStandingsLoading(false);
    }
  };

  // Minification logic for sharing
  const minifyTournament = (data: { rounds: Round[], starters: Player[], modifiedMatches: string[] }) => {
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
          sB: match.scoreB
        }))
      })),
      s: data.starters.map(p => ({
        i: p.id,
        n: p.name
      })),
      u: data.modifiedMatches
    };
  };

  const unminifyTournament = (min: any) => {
    // Backward compatibility: check if it's already unminified
    if (min.rounds && min.starters) return min;

    const starters: Player[] = min.s.map((p: any) => ({
      id: p.i,
      name: p.n,
      role: PlayerRole.TITOLARE
    }));

    const rounds: Round[] = min.r.map((r: any) => ({
      number: r.n,
      completed: r.c === 1,
      matches: r.m.map((m: any) => {
        return {
          id: m.i,
          court: m.ct,
          teamA: m.tA,
          teamB: m.tB,
          scoreA: m.sA,
          scoreB: m.sB
        };
      })
    }));

    return {
      rounds,
      starters,
      modifiedMatches: min.u || []
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
      const { rounds: newRounds, starters: newStarters } = incomingTournament;
      
      const inferredCourts = Math.floor(newStarters.length / 4);
      setNumCourts(inferredCourts);
      setPendingNumCourts(inferredCourts);
      localStorage.setItem(STORAGE_KEY_COURTS, inferredCourts.toString());
      
      // Update state
      setRounds(newRounds);
      setStarters(newStarters);
      const restoredModified = new Set(incomingTournament.modifiedMatches || []);
      setModifiedMatches(restoredModified);

      // Force immediate localStorage update
      localStorage.setItem(STORAGE_KEY_ROUNDS, JSON.stringify(newRounds));
      localStorage.setItem(STORAGE_KEY_STARTERS, JSON.stringify(newStarters));
      localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(Array.from(restoredModified)));
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
    localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(Array.from(modifiedMatches)));
  }, [modifiedMatches]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COURTS, numCourts.toString());
  }, [numCourts]);

  const applyNumCourtsChange = () => {
    const newNum = pendingNumCourts;
    if (newNum < 1 || newNum > 10) return;
    setNumCourts(newNum);
    
    const newCount = newNum * 4;
    let newStarters = [...starters];
    
    if (newCount > starters.length) {
      const extra = Array.from({ length: newCount - starters.length }, (_, i) => ({
        id: starters.length + i + 1,
        name: `Giocatore ${starters.length + i + 1}`,
        role: PlayerRole.TITOLARE,
      }));
      newStarters = [...newStarters, ...extra];
    } else if (newCount < starters.length) {
      newStarters = newStarters.slice(0, newCount);
    }
    
    setStarters(newStarters);
    setRounds(generateRounds(newNum));
    setModifiedMatches(new Set());
    setShowCourtConfirmModal(false);
    setToast({ message: `Configurazione aggiornata: ${newNum} campi (${newCount} giocatori)`, type: 'success' });
  };

  const resetTournament = () => {
    localStorage.removeItem(STORAGE_KEY_ROUNDS);
    localStorage.removeItem(STORAGE_KEY_STARTERS);
    localStorage.removeItem(STORAGE_KEY_UNLOCKED);
    setRounds(generateRounds(numCourts));
    setStarters(generatePlayers(numCourts));
    setModifiedMatches(new Set());
    setPendingNumCourts(numCourts);
    setExpandedRound(1);
    setActiveTab('live');
    setShowResetModal(false);
    setIsMenuOpen(false);
    setToast({ message: 'Torneo resettato con successo!', type: 'success' });
  };

  // Calculate Leaderboard
  const leaderboard = useMemo(() => {
    const scores: { 
      [name: string]: { 
        points: number, 
        pointsConceded: number,
        matches: number,
        wins: number,
        losses: number,
        partners: { [name: string]: { wins: number, total: number, pointsScored: number } },
        opponents: { [name: string]: { losses: number, total: number, pointsAgainst: number } },
        trend: ('W' | 'L')[]
      } 
    } = {};

    // Initialize starters
    starters.forEach(p => {
      scores[p.name] = { 
        points: 0, pointsConceded: 0, matches: 0, wins: 0, losses: 0, 
        partners: {}, opponents: {}, trend: []
      };
    });

    rounds.forEach(round => {
      const playersInThisRound = new Set<string>();
      
      round.matches.filter(m => modifiedMatches.has(m.id)).forEach(match => {
        const { scoreA, scoreB, teamA, teamB } = match;
        
        const teamANames = teamA.map(id => starters.find(p => p.id === id)?.name || '');
        const teamBNames = teamB.map(id => starters.find(p => p.id === id)?.name || '');

        const processMatchPlayer = (name: string, points: number, conceded: number, partnerNames: string[], opponentNames: string[], isWin: boolean) => {
          if (!name) return;
          if (!scores[name]) scores[name] = { 
            points: 0, pointsConceded: 0, matches: 0, wins: 0, losses: 0, 
            partners: {}, opponents: {}, trend: []
          };
          
          scores[name].points += points;
          scores[name].pointsConceded += conceded;
          scores[name].matches += 1;
          if (isWin) {
            scores[name].wins += 1;
            scores[name].trend.push('W');
          } else {
            scores[name].losses += 1;
            scores[name].trend.push('L');
          }
          
          partnerNames.forEach(pName => {
            if (pName === name) return;
            if (!scores[name].partners[pName]) scores[name].partners[pName] = { wins: 0, total: 0, pointsScored: 0 };
            scores[name].partners[pName].total += 1;
            if (isWin) scores[name].partners[pName].wins += 1;
            scores[name].partners[pName].pointsScored += points;
          });

          opponentNames.forEach(oName => {
            if (!scores[name].opponents[oName]) scores[name].opponents[oName] = { losses: 0, total: 0, pointsAgainst: 0 };
            scores[name].opponents[oName].total += 1;
            if (!isWin) scores[name].opponents[oName].losses += 1;
            scores[name].opponents[oName].pointsAgainst += conceded;
          });

          playersInThisRound.add(name);
        };

        teamANames.forEach(name => processMatchPlayer(name, scoreA, scoreB, teamANames, teamBNames, scoreA > scoreB));
        teamBNames.forEach(name => processMatchPlayer(name, scoreB, scoreA, teamBNames, teamANames, scoreB > scoreA));
      });

      // Award 2 points to starters who did NOT play in this round (only if round is completed)
      if (round.completed) {
        starters.forEach(p => {
          if (!playersInThisRound.has(p.name)) {
            scores[p.name].points += 2;
          }
        });
      }
    });

    // Identify global max points and min conceded for badges in this day
    let maxPointsMade = -1;
    let minConceded = Infinity;
    let maxMatches = 0;
    
    Object.values(scores).forEach(data => {
      if (data.points > maxPointsMade) maxPointsMade = data.points;
      if (data.matches >= Math.max(2, Math.floor(maxMatches * 0.7)) && data.pointsConceded < minConceded) minConceded = data.pointsConceded;
      if (data.matches > maxMatches) maxMatches = data.matches;
    });

    return Object.entries(scores)
      .map(([name, data]) => {
        // Find best partner
        let bestPartner = 'Nessuno';
        let maxWinRate = -1;
        let maxPartnerPoints = -1;
        Object.entries(data.partners).forEach(([pName, pData]) => {
          const winRate = pData.wins / pData.total;
          if (pData.total >= 1 && (winRate > maxWinRate || (winRate === maxWinRate && pData.pointsScored > maxPartnerPoints))) {
            maxWinRate = winRate;
            maxPartnerPoints = pData.pointsScored;
            bestPartner = pName;
          }
        });

        // Find nemesis
        let nemesis = 'Nessuno';
        let maxLosses = -1;
        let maxPointsAgainst = -1;
        Object.entries(data.opponents).forEach(([oName, oData]) => {
          if (oData.losses > maxLosses || (oData.losses === maxLosses && oData.pointsAgainst > maxPointsAgainst)) {
            maxLosses = oData.losses;
            maxPointsAgainst = oData.pointsAgainst;
            nemesis = oName;
          }
        });

        return {
          name,
          totalPoints: data.points,
          totalPointsMade: data.points,
          pointsConceded: data.pointsConceded,
          matchesPlayed: data.matches,
          wins: data.wins,
          losses: data.losses,
          avgPoints: Number((data.points / (data.matches || 1)).toFixed(1)),
          bestPartner,
          nemesis,
          trend: data.trend.slice(-5),
          isBomber: data.points === maxPointsMade && data.points > 0,
          isMuro: data.pointsConceded === minConceded && data.matches >= Math.max(2, Math.floor(maxMatches * 0.7)),
          isVeterano: data.matches === maxMatches && data.matches > 0,
          isOrganizzatore: name.toLowerCase() === 'zukka' || name.toLowerCase() === 'zucca'
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
  }, [rounds, starters]);

  const updateScore = (roundIdx: number, matchIdx: number, team: 'A' | 'B', delta: number) => {
    const newRounds = [...rounds];
    const match = newRounds[roundIdx].matches[matchIdx];
    if (team === 'A') match.scoreA = Math.max(0, match.scoreA + delta);
    else match.scoreB = Math.max(0, match.scoreB + delta);
    setRounds(newRounds);
  };

  const confirmMatchScore = (matchId: string) => {
    const newModified = new Set(modifiedMatches);
    newModified.add(matchId);
    setModifiedMatches(newModified);
    setToast({ message: 'Match confermato!', type: 'success' });
  };

  const unconfirmMatchScore = (matchId: string) => {
    const newModified = new Set(modifiedMatches);
    newModified.delete(matchId);
    setModifiedMatches(newModified);
    setToast({ message: 'Match riaperto per modifiche', type: 'info' });
  };

  const toggleRoundCompletion = (roundIdx: number) => {
    const newRounds = [...rounds];
    newRounds[roundIdx].completed = !newRounds[roundIdx].completed;
    setRounds(newRounds);
  };

  const handleStarterNameChange = (id: number, newName: string) => {
    const updatedStarters = starters.map(p => p.id === id ? { ...p, name: newName } : p);
    setStarters(updatedStarters);
  };

  const exportTournament = () => {
    setShowExportModal(true);
  };

  const handleConfirmExport = () => {
    const data = {
      rounds,
      starters,
      modifiedMatches: Array.from(modifiedMatches)
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
      modifiedMatches: Array.from(modifiedMatches) as string[]
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
      const restoredModified = new Set(data.modifiedMatches || []);
      setModifiedMatches(restoredModified);
      
      localStorage.setItem(STORAGE_KEY_ROUNDS, JSON.stringify(data.rounds));
      localStorage.setItem(STORAGE_KEY_STARTERS, JSON.stringify(data.starters));
      localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(Array.from(restoredModified)));

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
                <p className="text-[10px] uppercase tracking-widest opacity-50 font-semibold">{numCourts * 4} Giocatori • {numCourts * 4 - 1} Turni</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-4 sm:flex w-full sm:w-auto bg-[#E4E3E0] p-1 rounded-xl sm:rounded-full gap-1">
            <button 
              onClick={() => setActiveTab('players')}
              className={`px-2 sm:px-4 py-2 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-medium transition-all ${activeTab === 'players' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Giocatori
            </button>
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
              Giorno
            </button>
            <button 
              onClick={() => setActiveTab('total')}
              className={`px-2 sm:px-4 py-2 rounded-lg sm:rounded-full text-[11px] sm:text-xs font-medium transition-all ${activeTab === 'total' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
            >
              Totale
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
                <div className="h-px bg-[#141414]/5 my-2" />

                <button 
                  onClick={fetchTournamentList}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <CloudDownload size={24} className="text-green-500" />
                  </div>
                  <div>
                    <span className="block font-bold">Carica da Server</span>
                    <span className="text-xs opacity-50">Importa Giornata da Database</span>
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
                    <span className="text-xs opacity-50">Esporta Giornata su Database</span>
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
                  disabled={isCopying}
                  className="w-full flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl transition-colors text-left"
                >
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    {isCopying ? <Check size={24} className="text-emerald-500" /> : <Clipboard size={24} className="text-blue-600" />}
                  </div>
                  <div>
                    <span className="block font-bold">{isCopying ? 'Copiata!' : 'Copia Classifica Giornata'}</span>
                    <span className="text-xs opacity-50">Copia i risultati negli appunti</span>
                  </div>
                </button>

                <div className="h-px bg-[#141414]/5 my-2" />

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
                      <span className="text-xs opacity-50 text-red-400">Resetta la Giornata Locale</span>
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

      {/* Player Card Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlayer(null)}
              className="absolute inset-0 bg-[#141414]/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="relative w-full max-w-md bg-white rounded-[48px] shadow-2xl overflow-hidden border border-white/40 max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm hover:bg-white rounded-full transition-all text-[#141414] z-50 shadow-md border border-[#141414]/10"
              >
                <X size={20} />
              </button>

              <div className="pt-12 pb-10 px-6 sm:px-8">
                <div className="flex flex-col items-center mb-8">
                  <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-[32px] shadow-xl flex items-center justify-center mb-4 border-4 border-white">
                    <span className="text-4xl font-serif italic font-black text-white">
                      {selectedPlayer.name.charAt(0)}
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif italic font-bold mb-1 tracking-tight text-center">{selectedPlayer.name}</h3>
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-px w-12 bg-[#141414]/10" />
                    <span className="text-[10px] uppercase tracking-[0.3em] font-black opacity-30">
                      {selectedPlayer.maxTournamentMatches ? (
                        (selectedPlayer.wins || 0) / (selectedPlayer.matchesPlayed || 1) > 0.6 ? 'Top Performer' : 'Challenger'
                      ) : (
                        'Classifica Giornata'
                      )}
                    </span>
                    <div className="h-px w-12 bg-[#141414]/10" />
                  </div>
                </div>

                {selectedPlayer.maxTournamentMatches ? (
                  <>
                    {/* Radar Chart Section */}
                    <div className="mb-8 py-6 bg-[#F5F5F0]/50 rounded-[40px] border border-[#141414]/5 relative overflow-hidden">
                      <RadarChart stats={[
                        { 
                          label: 'Diff Punti', 
                          value: Math.max(0, Math.min(100, ((selectedPlayer.pointDiff || 0) + 5) * 10)), 
                          max: 100 
                        },
                        { 
                          label: 'Punti Fatti', 
                          value: Math.max(0, Math.min(100, (selectedPlayer.normPoints || 1) * 50)), 
                          max: 100 
                        },
                        { 
                          label: '% Vittorie', 
                          value: ((selectedPlayer.wins || 0) / (selectedPlayer.matchesPlayed || 1)) * 100, 
                          max: 100 
                        },
                        { 
                          label: 'Partecipazione', 
                          value: (selectedPlayer.matchesPlayed / (selectedPlayer.maxTournamentMatches || 1)) * 100, 
                          max: 100 
                        },
                        { 
                          label: 'Forma', 
                          value: (selectedPlayer.lastDayWinRate || 0) * 100, 
                          max: 100 
                        },
                      ]} />
                    </div>

                    {/* Raw Stats Table */}
                    <div className="mb-8 bg-[#F5F5F0]/30 rounded-3xl p-4 border border-[#141414]/5">
                      <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold opacity-40">Diff. Media</span>
                          <span className={`text-xs font-mono font-bold ${ (selectedPlayer.pointDiff || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {(selectedPlayer.pointDiff || 0) > 0 ? '+' : ''}{selectedPlayer.pointDiff}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold opacity-40">% Vittorie</span>
                          <span className="text-xs font-mono font-bold">
                            {Math.round(((selectedPlayer.wins || 0) / (selectedPlayer.matchesPlayed || 1)) * 100)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold opacity-40">Presenza</span>
                          <span className="text-xs font-mono font-bold">
                            {selectedPlayer.matchesPlayed}/{selectedPlayer.maxTournamentMatches}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold opacity-40">Ultima Giornata</span>
                          <span className="text-xs font-mono font-bold">
                            {Math.round((selectedPlayer.lastDayWinRate || 0) * 100)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold opacity-40">Punti Fatti</span>
                          <span className="text-xs font-mono font-bold">
                            {selectedPlayer.totalPointsMade}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold opacity-40">Punti Subiti</span>
                          <span className="text-xs font-mono font-bold">
                            {selectedPlayer.pointsConceded}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Badges Section */}
                    <div className="flex flex-wrap justify-center gap-3 mb-4">
                      {selectedPlayer.isOrganizzatore && (
                        <button 
                          onClick={() => setActiveBadge(activeBadge === 'organizzatore' ? null : 'organizzatore')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${activeBadge === 'organizzatore' ? 'bg-purple-400 text-white border-purple-500 scale-105' : 'bg-purple-100 text-purple-700 border-purple-200'}`}
                        >
                          <Shield size={12} /> Organizzatore 👑
                        </button>
                      )}
                      {selectedPlayer.isInvincibile && (
                        <button 
                          onClick={() => setActiveBadge(activeBadge === 'invincibile' ? null : 'invincibile')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${activeBadge === 'invincibile' ? 'bg-yellow-400 text-yellow-900 border-yellow-500 scale-105' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}
                        >
                          <Award size={12} /> Invincibile 🏆
                        </button>
                      )}
                      {selectedPlayer.isBomber && (
                        <button 
                          onClick={() => setActiveBadge(activeBadge === 'bomber' ? null : 'bomber')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${activeBadge === 'bomber' ? 'bg-orange-400 text-white border-orange-500 scale-105' : 'bg-orange-100 text-orange-700 border-orange-200'}`}
                        >
                          <Zap size={12} /> Bomber 🚀
                        </button>
                      )}
                      {selectedPlayer.isVeterano && (
                        <button 
                          onClick={() => setActiveBadge(activeBadge === 'veterano' ? null : 'veterano')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${activeBadge === 'veterano' ? 'bg-blue-400 text-white border-blue-500 scale-105' : 'bg-blue-100 text-blue-700 border-blue-200'}`}
                        >
                          <Shield size={12} /> Veterano
                        </button>
                      )}
                      {selectedPlayer.isMuro && (
                        <button 
                          onClick={() => setActiveBadge(activeBadge === 'muro' ? null : 'muro')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${activeBadge === 'muro' ? 'bg-emerald-400 text-white border-emerald-500 scale-105' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                        >
                          <Shield size={12} /> Muro 🧱
                        </button>
                      )}
                    </div>

                    <AnimatePresence mode="wait">
                      {activeBadge && (
                        <motion.div 
                          key={activeBadge}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="text-center mb-8 p-3 bg-[#F5F5F0] rounded-2xl border border-[#141414]/5"
                        >
                          <p className="text-[10px] font-bold opacity-60 leading-relaxed">
                            {activeBadge === 'organizzatore' && 'L\'organizzatore del torneo.'}
                            {activeBadge === 'invincibile' && '% Vittorie superiore al 70% (minimo 3 match).'}
                            {activeBadge === 'bomber' && 'Il giocatore che ha fatto più punti di tutti.'}
                            {activeBadge === 'veterano' && 'Aver partecipato a tutte le partite (almeno 2 giornate).'}
                            {activeBadge === 'muro' && 'Il giocatore con meno punti subiti.'}
                            {activeBadge === 'animaGemella' && 'Il compagno con cui hai la percentuale di vittoria più alta.'}
                            {activeBadge === 'nemesi' && 'L\'avversario contro cui hai perso più partite.'}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Insights Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div 
                        onClick={() => setActiveBadge(activeBadge === 'animaGemella' ? null : 'animaGemella')}
                        className={`p-5 rounded-[32px] border transition-all cursor-pointer group ${activeBadge === 'animaGemella' ? 'bg-emerald-100 border-emerald-300 scale-105 shadow-md' : 'bg-emerald-50/50 border-emerald-100/50 hover:bg-emerald-50'}`}
                      >
                        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm mb-3">
                          <Users size={20} />
                        </div>
                        <span className="block text-[9px] uppercase font-black opacity-30 mb-1 tracking-wider">Anima Gemella</span>
                        <span className="font-bold text-emerald-900 text-sm block truncate">{selectedPlayer.bestPartner || 'Nessuno'}</span>
                      </div>
                      
                      <div 
                        onClick={() => setActiveBadge(activeBadge === 'nemesi' ? null : 'nemesi')}
                        className={`p-5 rounded-[32px] border transition-all cursor-pointer group ${activeBadge === 'nemesi' ? 'bg-red-100 border-red-300 scale-105 shadow-md' : 'bg-red-50/50 border-red-100/50 hover:bg-red-50'}`}
                      >
                        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm mb-3">
                          <Target size={20} />
                        </div>
                        <span className="block text-[9px] uppercase font-black opacity-30 mb-1 tracking-wider">Nemesi</span>
                        <span className="font-bold text-red-900 text-sm block truncate">{selectedPlayer.nemesis || 'Nessuno'}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="p-8 bg-[#F5F5F0] rounded-[40px] border border-[#141414]/5 text-center">
                      <div className="text-4xl font-serif italic font-black text-yellow-600 mb-2">
                        {selectedPlayer.totalPoints}
                      </div>
                      <div className="text-[10px] uppercase font-black opacity-30 tracking-widest">Punti Guadagnati Oggi</div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-6 bg-white rounded-[32px] border border-[#141414]/5 text-center">
                        <div className="text-xl font-mono font-bold text-[#141414] mb-1">{selectedPlayer.matchesPlayed}</div>
                        <div className="text-[8px] uppercase font-bold opacity-40 tracking-wider">Partite</div>
                      </div>
                      <div className="p-6 bg-white rounded-[32px] border border-[#141414]/5 text-center">
                        <div className="text-xl font-mono font-bold text-emerald-600 mb-1">{selectedPlayer.wins || 0}</div>
                        <div className="text-[8px] uppercase font-bold opacity-40 tracking-wider">Vittorie</div>
                      </div>
                    </div>

                    <div className="p-6 bg-yellow-50 rounded-[32px] border border-yellow-100 text-center">
                      <p className="text-xs font-medium text-yellow-800 italic">
                        Visualizza la classifica totale per statistiche avanzate, radar chart e badge!
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-[#F5F5F0]/50 border-t border-[#141414]/5">
                <button 
                  onClick={() => setSelectedPlayer(null)}
                  className="w-full py-5 bg-[#141414] text-white rounded-[24px] font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-black/20 active:scale-95"
                >
                  Chiudi Profilo
                </button>
              </div>
            </motion.div>
          </div>
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

      {/* Modal Importazione Giocatori */}
      <AnimatePresence>
        {showImportPlayersModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 bg-[#141414] text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-serif italic">Importa Giocatori</h3>
                  <p className="text-xs opacity-50">Seleziona fino a {numCourts * 4} giocatori dalla classifica generale</p>
                </div>
                <button 
                  onClick={() => {
                    setShowImportPlayersModal(false);
                    setSelectedImportPlayers([]);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isTotalStandingsLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <RefreshCw size={32} className="animate-spin text-blue-600" />
                    <p className="text-sm font-medium opacity-50">Caricamento classifica generale...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-bold uppercase opacity-40">Giocatore</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold uppercase opacity-40">Presenze</span>
                        <button 
                          onClick={fetchTotalStandings}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-blue-600"
                          title="Aggiorna dati"
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>
                    </div>
                    {[...totalStandingsData]
                      .sort((a, b) => (b.daysPlayed || 0) - (a.daysPlayed || 0))
                      .map((player) => {
                        const isSelected = selectedImportPlayers.includes(player.name);
                        const isDisabled = !isSelected && selectedImportPlayers.length >= numCourts * 4;
                        
                        return (
                          <button
                            key={player.name}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedImportPlayers(prev => prev.filter(n => n !== player.name));
                              } else if (!isDisabled) {
                                setSelectedImportPlayers(prev => [...prev, player.name]);
                              }
                            }}
                            disabled={isDisabled}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                              isSelected 
                                ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                : isDisabled 
                                  ? 'opacity-30 grayscale cursor-not-allowed border-transparent' 
                                  : 'bg-[#F5F5F0] border-[#141414]/5 hover:border-[#141414]/20'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                                isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'
                              }`}>
                                {isSelected && <Check size={14} strokeWidth={3} />}
                              </div>
                              <span className="font-bold">{player.name}</span>
                            </div>
                            <span className="font-mono text-sm opacity-50">{player.daysPlayed} gg</span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-[#141414]/10 bg-[#F5F5F0] flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-bold text-blue-600">{selectedImportPlayers.length}</span>
                  <span className="opacity-50"> / {numCourts * 4} selezionati</span>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setShowImportPlayersModal(false);
                      setSelectedImportPlayers([]);
                    }}
                    className="px-6 py-2 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Annulla
                  </button>
                  <button 
                    onClick={() => {
                      const newStarters = [...starters];
                      selectedImportPlayers.forEach((name, index) => {
                        if (index < newStarters.length) {
                          newStarters[index] = { ...newStarters[index], name };
                        }
                      });
                      setStarters(newStarters);
                      setShowImportPlayersModal(false);
                      setSelectedImportPlayers([]);
                      setToast({ message: `${selectedImportPlayers.length} giocatori importati!`, type: 'success' });
                    }}
                    disabled={selectedImportPlayers.length === 0}
                    className="px-8 py-2 bg-[#141414] text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Conferma Importazione
                  </button>
                </div>
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

        {showCourtConfirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Target size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-serif italic">Cambia Campi</h3>
                  <p className="text-xs opacity-50">Questa azione resetterà il torneo</p>
                </div>
              </div>

              <p className="text-sm opacity-70 mb-8 leading-relaxed">
                Stai cambiando la configurazione a <strong>{pendingNumCourts} campi</strong> ({pendingNumCourts * 4} giocatori). 
                Tutti i match correnti e i punteggi verranno resettati. Vuoi procedere?
              </p>

              <div className="space-y-3">
                <button 
                  onClick={applyNumCourtsChange}
                  className="w-full bg-blue-600 text-white rounded-2xl py-4 font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={20} />
                  Sì, Applica e Resetta
                </button>
                <button 
                  onClick={() => {
                    setShowCourtConfirmModal(false);
                    setPendingNumCourts(numCourts);
                  }}
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
        {activeTab === 'players' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-[#141414] text-white">
                <h2 className="text-xl font-serif italic">Configurazione Campi</h2>
                <Target size={20} />
              </div>
              <div className="p-6">
                <div className="flex flex-col sm:flex-row items-center justify-between bg-[#F5F5F0] p-4 rounded-2xl border border-[#141414]/5 gap-4">
                  <div className="flex-1">
                    <span className="block font-bold text-lg">{pendingNumCourts} Campi</span>
                    <span className="text-xs opacity-50">{pendingNumCourts * 4} Giocatori • {pendingNumCourts * 4 - 1} Turni</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setPendingNumCourts(prev => Math.max(1, prev - 1))}
                        disabled={pendingNumCourts <= 1}
                        className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Minus size={20} />
                      </button>
                      <button 
                        onClick={() => setPendingNumCourts(prev => Math.min(10, prev + 1))}
                        disabled={pendingNumCourts >= 10}
                        className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    {pendingNumCourts !== numCourts && (
                      <button 
                        onClick={() => setShowCourtConfirmModal(true)}
                        className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md flex items-center gap-2"
                      >
                        <Check size={18} />
                        Applica
                      </button>
                    )}
                  </div>
                </div>
                {pendingNumCourts !== numCourts && (
                  <p className="mt-4 text-[10px] text-red-500 font-bold uppercase tracking-wider">
                    ⚠️ Attenzione: Cambiare il numero di campi resetterà i turni correnti!
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-[#141414] text-white">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-serif italic">Gestione Giocatori</h2>
                  <button 
                    onClick={() => {
                      fetchTotalStandings();
                      setShowImportPlayersModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border border-white/10"
                  >
                    <CloudDownload size={14} />
                    Importa da Classifica
                  </button>
                </div>
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
                          const isConfirmed = modifiedMatches.has(match.id);
                          return (
                            <div key={match.id} className={`p-4 rounded-xl space-y-4 border transition-all relative ${isConfirmed ? 'bg-green-50/50 border-green-200' : 'bg-[#F5F5F0] border-[#141414]/5'}`}>
                              <div className="flex justify-between items-center border-b border-[#141414]/10 pb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">Campo {match.court}</span>
                                {isConfirmed ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black uppercase text-green-600 flex items-center gap-1">
                                      <Check size={10} strokeWidth={3} />
                                      Concluso
                                    </span>
                                    <button 
                                      onClick={() => unconfirmMatchScore(match.id)}
                                      className="p-1 hover:bg-green-100 rounded-md text-green-700 transition-colors"
                                      title="Modifica punteggio"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => confirmMatchScore(match.id)}
                                    className="flex items-center gap-1 bg-blue-600 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm"
                                  >
                                    <Check size={10} />
                                    Conferma
                                  </button>
                                )}
                              </div>

                              {/* Team A */}
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  {match.teamA.map(id => (
                                    <div key={id} className="flex justify-between items-center group">
                                      <span className={`text-sm truncate pr-2 font-medium ${isConfirmed ? 'opacity-60' : ''}`}>
                                        {starters.find(p => p.id === id)?.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                
                                <div className={`flex items-center justify-center gap-3 bg-white rounded-lg border border-[#141414]/5 p-1 shadow-sm ${isConfirmed ? 'opacity-60' : ''}`}>
                                  {!isConfirmed && (
                                    <button 
                                      onClick={() => updateScore(rIdx, mIdx, 'A', -1)}
                                      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F0]"
                                    >
                                      <Minus size={14} />
                                    </button>
                                  )}
                                  <span className="font-mono text-xl font-bold w-8 text-center">{match.scoreA}</span>
                                  {!isConfirmed && (
                                    <button 
                                      onClick={() => updateScore(rIdx, mIdx, 'A', 1)}
                                      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F0]"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="text-center text-[10px] font-bold opacity-20 italic">VS</div>

                              {/* Team B */}
                              <div className="space-y-3">
                                <div className={`flex items-center justify-center gap-3 bg-white rounded-lg border border-[#141414]/5 p-1 shadow-sm ${isConfirmed ? 'opacity-60' : ''}`}>
                                  {!isConfirmed && (
                                    <button 
                                      onClick={() => updateScore(rIdx, mIdx, 'B', -1)}
                                      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F0]"
                                    >
                                      <Minus size={14} />
                                    </button>
                                  )}
                                  <span className="font-mono text-xl font-bold w-8 text-center">{match.scoreB}</span>
                                  {!isConfirmed && (
                                    <button 
                                      onClick={() => updateScore(rIdx, mIdx, 'B', 1)}
                                      className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[#F5F5F0]"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  {match.teamB.map(id => (
                                    <div key={id} className="flex justify-between items-center group">
                                      <span className={`text-sm truncate pr-2 font-medium ${isConfirmed ? 'opacity-60' : ''}`}>
                                        {starters.find(p => p.id === id)?.name}
                                      </span>
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
              <h2 className="text-xl font-serif italic">Classifica Giornata</h2>
              <Trophy size={20} className="text-yellow-400" />
            </div>
            <div className="w-full">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="bg-[#F5F5F0] border-b border-[#141414]/10">
                    <th className="w-12 px-2 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50 text-center">Pos</th>
                    <th className="px-2 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50">Giocatore</th>
                    <th className="w-14 px-2 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50 text-center">Part</th>
                    <th className="w-14 px-2 py-4 text-[10px] uppercase tracking-widest font-bold opacity-50 text-right">Punti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/5">
                  {leaderboard.map((entry, idx) => (
                    <tr 
                      key={entry.name} 
                      onClick={() => setSelectedPlayer(entry)}
                      className="hover:bg-[#F5F5F0] transition-colors cursor-pointer group"
                    >
                      <td className="px-2 py-4 font-mono text-xs font-bold opacity-40 text-center">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-4">
                        <div className="flex items-center justify-between group cursor-pointer">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm truncate group-hover:text-yellow-700 transition-colors">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-2 opacity-30 md:opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 md:translate-x-2 group-hover:translate-x-0">
                            <span className="hidden sm:inline text-[8px] uppercase font-bold opacity-40">Dettagli</span>
                            <Info size={14} className="text-yellow-600" />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-4 text-center font-mono text-xs opacity-40">
                        {entry.matchesPlayed}
                      </td>
                      <td className="px-2 py-4 text-right">
                        <span className="font-serif italic text-base font-bold text-yellow-700">{entry.totalPoints}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'total' && (
          <div className="bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-[#141414] text-white">
              <div>
                <h2 className="text-xl font-serif italic leading-tight">Classifica Totale</h2>
                <p className="text-[10px] uppercase tracking-widest opacity-50 font-semibold mt-1">
                  {totalStandingsData.length} Giocatori Unici • {totalStandingsData.length > 0 ? totalStandingsData[0].maxTournamentMatches : 0} Match Max
                </p>
              </div>
              <Trophy size={20} className="text-yellow-400" />
            </div>
            <div className="p-6">
              {isTotalStandingsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <RefreshCw size={40} className="animate-spin text-yellow-600" />
                  <p className="text-sm font-bold opacity-40">Calcolo classifica totale in corso...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {totalStandingsData.map((entry, index) => (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      key={entry.name}
                      onClick={() => setSelectedPlayer(entry)}
                      className="flex items-center gap-4 p-4 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-2xl border border-[#141414]/5 cursor-pointer transition-colors group"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-lg shadow-sm ${
                        index === 0 ? 'bg-yellow-400 text-yellow-900' :
                        index === 1 ? 'bg-slate-300 text-slate-700' :
                        index === 2 ? 'bg-orange-300 text-orange-900' :
                        'bg-white text-[#141414]/40'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between group cursor-pointer">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="block font-bold truncate group-hover:text-yellow-700 transition-colors">{entry.name}</span>
                              {entry.isOrganizzatore && <span title="Organizzatore" className="text-xs">👑</span>}
                              {entry.isInvincibile && <span title="Invincibile: % Vittorie > 70%" className="text-xs">🏆</span>}
                              {entry.isBomber && <span title="Bomber: Più punti fatti" className="text-xs">🚀</span>}
                              {entry.isMuro && <span title="Muro: Meno punti subiti" className="text-xs">🧱</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] opacity-40 uppercase font-bold tracking-tighter">
                                {entry.matchesPlayed} Partite
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-30 md:opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 md:translate-x-2 group-hover:translate-x-0">
                            <span className="hidden sm:inline text-[8px] uppercase font-bold opacity-40">Dettagli</span>
                            <Info size={14} className="text-yellow-600" />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono font-bold text-xl leading-none">{entry.totalPoints}</span>
                        <span className="text-[10px] opacity-40 uppercase font-bold tracking-tighter">Punti Totali</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              <div className="mt-8 p-4 bg-[#F5F5F0] rounded-xl border border-[#141414]/5">
                <p className="text-[10px] text-center opacity-40 font-medium leading-relaxed">
                  * Include 2 punti bonus per ogni partita non giocata rispetto al massimo delle partite disputate nel torneo.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-8 border-t border-[#141414]/10 text-center">
        <p className="text-[10px] uppercase tracking-widest font-bold opacity-30">
          Ogni giornata locale equivale a una giornata di gioco • {numCourts * 4} giocatori fissi
        </p>
      </footer>
    </div>
  );
}
