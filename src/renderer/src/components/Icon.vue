<script setup lang="ts">
defineProps<{
  name: 'plus' | 'x' | 'pencil' | 'pin' | 'chevron' | 'search' | 'copy' | 'folder' | 'list' | 'keyboard' | 'grid' | 'expand' | 'shrink' | 'activity' | 'history' | 'home' | 'more';
}>();
</script>

<template>
  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'plus'" d="M8 3v10M3 8h10" />
    <path v-else-if="name === 'x'" d="M4 4l8 8M12 4l-8 8" />
    <path v-else-if="name === 'pencil'" d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" />
    <path v-else-if="name === 'pin'" d="M9.5 2l4.5 4.5-2 1-2.5 2.5.5 3-1.5 1-3-3-3 3M5.5 7l3.5 3.5M6 6.5l2.5-2.5 1-2" />
    <path v-else-if="name === 'chevron'" d="M6 4l4 4-4 4" />
    <path v-else-if="name === 'search'" d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3.5-3.5" />
    <path v-else-if="name === 'copy'" d="M5 5V2.5h8.5V11H11M2.5 5H11v8.5H2.5z" />
    <path v-else-if="name === 'folder'" d="M2 4h4l1.5 1.5H14V13H2z" />
    <path v-else-if="name === 'list'" d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" />
    <path v-else-if="name === 'grid'" d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />
    <path v-else-if="name === 'expand'" d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    <path v-else-if="name === 'shrink'" d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
    <path v-else-if="name === 'activity'" d="M1.5 8h3l2-4.5 3 9 2-4.5h3" />
    <path v-else-if="name === 'history'" d="M2.5 8a5.5 5.5 0 105.5-5.5A5.6 5.6 0 003.6 4.6M2.5 2.5V5H5M8 5v3l2 1.5" />
    <path v-else-if="name === 'home'" d="M2 7.5l6-5 6 5M3.5 6.5v7h9v-7M6.5 13.5v-4h3v4" />
    <path v-else-if="name === 'more'" d="M3.5 8h.01M8 8h.01M12.5 8h.01" stroke-width="2.2" />
    <path v-else-if="name === 'keyboard'" d="M1.5 4h13v8h-13zM4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6" />
  </svg>
</template>
