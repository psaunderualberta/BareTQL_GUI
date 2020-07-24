<template>
  <div id="overtop">
    <slot name="logo" id="logo"></slot>
    <Button @click="activate"><slot name="activator" id="activator"></slot></Button>
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

.overtop-content {
  padding: 0 5%;
  text-align: left;
  line-height: 1.5em;
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
    box-shadow: 0 0 0 1000px rgba(0, 0, 0, .3); 
      
    /* For other browsers */ 
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, .3); 
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
  overflow: auto;
}

</style>