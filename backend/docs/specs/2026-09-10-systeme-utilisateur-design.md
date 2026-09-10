# Système utilisateur — conception

Date : 2026-09-10
Statut : validé, prêt pour le plan d'implémentation

## Objectif

Ajouter à l'API le socle d'authentification que tout projet possède :
inscription, connexion, déconnexion, et notion d'utilisateur courant. Le CRUD
`users` existe déjà mais crée des comptes sans mot de passe et laisse
n'importe qui modifier ou supprimer n'importe quel compte.

## Périmètre

Inclus : inscription, connexion, déconnexion, route « qui suis-je »,
projection publique des utilisateurs, restriction des écritures au
propriétaire.

Exclu : vérification d'email, réinitialisation et changement de mot de passe,
double authentification, rôles et administration, OAuth, limitation de débit.
Le changement de mot de passe est un suivi court une fois ce socle en place :
un champ `password` optionnel sur `PATCH /api/users/:id`, accompagné du mot de
passe courant.

Hors périmètre mais non bloqué : le badge RFID. Le firmware appelle déjà
`POST /api/scan` et `POST /api/hello` avec un en-tête `X-Device-Token`, deux
routes qui n'existent pas encore côté API. C'est un second axe
d'authentification — celui des appareils — indépendant de celui des humains.
Une table liant un UID de badge à un `user_id` s'ajoutera sans toucher à ce
qui est décrit ici.

## Décisions

| Décision | Choix | Raison |
|---|---|---|
| Mécanisme de session | Cookie opaque, session en base | La déconnexion supprime réellement l'accès. Rien à stocker côté JS, donc rien à voler par XSS. Pas de gestion d'expiration côté client. |
| Emplacement des routes | `/api/auth/*` dédié | Sépare « qui je suis » de la ressource `users`, et évite la collision avec `/api/users/:id`. |
| Hachage | argon2id | Gagnant du Password Hashing Competition. Vérifié : le paquet embarque des binaires précompilés pour linux-x64, donc `npm install` ne compile rien et ne réclame ni node-gyp ni python. |
| Identifiant de connexion | Email **ou** pseudo | Un champ `identifier` unique côté client, résolu par `WHERE email = $1 OR username = $1`. Les deux colonnes sont en `citext`, donc la casse n'a pas d'importance. |

## Modèle de données — migration `002_add_auth.sql`

```sql
ALTER TABLE users ADD COLUMN password_hash text NOT NULL;

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
```

`ON DELETE CASCADE` : supprimer un compte révoque ses sessions dans la même
transaction, sans code applicatif à ne pas oublier.

**Cette migration échoue si la table `users` contient déjà des lignes**, la
colonne étant `NOT NULL` sans valeur par défaut. C'est voulu : un compte sans
mot de passe ne doit pas pouvoir exister, et un échec bruyant vaut mieux qu'une
suppression silencieuse de données. En développement, `npm run db:reset` avant
d'appliquer.

## Sessions

Le cookie ne transporte pas l'identifiant de la ligne. À la connexion :

1. 32 octets aléatoires (`crypto.randomBytes`) forment le jeton.
2. Le jeton part au navigateur en base64url dans le cookie.
3. La base ne conserve que son SHA-256, dans `token_hash`.

Une fuite de la table `sessions` ne donne donc accès à aucun compte — le même
raisonnement que pour les mots de passe. Le SHA-256 suffit ici, contrairement
aux mots de passe : un jeton de 32 octets aléatoires n'est pas devinable par
force brute, il n'a pas besoin d'un hachage à coût mémoire.

Cookie `sid` : `httpOnly`, `sameSite=lax`, `secure` en production uniquement,
`path=/`, durée de vie 7 jours (constante du module, pas une variable
d'environnement tant que personne n'a besoin de la régler).

Plusieurs sessions coexistent par utilisateur, une par appareil. La
déconnexion ne supprime que la session courante.

Les sessions expirées sont ignorées et supprimées à la volée quand
`requireAuth` les rencontre. Pas de tâche de nettoyage périodique tant que le
volume ne le justifie pas.

## API

| Route | Accès | Réponse |
|---|---|---|
| `POST /api/auth/register` | public | 201 + cookie. 409 si pseudo ou email pris, 400 si validation |
| `POST /api/auth/login` | public | 200 + cookie. 401 sinon. Corps : `{ identifier, password }`, où `identifier` est un email ou un pseudo |
| `POST /api/auth/logout` | connecté | 204, idempotent |
| `GET /api/auth/me` | connecté | 200 avec l'email. 401 sinon |
| `GET /api/users` | public | annuaire sans emails |
| `GET /api/users/:id` | public | projection publique |
| `PATCH /api/users/:id` | propriétaire | 403 si ce n'est pas son compte |
| `DELETE /api/users/:id` | propriétaire | 204, sessions révoquées en cascade |
| `POST /api/users` | supprimée | remplacée par `register` |

