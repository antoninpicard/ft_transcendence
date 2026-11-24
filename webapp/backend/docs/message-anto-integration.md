# Intégration de ta partie (OAuth 42 + badgeuse) dans l'API

Salut Anto,

J'ai porté ton système de connexion dans l'API (`webapp/backend/`), pour qu'on n'ait plus qu'**un seul backend** dans le projet. Tout est sur ma branche `Backend_API_Lucas`. Je t'explique ce qui a changé par rapport à ta version et pourquoi, et ce dont j'ai besoin de toi.

Comme OAuth et la badgeuse sont tes modules pour la soutenance, j'aimerais vraiment que tu relises la PR : il faut que tu puisses expliquer ce code.

---

## En bref

- **Un seul backend** : l'API Express 5 (ESM) + PostgreSQL. Ton serveur (`infra/` + `webapp/routes/`) et SQLite pourront être retirés une fois que tu auras validé.
- **Ton firmware ne change pas** : `/api/hello`, `/api/scan`, l'en-tête `X-Device-Token` et le corps `{ "uid": "..." }` sont repris à l'identique.
- **Le protocole WebSocket ne change presque pas** : toujours `/ws`, toujours `{ "code": "..." }` en premier message.
- **Les routes du navigateur ont changé de nom** : ton front doit être adapté (tableau plus bas).
- **`make` lance maintenant l'API à côté de ton serveur, sans y toucher** (détails juste en dessous).

---

## Lancement : ce qui change dans `contbuild/`

J'ai suivi l'architecture de `main` : l'API est rangée dans `webapp/backend/`, et c'est le compose de l'équipe, `contbuild/docker-compose.yml`, qui la lance.

| Service | Port | Ce que c'est |
|---|---|---|
| `app` | 3000 | **ton serveur (`infra/`), inchangé** |
| `db` | 5432 | PostgreSQL 17 |
| `api` | 3001 | l'API ; elle applique les migrations puis démarre |

- **Ton service `app` n'a pas bougé** : même Dockerfile, même port. Les deux serveurs cohabitent jusqu'à ce que tu valides. Ensuite, on fera pointer le WAF vers l'API pour `/api`, et on retirera `infra/`.
- **Un seul `.env` pour tout le projet** : `contbuild/.env`, avec son modèle `contbuild/.env.example`. Il contient tes variables (`SESSION_SECRET`, `DEVICE_TOKEN`) et celles de l'API. Ton serveur refuse de démarrer sans ces deux-là.
- **J'ai ajouté un `.dockerignore` à la racine.** Sans lui, le `COPY . .` de ton Dockerfile copiait le `.env` et ses secrets dans l'image.

---

## Ce qui change dans la base et les sessions

| | Ta version | L'API |
|---|---|---|
| Base | SQLite | PostgreSQL |
| Mots de passe | bcrypt | argon2id |
| Session | `express-session`, cookie `connect.sid` | table `sessions`, cookie `sid` (`httpOnly`, `sameSite=lax`). La base ne garde que le hash du jeton : une fuite de la table ne donne accès à aucun compte |
| Comptes | email + mot de passe | pseudo + email + mot de passe ; connexion par email **ou** pseudo |

**Pas de reprise des données** : ta base SQLite est locale à ta machine, tes comptes n'ont pas de pseudo, et les hash bcrypt ne passent pas la vérification argon2. On recrée les comptes de test et on ré-appaire les badges.

---

## Correspondance des routes (pour le front)

