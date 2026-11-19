              UTILISATEUR
                   |
                   | Clone le projet
                   v
             GIT REPOSITORY
                   |
                   v
             PROJET LOCAL
                   |
                   | docker compose up
                   v
          CONTAINERIZATION (Docker)
                   |
          +--------+--------+
          |                 |
          v                 v
     APPLICATION        DATABASE
          |                 |
          +--------+--------+
                   |
                   v
             LOCAL SERVER
                   |
                   v
          http://localhost:PORT


DOCKER COMPOSE: 

context: .. indique que Docker doit utiliser la racine du projet comme contexte de construction.

dockerfile: contbuild/Dockerfile indique où se trouve le Dockerfile.

APP_PORT permet de choisir le port accessible depuis la machine hôte.

HOST: 0.0.0.0 permet à Express d'être accessible depuis l'extérieur du container.




INSTALL DOCKER (a scripter dans le makefile peut etre):

sudo apt update
sudo apt install docker.io docker-compose-v2 -y

sudo systemctl enable --now docker

sudo systemctl start docker

sudo usermod -aG docker $USER

newgrp docker

.ENV:
token et secret a set et explik


## Frontend Vue

Le frontend est maintenant une application **Vue 3 + Vite**, située dans `frontend/`.
Le serveur Express reste le backend : il sert le dossier compilé `frontend/dist/` et conserve les routes d'authentification, de badge NFC et le WebSocket.

### Lancer en développement

Dans un terminal :

```sh
npm start

# Dans un second terminal
cd frontend
npm install
npm run dev
```

Le serveur Vite démarre sur le port 5173. Dans un second terminal, démarre Express sur le port 3000 avec `npm start`. Vite relaie automatiquement les appels API et le WebSocket vers Express.

### Compiler et lancer avec Express

Depuis la racine du dépôt :

```sh
npm ci
npm run build
npm start
```

Puis ouvre http://localhost:3000.

### Avec Docker

La commande habituelle reste :

```sh
make
```

Le Dockerfile installe les dépendances frontend, compile Vue, puis l'image de production sert le résultat compilé avec Express.

### Routes backend utilisées par Vue

- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `POST /pairing/start`, `GET /badge/status`, `POST /badge/unlink`
- `POST /badge-login/start`, `POST /badge-login/confirm`
- WebSocket sur `/socket`

Les anciennes pages HTML peuvent rester dans `frontend/public/` pendant la transition ; Express ne les sert plus directement une fois la version Vue compilée.
