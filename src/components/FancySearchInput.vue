<template>
  <div class="fancy-search" :class="[{ focused: isFocused }, full ? 'fancy--full' : '']">
    <!-- layered borders/glow -->
    <div class="fancy-glow"></div>
    <div class="fancy-darkBorderBg"></div>
    <div class="fancy-darkBorderBg"></div>
    <div class="fancy-darkBorderBg"></div>
    <div class="fancy-white"></div>
    <div class="fancy-border"></div>

    <div class="fancy-main">
      <input
        class="fancy-input"
        type="text"
        :placeholder="placeholder"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target && $event.target.value)"
        @keyup.enter="$emit('enter')"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />
      <div class="fancy-input-mask"></div>
      <div class="fancy-pink-mask"></div>

      <div class="fancy-filterBorder"></div>
      <button
        type="button"
        class="fancy-filter-icon"
        :title="actionTitle"
        aria-label="上一级"
        @click="$emit('action')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#d6d6e6"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 14 4 9 9 4"></polyline>
          <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
        </svg>
      </button>

      <div class="fancy-search-icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          height="24"
          fill="none"
          class="feather feather-search"
        >
          <circle stroke="url(#fancy-search-grad)" r="8" cy="11" cx="11"></circle>
          <line
            stroke="url(#fancy-search-line)"
            y2="16.65"
            y1="22"
            x2="16.65"
            x1="22"
          ></line>
          <defs>
            <linearGradient gradientTransform="rotate(50)" id="fancy-search-grad">
              <stop stop-color="#f8e7f8" offset="0%"></stop>
              <stop stop-color="#b6a9b7" offset="50%"></stop>
            </linearGradient>
            <linearGradient id="fancy-search-line">
              <stop stop-color="#b6a9b7" offset="0%"></stop>
              <stop stop-color="#837484" offset="50%"></stop>
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  </div>
  <!-- Optional background grid (off by default); enable by adding .show-grid on root -->
  <!-- <div class="fancy-grid"></div> -->
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '搜索...',
  },
  actionTitle: {
    type: String,
    default: '上一级',
  },
  full: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['update:modelValue', 'enter', 'action']);

const isFocused = ref(false);
</script>

<style scoped>
/* Heavily simplified/scoped version of the Uiverse.io snippet with class prefixes to avoid collisions. */

.fancy-search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative; /* containing block for absolute layers */
}

.fancy--full { width: 100%; flex: 1 1 auto; min-width: 0; }
.fancy--full .fancy-input { width: 100%; }
.fancy--full .fancy-main { width: 100%; }
.fancy--full .fancy-white,
.fancy--full .fancy-border,
.fancy--full .fancy-darkBorderBg,
.fancy--full .fancy-glow { max-width: none; }

.fancy-grid {
  height: 800px;
  width: 800px;
  background-image: linear-gradient(to right, #0f0f10 1px, transparent 1px),
    linear-gradient(to bottom, #0f0f10 1px, transparent 1px);
  background-size: 1rem 1rem;
  background-position: center center;
  position: absolute;
  z-index: -1;
  filter: blur(1px);
}

.fancy-white,
.fancy-border,
.fancy-darkBorderBg,
.fancy-glow {
  max-height: 70px;
  max-width: 314px;
  height: 100%;
  width: 100%;
  position: absolute;
  overflow: hidden;
  z-index: -1;
  border-radius: 12px;
  filter: blur(3px);
}

.fancy-main {
  position: relative;
}

.fancy-input {
  background-color: #010201;
  border: none;
  width: 301px;
  height: 56px;
  border-radius: 10px;
  color: #ffffff;
  padding-inline: 59px;
  font-size: 18px;
}
.fancy-input::placeholder {
  color: #c0b9c0;
}
.fancy-input:focus { outline: none; }

/* 移除非聚焦状态的文字遮挡，直接隐藏遮罩 */
.fancy-search.focused > .fancy-main > .fancy-input-mask { display: none; }

.fancy-input-mask {
  pointer-events: none;
  width: 100px;
  height: 20px;
  position: absolute;
  background: linear-gradient(90deg, transparent, black);
  top: 18px;
  left: 70px;
  display: none;
}
.fancy-pink-mask {
  pointer-events: none;
  width: 30px;
  height: 20px;
  position: absolute;
  background: #cf30aa;
  top: 10px;
  left: 5px;
  filter: blur(20px);
  opacity: 0.8;
  transition: all 2s;
}
.fancy-search:hover > .fancy-main > .fancy-pink-mask {
  opacity: 0;
}

.fancy-white {
  max-height: 63px;
  max-width: 307px;
  border-radius: 10px;
  filter: blur(2px);
}
.fancy-white::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(83deg);
  position: absolute;
  width: 600px;
  height: 600px;
  background-repeat: no-repeat;
  background-position: 0 0;
  filter: brightness(1.4);
  background-image: conic-gradient(
    rgba(0, 0, 0, 0) 0%,
    #a099d8,
    rgba(0, 0, 0, 0) 8%,
    rgba(0, 0, 0, 0) 50%,
    #dfa2da,
    rgba(0, 0, 0, 0) 58%
  );
  transition: all 2s;
}

.fancy-border {
  max-height: 59px;
  max-width: 303px;
  border-radius: 11px;
  filter: blur(0.5px);
}
.fancy-border::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(70deg);
  position: absolute;
  width: 600px;
  height: 600px;
  filter: brightness(1.3);
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(
    #1c191c,
    #402fb5 5%,
    #1c191c 14%,
    #1c191c 50%,
    #cf30aa 60%,
    #1c191c 64%
  );
  transition: all 2s;
}

