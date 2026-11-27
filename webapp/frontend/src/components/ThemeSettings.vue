<script setup>
import { ref } from "vue";
import { THEMES, themeChoice, chooseTheme } from "../theme.js";

const status = ref("");
const failed = ref(false);

// Apply the theme at once; it is saved on the account in the background
async function select(id)
{
	if (id === themeChoice.value)
		return;
	const response = await chooseTheme(id);
	failed.value = !response.ok;
	status.value = response.ok ? "Thème enregistré." : (response.error || "Le thème n'a pas pu être enregistré.");
}
</script>

<template>
	<h2>Apparence</h2>
	<fieldset class="theme-picker">
		<legend>Choisis le thème du site</legend>
		<label v-for="theme in THEMES" :key="theme.id" class="theme-option" :class="{ 'is-selected': themeChoice === theme.id }">
			<input type="radio" name="theme" :value="theme.id" :checked="themeChoice === theme.id" @change="select(theme.id)">
			<!-- The preview is drawn with the theme's own tokens: data-theme works on any element -->
			<span class="theme-preview" aria-hidden="true">
				<template v-if="theme.id === 'auto'">
					<span class="preview-half" data-theme="biscuit"><span class="preview-card"><span class="preview-line"></span><span class="preview-button"></span></span></span>
					<span class="preview-half" data-theme="chocolat"><span class="preview-card"><span class="preview-line"></span><span class="preview-button"></span></span></span>
				</template>
				<span v-else class="preview-half" :data-theme="theme.id"><span class="preview-card"><span class="preview-line"></span><span class="preview-button"></span></span></span>
			</span>
			<span class="theme-text">
				<strong>{{ theme.name }}</strong>
				<small>{{ theme.description }}</small>
			</span>
		</label>
	</fieldset>
	<p v-if="status" class="form-message" :class="{ 'error-message': failed }" role="status" aria-live="polite">{{ status }}</p>
</template>

<style scoped>
.theme-picker {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	border: 0;
}

.theme-picker legend {
	margin-bottom: 10px;
	padding: 0;
	color: var(--text-soft);
}

.theme-option {
	position: relative;
	display: grid;
	gap: 8px;
	margin: 0;
	padding: 10px;
	border: 2px solid var(--line);
	border-radius: 12px;
	background: var(--surface-warm);
	cursor: pointer;
	transition: border-color 150ms ease, transform 150ms ease;
}

.theme-option:hover {
	transform: translateY(-2px);
	border-color: var(--accent);
}

.theme-option.is-selected {
	border-color: var(--accent-strong);
	background: var(--surface-soft);
}

.theme-option:focus-within {
	outline: 3px solid var(--accent-strong);
	outline-offset: 2px;
}

/* The radio stays for the keyboard and screen readers; the whole card shows the choice */
.theme-option input {
	position: absolute;
	width: 1px;
	height: 1px;
	min-height: 0;
	opacity: 0;
}

.theme-preview {
	display: flex;
	height: 64px;
	overflow: hidden;
	border: 1px solid var(--line);
	border-radius: 8px;
}

.preview-half {
	display: grid;
	flex: 1;
	place-items: center;
	background: var(--bg);
}

.preview-card {
	display: grid;
	gap: 6px;
	width: 70%;
	padding: 7px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--surface);
}

.preview-line {
	height: 5px;
	border-radius: 3px;
	background: var(--text);
}

.preview-button {
	width: 55%;
	height: 9px;
	border-radius: 3px;
	background: var(--accent);
}

.theme-text strong {
	display: block;
	color: var(--text);
}

.theme-text small {
	display: block;
	color: var(--text-soft);
	font-size: 0.8rem;
	line-height: 1.35;
}

@media (prefers-reduced-motion: reduce) {
	.theme-option:hover {
		transform: none;
	}
}
</style>
