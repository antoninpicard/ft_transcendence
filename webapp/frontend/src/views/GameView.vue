<template>
  <div class="game-page scratch-page">
    <div class="game-shell">
      <div class="game-layout">
        <aside class="game-panel leaderboard">
          <h2 class="panel-heading">🏆 Classement</h2>
          <p class="leaderboard-kicker">Les plus chanceux du club</p>
          <div v-for="player in leaderboardRows" :key="player.key" class="leader-row" :class="{ 'player-row': player.current }">
            <span class="leader-rank">{{ player.rank }}</span><strong>{{ player.name }}</strong><span class="leader-score">{{ player.score }}</span>
          </div>
          <p v-if="leaderboard.error.value" class="game-error" role="alert">{{ leaderboard.error.value }}</p>
        </aside>

        <section class="game-center scratch-center">
          <template v-if="game.ticket.value">
            <h2 class="game-title">{{ game.ticket.value.name }}</h2>
            <div class="scratch-stage">
              <div class="scratch-ticket">
                <img class="ticket-art ticket-size" :src="imageOf(game.ticket.value)" :alt="'Ticket à gratter ' + game.ticket.value.name">
                <div v-if="game.state.value === 'revealed'" class="revealed-prize">
                  <strong>{{ game.points.value }}</strong>
                  <span>POINTS</span>
                </div>
                <img
                  class="ticket-art ticket-cover"
                  :class="{ 'is-scratched': game.state.value === 'revealed' }"
                  :style="{ '--scratch-progress': game.progress.value + '%' }"
                  :src="imageOf(game.ticket.value)"
                  :alt="'Couverture à gratter du ticket ' + game.ticket.value.name"
                >
              </div>
            </div>

            <div class="qte-panel" aria-live="polite">
              <template v-if="game.state.value === 'starting' || game.state.value === 'scratching'">
                <p class="qte-instruction">Qte2Fou</p>
                <div class="qte-sequence">
                  <span v-for="(key, index) in game.sequence.value" :key="index" class="qte-key" :class="{ 'is-done': index < game.step.value, 'is-next': index === game.step.value }">{{ key }}</span>
                </div>
                <p class="qte-feedback" :class="{ 'has-error': game.mistake.value }">{{ feedback }}</p>
              </template>
              <p v-else-if="game.state.value === 'revealing'" class="qte-instruction">Ouverture du ticket…</p>
              <button v-else-if="game.state.value === 'revealed'" type="button" @click="game.start(game.ticket.value)">Rejouer</button>
              <template v-else-if="game.state.value === 'error'">
                <p class="game-error" role="alert">{{ game.error.value }}</p>
                <button type="button" @click="game.retry()">Réessayer</button>
              </template>
            </div>
          </template>
          <p v-else-if="catalogError" class="game-error" role="alert">{{ catalogError }}</p>
          <p v-else class="qte-instruction">Chargement des tickets…</p>
        </section>

        <aside class="game-panel game-picker">
          <h2 class="panel-heading">🎟 Choisir un jeu</h2>
          <section v-for="group in ticketGroups" :key="group.price" class="ticket-level">
            <h3>{{ group.price }} <span>{{ group.level }}</span></h3>
            <a
              v-for="ticket in group.tickets"
              :key="ticket.id"
              href="#"
              :class="{ 'is-selected': game.ticket.value?.id === ticket.id }"
              @click.prevent="game.start(ticket)"
            >
              <img class="mini-ticket-art" :src="imageOf(ticket)" :alt="'Aperçu ' + ticket.name">
              <span><strong>{{ ticket.name }}</strong><small>{{ ticket.points }} points à gagner</small></span>
            </a>
          </section>
        </aside>
      </div>
      <p class="sample-note">Points fictifs — aucun paiement n'est activé.</p>
    </div>
  </div>
</template>

<script setup>
// This view only displays the game: the tickets come from the API (GET /api/game/catalog),
// the ticket state machine lives in useScratchTicket, the scoreboard in useLeaderboard.
import { computed, ref, onMounted, onUnmounted } from 'vue';
import '../game.css';
import { request } from '../api.js';
import { currentUser } from '../session.js';
import { useScratchTicket } from '../game/useScratchTicket.js';
import { useLeaderboard } from '../game/useLeaderboard.js';
import ticket1 from '../assets/tickets/ticket_1.JPG';
import ticket2 from '../assets/tickets/ticket_2.JPG';
import ticket3 from '../assets/tickets/ticket_3.JPG';

// The images are the only ticket data kept in the front
const IMAGES = { 'etoile-filante': ticket1, 'diamant-rouge': ticket2, royale: ticket3 };
const imageOf = (ticket) => IMAGES[ticket.id] ?? ticket1;

