<template>
  <div id="overtop">
    <div id="container">
      <div></div>
      <div>
        <slot name="logo" id="logo"></slot>
      </div>
      <div>
        <span id="activator" @click="activate"><slot name="activator" ></slot></span>
      </div>
    </div>
    <div class="hidden-content">
      <slot class="centering overtop-header" name="header"></slot>
      <div class="overtop-content">
        <slot name="content"></slot>
      </div>
      <div class="centering">
        <button id="exit-help" v-on:submit.prevent @click="deactivate">Exit Help</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "overtop",
  methods: {
    changeButtons(become_disabled) {
      document.querySelectorAll('input, button:not(#exit-help), a').forEach(inp => {
        inp.disabled = become_disabled;
        inp.style.cursor = become_disabled ? "auto" : "pointer";
      })
    },

    activate() {
      this.changeButtons(true)
      document.querySelector('.hidden-content').classList.add('hidden-content-visible')
      
    },

    deactivate() {
      this.changeButtons(false)
      document.querySelector('.hidden-content').classList.remove('hidden-content-visible')
      
    }
  }
}
</script>

<style scoped>

#overtop {
  width: 80%;
  margin: 0 auto;
}

#activator {
  cursor: pointer;
}

#exit-help {
  margin-top: 15px;
}

.overtop-content {
  padding: 0 5%;
  text-align: left;
  line-height: 1.5em;
  max-height: 500px;
  overflow-y: auto;
  margin-bottom: 5px;
}

.overtop-content ul {
  list-style: initial;
}

.hidden-content-visible {
    opacity: 1 !important;
    visibility: visible !important;

    /* https://www.geeksforgeeks.org/how-to-dim-entire-screen-except-a-fixed-area-using-javascript/
       Accessed July 24th, 2020 */

    /* For Internet Explorer */ 
    box-shadow: 0 0 0 1000px rgba(0, 0, 0, .65); 
      
    /* For other browsers */ 
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, .65); 
}

.hidden-content {
  background: #102127;
  opacity: 0;
  visibility: hidden;
  position: fixed;
  width: 80%;
  height: 80%;
  margin: auto;
  z-index: 9999;
  transition: 0.25s ease;
}

/* 
 * Align 3 divs left - center - right
 * https://stackoverflow.com/questions/2603700/how-to-align-3-divs-left-center-right-inside-another-div
 * Accessed July 28, 2020 */

#container {
  display: flex;                  /* establish flex container */
  justify-content: space-between; /* switched from default (flex-start, see below) */
}

#container > div {
  width: 200px;
}

</style>