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
import SeedSet from './SeedSet.vue';
import Operations from './Operations.vue';

export default {
    name: 'Page',
    components: {
        SeedSet,
        Operations,
    },
    data: function() {
        return {
            isKeyword: true,
        }
    },
    methods: {
        changeMode: function() {
            this.isKeyword = !this.isKeyword
        }
    }
}

</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');

body {
    background: #1f1e1e;
    color: #80C080;
    font-family: "Roboto";
}

p {
    margin: 0 0 1em 0
}

ul {
    list-style: none;
}


input[type='submit'], button {
    border: 2px solid rgba(180, 180, 180, 0.8);
    height: 30px;
    border-radius: 2px;
    background: none;
    color:#80C080;
    margin-bottom: 0.5%;
}


input[type=checkbox] {
    display: none;
}

input[type=checkbox]:checked + label {
    opacity: 0.5;
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

.deactivate {
    opacity: 0.5;
}

.page, .separate-components {
    padding: 1% 0;
    margin-bottom: 0.5%;
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
    border-radius: 5px;
    background: #2c2b2b;
}


</style>