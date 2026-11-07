<template>
	<main class="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 py-12">
		<section class="bulb-frame">
			<article class="rounded-2xl border-2 border-[#ff2d95] box-neon bg-[#0d0616] p-6 sm:p-10 text-gray-200 leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-bungee [&_h2]:text-lg [&_h2]:text-[#00f0ff] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_p]:mt-2">
				<h1 class="font-bungee text-2xl sm:text-4xl text-center glow-pink">PRIVACY POLICY</h1>
				<p class="text-center text-sm text-gray-400">Dernière mise à jour : 29 septembre 2026</p>

				<p>Jackpot est un projet étudiant réalisé dans le cadre du cursus de l'école 42. Cette page explique quelles données nous collectons, pourquoi, et ce que tu peux en faire.</p>

				<h2>Données que nous collectons</h2>
				<ul>
					<li><b>Adresse email</b> : ton identifiant de connexion.</li>
					<li><b>Mot de passe</b> : jamais stocké en clair. Nous gardons uniquement une empreinte (hash bcrypt salé) qui ne permet pas de retrouver le mot de passe.</li>
					<li><b>Identifiant 42</b> : si tu te connectes avec 42, nous récupérons ton identifiant et ton email depuis l'API de l'intra 42. Nous ne recevons jamais ton mot de passe 42.</li>
					<li><b>Badge NFC</b> : si tu lies un badge, nous enregistrons une empreinte SHA-256 de son identifiant (UID), pas l'UID lui-même.</li>
					<li><b>Date de création</b> de ton compte et de la liaison de ton badge.</li>
				</ul>

				<h2>Pourquoi</h2>
				<p>Ces données servent uniquement à créer ton compte et à te connecter (email et mot de passe, compte 42 ou badge NFC). Elles ne sont ni vendues, ni partagées, ni utilisées pour de la publicité.</p>

				<h2>Cookies</h2>
				<p>Nous utilisons un seul cookie, <code>connect.sid</code>, qui garde ta session ouverte. Il est strictement nécessaire au fonctionnement du site, inaccessible au JavaScript (<code>HttpOnly</code>) et envoyé uniquement en HTTPS (<code>Secure</code>). Il est supprimé quand tu te déconnectes. Aucun cookie de suivi ou de publicité.</p>

				<h2>Sécurité</h2>
				<ul>
					<li>Toutes les communications avec le serveur passent en HTTPS, y compris celles du lecteur de badge.</li>
					<li>Les tentatives de connexion trop rapprochées sont bloquées pour limiter les attaques par force brute.</li>
					<li>Un badge NFC peut être copié : il sert de raccourci de connexion, pas de preuve d'identité absolue.</li>
				</ul>

				<h2>Services tiers</h2>
				<ul>
					<li><b>Intra 42</b> (api.intra.42.fr) : uniquement si tu choisis la connexion 42.</li>
					<li><b>Google Fonts</b> : les polices du site sont chargées depuis les serveurs de Google, qui voient donc ton adresse IP.</li>
				</ul>

				<h2>Conservation</h2>
				<p>Tes données sont conservées tant que ton compte existe. Tu peux délier ton badge à tout moment depuis la page Paramètres, ce qui supprime son empreinte.</p>

				<h2>Tes droits</h2>
				<p>Conformément au RGPD, tu peux demander l'accès, la rectification ou la suppression de tes données en contactant l'équipe du projet.</p>

				<RouterLink to="/login" class="mt-10 block text-center text-sm underline hover:text-[#00f0ff]">← Retour au casino</RouterLink>
			</article>
		</section>
	</main>
</template>
