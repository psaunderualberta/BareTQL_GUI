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

body {
    background: #1f1e1e;
    color: #80C080;
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
}

input[type=checkbox] {
  visibility: hidden;
}

input[type=checkbox]:checked + label {
    opacity: 0.5;
}

.page, .separate-components {
    padding: 1% 0;
    margin-bottom: 1%;
}
/* Divide the page into two 'halves',
like an open book */
.page {
    width: 46%;
    margin: 1%;
    float: left;
}

.centering {
  text-align: center;
}

/* Display separation during development */
.separate-components {
  /* border: 2px solid black; */
    border-radius: 5px;
    background: #2c2b2b;
    margin: 1px;
}


</style>