# Plan de développement

Concept : créer des recettes à la main ou à partir d'une liste d'ingrédients, garder l'historique des recettes cuisinées, et les rechercher pour les refaire.

Le développement avance par petites étapes. Chacune est une fonctionnalité complète (modèle, migration, API, page Vue, tests) qu'on peut essayer dans l'application et commiter à part.

## Phase 1 : Recettes manuelles

- [x] **1. Fiche recette de base.** La table `recipes` remplace l'exemple « items » : titre, description, portions, temps de préparation et de cuisson, étapes en texte. API de création, lecture, modification et suppression, avec tests pytest.
- [x] **2. Pages liste et formulaire.** La page d'accueil liste les recettes ; formulaire de création et de modification. Test Playwright du parcours.
- [x] **3. Ingrédients structurés.** Nom, quantité et unité, liés à la recette. Lignes d'ingrédients ajoutables et supprimables dans le formulaire. Base des phases 3 et 4.
- [x] **4. Page détail.** Vue de lecture claire, pour cuisiner avec.

## Phase 2 : Historique

- [ ] **5. « Je l'ai cuisinée ».** Bouton qui enregistre la date, une note et un commentaire. La fiche affiche la dernière fois et le nombre de fois.
- [ ] **6. Page Historique.** Repas passés du plus récent au plus ancien, filtre par période, bouton pour refaire la recette.

## Phase 3 : Recherche

- [ ] **7. Recherche par titre.** Barre de recherche sur la liste.
- [ ] **8. Recherche par ingrédient et filtres.** Par exemple « avec du poulet », « moins de 30 minutes », « pas faite depuis un mois », avec un tri.

## Phase 4 : Recettes à partir d'ingrédients

- [ ] **9. Suggestions parmi vos recettes.** On saisit les ingrédients disponibles ; l'application classe les recettes selon leur correspondance et montre les ingrédients manquants.
- [ ] **10. Création automatique par IA.** *En attente, décision reportée.* Proposer une nouvelle recette en brouillon à partir des ingrédients, via l'API Claude. Coût estimé : quelques centimes à moins d'un euro par mois pour un usage personnel. Implique un compte sur la Console Anthropic, une clé d'API dans `.env` et une connexion internet ; la fonction resterait optionnelle.

## Pour plus tard

Activer les comptes utilisateurs, photos, catégories ou étiquettes, liste de courses.
