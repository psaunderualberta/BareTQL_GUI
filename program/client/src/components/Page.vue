<template>
  <div>
    <!-- Runs if the user is using keyword search -->
    <div v-if="isKeyword">
      <SeedSet @ChangeMode="changeMode" />
    </div>

    <!-- Runs if user is using operations on seed set -->
    <div v-else>
      <Operations @ChangeMode="changeMode" />
    </div>
  </div>
</template>

<script>
import SeedSet from "./SeedSet.vue";
import Operations from "./Operations.vue";

export default {
  name: "Page",
  components: {
    SeedSet,
    Operations,
  },
  data: function () {
    return {
      isKeyword: true,
    };
  },
  methods: {
    changeMode: function () {
      this.isKeyword = !this.isKeyword;
    },
  },
};
</script>

<style>
/* https://designshack.net/articles/trends/best-website-color-schemes/ */
@import url("https://fonts.googleapis.com/css2?family=PT+Serif&display=swap");

body {
  background: #051622;
  color: #1ba098;
  font-family: "PT Serif";
}

input[type="text"] {
  border: 5px solid white;
  height: 100%;
  width: 30%;
}

input[type="number"] {
  border: 5px solid white;
  height: 15px;
  width: 40px;
  margin-bottom: 5px;
}

img {
  width: 30px;
  height: 30px;
}

hr,
label,
input[type="submit"],
button,
.slider-values,
.col-checkboxes {
  color: #deb992;
}

label,
input,
button {
  cursor: pointer;
}

hr,
label {
  width: 90%;
  height: 10%;
}

hr {
  border: 0;
  height: 1px;
  background-image: linear-gradient(to right, #051622, #deb992, #051622);
}

p {
  color: #1ba098;
  margin: 0 0 1em 0;
}

ul {
  list-style: none;
}

input[type="submit"],
button,
.hidden-content,
.col-checkboxes {
  border: 2px solid rgba(180, 180, 180, 0.8);
  height: 30px;
  border-radius: 2px;
  background: none;
  margin-bottom: 0.5%;
}

input[type="checkbox"] {
  display: none;
}

input[type="checkbox"]:checked + label,
.clicked {
  opacity: 0.5;
}

.table,
.slider-values {
  color: #c0a763;
}

.sticky {
  position: sticky;
  top: 2%;
}

.no-overflow {
  max-height: 500px;
  overflow-y: auto;
  margin-bottom: 5px;
}

.info {
  font-size: 0.8em;
}

.deactivate {
  opacity: 0.5;
  transition: 0.2s ease;
}

.page,
.separate-components {
  padding: 1% 0;
}

/* Divide the webpage into two 'halves',
like an open book */
.page {
  width: 48%;
  margin: 0 1%;
  float: left;
}

.centering {
  text-align: center;
}

.separate-components {
  /* border: 2px solid black; */
  margin: 0 5%;
  border-radius: 5px;
  background: #2c2b2b;
}

.hr-in-separate-components {
  background-image: linear-gradient(to right, #2c2b2b, #deb992, #2c2b2b);
}
</style>