Projection publique : `id`, `username`, `createdAt`. La projection privée,
réservée à `GET /api/auth/me` et au propriétaire, ajoute `email` et
`updatedAt`.

L'inscription ouvre la session directement : demander à l'utilisateur de se
reconnecter juste après s'être inscrit n'apporte rien.

## Sécurité

**Pas d'énumération de comptes.** Identifiant inconnu et mot de passe faux
renvoient le même 401 et le même message. Quand l'identifiant n'existe pas, le
service vérifie malgré tout le mot de passe contre un hash factice : sans cela,
la différence de temps de réponse entre les deux cas révèle quels comptes sont
enregistrés.

**Aucune collision possible entre les deux identifiants.** `USERNAME_PATTERN`
n'autorise que `[a-zA-Z0-9_-]`, donc un pseudo ne peut pas contenir d'arobase
et ne peut pas ressembler à l'email d'un autre. Un `OR` sur les deux colonnes
ne peut donc pas résoudre vers un compte inattendu. Si ce motif venait à
s'élargir, cette garantie tomberait et la résolution devrait être scindée.

**Le hash ne peut pas fuiter par inadvertance.** `password_hash` reste absent
de la constante `COLUMNS` qui construit les `SELECT` de `users.service.js`. Il
n'est lu que par une requête dédiée, dans le service d'authentification, dont
la valeur ne quitte jamais ce module.

**Politique de mot de passe** : 8 caractères minimum, 128 maximum. Pas de
règle de composition — les recommandations actuelles (NIST SP 800-63B) tiennent
la longueur pour plus utile, et les règles de composition poussent surtout aux
mots de passe prévisibles. La borne haute évite qu'une entrée démesurée fasse
travailler argon2 pour rien.

**Le cookie n'est pas une protection CSRF à lui seul.** `sameSite=lax` bloque
les envois inter-sites sur les requêtes non sûres, ce qui couvre le cas
courant. Un jeton CSRF explicite deviendra nécessaire si l'API doit un jour
accepter des requêtes inter-origines authentifiées.

## Découpage

Nouveaux fichiers :

- `src/db/migrations/002_add_auth.sql`
- `src/schemas/auth.schema.js` — corps de `register` et `login`
- `src/services/auth.service.js` — inscription, vérification des identifiants
- `src/services/sessions.service.js` — création, résolution, révocation
- `src/controllers/auth.controller.js`
- `src/routes/auth.routes.js`
- `src/middlewares/requireAuth.js` — pose `req.user`

Fichiers modifiés :

- `users.service.js` — projection publique et privée
- `users.routes.js` / `users.controller.js` — propriétaire uniquement, `POST` retiré
- `routes/index.js` — montage de `authRouter`
- `app.js` — `cookie-parser`
- `package.json` — `argon2`, `cookie-parser`, script `test:db`

`sessions.service.js` est séparé de `auth.service.js` : le premier ne connaît
que des jetons et des durées, le second des mots de passe et des comptes. La
frontière permet de tester la gestion de session sans toucher à argon2.

## Tests

Les 13 tests actuels tournent sans base de données, propriété annoncée dans le
README. Elle est conservée : `npm test` reste inchangé.

L'authentification ne se teste pas sans Postgres. Un fichier
`tests/auth.test.js` et un script `npm run test:db` s'y ajoutent. Ces tests
visent la base de développement mais ne la vident pas : chaque cas crée ses
comptes avec des pseudos aléatoires et les supprime en sortie.

Développement en TDD, test avant implémentation. Cas couverts :

- inscription : succès, pseudo pris, email pris, mot de passe trop court
- connexion : succès par email, succès par pseudo, succès quelle que soit la
  casse, mauvais mot de passe, identifiant inconnu — messages identiques
- `me` : sans cookie, avec cookie, après déconnexion
- déconnexion : idempotente
- `PATCH` et `DELETE` sur le compte d'autrui : 403
- `DELETE` de son compte : sessions révoquées
- `GET /api/users` : aucun email dans la réponse
- `password_hash` absent de toutes les réponses

## Risques

Le principal est la migration `002` face à une base non vide : elle échoue
franchement, et la marche à suivre est `npm run db:reset`. Le noter dans le
README évite de perdre du temps dessus.

Le second est le partage de la base entre développement et tests. Les tests
nettoient derrière eux, mais un plantage en cours de route peut laisser des
comptes de test. Ils sont reconnaissables à leur pseudo aléatoire et
disparaissent au prochain `db:reset`.
