<template>
  <div id="app">
    <Page />
  </div>
</template>

<script>
import Page from "./components/Page.vue";

export default {
  name: "App",
  components: {
    Page,
  },
};
</script>

<style>
#app {
  margin-top: 0;
}
</style>
