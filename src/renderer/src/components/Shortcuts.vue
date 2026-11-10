<script setup lang="ts">
const KEYS: Array<[string, string]> = [
  ['Ctrl+Shift+F', 'Buscar en títulos y conversaciones'],
  ['Ctrl+Shift+L', 'Lobby: todas las terminales abiertas'],
  ['F11', 'Pantalla completa (entrar o salir)'],
  ['Ctrl+Shift+B', 'Mostrar u ocultar la barra lateral'],
  ['Ctrl+Shift+R', 'Recargar la interfaz (las terminales siguen vivas)'],
  ['Ctrl+Shift+H', 'Minimizar o expandir el encabezado de la sesión'],
  ['Ctrl+Shift+N', 'Nueva sesión'],
  ['Ctrl+Tab', 'Pestaña siguiente (con Shift, la anterior)'],
  ['Ctrl+1…9', 'Ir a la pestaña por posición (Ctrl+9: la última)'],
  ['Ctrl+Shift+E', 'Organizar la sesión activa'],
  ['Ctrl+Shift+W', 'Cerrar la pestaña (Claude sale limpio)'],
  ['Ctrl+C', 'Copiar si hay selección; si no, interrumpir'],
  ['Ctrl+V', 'Pegar texto'],
  ['Clic derecho', 'Organizar una conversación de la lista'],
];
</script>

<template>
  <dl class="keys">
    <template v-for="[k, d] in KEYS" :key="k">
      <dt><kbd>{{ k }}</kbd></dt>
      <dd>{{ d }}</dd>
    </template>
  </dl>
</template>