| Ton front appelle | Nouvelle route | Changements |
|---|---|---|
| `POST /api/signup` | `POST /api/auth/register` | **nécessite un `username`** en plus de `email` et `password` ; ouvre directement la session ; 201 |
| `POST /api/login` | `POST /api/auth/login` | corps `{ identifier, password }`, `identifier` étant l'email ou le pseudo ; renvoie le compte |
| `POST /api/logout` | `POST /api/auth/logout` | répond 204, même sans session |
| `GET /api/me` | `GET /api/auth/me` | renvoie le compte **directement**, plus `{ user }` |
| `GET /api/auth/42` | `GET /api/auth/42` | inchangé |
| `POST /api/badge-login/start` | `POST /api/badge/login` | renvoie `{ code }` ; **réservé à l'IP de la borne** (voir plus bas) |
| `POST /api/badge-login/confirm` | `POST /api/badge/login/confirm` | `{ token }` → ouvre la session et renvoie le compte ; réservé à la borne aussi |
| `POST /api/pairing/start` | `POST /api/badge/pairing` | connecté ; renvoie `{ code }` |
| `GET /api/badge/status` | `GET /api/badge` | `{ linked: true \| false }` |
| `POST /api/badge/unlink` | `DELETE /api/badge` | 204 |

Les erreurs de l'API ont toutes la forme `{ "error": { "message": "..." } }`, avec des messages en français.

---

## OAuth 42 : ce qui change

- **Plus de rattachement automatique par email.** Chez toi, une connexion 42 se rattachait au compte local qui avait le même email. Or on ne vérifie pas les emails à l'inscription : quelqu'un pouvait créer un compte avec l'email 42 d'un autre étudiant et son propre mot de passe, puis récupérer l'accès le jour où l'étudiant se connectait via 42. Maintenant :
  - un compte 42 est retrouvé par son identifiant 42, sinon il est créé ;
  - si l'email est déjà pris par un autre compte, la connexion est refusée (`oauth_email_taken`).
- **Un compte créé via 42 n'a pas de mot de passe** : la colonne est vide, au lieu du hash d'un mot de passe aléatoire. Une connexion par mot de passe sur ce compte échoue exactement comme un mauvais mot de passe.
- **Pseudo** : c'est le login 42 ; s'il est déjà pris, on ajoute un suffixe (`login-a3f9`).
- **Le `state`** est stocké dans un cookie `oauth_state` (`httpOnly`, 10 min) au lieu de la session, et comparé en temps constant.
- **Redirections** : succès → `/home` ; échec → `/login?oauth_error=<code>`, avec `oauth_state`, `oauth_denied`, `oauth_email_taken` ou `oauth_unavailable`. Le front peut lire ce paramètre pour afficher le bon message.
- Le `code` et le `state` du retour de 42 ne sont jamais écrits dans les logs.

---

## Badgeuse : ce qui change

- **UID haché avec un secret serveur** (HMAC-SHA-256, variable `BADGE_UID_SECRET`) au lieu d'un SHA-256 simple. Un UID ne fait que 4 à 7 octets, donc son SHA-256 sans secret se retrouve par force brute en quelques secondes à partir d'un dump. L'UID est aussi mis en majuscules avant hachage.
- **L'UID n'est plus jamais logué** : ta version l'affichait en clair dans la console.
- **Le jeton d'appareil** est comparé en temps constant sur les hash des deux valeurs, ce qui ne laisse plus fuiter sa longueur.
- **Connexion par badge réservée à la borne** (variable `BADGE_LOGIN_ALLOWED_IPS`). C'est le plus gros changement. Avec le modèle « le prochain scan gagne », n'importe qui pouvait, **depuis chez lui** :
  1. ouvrir une fenêtre de connexion par badge et la rouvrir en boucle pour garder le créneau ;
  2. recevoir le jeton du prochain étudiant qui badge ;
  3. se connecter sur son compte, sans que l'étudiant le voie (l'ESP32 n'affiche rien).

  Comme on badge depuis un PC fixe connu, le démarrage et la confirmation ne sont acceptés que depuis son IP. Sans la variable, la connexion par badge est désactivée (503) ; depuis une autre IP, c'est 403.
- **Un appairage remplace une fenêtre de connexion en cours** au lieu de prendre 409. Sinon, quelqu'un pouvait bloquer l'appairage de tout le monde en rouvrant des fenêtres de connexion.
- **WebSocket** :
  - le code d'action fait maintenant **32 caractères hexadécimaux** (16 octets) au lieu de 6, car à 3 octets il se devinait ;
  - une socket qui n'envoie rien en 10 s est fermée, et aucune ne reste ouverte plus de 35 s ;
  - si la page est rechargée, une nouvelle socket peut se rattacher avec le même code.
