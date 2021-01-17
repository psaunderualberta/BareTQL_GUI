<!-- List of buttons, which only highlights one at a time and records
which button is clicked -->

<template>
    <div class="ButtonList separate-components">
        <!-- Set up list of buttons -->
        <button
            v-for="item in arr"
            :key="item.message"
            @click="click"
            :name="item.value"
            :class="origin">
        {{ item.message }}
        </button>

    </div>
</template>

<script>
export default {
    name: 'ButtonList',
    props: {
        arr: Array,
        origin: String,
    },
    methods: {
        click: function (event) {
            var buttons = document.querySelectorAll(`.${this.origin}`);
            var selected;

            if (buttons.length > 1) {
                buttons.forEach(button => {
                    button.classList.remove('clicked');
                });
    
                if (event) {
                    event.target.classList.toggle('clicked');
                    selected = event.target;
                }
            } else {
                selected = event.target
            }

            this.$emit('NewClick', selected.name.toLowerCase());
        }
    }
}
</script>


<style scoped>
button {
    margin: 0px 5%;
    min-width: 50px;
}

.ButtonList {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
}

.clicked {
    opacity: 0.3;
}


</style>