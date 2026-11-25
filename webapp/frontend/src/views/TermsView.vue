<template>
	<main class="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 py-12">
		<section class="bulb-frame">
			<article class="rounded-2xl border-2 border-[#ff2d95] box-neon bg-[#0d0616] p-6 sm:p-10 text-gray-200 leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-bungee [&_h2]:text-lg [&_h2]:text-[#00f0ff] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_p]:mt-2">
				<h1 class="font-bungee text-2xl sm:text-4xl text-center glow-pink">TERMS OF SERVICE</h1>
				<p class="text-center text-sm text-gray-400">Dernière mise à jour : 29 septembre 2026</p>

				<p>En utilisant Jackpot, tu acceptes les conditions ci-dessous. Si tu n'es pas d'accord, n'utilise pas le site.</p>

				<h2>Le service</h2>
				<p>Jackpot est un projet étudiant de l'école 42 sur le thème des jeux à gratter et du casino. <b>Aucun argent réel n'est en jeu</b> : il n'y a ni dépôt, ni mise, ni gain réel. Les montants, jackpots et « gagnants » affichés sont fictifs et purement décoratifs.</p>

				<h2>La roulette de connexion</h2>
				<p>La roulette affichée à la connexion est un gag visuel. Elle ne remplace pas la vérification de tes identifiants, qui est toujours faite par le serveur. Si tu perds, tu peux relancer autant de fois que tu veux.</p>

				<h2>Ton compte</h2>
				<ul>
					<li>Tu dois fournir une adresse email valide et un mot de passe d'au moins 8 caractères.</li>
					<li>Tu es responsable de la confidentialité de ton mot de passe et de ton badge NFC.</li>
					<li>Si tu perds ton badge, délie-le depuis la page Paramètres.</li>
					<li>Un compte est personnel : n'utilise pas celui de quelqu'un d'autre.</li>
				</ul>

				<h2>Utilisation acceptable</h2>
				<ul>
					<li>Pas de tentative d'accès aux comptes des autres joueurs.</li>
					<li>Pas d'attaque du service (force brute, surcharge, exploitation de failles).</li>
					<li>Pas d'utilisation automatisée du site sans autorisation.</li>
				</ul>
				<p>Nous pouvons suspendre un compte qui ne respecte pas ces règles.</p>

				<h2>Disponibilité</h2>
				<p>Le service est fourni tel quel, dans un cadre pédagogique. Il peut être interrompu, modifié ou supprimé à tout moment, sans garantie de disponibilité.</p>

				<h2>Jeu responsable</h2>
				<p>Même sans argent réel, le jeu d'argent peut devenir un problème. Si toi ou un proche êtes concernés, tu peux contacter Joueurs Info Service au 09 74 75 13 13 (appel non surtaxé) ou sur joueurs-info-service.fr.</p>

				<h2>Données personnelles</h2>
				<p>Le traitement de tes données est décrit dans notre <RouterLink to="/privacy" class="underline glow-cyan">Privacy Policy</RouterLink>.</p>

				<RouterLink to="/login" class="mt-10 block text-center text-sm underline hover:text-[#00f0ff]">← Retour au casino</RouterLink>
			</article>
		</section>
	</main>
</template>
