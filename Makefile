# Full stack: app + WAF (nginx/ModSecurity) + Vault.
# cybersecurity/docker-compose.yml comes first: it sets the project directory
# (for relative paths) and the project name "cybersecurity" (keeps the vault-data volume).
export COMPOSE_FILE = cybersecurity/docker-compose.yml:contbuild/docker-compose.yml:cybersecurity/docker-compose.app.yml
SECRETS = cybersecurity/vault/secrets/app.env

all: $(SECRETS)
	@clear
	docker compose up -d vault
	bash cybersecurity/vault/scripts/bootstrap.sh
	docker compose up --build -d

$(SECRETS):
	@echo "Missing $@: copy $@.example to $@ and fill in the values" && exit 1

a_wish:
	@echo "Images :"
	@docker images
	@echo "\nConteneurs en cours :"
	@docker ps -a
	@echo "\n"
	docker compose logs app
	@echo "\n"

stop:
	@clear
	docker compose down


clean:
	docker compose down
	@echo "After cleaning :"
	@docker ps -a

re:
	@make clean && make

.PHONY: all status clean re
