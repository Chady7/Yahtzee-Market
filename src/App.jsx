import React, { useEffect, useMemo, useState } from 'react';
import {
  ref,
  set,
  update,
  get,
  onValue,
  remove
} from 'firebase/database';
import { db } from './firebase';

const CATEGORIES = [
  { key: 'ones', label: 'As', section: 'upper' },
  { key: 'twos', label: 'Deux', section: 'upper' },
  { key: 'threes', label: 'Trois', section: 'upper' },
  { key: 'fours', label: 'Quatre', section: 'upper' },
  { key: 'fives', label: 'Cinq', section: 'upper' },
  { key: 'sixes', label: 'Six', section: 'upper' },
  { key: 'threeKind', label: 'Brelan', section: 'lower' },
  { key: 'fourKind', label: 'Carré', section: 'lower' },
  { key: 'fullHouse', label: 'Full', section: 'lower' },
  { key: 'smallStraight', label: 'Petite suite', section: 'lower' },
  { key: 'largeStraight', label: 'Grande suite', section: 'lower' },
  { key: 'yahtzee', label: 'Yahtzee', section: 'lower' },
  { key: 'chance', label: 'Chance', section: 'lower' }
];

const UPPER_KEYS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER_KEYS = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
const INITIAL_SCORECARD = Object.fromEntries(CATEGORIES.map((c) => [c.key, null]));

const uid = () => Math.random().toString(36).slice(2, 10);
const roomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const countsOf = (dice) => Object.values(dice.reduce((m, d) => ({ ...m, [d]: (m[d] || 0) + 1 }), {}));
const sortNums = (arr) => [...new Set(arr)].sort((a, b) => a - b);
const randomDie = () => 1 + Math.floor(Math.random() * 6);
const rollDiceWithHolds = (prevDice, holds) => prevDice.map((d, i) => (holds[i] ? d : randomDie()));

function getPlayerId() {
  const existing = localStorage.getItem('yahtzee_market_player_id');
  if (existing) return existing;
  const fresh = uid();
  localStorage.setItem('yahtzee_market_player_id', fresh);
  return fresh;
}

function computeBaseScore(categoryKey, dice) {
  const total = sum(dice);
  const counts = countsOf(dice).sort((a, b) => b - a);
  const unique = sortNums(dice);
  const hasRun = (len) => {
    let streak = 1;
    for (let i = 1; i < unique.length; i += 1) {
      if (unique[i] === unique[i - 1] + 1) {
        streak += 1;
        if (streak >= len) return true;
      } else {
        streak = 1;
      }
    }
    return false;
  };

  switch (categoryKey) {
    case 'ones': return dice.filter((d) => d === 1).length * 1;
    case 'twos': return dice.filter((d) => d === 2).length * 2;
    case 'threes': return dice.filter((d) => d === 3).length * 3;
    case 'fours': return dice.filter((d) => d === 4).length * 4;
    case 'fives': return dice.filter((d) => d === 5).length * 5;
    case 'sixes': return dice.filter((d) => d === 6).length * 6;
    case 'threeKind': return counts[0] >= 3 ? total : 0;
    case 'fourKind': return counts[0] >= 4 ? total : 0;
    case 'fullHouse': return counts[0] === 3 && counts[1] === 2 ? 25 : 0;
    case 'smallStraight': return hasRun(4) ? 30 : 0;
    case 'largeStraight': return hasRun(5) ? 40 : 0;
    case 'yahtzee': return counts[0] === 5 ? 50 : 0;
    case 'chance': return total;
    default: return 0;
  }
}

function getAllowedCategories(scorecard, dice) {
  const open = CATEGORIES.filter((c) => scorecard[c.key] === null).map((c) => c.key);
  const isYahtzeeRoll = countsOf(dice)[0] === 5;
  if (!isYahtzeeRoll || scorecard.yahtzee === null) return open;

  const face = dice[0];
  const matchingUpper = UPPER_KEYS[face - 1];

  if (scorecard[matchingUpper] === null) return [matchingUpper];

  const openLower = LOWER_KEYS.filter((k) => scorecard[k] === null);
  if (openLower.length > 0) return openLower;

  return open;
}

