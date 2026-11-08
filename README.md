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