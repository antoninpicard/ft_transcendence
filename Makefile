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
	docker compose -f $(COMPOSE_FILE) logs
	@echo "\n"

stop:
	@clear
	docker compose -f $(COMPOSE_FILE) down


clean:
	docker compose -f $(COMPOSE_FILE) down
	@echo "After cleaning :"
	@docker ps -a

fclean:
	@printf "Attention : la base de données et les images construites seront supprimées. Continuer ? [y/N] "
	@read ans && [ "$$ans" = y ]
	docker compose -f $(COMPOSE_FILE) down --volumes --rmi local
	@echo "After cleaning :"
	@docker ps -a

re:
	@make clean && make

.PHONY: all a_wish stop clean fclean re
