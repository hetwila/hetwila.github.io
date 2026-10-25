<template>
  <div class="archive-art" aria-hidden="true">
    <div class="art-grid" />
    <svg viewBox="0 0 520 400" fill="none">
      <defs>
        <linearGradient id="orbit-gradient" x1="100" y1="80" x2="400" y2="330" gradientUnits="userSpaceOnUse">
          <stop stop-color="#d7e4c0" stop-opacity=".85" />
          <stop offset="1" stop-color="#92bda3" stop-opacity=".12" />
        </linearGradient>
      </defs>
      <g stroke="url(#orbit-gradient)">
        <circle cx="270" cy="195" r="138" stroke-width="1.2" />
        <circle cx="270" cy="195" r="158" stroke-dasharray="2 7" />
        <ellipse cx="270" cy="195" rx="138" ry="48" transform="rotate(-32 270 195)" />
        <ellipse cx="270" cy="195" rx="138" ry="48" transform="rotate(42 270 195)" />
        <ellipse cx="270" cy="195" rx="68" ry="138" transform="rotate(18 270 195)" />
        <path d="M80 195h380M270 12v366" stroke-dasharray="4 7" opacity=".4" />
        <circle cx="270" cy="195" r="92" opacity=".35" />
      </g>
      <g fill="#e9edd0">
        <circle cx="154" cy="120" r="4" /><circle cx="396" cy="250" r="3" /><circle cx="270" cy="195" r="5" />
        <circle cx="219" cy="322" r="3" />
      </g>
      <g stroke="#d7e4c0" stroke-opacity=".5">
        <path d="M146 112h16m-8-8v16M388 250h16m-8-8v16" />
      </g>
      <text x="64" y="365" fill="#bed0b7" font-size="10" letter-spacing="3">ORDER · MEMORY · EVERYDAY LIFE</text>
      <text x="455" y="56" fill="#bed0b7" font-size="10" text-anchor="end" letter-spacing="2">ARCHIVE / 001</text>
    </svg>
  </div>
</template>
