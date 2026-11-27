// Rules of the scratching, as a pure function (no Vue, no network).
// The server checks the sequence again when the ticket is revealed: this is only for the display.

// Applies one key press to the progress in the sequence: a wrong key starts it over
export function applyKey(sequence, step, key)
{
	if (key === sequence[step])
	{
		const next = step + 1;
		return { step: next, mistake: false, complete: next === sequence.length };
	}
	return { step: 0, mistake: true, complete: false };
}
