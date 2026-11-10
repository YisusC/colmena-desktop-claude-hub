<script setup lang="ts">
withDefaults(defineProps<{ color: string; icon?: string; size?: number }>(), { size: 14 });

const PATHS: Record<string, string> = {
  folder: 'M2 4h4l1.5 1.5H14V13H2z',
  code: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5',
  terminal: 'M2 3h12v10H2zM4.5 6.5L6.5 8l-2 1.5M8 10h3',
  database: 'M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2zM3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
  server: 'M2.5 2.5h11V7h-11zM2.5 9h11v4.5h-11zM5 4.75h.01M5 11.25h.01',
  cloud: 'M4.5 12.5a3 3 0 01-.4-6 4 4 0 017.7-1 3.5 3.5 0 01.2 7z',
  globe: 'M8 14.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM1.5 8h13M8 1.5c1.8 1.8 2.6 4 2.6 6.5S9.8 12.7 8 14.5C6.2 12.7 5.4 10.5 5.4 8S6.2 3.3 8 1.5z',
  chart: 'M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5',
  cash: 'M1.5 4.5h13v7h-13zM8 9.75a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM4 6.5v3M12 6.5v3',
  receipt: 'M3.5 1.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1zM6 5h4M6 7.5h4M6 10h2.5',
  cart: 'M1.5 2.5h2l1.6 7.5h7.4l1.5-5.5H4.3M6.5 13.5h.01M11.5 13.5h.01',
  truck: 'M1.5 4h8v7h-8zM9.5 6.5h3l2 2.5V11h-5M4 13.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM11.5 13.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z',
  briefcase: 'M1.5 5h13v8.5h-13zM5.5 5V3h5v2M1.5 9h13',
  users: 'M6 7.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 2.7a2.5 2.5 0 010 4.6M12.5 9.7c1.2.5 2 1.8 2 3.8',
  mail: 'M1.5 3.5h13v9h-13zM1.5 4l6.5 5 6.5-5',
  chat: 'M2 3h12v8H6l-3 2.5V11H2z',
  phone: 'M4.5 1.5h7v13h-7zM7 12.5h2',
  calendar: 'M2 3.5h12v10H2zM2 6.5h12M5 2v3M11 2v3',
  book: 'M8 4v10M8 4c-1-1-3-1.5-5.5-1.5v10C5 12.5 7 13 8 14c1-1 3-1.5 5.5-1.5v-10C11 2.5 9 3 8 4z',
  flask: 'M6 1.5h4M6.5 1.5V6l-4 7a1 1 0 00.9 1.5h9.2a1 1 0 00.9-1.5l-4-7V1.5M4.5 10h7',
  wrench: 'M10.5 2a3.5 3.5 0 00-3.3 4.6l-4.7 4.7a1.4 1.4 0 002 2l4.7-4.7A3.5 3.5 0 0013.8 5l-2 2-2-.5-.5-2 2-2a3.5 3.5 0 00-.8-.5z',
  bug: 'M5.5 5.5a2.5 2.5 0 015 0M4.5 6.5h7V10a3.5 3.5 0 01-7 0zM8 6.5v7M2 9h2.5M11.5 9H14M2.5 5.5l2 1.5M13.5 5.5l-2 1.5',
  shield: 'M8 1.5l5.5 2v4c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7v-4z',
  lock: 'M3.5 7h9v7h-9zM5.5 7V5a2.5 2.5 0 015 0v2',
  rocket: 'M9.5 2.5c2-1 4-1 4-1s0 2-1 4L8 10 6 8zM6 8l-2.5.5L2 10l2.5.5M8 10l-.5 2.5L6 14l-.5-2.5M10.5 5.5h.01',
  bolt: 'M9 1.5L3 9h4.5L7 14.5 13 7H8.5z',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z',
  home: 'M2 7.5l6-5 6 5M3.5 6.5v7h9v-7M6.5 13.5v-4h3v4',
};
</script>

<template>
  <!-- data URL validated in main. -->
  <img v-if="icon?.startsWith('data:image/')" class="group-mark group-img" :src="icon" :width="size" :height="size" alt="" />
  <svg
    v-else
    class="group-mark"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    :stroke="color"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[icon ?? ''] ?? PATHS.folder" />
  </svg>
</template>