.fancy-darkBorderBg {
  max-height: 65px;
  max-width: 312px;
}
.fancy-darkBorderBg::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(82deg);
  position: absolute;
  width: 600px;
  height: 600px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(
    rgba(0, 0, 0, 0),
    #18116a,
    rgba(0, 0, 0, 0) 10%,
    rgba(0, 0, 0, 0) 50%,
    #6e1b60,
    rgba(0, 0, 0, 0) 60%
  );
  transition: all 2s;
}

/* hover/active rotations */
.fancy-search:hover > .fancy-darkBorderBg::before {
  transform: translate(-50%, -50%) rotate(-98deg);
}
.fancy-search:hover > .fancy-glow::before {
  transform: translate(-50%, -50%) rotate(-120deg);
}
.fancy-search:hover > .fancy-white::before {
  transform: translate(-50%, -50%) rotate(-97deg);
}
.fancy-search:hover > .fancy-border::before {
  transform: translate(-50%, -50%) rotate(-110deg);
}

.fancy-search.focused > .fancy-darkBorderBg::before {
  transform: translate(-50%, -50%) rotate(442deg);
  transition: all 4s;
}
.fancy-search.focused > .fancy-glow::before {
  transform: translate(-50%, -50%) rotate(420deg);
  transition: all 4s;
}
.fancy-search.focused > .fancy-white::before {
  transform: translate(-50%, -50%) rotate(443deg);
  transition: all 4s;
}
.fancy-search.focused > .fancy-border::before {
  transform: translate(-50%, -50%) rotate(430deg);
  transition: all 4s;
}

.fancy-glow {
  overflow: hidden;
  filter: blur(30px);
  opacity: 0.4;
  max-height: 130px;
  max-width: 354px;
}
.fancy-glow:before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(60deg);
  position: absolute;
  width: 999px;
  height: 999px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(
    #000,
    #402fb5 5%,
    #000 38%,
    #000 50%,
    #cf30aa 60%,
    #000 87%
  );
  transition: all 2s;
}

@keyframes rotate {
  100% {
    transform: translate(-50%, -50%) rotate(450deg);
  }
}

.fancy-filter-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  max-height: 40px;
  max-width: 38px;
  height: 100%;
  width: 100%;
  isolation: isolate;
  overflow: hidden;
  border-radius: 10px;
  background: linear-gradient(180deg, #161329, black, #1d1b4b);
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0;
}
.fancy-filterBorder {
  height: 42px;
  width: 40px;
  position: absolute;
  overflow: hidden;
  top: 7px;
  right: 7px;
  border-radius: 10px;
}
.fancy-filterBorder::before {
  content: "";
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(90deg);
  position: absolute;
  width: 600px;
  height: 600px;
  background-repeat: no-repeat;
  background-position: 0 0;
  filter: brightness(1.35);
  background-image: conic-gradient(
    rgba(0, 0, 0, 0),
    #3d3a4f,
    rgba(0, 0, 0, 0) 50%,
    rgba(0, 0, 0, 0) 50%,
    #3d3a4f,
    rgba(0, 0, 0, 0) 100%
  );
  animation: rotate 4s linear infinite;
}
.fancy-search-icon {
  position: absolute;
  left: 20px;
  top: 15px;
}
</style>