function scoreForCategory(scorecard, categoryKey, dice) {
  const isExtraYahtzee = countsOf(dice)[0] === 5 && scorecard.yahtzee !== null && categoryKey !== 'yahtzee';
  if (!isExtraYahtzee) return computeBaseScore(categoryKey, dice);

  const total = sum(dice);
  if (UPPER_KEYS.includes(categoryKey)) return total;
  if (categoryKey === 'threeKind' || categoryKey === 'fourKind' || categoryKey === 'chance') return total;
  if (categoryKey === 'fullHouse') return 25;
  if (categoryKey === 'smallStraight') return 30;
  if (categoryKey === 'largeStraight') return 40;
  return computeBaseScore(categoryKey, dice);
}

function buildPlayer(name, playerId) {
  return {
    id: playerId,
    name,
    coins: 100,
    scorecard: { ...INITIAL_SCORECARD },
    upperBonus: 0,
    yahtzeeBonusCount: 0,
    filledCount: 0,
    totalScore: 0,
    finalScore: 100,
    removed: false,
    joinedAt: Date.now()
  };
}

function recalcPlayer(player) {
  const upperSubtotal = UPPER_KEYS.reduce((acc, key) => acc + (player.scorecard[key] ?? 0), 0);
  const upperBonus = upperSubtotal >= 63 ? 35 : 0;
  const lowerTotal = LOWER_KEYS.reduce((acc, key) => acc + (player.scorecard[key] ?? 0), 0);
  const totalScore = upperSubtotal + upperBonus + lowerTotal + ((player.yahtzeeBonusCount || 0) * 100);
  const filledCount = Object.values(player.scorecard).filter((v) => v !== null).length;
  return {
    ...player,
    upperBonus,
    totalScore,
    filledCount,
    finalScore: totalScore + player.coins
  };
}

