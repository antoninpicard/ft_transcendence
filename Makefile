# Full stack: app + WAF (nginx/ModSecurity) + Vault.
# cybersecurity/docker-compose.yml comes first: it sets the project directory
# (for relative paths) and the project name "cybersecurity" (keeps the vault-data volume).
export COMPOSE_FILE = cybersecurity/docker-compose.yml:contbuild/docker-compose.yml:cybersecurity/docker-compose.app.yml
# Variables of the Compose files (POSTGRES_*): without this, Compose would look for them
# in cybersecurity/.env, the directory of the first file
ENV_FILE = contbuild/.env
export COMPOSE_ENV_FILES = $(ENV_FILE)
# Secrets loaded into Vault by the bootstrap (app: infra/, backend: the API, db: Postgres)
SECRETS = cybersecurity/vault/secrets/app.env cybersecurity/vault/secrets/backend.env cybersecurity/vault/secrets/db.env
CERT = cybersecurity/waf/certs/server.crt
KEY = cybersecurity/waf/certs/server.key

all: $(ENV_FILE) $(SECRETS) $(CERT)
	@clear
	docker compose up -d vault
	bash cybersecurity/vault/scripts/bootstrap.sh
	docker compose up --build -d
	# nginx resolves the app address only at startup: if the app was recreated with a new IP,
	# the WAF would answer 502. Restarting nginx makes it resolve the current address.
	docker compose restart nginx
	@echo ""
	@echo "Site ready: https://localhost:8443 (accept the self-signed certificate warning in the browser)"

$(ENV_FILE) $(SECRETS):
	@echo "Missing $@: copy $@.example to $@ and fill in the values" && exit 1

# Self-signed certificate for local development (ignored by Git), created only if missing
$(CERT):
	mkdir -p $(dir $@)
	openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
		-subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
		-keyout $(KEY) -out $@
	# nginx runs as uid 101 in its container: the key must be readable by it on Linux hosts
	chmod 644 $(KEY)

a_wish:
	@echo "Images :"
	@docker images
	@echo "\nConteneurs en cours :"
	@docker ps -a
	@echo "\n"
	docker compose logs
	@echo "\n"

stop:
	@clear
	docker compose down


clean:
	docker compose down
	@echo "After cleaning :"
	@docker ps -a

fclean:
	@printf "Attention : la base de données et les images construites seront supprimées. Continuer ? [y/N] "
	@read ans && [ "$$ans" = y ]
	# Removes the database volume only: the Vault volume (cybersecurity_vault-data) is kept,
	# otherwise Vault would have to be initialized again and ~/vault-init.json would be useless
	docker compose down --rmi local
	docker volume rm -f cybersecurity_db-data
	@echo "After cleaning :"
	@docker ps -a

re:
	@make clean && make

.PHONY: all a_wish stop clean fclean re