- **Un UID malformé** sur `/api/scan` donne maintenant 400. Ton firmware n'en envoie jamais, donc ça ne change rien pour lui. Toutes les autres issues d'un scan répondent toujours 200.

---

## Limitation de débit

| Route | Limite |
|---|---|
| `POST /api/auth/login` | 10 par minute, par IP **et** par identifiant (derrière le NAT de l'école, une limite par IP seule aurait permis à un seul étudiant de bloquer tout le monde) |
| `POST /api/auth/register` | 5 par minute par IP |
| `POST /api/badge/login` | 1 toutes les 10 secondes par IP (ta valeur) |

Au-delà : 429.

---

## Ce dont j'ai besoin de toi

1. **Relire la PR**, surtout OAuth et la badgeuse, puisque c'est toi qui les présenteras.
2. **Les variables d'environnement** à mettre dans `contbuild/.env` (elles sont vides dans `contbuild/.env.example`) :
   - `DEVICE_TOKEN` : **le même** que dans ton `secrets.h` ;
   - `FORTYTWO_CLIENT_ID`, `FORTYTWO_CLIENT_SECRET`, `FORTYTWO_REDIRECT_URI` : ceux de ton application sur l'intra. L'URI de redirection doit pointer sur `/api/auth/42/callback` ;
   - `BADGE_UID_SECRET` : au moins 32 caractères, à générer avec `openssl rand -hex 32` ;
   - `BADGE_LOGIN_ALLOWED_IPS` : l'IP du PC de la borne.
3. **Le chemin entre l'ESP32 et l'API**, à voir avec Alex. L'API écoute en HTTP derrière le WAF, qui termine le HTTPS sur 8443, alors que ton firmware vise le port 3000 en HTTPS avec le certificat épinglé. Il faudra soit que le WAF écoute sur 3000, soit changer `SERVER_PORT` dans le firmware. Il faudra aussi que le certificat du WAF soit celui de `ca_cert.h`, et que quelqu'un annonce `transcendence.local` en mDNS.
4. **La 2FA** (ton module) devra se brancher sur `POST /api/auth/login`. On en parle quand tu veux.
5. **Le front** : adapter les appels selon le tableau, et ajouter un champ pseudo à l'inscription.
6. **Une fois que tu as validé** : faire pointer le WAF vers le service `api` pour `/api`, puis retirer `infra/`, `webapp/routes/`, ton service `app` du compose et les dépendances SQLite / bcrypt / `express-session`.

---

## Limites connues

- **Détournement d'appairage sur place** : si quelqu'un badge pendant les 30 s où tu appaires ton badge, c'est son badge qui est lié à ton compte. Il faut être physiquement à la badgeuse. C'est inhérent au « prochain scan gagne », que j'ai gardé.
- **Squat d'email sur 42** : quelqu'un peut créer un compte local avec l'email 42 d'un étudiant avant sa première connexion 42, qui sera alors refusée. C'est le prix du refus de rattachement automatique.
- **Une seule action badge à la fois**, et un compte connecté peut monopoliser la badgeuse en rouvrant des appairages.
- **L'état de la badgeuse est en mémoire** : un seul process API.
- **La restriction d'IP de la borne repose sur le WAF** : l'API ne doit jamais être exposée directement.

---

## Tests

Tout est testé :

- `npm test` : 94 tests, sans base ;
- `npm run test:db` : 103 tests, avec PostgreSQL.

L'ESP32 et l'intra 42 y sont simulés. La doc complète des routes est dans `webapp/backend/README.md`, et la collection de requêtes dans `webapp/backend/requests/api.http`.

Dis-moi si quelque chose ne te va pas, surtout sur la restriction de la borne et le refus du rattachement par email : ce sont les deux écarts les plus visibles par rapport à ta version.

Lucas
