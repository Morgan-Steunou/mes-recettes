<script setup lang="ts">
import { nextTick, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { ingredientRow, type IngredientRow } from '@/utils/recipe'

// Lignes { key, quantity, unit, name } (texte), modifiées sur place
const rows = defineModel<IngredientRow[]>({ required: true })

// Unités proposées à la saisie (l'unité reste libre)
const UNITS = ['g', 'kg', 'ml', 'cl', 'l', 'c. à café', 'c. à soupe', 'pincée', 'tasse', 'tranche']

const list = ref<HTMLElement | null>(null)

// Ajoute une ligne vide après la ligne index (ou à la fin) et place le curseur dedans
async function addRow(index = rows.value.length - 1) {
  rows.value.splice(index + 1, 0, ingredientRow())
  await nextTick()
  list.value?.querySelectorAll<HTMLInputElement>('.quantity')[index + 1]?.focus()
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  // Toujours au moins une ligne à remplir
  if (!rows.value.length) rows.value.push(ingredientRow())
}
</script>

<template>
  <fieldset class="ingredients">
    <legend class="label">Ingrédients</legend>
    <p id="ingredients-hint" class="hint">
      Quantité et unité facultatives. Entrée ajoute une ligne en dessous.
    </p>

    <div class="head" aria-hidden="true">
      <span>Quantité</span><span>Unité</span><span>Ingrédient</span>
    </div>
    <ol ref="list" class="rows">
      <li v-for="(row, index) in rows" :key="row.key" class="row">
        <input
          v-model="row.quantity"
          class="quantity"
          inputmode="decimal"
          maxlength="12"
          autocomplete="off"
          placeholder="250"
          :aria-label="`Quantité de l'ingrédient ${index + 1}`"
          aria-describedby="ingredients-hint"
          @keydown.enter.prevent="addRow(index)"
        />
        <input
          v-model="row.unit"
          class="unit"
          list="ingredient-units"
          maxlength="30"
          autocomplete="off"
          placeholder="g"
          :aria-label="`Unité de l'ingrédient ${index + 1}`"
          @keydown.enter.prevent="addRow(index)"
        />
        <input
          v-model="row.name"
          class="name"
          maxlength="100"
          autocomplete="off"
          placeholder="Farine"
          :aria-label="`Nom de l'ingrédient ${index + 1}`"
          @keydown.enter.prevent="addRow(index)"
        />
        <button
          type="button"
          class="btn-ghost remove"
          :aria-label="`Retirer l'ingrédient ${index + 1}`"
          @click="removeRow(index)"
        >
          <AppIcon name="x" />
        </button>
      </li>
    </ol>
    <datalist id="ingredient-units">
      <option v-for="unit in UNITS" :key="unit" :value="unit" />
    </datalist>

    <button type="button" class="btn-ghost add" @click="addRow()">
      <AppIcon name="plus" /> Ajouter un ingrédient
    </button>
  </fieldset>
</template>

<style scoped>
.ingredients {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.label {
  padding: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
}
.hint {
  font-size: 0.825rem;
  color: var(--text-faint);
}
/* Colonnes : quantité, unité, nom, bouton de retrait */
.head,
.row {
  display: grid;
  grid-template-columns: 5.5rem 7.5rem minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
}
.head {
  padding-top: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.rows {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row input {
  width: 100%;
  min-width: 0;
}
.remove {
  padding: 0.55rem;
}
.add {
  justify-self: start;
}

/* Sur petit écran : quantité et unité sur une ligne, nom en dessous */
@media (max-width: 560px) {
  .head {
    display: none;
  }
  .row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    grid-template-areas:
      'quantity unit remove'
      'name name name';
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .quantity {
    grid-area: quantity;
  }
  .unit {
    grid-area: unit;
  }
  .name {
    grid-area: name;
  }
  .remove {
    grid-area: remove;
  }
}
</style>
