<svg class="spinner" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle
    cx="7" cy="7" r="5"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-dasharray="23.56 7.85"
  />
</svg>

<style>
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
