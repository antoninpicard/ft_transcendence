import { ref } from "vue";
import { request } from "../api.js";

// Scoreboard of the game: loaded from the API, replaced by the board returned with each
// revealed ticket, and polled so that the tickets of the other players show up too
export function useLeaderboard(pollMs = 10_000)
{
	const board = ref({ top: [], me: { rank: null, score: 0 } });
	const error = ref("");
	let timer = null;

	async function load()
	{
		const response = await request("GET", "/api/game/leaderboard");
		if (response.ok)
			set(response.data);
		else
			error.value = response.error || "Classement indisponible.";
	}

	function set(data)
	{
		board.value = data;
		error.value = "";
	}

	function startPolling()
	{
		load();
		timer = setInterval(load, pollMs);
	}

	function stopPolling()
	{
		clearInterval(timer);
	}

	return { board, error, set, startPolling, stopPolling };
}