function App() {
  const [playerId] = useState(getPlayerId());
  const [pseudo, setPseudo] = useState(localStorage.getItem('yahtzee_market_name') || '');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [room, setRoom] = useState(null);
  const [roomId, setRoomId] = useState(new URLSearchParams(window.location.search).get('room') || '');
  const [statusText, setStatusText] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!roomId) return undefined;
    const roomRef = ref(db, `rooms/${roomId}`);
    return onValue(roomRef, (snap) => {
      const data = snap.val();
      setRoom(data || null);
    });
  }, [roomId]);

  const me = room?.players?.[playerId] || null;
  const players = useMemo(() => {
    const all = Object.values(room?.players || {}).filter((p) => !p.removed);
    return all.sort((a, b) => a.joinedAt - b.joinedAt);
  }, [room]);

  const orderedPlayers = useMemo(() => {
    const order = room?.order || [];
    return order.map((id) => room?.players?.[id]).filter((p) => p && !p.removed);
  }, [room]);

  const currentTurn = room?.currentTurn;
  const activePlayer = currentTurn ? room?.players?.[currentTurn.activePlayerId] : null;
  const seller = currentTurn ? room?.players?.[currentTurn.sellerId] : null;
  const iAmHost = room?.hostId === playerId;
  const iAmActive = currentTurn?.activePlayerId === playerId;
  const iAmSeller = currentTurn?.sellerId === playerId;
  const auction = currentTurn?.auction || null;

  const remainingAuctionSeconds = auction?.phase === 'bidding'
    ? Math.max(0, Math.ceil((auction.biddingEndsAt - clock) / 1000))
    : auction?.phase === 'decision'
      ? Math.max(0, Math.ceil((auction.decisionEndsAt - clock) / 1000))
      : 0;

  useEffect(() => {
    if (!roomId || !auction) return;
    if (auction.phase === 'bidding' && auction.biddingEndsAt <= clock && iAmSeller) {
      moveAuctionToDecision();
    }
    if (auction.phase === 'decision' && auction.decisionEndsAt <= clock && iAmSeller) {
      closeAuctionWithoutSale();
    }
  }, [clock, auction, roomId]);

  async function createRoom() {
    const name = pseudo.trim();
    if (!name) return setStatusText('Entre un pseudo.');
    localStorage.setItem('yahtzee_market_name', name);
    let newRoom = roomCode();
    const roomRef = ref(db, `rooms/${newRoom}`);
    await set(roomRef, {
      id: newRoom,
      hostId: playerId,
      status: 'lobby',
      createdAt: Date.now(),
      order: [playerId],
      totalGlobalTurns: 0,
      globalTurnIndex: 0,
      turnIndex: 0,
      currentTurn: null,
      players: {
        [playerId]: buildPlayer(name, playerId)
      }
    });
    const url = `${window.location.origin}${window.location.pathname}?room=${newRoom}`;
    window.history.replaceState({}, '', url);
    setRoomId(newRoom);
    setRoomIdInput(newRoom);
    setStatusText('Salle créée. Partage le lien.');
  }

  async function joinRoom() {
    const name = pseudo.trim();
    const targetRoom = roomIdInput.trim().toUpperCase();
    if (!name || !targetRoom) return setStatusText('Entre un pseudo et un code de salle.');
    localStorage.setItem('yahtzee_market_name', name);
    const roomRef = ref(db, `rooms/${targetRoom}`);
    const snap = await get(roomRef);
    if (!snap.exists()) return setStatusText('Salle introuvable.');
    const data = snap.val();
    if (data.status !== 'lobby') return setStatusText('La partie a déjà commencé.');
    const activeCount = Object.values(data.players || {}).filter((p) => !p.removed).length;
    if (activeCount >= 7) return setStatusText('La salle est pleine (7 joueurs max).');

    await update(roomRef, {
      [`players/${playerId}`]: buildPlayer(name, playerId),
      order: [...(data.order || []), playerId]
    });
    const url = `${window.location.origin}${window.location.pathname}?room=${targetRoom}`;
    window.history.replaceState({}, '', url);
    setRoomId(targetRoom);
    setStatusText('Salle rejointe.');
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    await navigator.clipboard.writeText(url);
    setStatusText('Lien copié.');
  }

  function firstTurn(order) {
    return {
      sellerId: order[0],
      activePlayerId: order[0],
      rollNumber: 0,
      dice: [1, 1, 1, 1, 1],
      holds: [false, false, false, false, false],
      auction: null
    };
  }

  async function startGame() {
    if (!iAmHost) return;
    const livePlayers = players;
    if (livePlayers.length < 1) return setStatusText('Il faut au moins 1 joueur.');
    const order = livePlayers.map((p) => p.id);
    await update(ref(db, `rooms/${roomId}`), {
      status: 'in_progress',
      order,
      totalGlobalTurns: 13 * order.length,
      globalTurnIndex: 0,
      turnIndex: 0,
      currentTurn: firstTurn(order)
    });
  }

  async function rollFirst() {
    if (!iAmActive || currentTurn.rollNumber !== 0) return;
    await update(ref(db, `rooms/${roomId}/currentTurn`), {
      rollNumber: 1,
      dice: Array.from({ length: 5 }, randomDie),
      holds: [false, false, false, false, false]
    });
  }

  async function toggleHold(index) {
    if (!iAmActive) return;
    if (![1, 2].includes(currentTurn.rollNumber)) return;
    const holds = [...currentTurn.holds];
    holds[index] = !holds[index];
    await update(ref(db, `rooms/${roomId}/currentTurn`), { holds });
  }

  async function reroll() {
    if (!iAmActive) return;
    if (![1, 2].includes(currentTurn.rollNumber)) return;
    const nextRoll = currentTurn.rollNumber + 1;
    await update(ref(db, `rooms/${roomId}/currentTurn`), {
      rollNumber: nextRoll,
      dice: rollDiceWithHolds(currentTurn.dice, currentTurn.holds)
    });
  }

  async function openAuction() {
    if (!iAmActive || currentTurn.rollNumber !== 2) return;
    const now = Date.now();
    await update(ref(db, `rooms/${roomId}/currentTurn`), {
      auction: {
        phase: 'bidding',
        biddingEndsAt: now + 20000,
        decisionEndsAt: null,
        bids: {}
      }
    });
  }

  async function moveAuctionToDecision() {
    if (!iAmSeller || auction?.phase !== 'bidding') return;
    await update(ref(db, `rooms/${roomId}/currentTurn/auction`), {
      phase: 'decision',
      decisionEndsAt: Date.now() + 10000
    });
  }

  async function placeBid() {
    const amount = Number(bidAmount);
    if (!auction || auction.phase !== 'bidding') return;
    if (!me || me.filledCount >= 13 || me.coins < amount || amount <= 0) {
      return setStatusText('Offre invalide.');
    }
    if (playerId === currentTurn.sellerId) return;
    if (auction.bids?.[playerId]) return setStatusText('Une seule offre par joueur.');
    await set(ref(db, `rooms/${roomId}/currentTurn/auction/bids/${playerId}`), {
      playerId,
      amount,
      createdAt: Date.now()
    });
    setBidAmount('');
  }

  async function closeAuctionWithoutSale() {
    if (!iAmSeller || auction?.phase !== 'decision') return;
    await remove(ref(db, `rooms/${roomId}/currentTurn/auction`));
  }

  async function acceptBid(buyerId, amount) {
    if (!iAmSeller || auction?.phase !== 'decision') return;
    const buyer = room.players[buyerId];
    if (!buyer || buyer.removed || buyer.coins < amount || buyer.filledCount >= 13) return;
    const sellerData = room.players[currentTurn.sellerId];
    await update(ref(db, `rooms/${roomId}`), {
      [`players/${buyerId}/coins`]: buyer.coins - amount,
      [`players/${currentTurn.sellerId}/coins`]: sellerData.coins + amount,
      [`players/${buyerId}/finalScore`]: buyer.finalScore - amount,
      [`players/${currentTurn.sellerId}/finalScore`]: sellerData.finalScore + amount,
      'currentTurn/activePlayerId': buyerId,
      'currentTurn/auction': {
        phase: 'sold',
        soldTo: buyerId,
        amount,
        bids: auction.bids || {}
      }
    });
  }

  async function scoreCategory(categoryKey) {
    if (!iAmActive || currentTurn.rollNumber < 1) return;
    const player = room.players[playerId];
    if (player.scorecard[categoryKey] !== null) return;
    const allowed = getAllowedCategories(player.scorecard, currentTurn.dice);
    if (!allowed.includes(categoryKey)) return setStatusText('Cette case n’est pas autorisée pour ce roll.');

    const categoryScore = scoreForCategory(player.scorecard, categoryKey, currentTurn.dice);
    const isBonusYahtzee = countsOf(currentTurn.dice)[0] === 5 && player.scorecard.yahtzee === 50 && categoryKey !== 'yahtzee';

    const updatedPlayer = recalcPlayer({
      ...player,
      scorecard: { ...player.scorecard, [categoryKey]: categoryScore },
      yahtzeeBonusCount: player.yahtzeeBonusCount + (isBonusYahtzee ? 1 : 0)
    });

    await update(ref(db, `rooms/${roomId}`), {
      [`players/${playerId}`]: updatedPlayer
    });
    await advanceTurn();
  }

  async function advanceTurn() {
    const nextGlobal = (room.globalTurnIndex || 0) + 1;
    if (nextGlobal >= room.totalGlobalTurns) {
      await update(ref(db, `rooms/${roomId}`), {
        status: 'finished',
        globalTurnIndex: nextGlobal,
        currentTurn: null
      });
      return;
    }

    const order = room.order || [];
    let idx = room.turnIndex || 0;
    let nextId = null;
    for (let i = 0; i < order.length; i += 1) {
      idx = (idx + 1) % order.length;
      const candidate = room.players[order[idx]];
      if (candidate && !candidate.removed && candidate.filledCount < 13) {
        nextId = candidate.id;
        break;
      }
    }

    if (!nextId) {
      await update(ref(db, `rooms/${roomId}`), {
        status: 'finished',
        globalTurnIndex: nextGlobal,
        currentTurn: null
      });
      return;
    }

    await update(ref(db, `rooms/${roomId}`), {
      globalTurnIndex: nextGlobal,
      turnIndex: idx,
      currentTurn: {
        sellerId: nextId,
        activePlayerId: nextId,
        rollNumber: 0,
        dice: [1, 1, 1, 1, 1],
        holds: [false, false, false, false, false],
        auction: null
      }
    });
  }

  async function removePlayer(targetId) {
    if (!iAmHost || !room?.players?.[targetId]) return;
    const target = room.players[targetId];
    await update(ref(db, `rooms/${roomId}`), {
      [`players/${targetId}/removed`]: true,
      [`players/${targetId}/name`]: `${target.name} (exclu)`
    });
  }

  const scoreboard = useMemo(() => {
    return [...players].sort((a, b) => b.finalScore - a.finalScore);
  }, [players]);

  const visibleBids = useMemo(() => {
    if (!auction?.bids) return [];
    return Object.values(auction.bids)
      .map((bid) => ({ ...bid, name: room?.players?.[bid.playerId]?.name || 'Inconnu' }))
      .sort((a, b) => b.amount - a.amount);
  }, [auction, room]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Yahtzee Marché</h1>
          <p>Yahtzee classique + enchères privées après le 2e lancer.</p>
        </div>
        {roomId && <span className="pill">Salle {roomId}</span>}
      </header>

      {!roomId && (
        <section className="card auth-card">
          <h2>Créer ou rejoindre une salle</h2>
          <label>
            Pseudo
            <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} />
          </label>
          <div className="auth-grid">
            <button onClick={createRoom}>Créer une salle</button>
            <div className="join-block">
              <input placeholder="Code de salle" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())} />
              <button onClick={joinRoom}>Rejoindre</button>
            </div>
          </div>
          {statusText && <p className="status">{statusText}</p>}
        </section>
      )}

      {room && (
        <main className="layout">
          <section className="left-column">
            <div className="card">
              <div className="row-between">
                <h2>Lobby / Partie</h2>
                <button onClick={copyLink}>Copier le lien</button>
              </div>
              <p>Ordre des tours: ordre d’arrivée dans la salle.</p>
              <p>Tour global: {room.globalTurnIndex} / {room.totalGlobalTurns || '-'} </p>
              <p>Statut: {room.status === 'lobby' ? 'En lobby' : room.status === 'in_progress' ? 'En cours' : 'Terminée'}</p>
              {room.status === 'lobby' && iAmHost && <button onClick={startGame}>Lancer la partie</button>}
              {statusText && <p className="status">{statusText}</p>}
            </div>

            <div className="card">
              <h2>Joueurs</h2>
              <div className="players-list">
                {orderedPlayers.length ? orderedPlayers.map((p, index) => (
                  <div key={p.id} className={`player-row ${currentTurn?.activePlayerId === p.id ? 'active' : ''}`}>
                    <div>
                      <strong>{index + 1}. {p.name}</strong>
                      <div className="muted">{p.coins} pièces · {p.filledCount}/13 cases · score final {p.finalScore}</div>
                    </div>
                    {iAmHost && p.id !== playerId && room.status !== 'finished' && (
                      <button className="danger" onClick={() => removePlayer(p.id)}>Exclure</button>
                    )}
                  </div>
                )) : <p>Aucun joueur.</p>}
              </div>
            </div>

            {currentTurn && (
              <div className="card">
                <h2>Tour actuel</h2>
                <p>Vendeur: <strong>{seller?.name}</strong></p>
                <p>Joueur actif: <strong>{activePlayer?.name}</strong></p>
                <p>Lancer: <strong>{currentTurn.rollNumber} / 3</strong></p>
                <div className="dice-row">
                  {currentTurn.dice.map((die, index) => (
                    <button
                      key={`${die}-${index}`}
                      className={`die ${currentTurn.holds[index] ? 'held' : ''}`}
                      onClick={() => toggleHold(index)}
                      disabled={!iAmActive || ![1, 2].includes(currentTurn.rollNumber)}
                    >
                      {die}
                    </button>
                  ))}
                </div>

                <div className="actions-grid">
                  {iAmActive && currentTurn.rollNumber === 0 && <button onClick={rollFirst}>1er lancer</button>}
                  {iAmActive && [1, 2].includes(currentTurn.rollNumber) && !(currentTurn.rollNumber === 2 && auction && auction.phase !== 'sold') && <button onClick={reroll}>{currentTurn.rollNumber === 1 ? '2e lancer' : '3e lancer'}</button>}
                  {iAmActive && currentTurn.rollNumber === 2 && !auction && <button onClick={openAuction}>Ouvrir les enchères</button>}
                </div>

                {auction && (
                  <div className="auction-box">
                    <h3>Enchère</h3>
                    <p>Phase: {auction.phase === 'bidding' ? 'offres' : auction.phase === 'decision' ? 'décision du vendeur' : auction.phase === 'sold' ? 'vendu' : 'fermée'}</p>
                    {(auction.phase === 'bidding' || auction.phase === 'decision') && <p>Temps restant: {remainingAuctionSeconds}s</p>}
                    {auction.phase === 'bidding' && !iAmSeller && me && me.filledCount < 13 && (
                      <div className="bid-row">
                        <input type="number" min="1" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="Montant" />
                        <button onClick={placeBid}>Envoyer mon offre</button>
                      </div>
                    )}
                    {auction.phase === 'bidding' && iAmSeller && <p>Les autres joueurs peuvent soumettre une seule offre privée.</p>}
                    {iAmSeller && (auction.phase === 'decision' || auction.phase === 'sold') && (
                      <div>
                        <h4>Offres reçues</h4>
                        {visibleBids.length === 0 ? <p>Aucune offre.</p> : visibleBids.map((bid) => (
                          <div key={bid.playerId} className="bid-item">
                            <span>{bid.name}: {bid.amount} pièces</span>
                            {auction.phase === 'decision' && <button onClick={() => acceptBid(bid.playerId, bid.amount)}>Accepter</button>}
                          </div>
                        ))}
                        {auction.phase === 'decision' && <button onClick={closeAuctionWithoutSale}>Refuser toutes les offres</button>}
                      </div>
                    )}
                    {!iAmSeller && auction.phase !== 'bidding' && <p>Enchère en cours, attente de la décision du vendeur.</p>}
                    {auction.phase === 'sold' && <p>Roll vendu à {room.players?.[auction.soldTo]?.name} pour {auction.amount} pièces.</p>}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="center-column">
            <div className="card">
              <h2>Mon score</h2>
              {me ? (
                <table className="score-table">
                  <thead>
                    <tr><th>Case</th><th>Valeur</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.map((cat) => {
                      const allowed = currentTurn && iAmActive ? getAllowedCategories(me.scorecard, currentTurn.dice) : [];
                      const preview = currentTurn ? scoreForCategory(me.scorecard, cat.key, currentTurn.dice) : 0;
                      return (
                        <tr key={cat.key}>
                          <td>{cat.label}</td>
                          <td>{me.scorecard[cat.key] === null ? '-' : me.scorecard[cat.key]}</td>
                          <td>
                            {me.scorecard[cat.key] === null && iAmActive && currentTurn?.rollNumber >= 1 && allowed.includes(cat.key) && (
                              <button onClick={() => scoreCategory(cat.key)}>Valider ({preview})</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p>En attente...</p>}
              {me && (
                <div className="summary-grid">
                  <div>Pièces: <strong>{me.coins}</strong></div>
                  <div>Bonus supérieur: <strong>{me.upperBonus}</strong></div>
                  <div>Bonus Yahtzee: <strong>{(me.yahtzeeBonusCount || 0) * 100}</strong></div>
                  <div>Score final: <strong>{me.finalScore}</strong></div>
                </div>
              )}
            </div>
          </section>

          <section className="right-column">
            <div className="card">
              <h2>Classement</h2>
              <ol className="ranking">
                {scoreboard.map((p) => (
                  <li key={p.id}>
                    <strong>{p.name}</strong>
                    <span>{p.finalScore}</span>
                  </li>
                ))}
              </ol>
            </div>
            {room.status === 'finished' && (
              <div className="card">
                <h2>Partie terminée</h2>
                <p>Le score final = score Yahtzee + pièces restantes.</p>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
