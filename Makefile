COMPOSE_FILE = contbuild/docker-compose.yml

all:
	@clear
	docker compose -f $(COMPOSE_FILE) up --build -d

a_wish:
	@echo "Images :"
	@docker images
	@echo "\nConteneurs en cours :"
	@docker ps -a
	@echo "\n"
	docker logs contbuild-app-1
	@echo "\n"

stop:
	@clear
	docker compose -f $(COMPOSE_FILE) down


clean:
	docker compose -f $(COMPOSE_FILE) down
	@echo "After cleaning :"
	@docker ps -a

re:
	@make clean && make

.PHONY: all status clean re