<!-- https://www.w3schools.com/howto/howto_js_popup.asp -->
<template>
    <div class="instruction-component">
        <slot name="shown"></slot>
        <div class="popup">
            <div class="popuptext" :id="'myPopup-'+index" >
                <slot name="hidden" @click="unclick"></slot>
                <button :id="'next-instruction-button-'+index">Next</button>
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
        async handleClick() {
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

 /* Popup container */
.popup {
  position: relative;
  cursor: pointer;
}

/* The actual popup (appears on top) */
.popup .popuptext {
  visibility: hidden;
  width: 160px;
  background-color: #555;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 2%;
  position: absolute;
  z-index: 1;
  bottom: 125%;
  left: 50%;
  margin-left: -80px;
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
  visibility: visible;
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