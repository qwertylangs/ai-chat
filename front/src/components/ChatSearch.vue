<script setup lang="ts">
defineProps<{ noResults: boolean }>()
const query = defineModel<string>({ required: true })
</script>

<template>
  <input v-model="query" placeholder="Поиск по чатам" />
  <p v-if="noResults" class="no-results">Ничего не найдено</p>
</template>

<style scoped>
.no-results {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
</style>
