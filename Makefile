# Raccourcis vers tasks.py, pour Linux et macOS : make <commande>
# Sous Windows (sans make) : python tasks.py <commande>   — mêmes commandes, même comportement.
# Liste des commandes : make help (ou python tasks.py --help)
PYTHON ?= python3

COMMANDS = install api web test test-pg cov e2e lint audit up down \
           prod-up prod-down prod-backup prod-backups

.PHONY: help prod-restore $(COMMANDS)

help:
	@$(PYTHON) tasks.py --help

$(COMMANDS):
	@$(PYTHON) tasks.py $@

# make prod-restore FILE=<nom du fichier>   (ou FILE=latest)
prod-restore:
	@$(PYTHON) tasks.py prod-restore $(FILE)
