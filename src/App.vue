<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { IconDatabase } from '@tabler/icons-vue'
</script>

<template>
  <RouterView />

</template>

<style>
.artboard-heading > div:first-child { flex: 1; min-width: 0; }

@media (min-width: 1101px) {
  .data-studio .data-layout { grid-template-rows: 455px minmax(300px, 1fr) !important; }
}
</style>
