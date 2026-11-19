<template>
  <div class="game-page scratch-page">
    <div class="game-shell">
      <div class="game-layout">
        <aside class="game-panel leaderboard">
          <h2 class="panel-heading">🏆 Classement</h2>
          <p class="leaderboard-kicker">Les plus chanceux du club</p>
          <div v-for="player in leaderboard" :key="player.name" class="leader-row" :class="{ 'player-row': player.current }">
            <span class="leader-rank">{{ player.rank }}</span><strong>{{ player.name }}</strong><span class="leader-score">{{ player.score }}</span>
          </div>
        </aside>

        <section class="game-center scratch-center">
          <h2 class="game-title">{{ selected.name }}</h2>
          <div class="scratch-stage">
            <div class="scratch-ticket">
              <img class="ticket-art ticket-size" :src="selected.image" :alt="'Ticket à gratter ' + selected.name">
              <div v-if="isRevealed" class="revealed-prize">
                <strong>{{ selected.gain }}</strong>
                <span>POINTS</span>
              </div>
              <img
                class="ticket-art ticket-cover"
                :class="{ 'is-scratching': isScratching, 'is-scratched': isRevealed }"
                :style="{ '--scratch-progress': scratchProgress + '%' }"
                :src="selected.image"
                :alt="'Couverture à gratter du ticket ' + selected.name"
              >
            </div>
          </div>
          <div v-if="!isRevealed" class="qte-panel" aria-live="polite">
            <p class="qte-instruction">Qte2Fou</p>
            <div class="qte-sequence">
              <span v-for="(key, index) in qteSequence" :key="index" class="qte-key" :class="{ 'is-done': index < currentStep, 'is-next': index === currentStep }">{{ key }}</span>
            </div>
            <p class="qte-feedback" :class="{ 'has-error': qteError }">{{ qteError ? 'Raté ! Recommence la séquence.' : currentStep + ' / ' + qteSequence.length + ' touches' }}</p>
          </div>
        </section>

        <aside class="game-panel game-picker">
          <h2 class="panel-heading">🎟 Choisir un jeu</h2>
          <section v-for="group in ticketGroups" :key="group.price" class="ticket-level">
            <h3>{{ group.price }} <span>{{ group.label }}</span></h3>
            <a
              v-for="ticket in group.tickets"
              :key="ticket.name"
              href="#"
              :class="{ 'is-selected': selected.name === ticket.name }"
              @click.prevent="selectTicket(ticket)"
            >
              <img class="mini-ticket-art" :src="ticket.image" :alt="'Aperçu ' + ticket.name">
              <span><strong>{{ ticket.name }}</strong><small>{{ ticket.description }}</small></span>
            </a>
          </section>
        </aside>
      </div>
      <p class="sample-note">Maquette visuelle uniquement — tickets, scores et gains fictifs. Aucun jeu ni paiement n'est activé.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import ticket1 from '../assets/tickets/ticket_1.JPG';
import ticket2 from '../assets/tickets/ticket_2.JPG';
import ticket3 from '../assets/tickets/ticket_3.JPG';

const tickets = [
  { name: 'Étoile Filante', price: '5 €', group: '5 €', qteLength: 4, image: ticket1, gain: '10', description: '', message: 'Bravo ! Vous gagnez 10 points fictifs.' },
  { name: 'Diamant Rouge', price: '10 €', group: '10 €', qteLength: 7, image: ticket2, gain: '25', description: '', message: 'Magnifique ! Vous gagnez 25 points fictifs.' },
  { name: 'Royale', price: '20 €', group: '20 €', qteLength: 10, image: ticket3, gain: '50', description: '', message: 'Royal ! Vous gagnez 50 points fictifs.' }
];

const selected = ref(tickets[2]);
const isScratching = ref(false);
const isRevealed = ref(false);
const qteKeys = ['A', 'S', 'D', 'F', 'J', 'K', 'L'];
const qteSequence = ref(makeSequence(selected.value.qteLength));
const currentStep = ref(0);
const qteError = ref(false);
const scratchProgress = computed(() => Math.round((currentStep.value / qteSequence.value.length) * 100));

function makeSequence(length) {
  return Array.from({ length }, () => qteKeys[Math.floor(Math.random() * qteKeys.length)]);
}

function resetQte() {
  qteSequence.value = makeSequence(selected.value.qteLength);
  currentStep.value = 0;
  qteError.value = false;
  isScratching.value = false;
  isRevealed.value = false;
}

function handleQteKeydown(event) {
  if (isRevealed.value || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const pressedKey = event.key.toUpperCase();
  if (!qteKeys.includes(pressedKey)) return;

  if (pressedKey === qteSequence.value[currentStep.value]) {
    qteError.value = false;
    currentStep.value += 1;
    isScratching.value = true;
    if (currentStep.value === qteSequence.value.length) {
      isRevealed.value = true;
      isScratching.value = false;
    }
  } else {
    currentStep.value = 0;
    isScratching.value = false;
    qteError.value = true;
  }
}

function selectTicket(ticket) {
  selected.value = ticket;
  resetQte();
}

onMounted(() => window.addEventListener('keydown', handleQteKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleQteKeydown));

const ticketGroups = computed(() => [
  { price: '5 €', label: 'Débutant', tickets: tickets.filter(t => t.group === '5 €') },
  { price: '10 €', label: 'Classique', tickets: tickets.filter(t => t.group === '10 €') },
  { price: '20 €', label: 'Chaperonné', tickets: tickets.filter(t => t.group === '20 €') }
]);

const leaderboard = [
  { rank: '🥇', name: '', score: ' pts' },
  { rank: '🥈', name: '', score: ' pts' },
  { rank: '🥉', name: '', score: ' pts' },
  { rank: '4', name: '', score: ' pts' },
  { rank: '5', name: '', score: ' pts' },
  { rank: '6', name: 'vous', score: ' pts', current: true }
];
</script>

<style scoped>
.scratch-ticket {
  position: relative;
  width: min(100%, 330px);
  overflow: hidden;
  border-radius: 13px;
  background: #f5e8ce;
  box-shadow: 0 13px 22px rgba(75, 45, 32, .24);
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
  color: #7b2f18;
  background: #fff4d9;
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
  color: var(--ink, #49372c);
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
  border: 2px solid #c9b99e;
  border-radius: 7px;
  background: #fffaf0;
  color: #5d4938;
  font-size: 1rem;
  font-weight: 900;
  box-shadow: 0 3px 0 #c9b99e;
}
.qte-key.is-next {
  border-color: var(--caramel, #b9783f);
  background: #f7dfb9;
  transform: translateY(-2px);
  box-shadow: 0 5px 0 #b9783f;
}
.qte-key.is-done {
  border-color: #64865c;
  background: #e1efd9;
  color: #365b32;
  box-shadow: 0 2px 0 #64865c;
}
.qte-feedback {
  margin: 12px 0 0;
  color: #64865c;
  font-size: .9rem;
  font-weight: 700;
}
.qte-feedback.has-error {
  color: #b33b2e;
}
.ticket-level a.is-selected { border-color: var(--caramel); background: var(--cream-deep); }
@media (prefers-reduced-motion: reduce) {
  .ticket-cover { transition: none; }
}
</style>
