<template>
  <section class="content-panel">
    <h1>Paramètres</h1>
    <h2>Badge NFC</h2>
    <p class="form-message">{{ badgeMessage }}</p>
    <div class="settings-actions">
      <button type="button" :disabled="pairing" @click="pairBadge">
        {{ pairing ? 'En attente du badge…' : 'Lier mon badge' }}
      </button>
      <button v-if="linked" type="button" class="secondary-button" @click="removeBadge">Délier mon badge</button>
    </div>
    <p v-if="actionMessage" class="form-message">{{ actionMessage }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { getBadgeStatus, startBadgeAction, unlinkBadge } from '../services/badge';

const linked = ref(false);
const pairing = ref(false);
const badgeMessage = ref('Chargement…');
const actionMessage = ref('');
let pairingSocket;

async function refreshStatus() {
  try {
    const data = await getBadgeStatus();
    linked.value = data.linked;
    badgeMessage.value = data.linked ? 'Un badge est lié à ce compte.' : 'Aucun badge lié à ce compte.';
  } catch (err) {
    badgeMessage.value = err.message;
  }
}

function pairBadge() {
  actionMessage.value = '';
  pairing.value = true;
  pairingSocket?.close();
  pairingSocket = startBadgeAction('/pairing/start', async (message) => {
    if (message.status === 'paired') {
      actionMessage.value = 'Badge lié avec succès !';
      pairing.value = false;
      await refreshStatus();
    } else if (message.status === 'already-linked') {
      actionMessage.value = 'Ce badge est déjà lié à un compte.';
      pairing.value = false;
    }
  }, (message) => {
    actionMessage.value = message;
    if (message !== 'Scanne ton badge dans les 30 secondes…') pairing.value = false;
  });
}

async function removeBadge() {
  try {
    await unlinkBadge();
    actionMessage.value = 'Badge délié.';
    await refreshStatus();
  } catch (err) {
    actionMessage.value = err.message;
  }
}

onMounted(refreshStatus);
</script>
