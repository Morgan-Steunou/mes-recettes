# Plan de développement

Concept : créer des recettes à la main ou à partir d'une liste d'ingrédients, garder l'historique des recettes cuisinées, et les rechercher pour les refaire.

Le développement avance par petites étapes. Chacune est une fonctionnalité complète (modèle, migration, API, page Vue, tests) qu'on peut essayer dans l'application et commiter à part.

## Phase 1 : Recettes manuelles

- [x] **1. Fiche recette de base.** La table `recipes` remplace l'exemple « items » : titre, description, portions, temps de préparation et de cuisson, étapes en texte. API de création, lecture, modification et suppression, avec tests pytest.
- [x] **2. Pages liste et formulaire.** La page d'accueil liste les recettes ; formulaire de création et de modification. Test Playwright du parcours.
- [x] **3. Ingrédients structurés.** Nom, quantité et unité, liés à la recette. Lignes d'ingrédients ajoutables et supprimables dans le formulaire. Base des phases 3 et 4.
- [x] **4. Page détail.** Vue de lecture claire, pour cuisiner avec.

## Phase 2 : Historique

- [x] **5. « Je l'ai cuisinée ».** Bouton qui enregistre la date, une note et un commentaire. La fiche affiche la dernière fois et le nombre de fois.
- [x] **6. Page Historique.** Repas passés du plus récent au plus ancien, filtre par période, bouton pour refaire la recette.

## Phase 3 : Recherche

- [x] **7. Recherche par titre.** Barre de recherche sur la liste, sans tenir compte des accents ni des majuscules, mots dans n'importe quel ordre. Filtrage dans le navigateur (`src/utils/search.ts`), recherche gardée dans l'URL (`/?q=…`), raccourcis « / » et Échap.
- [x] **8. Recherche par ingrédient et filtres.** Par exemple « avec du poulet », « moins de 30 minutes », « pas faite depuis un mois », avec un tri. La recherche porte sur le titre et les ingrédients (petits mots et pluriels ignorés, ingrédients trouvés affichés sur la carte) ; menus « Temps total », « Dernière fois » et « Trier par », gardés dans l'URL (`?temps=30&faite=1m&tri=titre`) ; « Tout effacer ».

## Phase 4 : Recettes à partir d'ingrédients

- [x] **9. Suggestions parmi vos recettes.** On saisit les ingrédients disponibles ; l'application classe les recettes selon leur correspondance et montre les ingrédients manquants. Page « Que cuisiner ? » (`/que-cuisiner`) : ingrédients en étiquettes (Entrée, virgules, propositions tirées des recettes), recettes « Prêtes à cuisiner » puis « Il manque quelques ingrédients », du moins au plus manquant ; sel, poivre, huile et eau comptés comme toujours disponibles (option). Correspondance par mots entiers (`src/utils/suggest.ts`) : « poulet » trouve « Blanc de poulet », « eau » ne trouve pas « Veau » ; limite connue : « pomme » trouve aussi « Pommes de terre ».
- [ ] **10. Création automatique par IA.** *En attente, décision reportée.* Proposer une nouvelle recette en brouillon à partir des ingrédients, via l'API Claude. Coût estimé : quelques centimes à moins d'un euro par mois pour un usage personnel. Implique un compte sur la Console Anthropic, une clé d'API dans `.env` et une connexion internet ; la fonction resterait optionnelle.

## Ajouts

- [x] **Catégories de plats.** Catégories créées par l'utilisateur (page `/categories` : créer, renommer, supprimer ; nom unique sans tenir compte des majuscules), une catégorie facultative par recette, choisie ou créée dans le formulaire. Accueil : onglets « Toutes · Desserts (7) · … · Sans catégorie », combinés avec la recherche et les filtres, gardés dans l'URL (`?categorie=3`) ; « Nouvelle recette » depuis un onglet crée la recette dans cette catégorie. Supprimer une catégorie garde ses recettes (sans catégorie). Table `categories` et colonne `recipes.category_id` (migration 0006), API `/api/categories`.

## Pour plus tard

Activer les comptes utilisateurs, photos, étiquettes (plusieurs par recette), ordre personnalisé des catégories, liste de courses.
