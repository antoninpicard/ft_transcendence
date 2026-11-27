import { computed, ref } from "vue";
import { request } from "../api.js";
import { applyKey } from "./scratchRules.js";

// One ticket, as a state machine:
//   idle ──start──▶ starting ──▶ scratching ──last key──▶ revealing ──▶ revealed
//                      │                                     │
//                      └──────────────▶ error ◀──────────────┘
// The server draws the sequence (POST /api/game/tickets) and pays the prize
// (POST /api/game/tickets/:id/reveal): the prize is only shown once the server confirms it.
export function useScratchTicket({ onRevealed } = {})
{
	const state = ref("idle");
	const ticket = ref(null);
	const sequence = ref([]);
	const step = ref(0);
	const mistake = ref(false);
	const points = ref(null);
	const error = ref("");

	let playId = null;
	let canRetryReveal = false;
	// Each start gets a number: the answer of a ticket the player already left is ignored
	let attempt = 0;

	const progress = computed(() => (sequence.value.length ? Math.round((step.value / sequence.value.length) * 100) : 0));

	function fail(message, retryReveal)
	{
		error.value = message;
		canRetryReveal = retryReveal;
		state.value = "error";
	}

	async function start(item)
	{
		// The reveal request is already sent: leaving now would hide a prize that is paid
		if (state.value === "revealing")
			return;
		const current = ++attempt;
		ticket.value = item;
		state.value = "starting";
		sequence.value = [];
		step.value = 0;
		mistake.value = false;
		points.value = null;
		error.value = "";

		const response = await request("POST", "/api/game/tickets", { ticket: item.id });
		if (current !== attempt)
			return;
		if (!response.ok)
			return fail(response.error || "Impossible de prendre ce ticket.", false);
		playId = response.data.id;
		sequence.value = response.data.sequence.split("");
		state.value = "scratching";
	}

	// Keys of the game (from the catalog): any other key is ignored, it does not break the sequence
	let gameKeys = [];
	function setKeys(keys)
	{
		gameKeys = keys;
	}

	// Returns false when the key is not for the game, so the page can let it through
	function press(key)
	{
		if (state.value !== "scratching" || !gameKeys.includes(key))
			return false;
		const result = applyKey(sequence.value, step.value, key);
		step.value = result.step;
		mistake.value = result.mistake;
		if (result.complete)
			reveal();
		return true;
	}

	async function reveal()
	{
		const current = attempt;
		state.value = "revealing";
		const response = await request("POST", "/api/game/tickets/" + playId + "/reveal", { keys: sequence.value.join("") });
		if (current !== attempt)
			return;
		if (!response.ok)
		{
			// Network error, rate limit or server error: the ticket is still valid, sending again can work.
			// Otherwise (already open, expired, refused) only a new ticket helps.
			const transient = response.status === 0 || response.status === 429 || response.status >= 500;
			return fail(response.error || "Le ticket n'a pas pu être ouvert.", transient);
		}
		points.value = response.data.points;
		state.value = "revealed";
		onRevealed?.(response.data.leaderboard);
	}

	function retry()
	{
		if (canRetryReveal)
			return reveal();
		return start(ticket.value);
	}

	return { state, ticket, sequence, step, mistake, points, error, progress, start, press, retry, setKeys };
}
