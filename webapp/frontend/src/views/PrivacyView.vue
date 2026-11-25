<template>
	<article class="content-panel">
		<h1>Privacy Policy</h1>
		<p>Dernière mise à jour : 25 novembre 2026</p>

		<p>CLB Private Club est un projet étudiant réalisé dans le cadre du cursus de l'école 42. Cette page explique quelles données nous collectons, pourquoi, et ce que tu peux en faire.</p>

		<h2>Données que nous collectons</h2>
		<ul>
			<li><strong>Pseudo et adresse email</strong> : ils identifient ton compte et te permettent de te connecter.</li>
			<li><strong>Mot de passe</strong> : jamais stocké en clair. Nous gardons uniquement une empreinte salée (argon2id) qui ne permet pas de retrouver le mot de passe.</li>
			<li><strong>Identifiant 42</strong> : si tu te connectes avec 42, nous récupérons ton identifiant, ton login et ton email depuis l'API de l'intra 42. Nous ne recevons jamais ton mot de passe 42.</li>
			<li><strong>Badge NFC</strong> : si tu lies un badge, nous enregistrons une empreinte de son identifiant (HMAC-SHA-256 avec une clé secrète du serveur), jamais l'identifiant lui-même.</li>
			<li><strong>Amis et messages</strong> : les demandes d'amis et les messages que tu échanges avec tes amis.</li>
			<li><strong>Clés d'API</strong> : si tu en crées, nous ne gardons que leur empreinte.</li>
			<li><strong>Sessions</strong> : la date de connexion et d'expiration de chaque session ouverte.</li>
		</ul>

		<h2>Pourquoi</h2>
		<p>Ces données servent uniquement à faire fonctionner ton compte : te connecter (mot de passe, compte 42 ou badge NFC), afficher ton profil, tes amis et tes messages. Elles ne sont ni vendues, ni partagées, ni utilisées pour de la publicité.</p>

		<h2>Cookies</h2>
		<ul>
			<li><code>sid</code> : garde ta session ouverte pendant 7 jours au plus. Il est supprimé quand tu te déconnectes.</li>
			<li><code>oauth_state</code> : présent seulement pendant une connexion avec 42, 10 minutes au plus. Il protège cette connexion contre les attaques par falsification de requête.</li>
		</ul>
		<p>Ces cookies sont strictement nécessaires au fonctionnement du site, inaccessibles au JavaScript (<code>HttpOnly</code>) et envoyés uniquement en HTTPS (<code>Secure</code>). Aucun cookie de suivi ou de publicité.</p>

		<h2>Sécurité</h2>
		<ul>
			<li>Toutes les communications avec le serveur passent en HTTPS.</li>
			<li>Les tentatives de connexion trop rapprochées sont bloquées pour limiter les attaques par force brute.</li>
			<li>Un badge NFC peut être copié : il sert de raccourci de connexion, pas de preuve d'identité absolue.</li>
		</ul>

		<h2>Services tiers</h2>
		<p>Intra 42 (api.intra.42.fr), uniquement si tu choisis la connexion avec 42. Le site ne charge aucune ressource depuis un autre service.</p>

		<h2>Conservation</h2>
		<p>Tes données sont conservées tant que ton compte existe. Supprimer ton compte supprime aussi tes sessions, ton badge, tes amis et tes messages. Tu peux délier ton badge à tout moment depuis la page Paramètres, ce qui supprime son empreinte.</p>

		<h2>Tes droits</h2>
		<p>Conformément au RGPD, tu peux demander l'accès, la rectification ou la suppression de tes données en contactant l'équipe du projet.</p>
	</article>
</template>