const catalog = ref([]);
const catalogError = ref('');
const leaderboard = useLeaderboard();
const game = useScratchTicket({ onRevealed: leaderboard.set });

async function loadCatalog() {
  const response = await request('GET', '/api/game/catalog');
  if (!response.ok) {
    catalogError.value = response.error || 'Tickets indisponibles.';
    return;
  }
  catalog.value = response.data.items;
  game.setKeys(response.data.keys);
  // Start with the most expensive ticket, as before
  if (catalog.value.length) game.start(catalog.value[catalog.value.length - 1]);
}

// Tickets grouped by price, in catalog order
const ticketGroups = computed(() => {
  const groups = [];
  for (const ticket of catalog.value) {
    let group = groups.find((g) => g.price === ticket.price);
    if (!group) groups.push(group = { price: ticket.price, level: ticket.level, tickets: [] });
    group.tickets.push(ticket);
  }
  return groups;
});

const feedback = computed(() => {
  if (game.state.value === 'starting') return 'Préparation du ticket…';
  if (game.mistake.value) return 'Raté ! Recommence la séquence.';
  return game.step.value + ' / ' + game.sequence.value.length + ' touches';
});

function handleKeydown(event) {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (game.press(event.key.toUpperCase())) event.preventDefault();
}

const MEDALS = ['🥇', '🥈', '🥉'];
const rankLabel = (rank) => (rank === null ? '—' : MEDALS[rank - 1] ?? String(rank));

const leaderboardRows = computed(() => {
  const myId = currentUser.value?.id;
  const { top, me } = leaderboard.board.value;
  const rows = top.map((entry) => ({
    key: entry.user.id,
    rank: rankLabel(entry.rank),
    name: entry.user.id === myId ? entry.user.username + ' (vous)' : entry.user.username,
    score: entry.score + ' pts',
    current: entry.user.id === myId,
  }));
  if (!rows.some((row) => row.current)) {
    rows.push({ key: 'me', rank: rankLabel(me.rank), name: 'vous', score: me.score + ' pts', current: true });
  }
  return rows;
});

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  loadCatalog();
  leaderboard.startPolling();
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  leaderboard.stopPolling();
});
</script>

<style scoped>
.scratch-ticket {
  position: relative;
  width: min(100%, 330px);
  overflow: hidden;
  border-radius: 13px;
  background: var(--surface-soft);
  box-shadow: 0 13px 22px rgb(var(--shadow-rgb) / 0.24);
}
.ticket-art {
  display: block;
  width: 100%;
  height: auto;
}
.ticket-size {
  visibility: hidden;
}
.ticket-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  clip-path: inset(0 0 0 var(--scratch-progress, 0%));
  transition: clip-path .16s ease-out;
  pointer-events: none;
}
.ticket-cover.is-scratched {
  visibility: hidden;
}
.revealed-prize {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--prize-text);
  background: var(--prize-bg);
  opacity: 1;
}
.revealed-prize strong {
  font-size: clamp(3rem, 10vw, 5rem);
  line-height: 1;
  font-weight: 900;
}
.revealed-prize span {
  font-size: .8rem;
  font-weight: 900;
  letter-spacing: .18em;
}
.mini-ticket-art {
  display: block;
  width: 58px;
  height: 42px;
  flex: 0 0 58px;
  object-fit: cover;
  border-radius: 5px;
}
.qte-panel {
  margin: 18px auto 8px;
  text-align: center;
}
.qte-instruction {
  margin: 0 0 10px;
  color: var(--text);
  font-weight: 700;
}
.qte-sequence {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.qte-key {
  display: grid;
  width: 38px;
  height: 42px;
  place-items: center;
  border: 2px solid var(--key-border);
  border-radius: 7px;
  background: var(--key-bg);
  color: var(--key-text);
  font-size: 1rem;
  font-weight: 900;
  box-shadow: 0 3px 0 var(--key-border);
}
.qte-key.is-next {
  border-color: var(--key-next-border);
  background: var(--key-next-bg);
  transform: translateY(-2px);
  box-shadow: 0 5px 0 var(--key-next-border);
}
.qte-key.is-done {
  border-color: var(--success-border);
  background: var(--success-bg);
  color: var(--success-text);
  box-shadow: 0 2px 0 var(--success-border);
}
.qte-feedback {
  margin: 12px 0 0;
  color: var(--success-text);
  font-size: .9rem;
  font-weight: 700;
}
.qte-feedback.has-error {
  color: var(--danger);
}
.game-error {
  margin: 10px 0 0;
  color: var(--danger);
  font-size: .85rem;
  font-weight: 700;
}
.ticket-level a.is-selected { border-color: var(--accent-strong); background: var(--surface-soft); }
@media (prefers-reduced-motion: reduce) {
  .ticket-cover { transition: none; }
}
</style>
