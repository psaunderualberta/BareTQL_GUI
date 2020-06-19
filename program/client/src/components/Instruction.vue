<!-- https://www.w3schools.com/howto/howto_js_popup.asp -->
<template>
    <div class="instruction-component">
        <div class="popup">
            <slot name="shown"></slot>
            <div class="popuptext" :id="'myPopup-'+index" >
                <slot name="hidden" @click="unclick"></slot>
                <button v-on:submit.prevent 
                        name="button-text" 
                        :id="'next-instruction-button-'+index"
                        style="cursor: pointer;"
                        >
                        Next
                </button>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'instruction',
    props: [
        'index',
    ],
    methods: {
        handleClick() {
            return new Promise(res => {
                var popup = document.getElementById(`myPopup-${this.index}`);
                popup.classList.toggle("show");

                /* Not totally sure what I've built here, but it works */
                new Promise(resolve => {
                    document.querySelector(`#next-instruction-button-${this.index}`).addEventListener('click', () => {
                        return resolve();
                    })
                })
                .then(() => {
                    popup.classList.toggle("show");
                    res();
                })
            })
        },
    }
}
</script>

<style scoped>

.instruction-component {
  padding-bottom: 1%;
}

 /* Popup container */
.popup {
  position: relative;
}

/* The actual popup (appears on top) */
.popup .popuptext {
  background-color: #555;
  display: none;
  font-size: 0.9em;
  color: inherit;
  width: 50%;
  text-align: center;
  border-radius: 6px;
  padding: 1%;
  /* position: absolute;
  z-index: 1; */
  /* bottom: 125%;
  left: 50%; */
  margin: 0 auto;
}

/* Popup arrow */
.popup .popuptext::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #555 transparent transparent transparent;
}

/* Toggle this class when clicking on the popup container (hide and show the popup) */
.popup .show {
  display: inline-block;
  -webkit-animation: fadeIn 1s;
  animation: fadeIn 1s
}

/* Add animation (fade in the popup) */
@-webkit-keyframes fadeIn {
  from {opacity: 0;}
  to {opacity: 1;}
}

@keyframes fadeIn {
  from {opacity: 0;}
  to {opacity:1 ;}
} 
</style>